import { useEffect, useRef, useState } from "react";
import { AudioLines, Film, ImageIcon, Type } from "lucide-react";
import { connection, mediaUrl, sizeLabel } from "./api";

type Asset = { id: string; kind: string; filename: string; size: number; sha256: string; url: string; mimeType?: string };
type Information = { width?: number; height?: number; duration?: number; poster?: string; error?: string };
const cache = new Map<string, Information>();
const pending = new Map<string, Promise<Information>>();
const listeners = new Map<string, Set<(info: Information) => void>>();
const queue: (() => void)[] = [];
let running = 0;
function drain() { while (running < 2 && queue.length) queue.shift()!(); }
let database: Promise<IDBDatabase | null> | undefined;
function db() {
  return database ||= new Promise(resolve => {
    try {
      const request = indexedDB.open("zhilume-media-previews", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("previews", { keyPath: "key" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function cached(key: string): Promise<Information | undefined> {
  try {
    const database = await db();
    if (!database) return;
    return await new Promise(resolve => {
      const req = database.transaction("previews").objectStore("previews").get(key);
      req.onsuccess = () => resolve(req.result?.info);
      req.onerror = () => resolve(undefined);
    });
  } catch { return; }
}
async function persist(key: string, info: Information) {
  if (info.error) return;
  try {
    const database = await db();
    if (!database) return;
    const tx = database.transaction("previews", "readwrite"), store = tx.objectStore("previews");
    store.put({ key, info, time: Date.now() });
    // Disposable, bounded cache: no original files or signed URLs.
    const all = store.getAll();
    all.onsuccess = () => {
      const entries = all.result.sort((a, b) => b.time - a.time);
      entries.slice(200).forEach(entry => store.delete(entry.key));
    };
    tx.onerror = () => {};
  } catch { /* Cache is optional. */ }
}

function inspect(asset: Asset): Promise<Information> {
  return new Promise(resolve => {
    const image = asset.kind === "image" ? new Image() : null;
    const media = image ? null : document.createElement(asset.kind === "audio" ? "audio" : "video");
    let finished = false;
    const info: Information = {};
    const done = (value: Information) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (image) { image.onload = null; image.onerror = null; image.removeAttribute("src"); }
      if (media) {
        media.onloadedmetadata = null; media.onloadeddata = null; media.onseeked = null; media.onerror = null;
        media.pause(); media.removeAttribute("src"); media.load();
      }
      resolve(value);
    };
    const timeout = window.setTimeout(() => done({ ...info, error: "预览读取超时，可在详情中重试" }), 12000);
    if (image) {
      image.onload = () => done({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => done({ error: "无法读取图片" });
      image.src = mediaUrl(asset.url);
      return;
    }
    if (!media) return;
    media.crossOrigin = "anonymous";
    media.preload = asset.kind === "audio" ? "metadata" : "auto";
    media.muted = true;
    const capture = () => {
      const video = media as HTMLVideoElement;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(320, video.videoWidth);
        canvas.height = Math.max(1, Math.round(canvas.width * video.videoHeight / video.videoWidth));
        if (canvas.height > 320) { canvas.width = Math.max(1, Math.round(canvas.width * 320 / canvas.height)); canvas.height = 320; }
        canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
        info.poster = canvas.toDataURL("image/jpeg", .78);
        done(info);
      } catch { done({ ...info, error: "无法生成视频缩略图" }); }
    };
    media.onloadedmetadata = () => {
      if (Number.isFinite(media.duration)) info.duration = media.duration;
      if (asset.kind === "audio") { done(info); return; }
      const video = media as HTMLVideoElement;
      info.width = video.videoWidth; info.height = video.videoHeight;
    };
    media.onloadeddata = () => {
      if (asset.kind !== "video") return;
      const target = Math.min(.2, (info.duration || 0) / 2);
      if (target > 0) { media.onseeked = capture; media.currentTime = target; }
      else capture();
    };
    media.onerror = () => done({ ...info, error: "无法读取媒体，文件或编码可能不受支持" });
    media.src = mediaUrl(asset.url);
  });
}
const keyFor = (asset: Asset) => `${connection.base}|${asset.sha256 || asset.id}|preview-v1`;
function load(asset: Asset, retry = false): Promise<Information> {
  const key = keyFor(asset);
  if (retry) cache.delete(key);
  if (cache.has(key)) return Promise.resolve(cache.get(key)!);
  if (pending.has(key)) return pending.get(key)!;
  const job = new Promise<Information>(resolve => {
    queue.push(() => {
      running++;
      void (async () => {
        let info = !retry ? await cached(key) : undefined;
        if (!info) info = asset.kind === "text" ? {} : await inspect(asset);
        cache.set(key, info);
        listeners.get(key)?.forEach(listener => listener(info!));
        if (cache.size > 200) cache.delete(cache.keys().next().value!);
        void persist(key, info);
        resolve(info);
      })().catch(() => resolve({ error: "无法读取素材信息" })).finally(() => {
        pending.delete(key); running--; drain();
      });
    });
    drain();
  });
  pending.set(key, job);
  return job;
}
function useInformation(asset: Asset) {
  const ref = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<Information>();
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true, started = false;
    const key = keyFor(asset);
    const receive = (value: Information) => { if (active && started) setInfo(value); };
    const group = listeners.get(key) || new Set();
    group.add(receive); listeners.set(key, group);
    setInfo(undefined);
    const observer = new IntersectionObserver(entries => {
      if (started || !entries.some(e => e.isIntersecting)) return;
      started = true; observer.disconnect();
      void load(asset, attempt > 0).then(value => { if (active) setInfo(value); });
    }, { rootMargin: "120px" });
    if (ref.current) observer.observe(ref.current);
    return () => {
      active = false; observer.disconnect(); group.delete(receive);
      if (!group.size) listeners.delete(key);
    };
  }, [asset.id, asset.sha256, asset.url, attempt]);
  return { ref, info, retry: () => retry(a => a + 1) };
}
function durationLabel(seconds: number) {
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}
export function AssetThumbnail({ asset }: { asset: Asset }) {
  const { ref, info } = useInformation(asset);
  const Icon = ({ image: ImageIcon, video: Film, audio: AudioLines, text: Type })[asset.kind] || Type;
  return <div className="asset-thumb" ref={ref} title={info?.error || asset.filename}>
    {asset.kind === "image" && !info?.error ? <img loading="lazy" src={mediaUrl(asset.url)} alt={asset.filename} />
      : info?.poster ? <img src={info.poster} alt={`${asset.filename} 视频缩略图`} /> : <Icon size={24} strokeWidth={1.2} />}
    {info?.duration !== undefined && <span className="asset-duration">{durationLabel(info.duration)}</span>}
    {info?.error && <span className="asset-preview-error">预览不可用</span>}
  </div>;
}
export function AssetInformation({ asset, compact = false }: { asset: Asset; compact?: boolean }) {
  const { ref, info, retry } = useInformation(asset);
  const format = asset.filename.split(".").pop()?.toUpperCase() || asset.kind;
  const parts = [format, sizeLabel(asset.size)];
  if (info?.width && info.height) parts.push(`${info.width} × ${info.height}`);
  if (info?.duration !== undefined) parts.push(durationLabel(info.duration));
  return <div ref={ref} className={compact ? "asset-meta compact" : "asset-meta"} aria-label="素材信息">
    <span className="asset-meta-parts">{parts.map((part, index) => <span key={index}>{part}</span>)}</span>
    {!compact && !info && asset.kind !== "text" && <span>正在读取媒体信息…</span>}
    {!compact && info?.error && <span className="asset-info-error">{info.error} <button onClick={retry}>重新读取</button></span>}
  </div>;
}

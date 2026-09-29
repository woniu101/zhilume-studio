import { useEffect, useRef, useState } from "react";
import { api, mediaUrl, uploadAsset } from "../api";
import { Modal } from "../ui";
import { gridRects, processImages, type ImageOperation, type ImageParameters } from "./image-processing";
import { type VideoOperation } from "./video-processing";
import "./media-tools.css";

type Asset = { id: string; kind: string; filename: string; url: string; size: number; dimensions?: { width: number; height: number } };
type Operation = ImageOperation | VideoOperation;
type Result = { file: File; url: string; provenance: { operation: string; sourceAssetIds: string[]; parameters: object }; asset?: Asset; dimensions?: { width: number; height: number } };
const labels: Record<Operation, string> = { "image.crop.v1": "裁剪", "image.grid.v1": "宫格切分", "image.collage.v1": "拼图", "media.video.trim.v1": "视频截取", "media.audio.extract.v1": "提取音轨" };

export function MediaTools({ asset, assets, close, complete, submit }: {
  asset: Asset; assets: Asset[]; close: () => void;
  complete: (assets: Asset[], replace: boolean, operation:Operation) => void;
  submit: (operation: VideoOperation, input: { assetId: string; start: number; end: number }) => Promise<void>;
}) {
  const [operation, setOperation] = useState<Operation>(asset.kind === "image" ? "image.crop.v1" : "media.video.trim.v1");
  const [params, setParams] = useState<ImageParameters>({ x: 0, y: 0, width: 1, height: 1, rows: 2, columns: 2, gap: 16, cell: 512, background: "#ffffff" });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [ids, setIds] = useState([asset.id]);
  const [duration, setDuration] = useState(0), [start, setStart] = useState(0), [end, setEnd] = useState(0);
  const [serverReady, setServerReady] = useState(false);
  const nativeJob = useRef<string | null>(null);
  const [retrySync, setRetrySync] = useState(false);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(""), [progress, setProgress] = useState(0), [error, setError] = useState("");
  const [results, setResults] = useState<Result[]>([]), [replace, setReplace] = useState(true);
  const [collagePreview, setCollagePreview] = useState("");
  const controller = useRef<AbortController | null>(null), retained = useRef<Result[]>([]);
  const previewController = useRef<AbortController | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const isImage = asset.kind === "image", desktop = !!window.zhilumeDesktop?.media;

  const canReplace = ["image.crop.v1", "media.video.trim.v1"].includes(operation) && results.length === 1 && results[0].file.type.startsWith(asset.kind + "/");
  const field = (key: keyof ImageParameters, value: number | string) => setParams(p => ({ ...p, [key]: value }));
  useEffect(() => {
    if (!isImage && !desktop) api("/capabilities").then(list => setServerReady(list.some((c: any) => c.id === operation && c.ready))).catch(() => setServerReady(false));
  }, [operation, isImage]);
  useEffect(() => () => {
    controller.current?.abort(); retained.current.forEach(r => URL.revokeObjectURL(r.url));
    if (nativeJob.current) void window.zhilumeDesktop?.media.dispose(nativeJob.current);
  }, []);
  useEffect(() => {
    if (!busy && !results.length && !retrySync) return;
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [busy, results.length, retrySync]);
  async function loadImage(id: string, signal: AbortSignal) {
    const source = assets.find(a => a.id === id)!;
    let blob: Blob;
    const media = window.zhilumeDesktop?.media;
    if (media) {
      const task = await media.createSource(id);
      const unsubscribe = media.onProgress(value => { if (value.id === task && value.phase === 'downloading') { setStatus('下载原图到本机缓存…'); setProgress(value.progress ?? 0); } });
      const stop = () => { void media.cancel(task).catch(() => {}); };
      signal.addEventListener('abort', stop, { once: true });
      try { signal.throwIfAborted(); blob = new Blob([new Uint8Array(await media.readImage(task))]); }
      finally { unsubscribe(); signal.removeEventListener('abort', stop); await media.dispose(task); }
    } else {
      const response = await fetch(mediaUrl(source.url), { signal });
      if (!response.ok) throw new Error("原图读取失败，请重新打开工具刷新素材地址");
      blob = await response.blob();
    }
    signal.throwIfAborted();
    const image = await createImageBitmap(blob);
    if (image.width * image.height > 32_000_000) { image.close(); throw new Error("单张原图不能超过 3200 万像素"); }
    return image;
  }
  async function renderImages(signal: AbortSignal) {
    const images: ImageBitmap[] = [];
    try {
      let pixels = 0;
      for (const id of operation === "image.collage.v1" ? ids : [asset.id]) {
        signal.throwIfAborted(); const img = await loadImage(id, signal); images.push(img);
        pixels += img.width * img.height;
        if (pixels > 64_000_000) throw new Error("拼图原图总像素不能超过 6400 万，请减少图片数量或先缩小图片");
      }
      return await processImages(operation as ImageOperation, images, params, signal);
    } finally { images.forEach(img => img.close()); }
  }
  useEffect(() => {
    if (operation !== "image.collage.v1") { setCollagePreview(""); return; }
    const abort = new AbortController(); previewController.current = abort;
    let url = "";
    const timer = setTimeout(() => { void renderImages(abort.signal).then(blobs => {
      if (abort.signal.aborted) return;
      url = URL.createObjectURL(blobs[0]); setCollagePreview(url);
    }).catch(() => {}); }, 300);
    return () => { clearTimeout(timer); abort.abort(); if (url) URL.revokeObjectURL(url); };
  }, [operation, ids.join(","), params.columns, params.gap, params.cell, params.background]);
  const videoParamsValid = duration > 0 && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= duration + .001;
  async function run() {
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setProgress(0); setStatus("读取原始素材…");
    previewController.current?.abort();
    try {
      let blobs: Blob[];
      if (isImage) blobs = await renderImages(abort.signal);
      else {
        if (!videoParamsValid) throw new Error("截取范围必须位于视频时长内");
        if (!desktop) {
          await submit(operation as VideoOperation, { assetId: asset.id, start, end }); close(); return;
        }
        const media = window.zhilumeDesktop!.media;
        const id = retrySync && nativeJob.current ? nativeJob.current : await media.create(asset.id, operation, { start, end });
        nativeJob.current = id;
        const stages: Record<string, string> = { validating: "校验原始素材…", downloading: "下载原素材到本机缓存…", processing: "本机 FFmpeg 处理中…", syncing: "同步处理结果到项目…" };
        const unsubscribe = media.onProgress(value => { if (value.id === id) { setStatus(stages[value.phase] || ""); setProgress(value.progress ?? 0); } });
        const cancel = () => { void media.cancel(id); };
        abort.signal.addEventListener("abort", cancel, { once: true });
        try {
          if (abort.signal.aborted) { await media.dispose(id); nativeJob.current = null; abort.signal.throwIfAborted(); }
          const result = await (retrySync ? media.retrySync(id) : media.run(id));
          if (!result.ok) {
            setRetrySync(result.canRetrySync);
            if (!result.canRetrySync) { await media.dispose(id); nativeJob.current = null; }
            throw new Error(result.error.message);
          }
          setRetrySync(false); await media.dispose(id); nativeJob.current = null;
          complete([result.asset], operation === "media.video.trim.v1", operation); close(); return;
        } finally { unsubscribe(); abort.signal.removeEventListener("abort", cancel); }

      }
      abort.signal.throwIfAborted();
      const parameters = { ...params };
      const cols = Math.min(params.columns, ids.length);
      const sizes = operation === "image.grid.v1" ? gridRects(dimensions.width, dimensions.height, params.rows, params.columns)
        : operation === "image.collage.v1" ? [{ width: cols * params.cell + (cols + 1) * params.gap, height: Math.ceil(ids.length / cols) * params.cell + (Math.ceil(ids.length / cols) + 1) * params.gap }]
        : [{ width: params.width, height: params.height }];
      const output = blobs.map((blob, i) => ({ file: new File([blob], `${asset.filename.replace(/\.[^.]+$/, "").slice(0, 160)}-${labels[operation]}${blobs.length > 1 ? `-${i + 1}` : ""}.png`, { type: blob.type }), url: URL.createObjectURL(blob), dimensions: sizes[i], provenance: { operation, sourceAssetIds: operation === "image.collage.v1" ? [...ids] : [asset.id], parameters: { ...parameters, outputIndex: i } } }));
      retained.current = output; setResults(output); setProgress(1); setStatus("处理完成，原素材保持不变");
    } catch (e) { setStatus(""); setError(abort.signal.aborted ? "已取消处理" : (e as Error).message); }
    finally { setBusy(false); controller.current = null; }
  }
  async function save() {
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setStatus("保存新素材…");
    try {
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (!result.asset) result.asset = { ...await uploadAsset(result.file, abort.signal, p => setProgress((i + p) / results.length), result.provenance), dimensions: result.dimensions };
      }
      complete(results.map(r => r.asset!), canReplace && replace, operation); close();
    } catch (e) { setError(`${abort.signal.aborted ? "已取消保存" : (e as Error).message}。处理结果仍保留在此窗口，可重试保存或下载。`); }
    finally { setBusy(false); controller.current = null; }
  }
  function pointer(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(dimensions.width, Math.round((event.clientX - box.left) / box.width * dimensions.width))), y: Math.max(0, Math.min(dimensions.height, Math.round((event.clientY - box.top) / box.height * dimensions.height))) };
  }
  let rects: { x: number; y: number; width: number; height: number }[] = [];
  if (dimensions.width) {
    try { rects = operation === "image.grid.v1" ? gridRects(dimensions.width, dimensions.height, params.rows, params.columns) : [params]; } catch { /* Validation is displayed on submit. */ }
  }
  return <Modal title={isImage ? "图片工具" : "视频工具"} close={() => { if (!busy) close(); }}>
    <div className="media-tool">
      {!results.length && <>
        <nav className="media-tool-tabs">{(isImage ? ["image.crop.v1", "image.collage.v1", "image.grid.v1"] : ["media.video.trim.v1", "media.audio.extract.v1"]).map(op => <button key={op} disabled={busy || retrySync} className={operation === op ? "primary" : ""} onClick={() => setOperation(op as Operation)}>{labels[op as Operation]}</button>)}</nav>
        <fieldset disabled={busy || retrySync}>
          {isImage ? <>
            {operation === "image.collage.v1" ? <>
              <div className="media-collage-options">
                <label>列数<input aria-label="拼图列数" type="number" min={1} max={8} value={params.columns} onChange={e => field("columns", +e.target.value)} /></label>
                <label>单格像素<input type="number" min={64} max={2048} value={params.cell} onChange={e => field("cell", +e.target.value)} /></label>
                <label>间隔<input type="number" min={0} max={100} value={params.gap} onChange={e => field("gap", +e.target.value)} /></label>
                <label>背景<input type="color" value={params.background} onChange={e => field("background", e.target.value)} /></label>
              </div>
              <p className="muted">最多 16 张，完整保留图片比例。点击图片加入或移除，下方箭头调整顺序。</p>
              <div className="media-tool-assets">{assets.filter(a => a.kind === "image").map(a => <button key={a.id} aria-pressed={ids.includes(a.id)} title={a.filename} onClick={() => setIds(old => old.includes(a.id) ? old.filter(id => id !== a.id) : old.length < 16 ? [...old, a.id] : old)}><img src={mediaUrl(a.url)} alt={a.filename} /><span>{ids.includes(a.id) ? ids.indexOf(a.id) + 1 : "+"}</span></button>)}</div>
              <ol className="collage-order">{ids.map((id, i) => <li key={id}><span>{assets.find(a => a.id === id)?.filename}</span><button aria-label={`将第 ${i + 1} 张向前移动`} disabled={!i} onClick={() => setIds(old => { const next = [...old]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; return next; })}>←</button></li>)}</ol>
              {collagePreview && <img className="collage-preview" src={collagePreview} alt="拼图预览" />}
            </> : <>
              <div className="image-edit-preview" style={{ aspectRatio: dimensions.width ? `${dimensions.width}/${dimensions.height}` : undefined }}
                onPointerDown={e => { if (operation !== "image.crop.v1" || busy || !dimensions.width) return; drag.current = pointer(e); e.currentTarget.setPointerCapture(e.pointerId); }}
                onPointerMove={e => { if (!drag.current) return; const end = pointer(e), begin = drag.current; setParams(p => ({ ...p, x: Math.min(begin.x, end.x), y: Math.min(begin.y, end.y), width: Math.max(1, Math.abs(end.x - begin.x)), height: Math.max(1, Math.abs(end.y - begin.y)) })); }}
                onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
                <img src={mediaUrl(asset.url)} alt="原图" draggable={false} onLoad={e => { const { naturalWidth: width, naturalHeight: height } = e.currentTarget; setDimensions({ width, height }); setParams(p => ({ ...p, x: 0, y: 0, width, height })); }} />
                {rects.map((rect, i) => <div key={i} className="crop-outline" style={{ left: `${rect.x / dimensions.width * 100}%`, top: `${rect.y / dimensions.height * 100}%`, width: `${rect.width / dimensions.width * 100}%`, height: `${rect.height / dimensions.height * 100}%` }}>{operation === "image.grid.v1" && <span>{i + 1}</span>}</div>)}
              </div>
              <p className="muted">原图 {dimensions.width} × {dimensions.height} 像素{operation === "image.crop.v1" ? " · 拖动框选裁剪区域，或输入精确像素" : " · 从左到右、从上到下生成，无遗漏边缘像素"}</p>
              <div className="media-collage-options">{(operation === "image.crop.v1" ? [["x", "X"], ["y", "Y"], ["width", "宽度"], ["height", "高度"]] : [["rows", "行数"], ["columns", "列数"]]).map(([key, label]) => <label key={key}>{label}<input aria-label={label} type="number" value={params[key as keyof ImageParameters]} onChange={e => field(key as keyof ImageParameters, +e.target.value)} /></label>)}</div>
            </>}
          </> : <>
            <video className="media-tool-video" src={mediaUrl(asset.url)} controls preload="metadata" onLoadedMetadata={e => { const d = e.currentTarget.duration; if (Number.isFinite(d)) { setDuration(d); setEnd(d); } }} />
            <div className="media-collage-options">
              <label>开始（秒）<input aria-label="开始秒数" type="number" min={0} max={duration} step={.01} value={start} onChange={e => setStart(+e.target.value)} /></label>
              <label>结束（秒）<input aria-label="结束秒数" type="number" min={0} max={duration} step={.01} value={end} onChange={e => setEnd(+e.target.value)} /></label>
            </div>
            <p className="muted">{desktop ? "在本机处理，完成后自动同步到项目。远程素材会先下载到本机缓存。" : "提交到 Server 后台处理，关闭工具窗口不影响任务；在任务面板查看进度或取消。"}</p>
            <p className="muted">{operation === "media.video.trim.v1" ? "输出 MP4（H.264 / AAC）。" : "输出 WAV（PCM）。"} 输入、输出各限 1 GB，无需 GPU Worker。</p>
          </>}
        </fieldset>
      </>}
      {!!results.length && <>
        <div className="media-tool-results">{results.map((r, i) => <div key={i}>{r.file.type.startsWith("image/") ? <img src={r.url} alt={r.file.name} /> : r.file.type.startsWith("video/") ? <video src={r.url} controls /> : <audio src={r.url} controls />}<a href={r.url} download={r.file.name}>下载 {r.file.name}</a></div>)}</div>
        {canReplace && <label className="media-replace-option"><input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} disabled={busy} />更新当前节点（原内容保留在历史版本）</label>}
        <p className="muted">裁剪默认更新当前节点并保留历史；拼图与切分另建节点。保存失败可在此窗口重试。</p>
      </>}
      {status && <p role="status">{status}</p>}{busy && <progress max={1} value={progress} />}
      {error && <p role="alert" className="media-tool-error">{error}{retrySync && "。结果保留在本机，重试同步不会重新转码；关闭窗口会释放结果。"}</p>}
      <footer>{busy ? (!isImage && !desktop ? <button disabled>正在提交…</button> : <button onClick={() => controller.current?.abort()}>取消处理</button>) : results.length ? <button className="primary" onClick={() => void save()}>保存到画布</button> : <button className="primary" onClick={() => void run()} disabled={!isImage && (!videoParamsValid || (!desktop && !serverReady))}>{isImage ? "处理并预览" : retrySync ? "重试同步" : desktop ? "处理并同步" : "提交后台任务"}</button>}</footer>
    </div>
  </Modal>;
}

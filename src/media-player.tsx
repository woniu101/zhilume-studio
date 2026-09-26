import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  RefreshCw,
} from "lucide-react";
import { mediaUrl } from "./api";
import "./media-player.css";

export function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "00:00";
  const seconds = Math.floor(value);
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
    : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
const waveformCache = new Map<string, Promise<number[]>>();
let decodeQueue = Promise.resolve();
function loadWaveform(asset: any): Promise<number[]> {
  const key = asset.sha256 || asset.id;
  const cached = waveformCache.get(key);
  if (cached) return cached;
  if (asset.size > 64 * 1024 * 1024)
    return Promise.reject(new Error("large_audio"));
  const result = decodeQueue.then(async () => {
    const response = await fetch(mediaUrl(asset.url));
    if (!response.ok) throw new Error("waveform_fetch");
    const context = new OfflineAudioContext(1, 1, 8000);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      buffer.getChannelData(i),
    );
    const peaks: number[] = [];
    for (let i = 0; i < 120; i++) {
      const start = Math.floor((i * buffer.length) / 120),
        end = Math.floor(((i + 1) * buffer.length) / 120),
        stride = Math.max(1, Math.floor((end - start) / 400));
      let peak = 0;
      for (const values of channels)
        for (let j = start; j < end; j += stride)
          peak = Math.max(peak, Math.abs(values[j]));
      peaks.push(peak);
    }
    const highest = Math.max(...peaks, 0.001);
    return peaks.map((p) => Math.max(0.035, Math.pow(p / highest, 0.72)));
  });
  decodeQueue = result.then(
    () => {},
    () => {},
  );
  waveformCache.set(key, result);
  result.catch(() => waveformCache.delete(key));
  if (waveformCache.size > 24)
    waveformCache.delete(waveformCache.keys().next().value!);
  return result;
}

export function MediaPlayer({
  asset,
  kind = asset.kind,
  preview = false,
  onDimensions,
}: {
  asset: any;
  kind?: "video" | "audio";
  preview?: boolean;
  onDimensions?: (width: number, height: number) => void;
}) {
  const media = useRef<HTMLMediaElement | null>(null),
    frame = useRef<HTMLDivElement>(null),
    scrubbing = useRef(false),
    lastVolume = useRef(1);
  const waveGesture = useRef({ x: 0, y: 0, moved: false });
  const instance = useId().replace(/:/g, "");
  const [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [volume, setVolume] = useState(1),
    [rate, setRate] = useState(1),
    [error, setError] = useState(""),
    [peaks, setPeaks] = useState<number[]>([]),
    [waveState, setWaveState] = useState("loading");
  const url = mediaUrl(asset.url);
  const progress = duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0;
  useEffect(() => {
    setTime(0);
    setDuration(0);
    setPlaying(false);
    setError("");
    const element = media.current;
    return () => element?.pause();
  }, [asset.id]);
  useEffect(() => {
    if (kind !== "audio") return;
    let active = true;
    setPeaks([]);
    setWaveState("loading");
    loadWaveform(asset).then(
      (values) => {
        if (active) {
          setPeaks(values);
          setWaveState("ready");
        }
      },
      () => {
        if (active) setWaveState("unavailable");
      },
    );
    return () => {
      active = false;
    };
  }, [asset.id, kind]);
  useEffect(() => {
    const pauseOther = (event: Event) => {
      if ((event as CustomEvent).detail !== instance) media.current?.pause();
    };
    window.addEventListener("zhilume:media-play", pauseOther);
    return () => window.removeEventListener("zhilume:media-play", pauseOther);
  }, [instance]);
  useEffect(() => {
    if (!playing) return;
    let id: number;
    const update = () => {
      if (media.current) setTime(media.current.currentTime);
      id = requestAnimationFrame(update);
    };
    id = requestAnimationFrame(update);
    return () => cancelAnimationFrame(id);
  }, [playing]);
  async function toggle() {
    const element = media.current;
    if (!element) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    try {
      if (element.ended) element.currentTime = 0;
      await element.play();
      setError("");
    } catch (e) {
      setError(
        (e as Error).name === "NotSupportedError"
          ? "此媒体编码暂不支持播放"
          : "播放未能开始，请重试",
      );
    }
  }
  function seek(value: number) {
    if (!media.current || !duration) return;
    const next = Math.max(0, Math.min(duration, value));
    media.current.currentTime = next;
    setTime(next);
  }
  function waveSeek(event: PointerEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    seek(((event.clientX - bounds.left) / bounds.width) * duration);
  }
  function setSound(value: number) {
    if (!media.current) return;
    media.current.volume = value;
    media.current.muted = value === 0;
    setVolume(value);
    if (value > 0) lastVolume.current = value;
  }
  const handlers = {
    onLoadedMetadata: () => {
      const value = media.current?.duration || 0;
      setDuration(Number.isFinite(value) ? value : 0);
      if (kind === "video" && media.current instanceof HTMLVideoElement)
        onDimensions?.(media.current.videoWidth, media.current.videoHeight);
    },
    onDurationChange: () => {
      const value = media.current?.duration || 0;
      if (Number.isFinite(value)) setDuration(value);
    },
    onTimeUpdate: () => setTime(media.current?.currentTime || 0),
    onPlay: () => {
      setPlaying(true);
      window.dispatchEvent(
        new CustomEvent("zhilume:media-play", { detail: instance }),
      );
    },
    onPause: () => setPlaying(false),
    onEnded: () => {
      setPlaying(false);
      setTime(media.current?.duration || 0);
    },
    onError: () => setError("媒体加载失败或编码不受支持"),
  };
  return (
    <div
      ref={frame}
      className={`media-player ${kind}-player ${playing ? "is-playing" : "is-paused"} ${preview ? "is-preview nodrag nopan nowheel" : "is-canvas"}`}
      onPointerDown={preview ? (e) => e.stopPropagation() : undefined}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {kind === "video" ? (
        <video
          ref={(element) => {
            media.current = element;
          }}
          src={url}
          playsInline
          preload="metadata"
          onClick={preview ? () => void toggle() : undefined}
          draggable={false}
          {...handlers}
        />
      ) : (
        <audio
          ref={(element) => {
            media.current = element;
          }}
          src={url}
          preload="metadata"
          {...handlers}
        />
      )}
      {kind === "video" && !playing && !error && (
        <button
          className="video-play-overlay nodrag nopan"
          aria-label="播放视频"
          onClick={() => void toggle()}
        >
          <Play size={22} fill="currentColor" strokeWidth={0} />
        </button>
      )}
      {kind === "audio" && (
        <div
          className={`waveform-track ${waveState}`}
          role="slider"
          tabIndex={0}
          aria-label="音频波形进度"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={time}
          aria-valuetext={`${formatTime(time)} / ${formatTime(duration)}`}
          onPointerDown={(event) => {
            waveGesture.current = { x: event.clientX, y: event.clientY, moved: false };
            if (preview) {
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              scrubbing.current = true;
              waveSeek(event);
            }
          }}
          onPointerMove={(event) => {
            if (Math.hypot(event.clientX - waveGesture.current.x, event.clientY - waveGesture.current.y) > 5) waveGesture.current.moved = true;
            if (scrubbing.current) waveSeek(event);
          }}
          onPointerUp={(event) => {
            scrubbing.current = false;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            scrubbing.current = false;
            waveGesture.current.moved = true;
          }}
          onClick={(event) => {
            if (!preview && !waveGesture.current.moved) {
              const bounds = event.currentTarget.getBoundingClientRect();
              seek(((event.clientX - bounds.left) / bounds.width) * duration);
            }
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (
              ["ArrowLeft", "ArrowRight", "Home", "End", " "].includes(
                event.key,
              )
            )
              event.preventDefault();
            if (event.key === "ArrowLeft") seek(time - 5);
            if (event.key === "ArrowRight") seek(time + 5);
            if (event.key === "Home") seek(0);
            if (event.key === "End") seek(duration);
            if (event.key === " ") void toggle();
          }}
        >
          {peaks.length ? (
            <svg
              viewBox="0 0 480 92"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <clipPath id={`${instance}-played`}>
                  <rect x="0" y="0" width={480 * progress} height="92" />
                </clipPath>
              </defs>
              <g className="waveform-rest">
                {peaks.map((value, i) => (
                  <rect
                    key={i}
                    x={i * 4}
                    y={46 - value * 41}
                    width={2.3}
                    height={value * 82}
                    rx={1.1}
                  />
                ))}
              </g>
              <g
                className="waveform-played"
                clipPath={`url(#${instance}-played)`}
              >
                {peaks.map((value, i) => (
                  <rect
                    key={i}
                    x={i * 4}
                    y={46 - value * 41}
                    width={2.3}
                    height={value * 82}
                    rx={1.1}
                  />
                ))}
              </g>
            </svg>
          ) : (
            <div className="waveform-fallback">
              <span>
                {waveState === "loading"
                  ? "正在读取波形…"
                  : "波形暂不可用，可点击此处定位"}
              </span>
              <div style={{ width: `${progress * 100}%` }} />
            </div>
          )}
          <span
            className="waveform-playhead"
            style={{ left: `${progress * 100}%` }}
          />
        </div>
      )}
      <div className="player-controls nodrag nopan">
        {kind === "video" && (
          <input
            className="media-seek"
            type="range"
            min={0}
            max={duration || 1}
            step={0.01}
            value={Math.min(time, duration || 1)}
            aria-label="视频播放进度"
            disabled={!duration}
            onChange={(event) => seek(Number(event.target.value))}
            style={{ "--played": `${progress * 100}%` } as CSSProperties}
          />
        )}
        <div className="player-control-row">
          {kind === "video" && (
            <button
              className="media-icon"
              aria-label={playing ? "暂停视频" : "播放视频"}
              onClick={() => void toggle()}
            >
              {playing ? (
                <Pause size={14} fill="currentColor" />
              ) : (
                <Play size={14} fill="currentColor" />
              )}
            </button>
          )}
          <span className="media-time" aria-live="off">
            {formatTime(time)} <span>/ {formatTime(duration)}</span>
          </span>
          <div className="player-actions">
            <label className="rate-label">
              <span className="sr-only">播放速度</span>
              <select
                aria-label="播放速度"
                value={rate}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setRate(value);
                  if (media.current) media.current.playbackRate = value;
                }}
              >
                {[0.5, 1, 1.25, 1.5, 2].map((value) => (
                  <option key={value} value={value}>
                    {value}×
                  </option>
                ))}
              </select>
            </label>
            <div className="volume-control">
              <button
                className="media-icon"
                aria-label={volume ? "静音" : "取消静音"}
                onClick={() => setSound(volume ? 0 : lastVolume.current)}
              >
                {volume ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
              <input
                aria-label="音量"
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={volume}
                onChange={(event) => setSound(Number(event.target.value))}
              />
            </div>
            {kind === "video" ? (
              <button
                className="media-icon"
                aria-label="全屏视频"
                onClick={() =>
                  void (
                    document.fullscreenElement
                      ? document.exitFullscreen()
                      : frame.current?.requestFullscreen()
                  )?.catch(() => setError("无法进入全屏，可使用节点预览"))
                }
              >
                <Maximize size={15} />
              </button>
            ) : (
              <button
                className="audio-play-button"
                aria-label={playing ? "暂停音频" : "播放音频"}
                onClick={() => void toggle()}
              >
                {playing ? (
                  <Pause size={14} fill="currentColor" />
                ) : (
                  <Play size={14} fill="currentColor" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
      {error && (
        <div className="media-error" role="status">
          <span>{error}</span>
          <button
            className="media-icon nodrag nopan"
            aria-label="重新加载媒体"
            onClick={() => {
              setError("");
              media.current?.load();
            }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

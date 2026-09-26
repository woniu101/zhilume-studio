export type VideoOperation = "media.video.trim.v1" | "media.audio.extract.v1";
export type VideoParameters = { start: number; end: number };
export const WEB_INPUT_LIMIT = 64 * 1024 * 1024;
export const WEB_DURATION_LIMIT = 120;
export async function processNative(response: Response, operation: VideoOperation, params: VideoParameters, signal: AbortSignal, progress: (n: number) => void): Promise<Blob> {
  const media = window.zhilumeDesktop!.media;
  const id = await media.begin();
  const unsubscribe = media.onProgress(value => { if (value.id === id) progress(value.progress); });
  const stop = () => { void media.dispose(id); };
  signal.addEventListener("abort", stop, { once: true });
  const reader = response.body!.getReader();
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      for (let i = 0; i < value.length; i += 4 * 1024 ** 2) await media.append(id, value.slice(i, i + 4 * 1024 ** 2));
    }
    signal.throwIfAborted();
    const output = await media.run(id, operation, params), chunks: Uint8Array<ArrayBuffer>[] = [];
    for (let offset = 0; offset < output.size;) {
      signal.throwIfAborted();
      const bytes = await media.read(id, offset);
      if (!bytes.length) throw new Error("读取结果意外结束");
      chunks.push(new Uint8Array(bytes)); offset += bytes.length;
    }
    return new Blob(chunks, { type: output.filename.endsWith("mp4") ? "video/mp4" : "audio/wav" });
  } finally { await reader.cancel().catch(() => {}); unsubscribe(); signal.removeEventListener("abort", stop); await media.dispose(id); }
}
export function videoArguments(operation: VideoOperation, params: VideoParameters, input: string, output: string) {
  const { start, end } = params;
  if (![start, end].every(Number.isFinite) || start < 0 || end <= start || end > 86400) throw new Error("请设置有效的开始和结束时间");
  return ["-i", input, "-ss", String(start), "-t", String(end - start), ...(operation === "media.video.trim.v1"
    ? ["-map", "0:v:0", "-map", "0:a:0?", "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart"]
    : ["-map", "0:a:0", "-vn", "-c:a", "pcm_s16le"]), "-threads", "2", output];
}
export async function processVideo(blob: Blob, operation: VideoOperation, params: VideoParameters, signal: AbortSignal, progress: (n: number) => void): Promise<Blob> {
  if (blob.size > WEB_INPUT_LIMIT) throw new Error("浏览器本地处理上限为 64 MB，请选择 CPU Worker 或桌面版");
  signal.throwIfAborted();
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  signal.throwIfAborted();
  const ffmpeg = new FFmpeg();
  const stop = () => ffmpeg.terminate();
  signal.addEventListener("abort", stop, { once: true });
  const output = operation === "media.video.trim.v1" ? "output.mp4" : "output.wav";
  let errors = "";
  try {
    ffmpeg.on("log", ({ message }) => { errors = (errors + message + "\n").slice(-2000); });
    ffmpeg.on("progress", ({ time }) => progress(Math.min(.95, Math.max(0, time / 1e6 / (params.end - params.start)))));
    await ffmpeg.load({ coreURL: new URL("ffmpeg/ffmpeg-core.js", document.baseURI).href, wasmURL: new URL("ffmpeg/ffmpeg-core.wasm", document.baseURI).href }, { signal });
    signal.throwIfAborted();
    await ffmpeg.writeFile("input", new Uint8Array(await blob.arrayBuffer()));
    signal.throwIfAborted();
    const code = await ffmpeg.exec(videoArguments(operation, params, "input", output), 180_000);
    if (code !== 0) throw new Error(errors.includes("matches no streams") ? "视频没有可提取的音轨" : "媒体处理失败或超过 3 分钟，请改用 CPU Worker / 桌面版");
    const data = await ffmpeg.readFile(output);
    signal.throwIfAborted();
    return new Blob([new Uint8Array(data as Uint8Array)], { type: output.endsWith("mp4") ? "video/mp4" : "audio/wav" });
  } finally { signal.removeEventListener("abort", stop); ffmpeg.terminate(); }
}

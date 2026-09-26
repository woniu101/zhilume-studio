import { useEffect, useRef, useState } from "react";
import { api, mediaUrl, uploadAsset } from "../api";
import { type ImageDraft, ratios, ratioSize } from "./draft";
import catalog from "../contracts/operation-catalog.json";
import "./generation.css";

type Asset = { id: string; kind: string; filename: string; url: string };
type Profile = { profileId: string; workflowRevision: string; operations: string[]; maxReferences: number; formats: string[]; maxSize: number; referenceResolution: number; defaultSteps: number };
type Model = { id: string; name: string; operations: string[]; formats: string[]; profiles: Profile[] };
const operations = catalog.imageOperations;

export type ImageGenerationSession = { inFlight?: Promise<void> };
export function ImageGeneration({ assets, value, update, session, imported, close, submit }: {
  assets: Asset[]; value: ImageDraft; update: (change: (draft: ImageDraft) => ImageDraft) => void;
  session: ImageGenerationSession; imported: (asset: Asset) => Promise<void>; close: () => void;
  submit: (operation: string, input: object, requestId: string) => Promise<void>;
}) {
  const { operation, modelId, profileId, prompt, negative, refs, format, width, height, steps, seed } = value;
  const edit = (patch: Partial<ImageDraft>) => update(d => ({ ...d, ...patch }));
  const setRefs = (change: (refs: string[]) => string[]) => update(d => ({ ...d, refs: change(d.refs) }));
  const [models, setModels] = useState<Model[]>(catalog.imageModels.map(m => ({ ...m, profiles: [] })));
  const [busy, setBusy] = useState(!!session.inFlight), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [uploading, setUploading] = useState("");
  const input = useRef<HTMLInputElement>(null), controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function addReferences(ids: string[]) {
    update(d => {
      const refs = [...new Set([...d.refs, ...ids])];
      if (refs.length > 16) { setError("最多添加 16 张参考图"); return d; }
      return { ...d, refs, operation: refs.length > 1 ? "image.reference.v1" : "image.edit.v1", modelId: "qwen-image-2.1", profileId: d.modelId === "qwen-image-2.1" ? d.profileId : "" };
    });
  }
  async function upload(files: File[]) {
    if (controller.current || busy) return;
    const abort = new AbortController(); controller.current = abort; setError("");
    try {
      if (refs.length + files.length > 16) throw new Error("最多添加 16 张参考图");
      for (const file of files) {
        if (!file.type.startsWith("image/") || file.size > 64 * 1024 ** 2) throw new Error("请选择 64 MB 以内的图片");
        const asset = await uploadAsset(file, abort.signal, progress => setUploading(`${file.name} · ${Math.round(progress * 100)}%`));
        if (asset.kind !== "image") throw new Error("上传结果不是图片");
        await imported(asset);
        addReferences([asset.id]);
      }
    } catch (e) { if (!abort.signal.aborted) setError((e as Error).message); }
    finally { controller.current = null; setUploading(""); }
  }
  const model = models.find(m => m.id === modelId) || { id: modelId, name: modelId, operations: [], formats: [], profiles: [] };
  const profile = profileId ? model.profiles.find(p => p.profileId === profileId) : model.profiles[0];
  const images = assets.filter(a => a.kind === "image");
  const generate = operation === "image.generate.v1";
  const count = generate ? "不接受参考图" : operation === "image.edit.v1" ? "需要 1 张参考图" : `需要 2–${profile?.maxReferences ?? "待确认"} 张参考图`;
  const invalid = !model.operations.includes(operation) ? "此模型不支持当前操作，提示词与参考图已保留。"
    : refs.some(id => !images.some(a => a.id === id)) ? "参考图片不存在，请移除或重新选择。"
    : generate && refs.length ? "文生图不接受参考图，请移除参考图或切换操作。"
    : !generate && (refs.length < (operation === "image.edit.v1" ? 1 : 2) || (operation === "image.edit.v1" && refs.length !== 1)) ? count
    : profile && refs.length > profile.maxReferences ? `此执行配置最多支持 ${profile.maxReferences} 张参考图。`
    : !model.formats.includes(format) ? "此模型不支持 RGBA，请选择 PNG。"
    : !profile ? "暂无已启用此模型的在线 Worker，可先准备提示词与参考图。"
    : !profile.operations.includes(operation) ? "此执行配置未启用当前操作。"
    : !profile.formats.includes(format) ? "此执行配置不支持所选格式。"
    : !prompt.trim() ? "请输入提示词。"
    : generate && [width, height].some(n => !Number.isInteger(n) || n < 256 || n > profile.maxSize || n % 32) ? `宽高须为 256–${profile.maxSize} 内的 32 的倍数。`
    : steps && (!Number.isInteger(Number(steps)) || +steps < 1 || +steps > 100) ? "步数须为 1–100 的整数。"
    : seed && (!Number.isSafeInteger(Number(seed)) || +seed < 0) ? "种子须为非负安全整数。" : "";
  async function refresh() {
    setLoading(true);
    try { setModels(await api("/image-models")); setError(""); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void refresh();
    if (session.inFlight) void session.inFlight.then(() => setBusy(false), error => { setBusy(false); setError(error.message); });
  }, []);
  async function run() {
    if (invalid || busy || uploading || session.inFlight || !profile) return;
    setBusy(true); setError("");
    const draft = { modelId, profileId: profile.profileId, workflowRevision: profile.workflowRevision, prompt, negativePrompt: negative,
      referenceAssetIds: refs, outputFormat: format, steps: steps ? +steps : profile.defaultSteps, ...(generate ? { width, height } : {}) };
    const fingerprint = JSON.stringify({ operation, ...draft, seed });
    const request = value.request?.fingerprint === fingerprint ? value.request : { fingerprint, id: crypto.randomUUID(), seed: seed ? +seed : crypto.getRandomValues(new Uint32Array(1))[0] };
    edit({ request });
    try {
      session.inFlight = submit(operation, { ...draft, seed: request.seed }, request.id);
      await session.inFlight;
      update(d => ({ ...d, request: undefined }));
      close();
    }
    catch (e) { setError((e as Error).message); }
    finally { session.inFlight = undefined; setBusy(false); }
  }
  const preset = value.sizeMode === "custom" ? "custom" : ratios.find(([key]) => { const size = ratioSize(key, profile?.maxSize || 1536); return size?.width === width && size?.height === height; })?.[0] || "custom";
  return <div className="generation" onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; }}
    onDrop={e => {
      e.preventDefault(); e.stopPropagation();
      if (busy || uploading) return;
      const id = e.dataTransfer.getData("application/x-zhilume-asset");
      if (id) {
        if (images.some(a => a.id === id)) addReferences([id]);
        else setError("仅支持拖入图片参考素材");
      } else if (e.dataTransfer.files.length) void upload(Array.from(e.dataTransfer.files));
    }}>
      <div className="generation-tabs" role="group" aria-label="图片操作">{operations.map(op => <button key={op.id} className={operation === op.id ? "active" : ""} disabled={busy || !!uploading} onClick={() => edit({ operation: op.id })}>{op.name}</button>)}</div>
      <fieldset disabled={busy || !!uploading}>
        <label>提示词<textarea aria-label="提示词" rows={3} maxLength={12000} value={prompt} onChange={e => edit({ prompt: e.target.value })} placeholder="描述画面，或说明要怎样修改参考图…" /></label>

        {!!refs.length && <ol className="generation-references">{refs.map((id, i) => {
          const asset = images.find(a => a.id === id);
          return <li key={id}>{asset && <img src={mediaUrl(asset.url)} alt="" />}<span>{i + 1}. {asset?.filename || "素材不存在"}{i === 0 && !generate && <small>输出比例跟随此图</small>}</span><button disabled={!i} aria-label={`将参考图 ${i + 1} 向前移动`} onClick={() => setRefs(r => { const next = [...r]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; return next; })}>↑</button><button aria-label={`移除参考图 ${i + 1}`} onClick={() => setRefs(r => r.filter(v => v !== id))}>移除</button></li>;
        })}</ol>}
        <div className="reference-input"><button disabled={refs.length >= 16} onClick={() => input.current?.click()}>上传参考图</button><span className="muted">或把图片从素材库拖到这里</span>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="上传参考图片"
          onChange={e => { void upload(Array.from(e.target.files || [])); e.target.value = ""; }} /></div>
        {uploading && <p role="status">正在上传 {uploading}</p>}
        <label>添加参考图<select aria-label="添加参考图" value="" disabled={refs.length >= 16} onChange={e => { if (e.target.value) addReferences([e.target.value]); }}><option value="">从已有图片选择…</option>{images.filter(a => !refs.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.filename}</option>)}</select></label>
        <div className="generation-settings"><label>模型<select aria-label="模型" value={modelId} onChange={e => edit({ modelId: e.target.value, profileId: "" })}>{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        {generate ? <><label>画面比例<select aria-label="画面比例" value={preset} onChange={e => { const size = ratioSize(e.target.value, profile?.maxSize || 1536); if (size) edit({ ...size, sizeMode: "ratio" }); else edit({ sizeMode: "custom" }); }}>
          {ratios.filter(([key]) => ratioSize(key, profile?.maxSize || 1536)).map(([key]) => <option key={key} value={key}>{key}</option>)}<option value="custom">自定义</option>
        </select></label><span className="muted dimensions">{width} × {height}</span></> : <p className="muted">输出比例跟随第一张参考图</p>}</div>
        {generate && preset === "custom" && <div className="generation-row"><label>宽度<input aria-label="宽度" type="number" min={256} max={profile?.maxSize || 2048} step={32} value={width} onChange={e => edit({ width: +e.target.value })} /></label><label>高度<input aria-label="高度" type="number" min={256} max={profile?.maxSize || 2048} step={32} value={height} onChange={e => edit({ height: +e.target.value })} /></label></div>}
        <details><summary>更多参数</summary><div className="generation-row"><label>执行配置<select aria-label="执行配置" value={profile?.profileId || ""} onChange={e => edit({ profileId: e.target.value })}><option value="" disabled>暂无在线配置</option>{model.profiles.map(p => <option key={p.profileId} value={p.profileId}>默认 {p.defaultSteps} 步 · 上限 {p.maxSize}px · {p.maxReferences} 张参考图</option>)}</select></label>
<button onClick={refresh} disabled={loading}>{loading ? "刷新中…" : "刷新"}</button>
</div><label>反向提示词<textarea aria-label="反向提示词" rows={2} maxLength={12000} value={negative} onChange={e => edit({ negative: e.target.value })} /></label><div className="generation-row"><label>步数<input aria-label="步数" type="number" min={1} max={100} value={steps} placeholder={String(profile?.defaultSteps || "默认")} onChange={e => edit({ steps: e.target.value })} /></label><label>随机种子<input aria-label="随机种子" type="number" min={0} value={seed} placeholder="自动随机" onChange={e => edit({ seed: e.target.value })} /></label><label>输出格式<select aria-label="输出格式" value={format} onChange={e => edit({ format: e.target.value })}><option value="png">PNG</option><option value="rgba">RGBA PNG</option></select></label></div><p className="muted">RGBA 保留模型返回的透明通道，不会自动抠图。种子与执行参数会随结果归档。</p></details>
      </fieldset>
      {profile && <p className="muted">提交后使用在线 Worker 的 GPU · 当前工作流尚待 GPU 验收</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {invalid && <p className="muted" role="status">{invalid}</p>}
      <footer><span className="muted">结果作为新节点返回画布</span><button className="primary" disabled={busy || !!uploading || !!invalid} onClick={run}>{busy ? "提交中…" : "提交生成"}</button></footer>
    </div>;
}

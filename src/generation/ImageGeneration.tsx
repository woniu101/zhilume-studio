import { useEffect, useState } from "react";
import { api, mediaUrl } from "../api";
import catalog from "../contracts/operation-catalog.json";
import "./generation.css";

type Asset = { id: string; kind: string; filename: string; url: string };
type Profile = { profileId: string; workflowRevision: string; operations: string[]; maxReferences: number; formats: string[]; maxSize: number; referenceResolution: number; defaultSteps: number };
type Model = { id: string; name: string; operations: string[]; formats: string[]; profiles: Profile[] };
const operations = catalog.imageOperations;

type Draft = { operation: string; modelId: string; profileId: string; prompt: string; negative: string; refs: string[]; format: string; width: number; height: number; steps: string; seed: string };
export type ImageGenerationSession = { draft?: Draft; pending?: { fingerprint: string; id: string; seed: number }; inFlight?: Promise<void> };
export function ImageGeneration({ assets, initialPrompt, initialReferences, session, close, submit }: {
  session: ImageGenerationSession; assets: Asset[]; initialPrompt: string; initialReferences: string[]; close: () => void;
  submit: (operation: string, input: object, requestId: string) => Promise<void>;
}) {
  const saved = session.draft;
  const [models, setModels] = useState<Model[]>(catalog.imageModels.map(m => ({ ...m, profiles: [] })));
  const [operation, setOperation] = useState(saved?.operation ?? (initialReferences.length > 1 ? "image.reference.v1" : initialReferences.length ? "image.edit.v1" : "image.generate.v1"));
  const [modelId, setModelId] = useState(saved?.modelId ?? (initialReferences.length ? "qwen-image-2.1" : "qwen-image-2512"));
  const [profileId, setProfileId] = useState(saved?.profileId ?? "");
  const [prompt, setPrompt] = useState(saved?.prompt ?? initialPrompt), [negative, setNegative] = useState(saved?.negative ?? "");
  const [refs, setRefs] = useState(saved?.refs ?? initialReferences), [format, setFormat] = useState(saved?.format ?? "png");
  const [width, setWidth] = useState(saved?.width ?? 1024), [height, setHeight] = useState(saved?.height ?? 1024);
  const [steps, setSteps] = useState(saved?.steps ?? ""), [seed, setSeed] = useState(saved?.seed ?? "");
  const [busy, setBusy] = useState(!!session.inFlight), [loading, setLoading] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    session.draft = { operation, modelId, profileId, prompt, negative, refs, format, width, height, steps, seed };
  }, [session, operation, modelId, profileId, prompt, negative, refs, format, width, height, steps, seed]);
  const model = models.find(m => m.id === modelId)!;
  const profile = profileId ? model.profiles.find(p => p.profileId === profileId) : model.profiles[0];
  const images = assets.filter(a => a.kind === "image");
  const generate = operation === "image.generate.v1";
  const count = generate ? "不接受参考图" : operation === "image.edit.v1" ? "需要 1 张参考图" : `需要 2–${profile?.maxReferences ?? "待确认"} 张参考图`;
  const invalid = !model.operations.includes(operation) ? "此模型不支持当前操作，提示词与参考图已保留。"
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
    if (invalid || busy || session.inFlight || !profile) return;
    setBusy(true); setError("");
    const draft = { modelId, profileId: profile.profileId, workflowRevision: profile.workflowRevision, prompt, negativePrompt: negative,
      referenceAssetIds: refs, outputFormat: format, steps: steps ? +steps : profile.defaultSteps, ...(generate ? { width, height } : {}) };
    const fingerprint = JSON.stringify({ operation, ...draft, seed });
    if (session.pending?.fingerprint !== fingerprint) session.pending = { fingerprint, id: crypto.randomUUID(), seed: seed ? +seed : crypto.getRandomValues(new Uint32Array(1))[0] };
    try {
      session.inFlight = submit(operation, { ...draft, seed: session.pending.seed }, session.pending.id);
      await session.inFlight;
      session.pending = undefined;
      close();
    }
    catch (e) { setError((e as Error).message); }
    finally { session.inFlight = undefined; setBusy(false); }
  }
  return <div className="generation">
      <div className="generation-tabs" role="group" aria-label="图片操作">{operations.map(op => <button key={op.id} className={operation === op.id ? "active" : ""} disabled={busy} onClick={() => setOperation(op.id)}>{op.name}</button>)}</div>
      <fieldset disabled={busy}>
        <label>提示词<textarea aria-label="提示词" rows={3} maxLength={12000} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="描述画面，或说明要怎样修改参考图…" /></label>

        {!!refs.length && <ol className="generation-references">{refs.map((id, i) => {
          const asset = images.find(a => a.id === id);
          return <li key={id}>{asset && <img src={mediaUrl(asset.url)} alt="" />}<span>{i + 1}. {asset?.filename || "素材不存在"}{i === 0 && !generate && <small>输出比例跟随此图</small>}</span><button disabled={!i} aria-label={`将参考图 ${i + 1} 向前移动`} onClick={() => setRefs(r => { const next = [...r]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; return next; })}>↑</button><button aria-label={`移除参考图 ${i + 1}`} onClick={() => setRefs(r => r.filter(v => v !== id))}>移除</button></li>;
        })}</ol>}
        <label>添加参考图<select aria-label="添加参考图" value="" disabled={refs.length >= 16} onChange={e => { if (e.target.value) setRefs(r => [...r, e.target.value]); }}><option value="">从已有图片选择…</option>{images.filter(a => !refs.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.filename}</option>)}</select></label>
        <div className="generation-settings"><label>模型<select aria-label="模型" value={modelId} onChange={e => { setModelId(e.target.value); setProfileId(""); }}>{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        {generate ? <><label>宽度<input aria-label="宽度" type="number" min={256} max={profile?.maxSize || 2048} step={32} value={width} onChange={e => setWidth(+e.target.value)} /></label><label>高度<input aria-label="高度" type="number" min={256} max={profile?.maxSize || 2048} step={32} value={height} onChange={e => setHeight(+e.target.value)} /></label></> : <p className="muted">按第一张参考图比例输出，参考分辨率 {profile?.referenceResolution || "由执行配置确定"}；最终尺寸由工作流按 32 像素对齐。</p>}</div>
        <details><summary>更多参数</summary><div className="generation-row"><label>执行配置<select aria-label="执行配置" value={profile?.profileId || ""} onChange={e => setProfileId(e.target.value)}><option value="" disabled>暂无在线配置</option>{model.profiles.map(p => <option key={p.profileId} value={p.profileId}>默认 {p.defaultSteps} 步 · 上限 {p.maxSize}px · {p.maxReferences} 张参考图</option>)}</select></label>
<button onClick={refresh} disabled={loading}>{loading ? "刷新中…" : "刷新"}</button>
</div><label>反向提示词<textarea aria-label="反向提示词" rows={2} maxLength={12000} value={negative} onChange={e => setNegative(e.target.value)} /></label><div className="generation-row"><label>步数<input aria-label="步数" type="number" min={1} max={100} value={steps} placeholder={String(profile?.defaultSteps || "默认")} onChange={e => setSteps(e.target.value)} /></label><label>随机种子<input aria-label="随机种子" type="number" min={0} value={seed} placeholder="自动随机" onChange={e => setSeed(e.target.value)} /></label><label>输出格式<select aria-label="输出格式" value={format} onChange={e => setFormat(e.target.value)}><option value="png">PNG</option><option value="rgba">RGBA PNG</option></select></label></div><p className="muted">RGBA 保留模型返回的透明通道，不会自动抠图。种子与执行参数会随结果归档。</p></details>
      </fieldset>
      {profile && <p className="muted">提交后使用在线 Worker 的 GPU · 当前工作流尚待 GPU 验收</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {invalid && <p className="muted" role="status">{invalid}</p>}
      <footer><span className="muted">结果作为新节点返回画布</span><button className="primary" disabled={busy || !!invalid} onClick={run}>{busy ? "提交中…" : "提交生成"}</button></footer>
    </div>;
}

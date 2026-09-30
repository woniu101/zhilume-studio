import {ComposerLayout, ComposerPrompt, OfflineNotice} from './ComposerLayout';
import { FloatingPanel, PanelAction } from '../overlays';
import { initialProfile } from './model-selection';
import { Select } from '../Select';
import { useNodeTask } from './NodeTask';
import { LanguageTools, ExecutionTarget } from './LanguageTools';
import { useEffect, useRef, useState } from "react";
import { Plus, X, ArrowUp, GripVertical, Settings2, ChevronDown, ImagePlus } from "lucide-react";
import { api, mediaUrl, uploadAsset } from "../api";
import { type ImageDraft, ratios, ratioSize } from "./draft";
import catalog from "../contracts/operation-catalog.json";
import "./generation.css";

type Asset = { id: string; kind: string; filename: string; url: string };
type Profile = { identity?: {revision?:string;quantization?:string}; readyCount?:number; profileId: string; workflowRevision: string; operations: string[]; maxReferences: number; formats: string[]; maxSize: number; referenceResolution: number; defaultSteps: number };
type Model = { id: string; name: string; operations: string[]; formats: string[]; profiles: Profile[]; referenceLimits: { maximum: number } };
const operations = catalog.imageOperations;

export type ImageGenerationSession = { inFlight?: Promise<void> };
export function ImageGeneration({ assets, value, update, session, imported, submit }: {
  assets: Asset[]; value: ImageDraft; update: (change: (draft: ImageDraft) => ImageDraft) => void;
  session: ImageGenerationSession; imported: (asset: Asset) => Promise<void>; close: () => void;
  submit: (operation: string, input: object, requestId: string, targetWorkerId?: string) => Promise<void>;
}) {
  const taskRunning = useNodeTask();
  const referencesAnchor = useRef<HTMLButtonElement>(null);
  const advancedAnchor = useRef<HTMLButtonElement>(null);
  const outputAnchor = useRef<HTMLButtonElement>(null);
  const targetWorkerId = value.targetWorkerId || '';
  const setTargetWorkerId = (id: string) => update(d => ({ ...d, targetWorkerId: id }));
  const { operation, modelId, profileId, prompt, negative, refs, format, width, height, steps, seed } = value;
  const edit = (patch: Partial<ImageDraft>) => update(d => ({ ...d, ...patch }));
  const setRefs = (change: (refs: string[]) => string[]) => update(d => ({ ...d, refs: change(d.refs) }));
  const [models, setModels] = useState<Model[]>(catalog.imageModels.map(m => ({ ...m, profiles: [] })));
  const [busy, setBusy] = useState(!!session.inFlight), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [menu, setMenu] = useState<"references" | "output" | "advanced" | null>(null);
  const previewAnchor = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const toggle = (next: typeof menu) => setMenu(current => current === next ? null : next);
  const [uploading, setUploading] = useState("");
  const input = useRef<HTMLInputElement>(null), controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function addReferences(ids: string[]) {
    if (generate) { setError("请先选择指令编辑或多图参考，再添加参考图。"); return; }
    update(d => {
      const refs = [...new Set([...d.refs, ...ids])];
      if (refs.length > referenceLimit) { setError(`当前最多添加 ${referenceLimit} 张参考图`); return d; }
      return { ...d, refs, modelId: d.modelId, profileId: d.profileId };
    });
    setNotice("参考图已添加。");
  }
  async function upload(files: File[]) {
    if (controller.current || busy) return;
    const abort = new AbortController(); controller.current = abort; setError("");
    try {
      if (refs.length + files.length > referenceLimit) throw new Error(`当前最多添加 ${referenceLimit} 张参考图`);
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
  const model = models.find(m => m.id === modelId) || { id: modelId, name: modelId, operations: [], formats: [], profiles: [], referenceLimits: { maximum: 0 } };
  const profile = profileId ? model.profiles.find(p => p.profileId === profileId) : initialProfile(model.profiles);
  useEffect(() => { if (!value.profileId && profile) update(d => ({ ...d, profileId: profile.profileId })); }, [value.profileId, profile?.profileId]);
  const referenceModel = models.find(m => m.id === "qwen-image-2.1");
  const referenceProfile = modelId === "qwen-image-2.1" ? profile : referenceModel?.profiles[0];
  const referenceLimit = Math.min(referenceModel?.referenceLimits.maximum ?? 10, referenceProfile?.maxReferences ?? 10);
  const maxSize = profile?.maxSize ?? 1536;
  const images = assets.filter(a => a.kind === "image");
  const generate = operation === "image.generate.v1";
  const count = generate ? "不接受参考图" : operation === "image.edit.v1" ? "需要 1 张参考图" : `需要 2–${profile?.maxReferences ?? "待确认"} 张参考图`;
  const invalid = !model.operations.includes(operation) ? "此模型不支持当前操作，提示词与参考图已保留。"
    : refs.some(id => !images.some(a => a.id === id)) ? "参考图片不存在，请移除或重新选择。"
    : refs.length > (referenceModel?.referenceLimits.maximum ?? 10) ? "模型最多支持 10 张参考图，请移除多余参考；草稿仍会保存。"
    : generate && refs.length ? "文生图不接受参考图，请移除参考图或切换操作。"
    : !generate && (refs.length < (operation === "image.edit.v1" ? 1 : 2) || (operation === "image.edit.v1" && refs.length !== 1)) ? count
    : profile && refs.length > profile.maxReferences ? `此执行配置最多支持 ${profile.maxReferences} 张参考图。`
    : !model.formats.includes(format) ? "此模型不支持 RGBA，请选择 PNG。"
    : !profile ? "暂无此模型的已登记规格，可先准备提示词与参考图。"
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
    if (invalid || taskRunning || busy || uploading || session.inFlight || !profile) return;
    setBusy(true); setError("");
    const draft = { modelId, profileId: profile.profileId, workflowRevision: profile.workflowRevision, prompt, negativePrompt: negative,
      referenceAssetIds: refs, outputFormat: format, steps: steps ? +steps : profile.defaultSteps, ...(generate ? { width, height } : {}) };
    const fingerprint = JSON.stringify({ operation, ...draft, seed, targetWorkerId });
    const request = value.request?.fingerprint === fingerprint ? value.request : { fingerprint, id: crypto.randomUUID(), seed: seed ? +seed : crypto.getRandomValues(new Uint32Array(1))[0] };
    edit({ request });
    try {
      session.inFlight = submit(operation, { ...draft, seed: request.seed }, request.id, targetWorkerId);
      await session.inFlight;
      update(d => ({ ...d, request: undefined }));

    }
    catch (e) { setError((e as Error).message); }
    finally { session.inFlight = undefined; setBusy(false); }
  }
  const preset = value.sizeMode === "custom" ? "custom" : ratios.find(([key]) => { const size = ratioSize(key, maxSize, Math.max(width, height)); return size?.width === width && size?.height === height; })?.[0] || "custom";
  const chooseSize = (ratio: string, target = Math.max(width, height)) => {
    const size = ratioSize(ratio, maxSize, target);
    if (size) edit({ ...size, sizeMode: "ratio" });
  };
  const reorder = (from: number, to: number) => setRefs(current => {
    const next = [...current], [id] = next.splice(from, 1); next.splice(to, 0, id); return next;
  });
  return <ComposerLayout onKeyDown={event => {
    if (event.key === "Escape" && (menu || preview)) { event.stopPropagation(); setMenu(null); setPreview(null); }
  }} onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; }}
    onDrop={e => {
      e.preventDefault(); e.stopPropagation();
      if (busy || uploading || e.dataTransfer.types.includes("application/x-zhilume-reference")) return;
      const id = e.dataTransfer.getData("application/x-zhilume-asset");
      if (id) {
        if (images.some(a => a.id === id)) addReferences([id]);
        else setError("仅支持拖入图片参考素材");
      } else if (e.dataTransfer.files.length) void upload(Array.from(e.dataTransfer.files));
    }}
    disabled={busy || !!uploading}
    modes={<div className="generation-tabs" role="group" aria-label="图片操作">{operations.map(op => <button key={op.id} aria-pressed={operation === op.id} className={operation === op.id ? "active" : ""} disabled={busy || !!uploading} onClick={() => edit({ operation: op.id })}>{op.name.replace("图片指令编辑", "指令编辑")}</button>)}</div>}
    tools={<LanguageTools value={prompt} apply={v => edit({ prompt: v })} purpose="qwen" context={{ operation }} referenceAssetIds={refs} />}
    actions={<span className="character-count">{prompt.length}/12000</span>}
    status={<>{uploading && <p className="muted">正在上传 {uploading}</p>}
    {notice && <p className="muted composer-notice">{notice}</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {invalid && invalid !== "请输入提示词。" && (invalid !== count || refs.length > 0) && <div className="composer-validation" role="status">{invalid}{!model.operations.includes(operation) && <button onClick={() => { edit({ modelId: "qwen-image-2.1", profileId: "" }); setNotice("已切换至 Qwen Image 2.1，原输入已保留。"); }}>切换至 Qwen 2.1</button>}{format === "rgba" && !model.formats.includes(format) && <button onClick={() => edit({ format: "png" })}>使用普通 PNG</button>}</div>}{!error && <OfflineNotice profile={profile}/>}</>}
    submit={<button className="primary generate-submit" aria-label="提交生成" title={taskRunning ? "当前节点任务尚未结束" : invalid || "生成到当前节点"} disabled={taskRunning || busy || !!uploading || !!invalid} onClick={run}>{busy ? "提交中…" : <><ArrowUp size={18} /><span>{'生成'}</span></>}</button>}
    footer={<>
      <Select className="model-picker" displayValue={<><i className="model-dot" data-ready={(profile?.readyCount || 0)>0}/>{model.name}</>} aria-label="模型" disabled={busy || !!uploading} value={modelId} onChange={e => edit({ modelId: e.target.value, profileId: "" })}>{models.map(m => <option key={m.id} value={m.id}>{m.name}{m.profiles.length ? ` · ${m.profiles.reduce((count,p) => count+(p.readyCount || 0),0)} 端在线` : " · 未配置"}</option>)}</Select>
      <button ref={outputAnchor} aria-label="输出参数" aria-expanded={menu === "output"} disabled={busy || !!uploading} onClick={() => toggle("output")}>{generate ? `${width} × ${height}` : "跟随基准图"}{format === "rgba" ? " · 透明" : ""}<ChevronDown size={13} /></button>
      <button ref={advancedAnchor} aria-label="更多参数" aria-expanded={menu === "advanced"} disabled={busy || !!uploading} onClick={() => toggle("advanced")}><Settings2 size={16} /></button>

    </>}>

      {(!generate || refs.length > 0) && <div className="reference-strip">
        <ol className="generation-references">{refs.map((id, i) => {
          const asset = images.find(a => a.id === id);
          return <li key={id} draggable={!busy && !uploading} data-reference-id={id}
            onDragStart={e => { e.dataTransfer.setData("application/x-zhilume-reference", id); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); const from = refs.indexOf(e.dataTransfer.getData("application/x-zhilume-reference")); if (!busy && !uploading && from >= 0 && from !== i) reorder(from, i); }}>
            <button className="reference-thumbnail checkerboard" aria-label={`查看参考图 ${i + 1}`} onClick={e => {previewAnchor.current=e.currentTarget;setPreview(id);}}>{asset ? <img src={mediaUrl(asset.url)} alt={asset.filename} /> : <span>素材不存在</span>}</button>
            <span className="reference-number">{i + 1}</span>
            <button className="reference-remove" aria-label={`移除参考图 ${i + 1}`} onClick={() => setRefs(r => r.filter(v => v !== id))}><X size={12} /></button>
            <span className="reference-role">{i === 0 ? operation === "image.edit.v1" ? "被编辑图片" : "构图基准图" : "参考图片"}</span>
            <span className="reference-name" title={asset?.filename}>{asset?.filename || "素材不存在"}</span>
            <div className="reference-actions"><GripVertical size={12} aria-hidden="true" /><button disabled={!i} aria-label={`将参考图 ${i + 1} 向前移动`} onClick={() => reorder(i, i - 1)}>←</button><button disabled={!i} aria-label={`将参考图 ${i + 1} 设为构图基准`} onClick={() => reorder(i, 0)}>设为基准</button></div>
          </li>;
        })}</ol>
        <button className="reference-add" ref={referencesAnchor} aria-label="添加参考素材" aria-expanded={menu === "references"} disabled={refs.length >= referenceLimit} onClick={() => toggle("references")}><ImagePlus size={22} /><span>参考图片</span><small>{refs.length}/{referenceLimit}</small></button>
      </div>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="上传参考图片"
        onChange={e => { void upload(Array.from(e.target.files || [])); e.target.value = ""; }} />
      {menu === "references" && <FloatingPanel anchor={referencesAnchor} title="选择参考图片" close={() => setMenu(null)} disabled={busy || !!uploading}>
        <div className="reference-input"><button onClick={() => input.current?.click()}><Plus size={14} /> 上传参考图</button><span className="muted">也可将图片拖入面板</span></div>
        <label>添加参考图<Select aria-label="添加参考图" value="" disabled={refs.length >= referenceLimit} onChange={e => { if (e.target.value) addReferences([e.target.value]); }}><option value="">从已有图片选择…</option>{images.filter(a => !refs.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.filename}</option>)}</Select></label>
        <p className="muted">{referenceProfile ? `当前执行配置最多 ${referenceLimit} 张` : `离线可准备最多 ${referenceLimit} 张，提交时按在线配置校验`}。拖动卡片可排序，第一张决定参考输出比例。</p>
      </FloatingPanel>}
      {preview && <FloatingPanel anchor={previewAnchor} title="参考图片预览" wide close={() => setPreview(null)}><div className="reference-preview checkerboard"><img src={mediaUrl(images.find(a => a.id === preview)?.url || "")} alt="参考图大图" /></div></FloatingPanel>}
      <ComposerPrompt aria-label="提示词" rows={3} maxLength={12000} value={prompt} onChange={e => edit({ prompt: e.target.value })} placeholder={generate ? "描述你想生成的画面…" : "说明保留什么、修改什么，或如何组合参考图片…"} />
      {menu === "output" && <FloatingPanel anchor={outputAnchor} title="输出参数设置" close={() => setMenu(null)} disabled={busy || !!uploading}>
        {generate ? <>
          <div className="ratio-grid" role="group" aria-label="画面比例">{ratios.map(([key, w, h]) => <button key={key} aria-pressed={preset === key} disabled={!ratioSize(key, maxSize)} onClick={() => chooseSize(key)}><i style={{ width: 22 * Math.min(w / h, 1), height: 22 * Math.min(h / w, 1) }} /><span>{key}</span></button>)}<button aria-pressed={preset === "custom"} onClick={() => edit({ sizeMode: "custom" })}>自定义</button></div>
          {preset !== "custom" ? <div className="size-grid" role="group" aria-label="输出尺寸">{[512, 1024, 1536, 2048].filter(n => n <= maxSize).map(n => { const size = ratioSize(preset, maxSize, n); return size && <button key={n} aria-pressed={width === size.width && height === size.height} onClick={() => chooseSize(preset, n)}>{size.width} × {size.height}</button>; })}</div> : <div className="generation-row"><label>宽度<input aria-label="宽度" type="number" min={256} max={maxSize} step={32} value={width} onChange={e => edit({ width: +e.target.value })} /></label><label>高度<input aria-label="高度" type="number" min={256} max={maxSize} step={32} value={height} onChange={e => edit({ height: +e.target.value })} /></label></div>}
          <p className="muted">{width} × {height} 像素 · {profile ? `当前上限 ${maxSize}px` : "离线草稿，连接后检查尺寸"}</p>
        </> : <p className="muted">输出比例跟随构图基准图。{profile ? `参考处理分辨率 ${profile.referenceResolution}px。` : "连接后确认处理分辨率。"}在卡片上点击“设为基准”可更换。</p>}
        <label className="transparency-option"><input type="checkbox" aria-label="透明背景" checked={format === "rgba"} disabled={!model.formats.includes("rgba") || (!!profile && !profile.formats.includes("rgba"))} onChange={e => edit({ format: e.target.checked ? "rgba" : "png" })} /><span>透明背景 <small>{model.formats.includes("rgba") ? "保留模型返回的透明通道；请在提示词中说明透明背景" : "需要 Qwen Image 2.1"}</small></span></label>
      </FloatingPanel>}
      {menu === "advanced" && <FloatingPanel anchor={advancedAnchor} title="更多参数设置" close={() => setMenu(null)} disabled={busy || !!uploading}>
        <div className="generation-row"><label>执行配置<Select aria-label="执行配置" value={profile?.profileId || ""} onChange={e => edit({ profileId: e.target.value })}><option value="" disabled>暂无已登记规格</option>{model.profiles.map(p => <option key={p.profileId} value={p.profileId}>{p.identity?.revision} · {p.identity?.quantization || p.workflowRevision} · {p.readyCount || 0} 端 · {p.profileId.slice(0,8)}</option>)}</Select></label><button onClick={refresh} disabled={loading}>{loading ? "刷新中…" : "刷新"}</button></div>
      <ExecutionTarget profile={profile} value={targetWorkerId} change={setTargetWorkerId} />
        <label>反向提示词<textarea aria-label="反向提示词" rows={2} maxLength={12000} value={negative} onChange={e => edit({ negative: e.target.value })} /></label>
        <div className="generation-row"><label>步数<input aria-label="步数" type="number" min={1} max={100} value={steps} placeholder={String(profile?.defaultSteps || "默认")} onChange={e => edit({ steps: e.target.value })} /></label><label>随机种子<input aria-label="随机种子" type="number" min={0} value={seed} placeholder="自动随机" onChange={e => edit({ seed: e.target.value })} /></label></div>
      </FloatingPanel>}

  </ComposerLayout>;
}

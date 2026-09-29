import {ComposerLayout, OfflineNotice, submitLabel} from './ComposerLayout';
import type {ReactNode} from 'react';
import { PanelAction } from '../overlays';
import type { LanguageSelection } from './model-selection';
import { useNodeTask } from './NodeTask';
import { Select } from '../Select';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api';
export const LanguageProject = createContext('');

/** Suggestions remain separate from the node draft until the author applies them. */
export function LanguageTools({ value, apply, purpose = 'general', generate = false, context, referenceAssetIds = [], nodeId, prepare, submitted, selection, select, pending, body, modes }: { body?: ReactNode; modes?: ReactNode; pending?:(value:boolean)=>void; selection?:LanguageSelection; select?:(value:LanguageSelection)=>void; nodeId?: string; prepare?: () => Promise<void>; submitted?: () => Promise<void>; context?: any; referenceAssetIds?: string[]; value: string; apply: (v: string) => void; purpose?: string; generate?: boolean }) {
  const nodeBusy = useNodeTask();
  const [localWorker, setLocalWorker] = useState('');
  const targetWorkerId = selection?.targetWorkerId ?? localWorker;
  const setTargetWorkerId = (id:string) => {setLocalWorker(id); if (select) select({...selection, profileId:modelId,targetWorkerId:id});};
  const [useImages, setUseImages] = useState(false);
  const projectId = useContext(LanguageProject);
  const [models, setModels] = useState<any[]>([]), [selected, setSelected] = useState('');
  const [job, setJob] = useState<any>(null), [error, setError] = useState(''), [original, setOriginal] = useState('');
  const [suggestion, setSuggestion] = useState(''), [submitting, setSubmitting] = useState(false);
  const request = useRef<{ id: string; fingerprint: string } | null>(null);
  useEffect(() => { api('/language/models').then(setModels, e => setError(e.message)); }, []);
  useEffect(() => {
    if (!job || ['succeeded','failed','cancelled','interrupted'].includes(job.status)) return;
    let disposed = false;
    const timer = setInterval(() => { api(`/jobs/${job.id}`).then(v => { if (disposed) return; setJob(v); if (v.status === 'succeeded' && !generate) { setSuggestion(v.outputText || ''); request.current = null; } if (['failed','interrupted'].includes(v.status)) { setError(v.error || '请求失败，原稿已保留'); request.current = null; } if (v.status === 'cancelled') request.current = null; }, e => { if (!disposed) setError(e.message); }); }, 800);
    return () => { disposed = true; clearInterval(timer); };
  }, [job?.id, job?.status]);
  const modelId = selection?.profileId || selected || models.find(m => m.defaults.includes(generate ? 'text' : purpose))?.profileId || '';
  useEffect(() => { if (select && !selection?.profileId && modelId) select({profileId:modelId,targetWorkerId}); },[modelId,selection?.profileId]);
  const busy = (generate && nodeBusy) || submitting || (job && !['succeeded','failed','cancelled','interrupted'].includes(job.status));
  async function run() {
    if (busy || !modelId || !value.trim()) return;
    const input = { profileId: modelId, text: value, purpose, context, referenceAssetIds: useImages && models.find(m => m.profileId === modelId)?.capabilities.includes('vision') ? referenceAssetIds : [] };
    const fingerprint = JSON.stringify({input, targetWorkerId});
    if (selection?.request?.fingerprint === fingerprint) request.current = selection.request;
    if (!request.current || request.current.fingerprint !== fingerprint) request.current = { id: crypto.randomUUID(), fingerprint };
    if (select) select({profileId:modelId,targetWorkerId,request:request.current});
    setSubmitting(true); if(generate)pending?.(true); setOriginal(value); setSuggestion(''); setError('');
    try { if (generate) await prepare?.(); const next = await api('/jobs', 'POST', { requestId: request.current.id, projectId, ...(generate && nodeId ? { nodeId } : {}), ...(models.find(m=>m.profileId === modelId)?.executor === 'worker' && targetWorkerId ? {targetWorkerId} : {}), operation: generate ? 'text.generate.v1' : 'prompt.optimize.v1', input }); if (generate) { request.current = null; select?.({profileId:modelId,targetWorkerId}); await submitted?.(); return; } setJob(next); if(next.status === 'succeeded') setSuggestion(next.outputText || ''); if(['failed','cancelled','interrupted'].includes(next.status)){request.current=null;setError(next.error || '任务已结束，原稿已保留');} }
    catch (e) { setError((e as Error).message); }
    finally { setSubmitting(false); if(generate)pending?.(false); }
  }
  const selectedModel = models.find(m => m.profileId === modelId);
  const controls = <><Select aria-label="语言模型" value={modelId} onChange={e => {setSelected(e.target.value);setLocalWorker('');select?.({profileId:e.target.value,targetWorkerId:''});}} disabled={!!busy}>
      <option value="">{generate ? '选择语言模型' : '使用默认优化模型 / 选择模型'}</option>{models.map(m => <option key={m.profileId} value={m.profileId}>{m.providerName} / {m.name}{m.executor === 'worker' ? ` · ${m.readyCount} 个执行端就绪` : m.ready ? '' : ' · 已停用'}</option>)}
    </Select>{selectedModel?.executor === "worker" && <PanelAction title="语言参数" label="设置"><ExecutionTarget profile={selectedModel} value={targetWorkerId} change={setTargetWorkerId}/></PanelAction>}<button className="primary generate-submit" aria-label={generate ? "生成文本" : "优化提示词"} disabled={!!busy || !modelId || !value.trim()} onClick={() => void run()}>{generate ? submitLabel(selectedModel,'生成文本') : '优化提示词'}</button>
    {busy && job && <button onClick={() => api(`/jobs/${job.id}/cancel`, 'POST', {}).then(v => {setJob(v);if(v.status === 'cancelled')request.current=null;}, e => setError(e.message))}>取消</button>}</>;
  const status = <>{!models.length && <small className="muted">请先在 Server 管理台配置语言模型。</small>}{busy && <small role="status">{job?.stage || "提交中…"}</small>}{error && <p role="alert">{error}</p>}{selectedModel?.executor === "worker" && <OfflineNotice profile={selectedModel}/>}</>;
  const content = <div className="language-tools"><div className="generation-row">{controls}</div>    {referenceAssetIds.length > 0 && <label><input type="checkbox" checked={useImages} disabled={!selectedModel?.capabilities.includes('vision')} onChange={e => setUseImages(e.target.checked)} />同时发送参考图片给语言模型（需图片理解能力）</label>}
    {!models.length && <small className="muted">可在 Server 管理台配置语言模型；不影响直接生成图片、视频和语音。</small>}
    {busy && <small role="status">{job?.stage || '提交中…'}</small>}
    {error && <p role="alert">{error}</p>}
    {suggestion && <div className="suggestion-review"><label>原稿<textarea readOnly value={original}/></label><label>建议稿<textarea value={suggestion} onChange={e => setSuggestion(e.target.value)}/></label>
      {value !== original && <small>你已修改原稿；应用建议会替换当前输入。</small>}
      <div className="generation-row"><button onClick={() => { setSuggestion(''); request.current = null; }}>放弃建议</button><button className="primary" onClick={() => { apply(suggestion); setSuggestion(''); request.current = null; }}>应用建议</button></div></div>}
  </div>;
  return generate ? <ComposerLayout modes={modes} footer={controls} status={status}>{body}</ComposerLayout> : <PanelAction title="优化提示词" label="✦ 优化提示词" wide>{content}</PanelAction>;
}

export function ExecutionTarget({ profile, value, change }: { profile: any; value: string; change: (id: string) => void }) {
  if (!profile) return null;
  return <section className="execution-target" aria-label="执行设置"><small>{profile.readyCount || 0} 个执行端就绪 · {profile.identity?.revision || ''} · {profile.identity?.quantization || ''} · 规格 {profile.profileId.slice(0, 8)}</small>
    <label>执行端<Select aria-label="指定执行端" value={value} onChange={e => change(e.target.value)}><option value="">自动分配相同规格</option>{(profile.workers || []).filter((w: any) => w.id !== 'registry').map((w: any) => <option value={w.id} key={w.id}>{w.name}{w.ready ? '' : ' · 离线'}</option>)}</Select></label>
  </section>;
}

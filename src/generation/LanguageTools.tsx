import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api';
export const LanguageProject = createContext('');

/** Suggestions remain separate from the node draft until the author applies them. */
export function LanguageTools({ value, apply, purpose = 'general', generate = false, context, referenceAssetIds = [] }: { context?: any; referenceAssetIds?: string[]; value: string; apply: (v: string) => void; purpose?: string; generate?: boolean }) {
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
    const timer = setInterval(() => { api(`/jobs/${job.id}`).then(v => { if (disposed) return; setJob(v); if (v.status === 'succeeded') setSuggestion(v.outputText || ''); if (['failed','interrupted'].includes(v.status)) setError(v.error || '请求失败，原稿已保留'); }, e => { if (!disposed) setError(e.message); }); }, 800);
    return () => { disposed = true; clearInterval(timer); };
  }, [job?.id, job?.status]);
  const modelId = selected || models.find(m => m.defaults.includes(generate ? 'text' : purpose))?.profileId || '';
  const busy = submitting || (job && !['succeeded','failed','cancelled','interrupted'].includes(job.status));
  async function run() {
    const input = { profileId: modelId, text: value, purpose, context, referenceAssetIds: useImages && models.find(m => m.profileId === modelId)?.capabilities.includes('vision') ? referenceAssetIds : [] };
    const fingerprint = JSON.stringify(input);
    if (!request.current || request.current.fingerprint !== fingerprint) request.current = { id: crypto.randomUUID(), fingerprint };
    setSubmitting(true); setOriginal(value); setSuggestion(''); setError('');
    try { setJob(await api('/jobs', 'POST', { requestId: request.current.id, projectId, operation: generate ? 'text.generate.v1' : 'prompt.optimize.v1', input })); }
    catch (e) { setError((e as Error).message); }
    finally { setSubmitting(false); }
  }
  const selectedModel = models.find(m => m.profileId === modelId);
  return <section className="language-tools">
    <div className="generation-row"><select aria-label="语言模型" value={modelId} onChange={e => setSelected(e.target.value)} disabled={!!busy}>
      <option value="">选择语言模型（可选）</option>{models.map(m => <option key={m.profileId} value={m.profileId}>{m.providerName} / {m.name}{m.ready ? '' : ' · 已停用'}</option>)}
    </select><button disabled={!!busy || !modelId || !value.trim()} onClick={() => void run()}>{generate ? '生成文本' : '优化提示词'}</button>
    {busy && job && <button onClick={() => api(`/jobs/${job.id}/cancel`, 'POST', {}).then(setJob, e => setError(e.message))}>取消</button>}</div>
    {referenceAssetIds.length > 0 && <label><input type="checkbox" checked={useImages} disabled={!selectedModel?.capabilities.includes('vision')} onChange={e => setUseImages(e.target.checked)} />同时发送参考图片给语言模型（需图片理解能力）</label>}
    {!models.length && <small className="muted">可在 Server 管理台配置语言模型；不影响直接生成图片、视频和语音。</small>}
    {busy && <small role="status">{job?.stage || '提交中…'}</small>}
    {error && <p role="alert">{error}</p>}
    {suggestion && <div className="suggestion-review"><label>原稿<textarea readOnly value={original}/></label><label>建议稿<textarea value={suggestion} onChange={e => setSuggestion(e.target.value)}/></label>
      {value !== original && <small>你已修改原稿；应用建议会替换当前输入。</small>}
      <div className="generation-row"><button onClick={() => { setSuggestion(''); request.current = null; }}>放弃建议</button><button className="primary" onClick={() => { apply(suggestion); setSuggestion(''); request.current = null; }}>应用建议</button></div></div>}
  </section>;
}

export function ExecutionTarget({ profile, value, change }: { profile: any; value: string; change: (id: string) => void }) {
  if (!profile) return null;
  return <div className="execution-target"><small>{profile.readyCount || 0} 个执行端就绪 · {profile.identity?.revision || ''} · {profile.identity?.quantization || ''} · 规格 {profile.profileId.slice(0, 8)}</small>
    <details><summary>执行端（默认自动分配）</summary><select aria-label="指定执行端" value={value} onChange={e => change(e.target.value)}><option value="">自动分配相同规格</option>{(profile.workers || []).filter((w: any) => w.id !== 'registry').map((w: any) => <option value={w.id} key={w.id}>{w.name}{w.ready ? '' : ' · 离线'}</option>)}</select></details>
  </div>;
}

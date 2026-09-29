import { initialProfile } from './model-selection';
import { Select } from '../Select';
import { useNodeTask } from './NodeTask';
import { LanguageTools, ExecutionTarget } from './LanguageTools';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Settings2, Upload } from 'lucide-react';
import { api, mediaUrl, uploadAsset } from '../api';
import catalog from '../contracts/operation-catalog.json';
import type { SpeechDraft } from './speech-draft';
import type { ImageGenerationSession } from './ImageGeneration';
import './generation.css';
type Asset = { id: string; kind: string; filename: string; url: string };
type Profile = { readyCount?:number; identity?: {revision?:string;quantization?:string}; profileId: string; workflowRevision: string; languages: string[]; emotionModes: string[]; maxTextCharacters: number };
const model = catalog.speechModels[0];
const modes = [['follow','跟随音色参考'],['reference','情绪参考音频'],['vector','手动情绪'],['text','文字描述情绪']];
export function SpeechGeneration({ assets, value, update, session, imported, submit }: {
  assets: Asset[]; value: SpeechDraft; update: (change: (d: SpeechDraft) => SpeechDraft) => void; session: ImageGenerationSession;
  imported: (a: Asset) => Promise<void>; close: () => void; submit: (operation: string, input: object, requestId: string, targetWorkerId?: string) => Promise<void>;
}) {
  const taskRunning = useNodeTask();
  const targetWorkerId = value.targetWorkerId || '';
  const setTargetWorkerId = (id: string) => update(d => ({ ...d, targetWorkerId: id }));
  const [profiles, setProfiles] = useState<Profile[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(false), [busy, setBusy] = useState(!!session.inFlight), [uploading, setUploading] = useState('');
  const controller = useRef<AbortController | null>(null);
  const profile = value.profileId ? profiles.find(p => p.profileId === value.profileId) : initialProfile(profiles);
  const edit = (patch: Partial<SpeechDraft>) => update(d => ({ ...d, ...patch }));
  useEffect(() => { if (!value.profileId && profile) update(d => ({ ...d, profileId: profile.profileId })); }, [value.profileId, profile?.profileId]);
  const audio = assets.filter(a => a.kind === 'audio');
  async function refresh() {
    setLoading(true);
    try { const models = await api('/speech-models'); setProfiles(models.find((m: any) => m.id === value.modelId)?.profiles || []); setError(''); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void refresh();
    if (session.inFlight) void session.inFlight.then(() => setBusy(false), e => { setBusy(false); setError(e.message); });
    return () => controller.current?.abort();
  }, []);
  const clipError = (role: 'speaker' | 'emotionReference') => {
    const c = value[role];
    return !audio.some(a => a.id === c.assetId) ? `请选择${role === 'speaker' ? '音色' : '情绪'}参考音频。`
      : !Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < 0 || c.end > 86400 || c.end - c.start < 1 || c.end - c.start > 30 ? '参考片段需为 1–30 秒。' : '';
  };
  const invalid = clipError('speaker') || (value.emotionMode === 'reference' ? clipError('emotionReference') : '') ||
    (!value.text.trim() ? '输入要合成的文字。' : '') ||
    (value.text.length > (profile?.maxTextCharacters || 1000) ? '文字超过当前执行配置上限。' : '') ||
    (!profile ? '暂无已启用 IndexTTS 的在线 Worker，可先准备文字和参考音频。' : '') ||
    (profile && !profile.emotionModes.includes(value.emotionMode) ? '当前配置未启用此情绪模式，请调整或更换配置。' : '') ||
    (profile && !profile.languages.includes(value.language) ? '当前配置不支持此语言。' : '') ||
    (value.emotionMode === 'text' && !value.emotionText.trim() ? '请输入情绪描述。' : '');
  async function upload(role: 'speaker' | 'emotionReference', file?: File) {
    if (!file || controller.current) return;
    const abort = new AbortController(); controller.current = abort; setError('');
    try {
      if (!file.type.startsWith('audio/') || file.size > 64 * 1024 ** 2) throw new Error('请选择 64 MB 以内的音频');
      const a = await uploadAsset(file, abort.signal, p => setUploading(`${Math.round(p * 100)}%`));
      if (a.kind !== 'audio') throw new Error('素材不是音频');
      await imported(a); edit({ [role]: { assetId: a.id, start: 0, end: 10 } });
    } catch (e) { if (!abort.signal.aborted) setError((e as Error).message); }
    finally { controller.current = null; setUploading(''); }
  }
  function reference(role: 'speaker' | 'emotionReference', title: string) {
    const clip = value[role], asset = audio.find(a => a.id === clip.assetId);
    return <section className="speech-reference composer-popover" aria-label={title} onDragOver={e => { e.preventDefault(); e.stopPropagation(); }} onDrop={e => {
      e.preventDefault(); e.stopPropagation(); if (busy || uploading) return;
      const id = e.dataTransfer.getData('application/x-zhilume-asset');
      if (audio.some(a => a.id === id)) edit({ [role]: { assetId: id, start: 0, end: 10 } });
      else if (e.dataTransfer.files[0]) void upload(role, e.dataTransfer.files[0]); else setError('此区域仅接受音频参考');
    }}>
      <div className="generation-row"><label>{title}<Select aria-label={title} value={clip.assetId} onChange={e => edit({ [role]: { assetId: e.target.value, start: 0, end: 10 } })}><option value="">选择项目音频…</option>{audio.map(a => <option key={a.id} value={a.id}>{a.filename}</option>)}</Select></label>
        <label className="speech-upload"><Upload size={14} />上传<input aria-label={`上传${title}`} type="file" accept="audio/wav,audio/mpeg,audio/flac,audio/ogg,audio/mp4" onChange={e => { void upload(role, e.target.files?.[0]); e.target.value = ''; }} /></label></div>
      {asset && <audio controls preload="metadata" aria-label={`试听${title}原素材`} src={mediaUrl(asset.url)} onLoadedMetadata={e => {
        const duration = e.currentTarget.duration;
        if (Number.isFinite(duration) && clip.start === 0 && clip.end === 10 && duration < 10) update(d => d[role].assetId === asset.id ? { ...d, [role]: { ...d[role], end: Math.floor(duration * 1000) / 1000 } } : d);
      }} />}
      <div className="generation-row"><label>起点（秒）<input aria-label={`${title}起点`} type="number" min={0} step={.1} value={clip.start} onChange={e => edit({ [role]: { ...clip, start: +e.target.value } })} /></label><label>终点（秒）<input aria-label={`${title}终点`} type="number" min={0} step={.1} value={clip.end} onChange={e => edit({ [role]: { ...clip, end: +e.target.value } })} /></label></div>
      <small className="muted">合成仅使用指定片段（1–30 秒）；播放器试听原素材。建议选清晰、单人、无背景音乐的人声。</small>
    </section>;
  }
  async function run() {
    if (taskRunning || invalid || !profile || busy || session.inFlight) return;
    const input = { ...value, request: undefined, profileId: profile.profileId, workflowRevision: profile.workflowRevision };
    const fingerprint = JSON.stringify({input,targetWorkerId}), request = value.request?.fingerprint === fingerprint ? value.request : { fingerprint, id: crypto.randomUUID() };
    edit({ request }); setBusy(true); setError('');
    try { session.inFlight = submit('audio.speech.v1', input, request.id, targetWorkerId); await session.inFlight; update(d => ({ ...d, request: undefined }));  }
    catch (e) { setError((e as Error).message); }
    finally { session.inFlight = undefined; setBusy(false); }
  }
  return <div className="generation speech-generation" onKeyDown={e => { if (e.key === 'Escape' && settings) { e.stopPropagation(); setSettings(false); } }}>
    <fieldset disabled={busy || !!uploading}>
      {reference('speaker','音色参考')}
      <textarea className="composer-prompt" aria-label="合成文字" maxLength={1000} value={value.text} onChange={e => edit({ text: e.target.value })} placeholder="输入要合成的文字…" />
      <div className="prompt-meta"><span>内容按原文朗读；不会自动改写</span><span>{value.text.length}/{profile?.maxTextCharacters || 1000}</span></div>
      <label>情绪方式<Select aria-label="情绪方式" value={value.emotionMode} onChange={e => edit({ emotionMode: e.target.value })}>{modes.map(([key,title]) => <option key={key} value={key} disabled={!!profile && !profile.emotionModes.includes(key)}>{title}</option>)}</Select></label>
      {value.emotionMode === 'reference' && reference('emotionReference','情绪参考')}
      {value.emotionMode === 'text' && <label>情绪描述<textarea aria-label="情绪描述" maxLength={500} value={value.emotionText} onChange={e => edit({ emotionText: e.target.value })} placeholder="例如：轻声安慰，温暖而平静" /><small className="muted">需要执行端启用额外的文字情绪模型。</small></label>}
      {value.emotionMode === 'vector' && <div className="speech-emotions">{model.emotionLabels.map((label,i) => <label key={label}>{label} {value.emotionVector[i].toFixed(2)}<input aria-label={`${label}强度`} type="range" min={0} max={1} step={.05} value={value.emotionVector[i]} onChange={e => edit({ emotionVector: value.emotionVector.map((n,j) => i === j ? +e.target.value : n) })} /></label>)}</div>}
      {value.emotionMode !== 'follow' && <label>情绪影响 {value.emotionAlpha.toFixed(2)}<input aria-label="情绪影响" type="range" min={0} max={1} step={.05} value={value.emotionAlpha} onChange={e => edit({ emotionAlpha: +e.target.value })} /></label>}
      <ExecutionTarget profile={profile} value={targetWorkerId} change={setTargetWorkerId} />
      {settings && <section className="composer-popover" aria-label="语音参数设置"><div className="generation-row"><label>语言<Select aria-label="语言" value={value.language} onChange={e => edit({ language: e.target.value })}>{[['ZH','中文'],['EN','英语'],['JA','日语'],['ES','西班牙语'],['AR','阿拉伯语']].map(([id,name]) => <option key={id} value={id} disabled={!!profile && !profile.languages.includes(id)}>{name}</option>)}</Select></label><label>语速 {value.speed.toFixed(2)}×<input aria-label="语速" type="range" min={.5} max={2} step={.05} value={value.speed} onChange={e => edit({ speed: +e.target.value })} /></label></div>
        <div className="generation-row"><label>执行配置<Select aria-label="语音执行配置" value={profile?.profileId || ''} onChange={e => edit({ profileId: e.target.value })}><option value="" disabled>暂无已登记规格</option>{profiles.map(p => <option key={p.profileId} value={p.profileId}>{p.identity?.revision} · {p.identity?.quantization} · {p.maxTextCharacters} 字 · {p.emotionModes.includes('text') ? '含文字情绪' : '基础情绪'} · {p.profileId.slice(0,8)}</option>)}</Select></label><button onClick={refresh} disabled={loading}>{loading ? '刷新中…' : '刷新配置'}</button></div>
        <p className="muted">输出 WAV · 24kHz · 单声道。语速改变实际时长，不承诺精确秒数。</p></section>}
    </fieldset>
    {uploading && <p className="muted">参考音频上传中 {uploading}</p>}{error && <p className="error" role="alert">{error}</p>}{invalid && <p className="composer-validation" role="status">{invalid}</p>}
    <footer className="composer-toolbar"><span className="model-picker">IndexTTS 2.5</span><button aria-label="语音参数" aria-expanded={settings} onClick={() => setSettings(v => !v)}><Settings2 size={16} />{value.speed.toFixed(2)}× · WAV</button><button className="primary generate-submit" aria-label="合成语音" disabled={taskRunning || !!invalid || busy || !!uploading} onClick={run}><ArrowUp size={17} />{busy ? '提交中…' : '合成'}</button></footer>
  </div>;
}

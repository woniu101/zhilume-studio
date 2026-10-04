import {ReferenceBrowser} from './ReferenceBrowser';
import {ReferenceCard} from './ReferenceCard';
import {GenerateButton, ComposerLayout, ComposerPrompt, OfflineNotice} from './ComposerLayout';
import { FloatingPanel, PanelAction } from '../overlays';
import { initialProfile } from './model-selection';
import { Select } from '../Select';
import { useNodeTask } from './NodeTask';
import { LanguageTools, ExecutionTarget } from './LanguageTools';
import { useEffect, useRef, useState } from 'react';
import { Settings2, Upload } from 'lucide-react';
import { api, mediaUrl, uploadAsset } from '../api';
import type { ImageGenerationSession } from './ImageGeneration';
import { frameLabel, videoReferences, type VideoDraft, type VideoReference } from './video-draft';
type Asset = { id:string; kind:string; filename:string; url:string };
type Profile = { readyCount?:number; identity?: {revision?:string;quantization?:string}; profileId:string; workflowRevision:string; sizes:number[][]; frames:number[]; referenceLimits:Record<string,number> };
const modes = [['text','文生视频'],['first','首帧'],['last','尾帧'],['first-last','首尾帧'],['reference','全能参考']];
export function VideoGeneration({ assets,value,update,session,imported,submit }: {
  assets:Asset[]; value:VideoDraft; update:(f:(d:VideoDraft)=>VideoDraft)=>void; session:ImageGenerationSession;
  imported:(a:Asset)=>Promise<void>; close:()=>void; submit:(operation:string,input:object,requestId:string,targetWorkerId?:string)=>Promise<void>;
}) {
  const taskRunning = useNodeTask();
  const settingsAnchor = useRef<HTMLButtonElement>(null);
  const targetWorkerId = value.targetWorkerId || '';
  const setTargetWorkerId = (id: string) => update(d => ({ ...d, targetWorkerId: id }));
  const [models,setModels] = useState<any[]>([]), [error,setError] = useState(''), [settings,setSettings] = useState(false);
  const [busy,setBusy] = useState(!!session.inFlight), [uploading,setUploading] = useState(''), [refresh,setRefresh] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { let alive=true; api('/video-models').then(v => { if (alive) setModels(v); },e => { if (alive) setError(e.message); }); return () => { alive=false; }; },[refresh]);
  useEffect(() => { if (session.inFlight) void session.inFlight.then(() => setBusy(false),e => { setBusy(false); setError(e.message); }); return () => controller.current?.abort(); },[]);
  const edit = (patch:Partial<VideoDraft>) => update(d => ({ ...d,...patch }));
  const profiles:Profile[] = models.find(m => m.id === value.modelId)?.profiles || [];
  const profile = value.profileId ? profiles.find(p => p.profileId === value.profileId) : initialProfile(profiles);
  useEffect(() => { if (!value.profileId && profile) update(d => ({ ...d, profileId: profile.profileId })); }, [value.profileId, profile?.profileId]);
  const refs = videoReferences(value);
  const referenceError = refs.length > 12 ? '参考最多 12 份，请移除多余参考；已有草稿会保留。' : refs.some(r => !assets.some(a => a.id === r.assetId && a.kind === (['first','last'].includes(r.role) ? 'image' : r.role))) ? '请选择对应角色的参考素材。'
    : value.mode === 'reference' && !refs.length ? '至少添加一份参考素材。'
    : value.mode === 'reference' && value.references.some(r => r.role !== 'image' && (r.frames < 56 || r.frames > value.frames || r.frames % 17 !== 5 || !Number.isFinite(r.start) || r.start < 0 || r.start > 86400)) ? '参考片段至少 56 帧，按 17 帧递增，且不超过输出时长。'
    : ['video','audio'].some(kind => value.mode === 'reference' && value.references.filter(r => r.role === kind).reduce((n,r) => n+r.frames/24,0) > 15) ? '视频、音频参考总时长各不超过 15 秒。' : '';
  const invalid = referenceError || (!value.prompt.trim() ? '描述你希望生成的画面、动作和声音。' : '') || (value.prompt.length > 20000 ? '提示词超过 20000 字。' : '') ||
    (!profile ? '暂无已登记的 H3 规格，可先保存创作草稿。' : '') ||
    (profile && (!profile.frames.includes(value.frames) || !profile.sizes.some(s => s[0] === value.width && s[1] === value.height)) ? '当前尺寸或时长不在执行配置中，请在视频参数中选择。' : '') ||
    (profile && ['image','video','audio'].some(k => refs.filter(r => r.role === k).length > profile.referenceLimits[k]) ? '参考数量超过当前执行配置。' : '');
  function add(asset:Asset, slot?:'firstFrameId'|'lastFrameId') {
    if (slot) { if (asset.kind !== 'image') { setError('首尾帧只接受图片'); return; } edit({ [slot]:asset.id }); }
    else if (['image','video','audio'].includes(asset.kind)) update(d => d.references.length < 12 ? { ...d,references:[...d.references,{ role:asset.kind as VideoReference['role'],assetId:asset.id,start:0,frames:56 }] } : d);
    else setError('参考素材须为图片、视频或音频');
  }
  async function upload(file?:File, slot?:'firstFrameId'|'lastFrameId', kind?:string) {
    if (!file || controller.current) return;
    const abort=new AbortController(); controller.current=abort; setUploading('0%'); setError('');
    try {
      if ((kind && !file.type.startsWith(kind+'/')) || !/^(image|video|audio)\//.test(file.type) || (slot && !file.type.startsWith('image/')) || file.size > (file.type.startsWith('image/') ? 64 : 256)*1024**2) throw Error('请选择符合类型与大小限制的媒体文件');
      const asset=await uploadAsset(file,abort.signal,n=>setUploading(`${Math.round(n*100)}%`)); await imported(asset); add(asset,slot);
    } catch(e) { if (!abort.signal.aborted) setError((e as Error).message); }
    finally { controller.current=null; setUploading(''); }
  }
  function picker(slot?:'firstFrameId'|'lastFrameId', title='添加参考', kind?:string) {
    const selected=slot ? assets.find(a=>a.id===value[slot]) : null;
    const choose=(asset:Asset)=>{if(kind && asset.kind!==kind){setError('请选择对应类型的参考素材');return;}add(asset,slot);};
    return <section className="reference-empty" onDragOver={e=>{ e.preventDefault(); e.stopPropagation(); }} onDrop={e=>{
      e.preventDefault(); e.stopPropagation(); if (busy || uploading) return;
      const asset=assets.find(a=>a.id===e.dataTransfer.getData('application/x-zhilume-asset'));
      if (asset) choose(asset); else void upload(e.dataTransfer.files[0],slot,kind);
    }}>
      {selected && <div className="reference-cards"><ReferenceCard asset={selected} title={title} remove={()=>edit({[slot!]:''})}><span>点击下方替换</span></ReferenceCard></div>}
      <PanelAction title={title} label={`${title} · ${selected?.filename || "选择或上传"}`} wide disabled={busy || !!uploading}><ReferenceBrowser label={title} kinds={slot ? ['image'] : kind ? [kind] : ['image','video','audio']} selectedIds={slot && value[slot] ? [value[slot]] : []} disabled={busy || !!uploading || (!slot && value.references.length >= 12)} choose={choose}/><label className="speech-upload"><Upload size={14}/>上传<input aria-label={`上传${title}`} type="file" accept={slot ? 'image/*' : kind ? `${kind}/*` : 'image/*,video/*,audio/*'} onChange={e=>{ void upload(e.target.files?.[0],slot,kind); e.target.value=''; }}/></label></PanelAction>
    </section>;
  }
  async function run() {
    if (taskRunning || invalid || !profile || busy || session.inFlight) return;
    const input={ modelId:value.modelId,profileId:profile.profileId,workflowRevision:profile.workflowRevision,mode:value.mode,prompt:value.prompt,width:value.width,height:value.height,frames:value.frames,steps:value.steps,seed:value.seed,includeAudio:value.includeAudio,references:refs };
    const fingerprint=JSON.stringify({input,targetWorkerId}), request=value.request?.fingerprint===fingerprint ? value.request : { id:crypto.randomUUID(),fingerprint };
    edit({ request }); setBusy(true); setError('');
    try { session.inFlight=submit('video.generate.v1',input,request.id,targetWorkerId); await session.inFlight; update(d=>({...d,request:undefined}));  }
    catch(e) { setError((e as Error).message); } finally { session.inFlight=undefined; setBusy(false); }
  }
  const counts:Record<string,number>={image:0,video:0,audio:0};
  return <ComposerLayout className="generation video-generation" onKeyDown={e=>{if(e.key==='Escape' && settings){e.stopPropagation();setSettings(false);}}}
    disabled={busy || !!uploading}
    modes={<nav className="generation-tabs" aria-label="视频生成方式">{modes.map(([id,title])=><button key={id} aria-pressed={value.mode===id} className={value.mode===id?'active':''} onClick={()=>edit({ mode:id,modelId:id==='reference'?'minimax-h3-ref2va':'minimax-h3-fl2va',profileId: value.modelId === (id==='reference'?'minimax-h3-ref2va':'minimax-h3-fl2va') ? value.profileId : '', targetWorkerId: value.modelId === (id==='reference'?'minimax-h3-ref2va':'minimax-h3-fl2va') ? value.targetWorkerId : '' })}>{title}</button>)}</nav>}
    tools={<LanguageTools value={value.prompt} apply={v => edit({ prompt: v })} purpose="h3" context={{ mode: value.mode, duration: value.frames / 24, includeAudio: value.includeAudio }} referenceAssetIds={refs.filter(r => ["first", "last", "image"].includes(r.role)).map(r => r.assetId)} />}
    actions={<span className="character-count">{value.prompt.length}/20000</span>}
    status={<>{uploading && <p className="muted">上传参考素材 {uploading}</p>}{error && <p role="alert" className="error">{error}</p>}{invalid && profile && value.prompt.trim() && (refs.some(r=>r.assetId) || !referenceError) && <p role="status" className="composer-validation">{invalid}</p>}{!profile && <p role="status" className="muted">暂无已登记的 H3 规格，可先保存创作草稿。</p>}{!error && <OfflineNotice profile={profile}/>}</>}
    submit={<GenerateButton busy={busy} aria-label="生成视频" title={invalid || "生成到当前节点"} disabled={taskRunning || !!invalid||busy||!!uploading} onClick={run}/>}
    footer={<><span className="model-picker" title={value.mode==='reference'?'H3 Ref2VA':'H3 FL2VA'}>H3</span><button ref={settingsAnchor} aria-label="视频参数" aria-expanded={settings} onClick={()=>setSettings(v=>!v)}><Settings2 size={15}/>{(value.frames/24).toFixed(2)} 秒 · {value.width} × {value.height}</button></>}>


      {['first','first-last'].includes(value.mode) && picker('firstFrameId','首帧图片')}
      {['last','first-last'].includes(value.mode) && picker('lastFrameId','尾帧图片')}
      {value.mode==='reference' && <>
        <div className="reference-adders">{picker(undefined,'添加图片','image')}{picker(undefined,'添加视频','video')}{picker(undefined,'添加音频','audio')}</div>
        {!!value.references.length && <div className="reference-cards" aria-label="视频参考素材">{value.references.map((r,i)=>{
          const asset=assets.find(a=>a.id===r.assetId),tag=`<${r.role==='image'?'Picture':r.role==='video'?'Video':'Audio'} ${++counts[r.role]}>`;
          return <ReferenceCard key={i} asset={asset} title={`参考 ${i+1}`} detail={r.role==='image'?'图片参考':`${r.start.toFixed(2)} 秒起 · ${(r.frames/24).toFixed(2)} 秒`} remove={()=>edit({references:value.references.filter((_,j)=>i!==j)})}>
            <button title="插入参考标签" onClick={()=>edit({prompt:value.prompt+tag})}>{tag}</button>
            <PanelAction title={`参考 ${i+1} 设置`} label="编辑参考" wide disabled={busy || !!uploading}>
              <ReferenceBrowser label={`替换参考 ${i+1}`} kinds={[r.role]} selectedIds={[r.assetId]} disabled={busy || !!uploading} choose={asset=>edit({references:value.references.map((v,j)=>i===j?{...v,assetId:asset.id}:v)})}/>
              {r.role!=='image' && <div className="generation-row"><label>起点（秒）<input aria-label={`参考 ${i+1} 起点`} type="number" min={0} max={86400} step={.1} value={r.start} onChange={e=>edit({references:value.references.map((v,j)=>i===j?{...v,start:+e.target.value}:v)})}/></label><label>片段长度<Select aria-label={`参考 ${i+1} 长度`} value={r.frames} onChange={e=>edit({references:value.references.map((v,j)=>i===j?{...v,frames:+e.target.value}:v)})}>{Array.from({length:18},(_,j)=>56+j*17).filter(n=>n<=345).map(n=><option key={n} value={n} disabled={n>value.frames}>{frameLabel(n)}</option>)}</Select></label></div>}
              <small className="muted">{r.role==='video'?'仅参考画面；声音请单独添加音频参考。':r.role==='audio'?'播放器试听原素材，生成只使用指定片段。':'标签用于在提示词中说明此图片的用途。'}</small>
              {i>0 && <button onClick={()=>edit({references:value.references.map((v,j)=>j===i-1?value.references[i]:j===i?value.references[i-1]:v)})}>上移参考（标签编号会变化）</button>}
            </PanelAction>
          </ReferenceCard>;
        })}</div>}
      </>}
      <ComposerPrompt aria-label="视频提示词" maxLength={20000} value={value.prompt} onChange={e=>edit({prompt:e.target.value})} placeholder="描述主体、动作、镜头和声音；有参考时用标签说明各素材的用途…"/>
      {settings && <FloatingPanel anchor={settingsAnchor} title="视频参数设置" close={() => setSettings(false)} disabled={busy || !!uploading}>
        <div className="generation-row"><label>尺寸<Select aria-label="视频尺寸" value={`${value.width}x${value.height}`} onChange={e=>{const [width,height]=e.target.value.split('x').map(Number);edit({width,height});}}>{[...[ [value.width,value.height] ],...(profile?.sizes||[])].filter((s,i,a)=>a.findIndex(v=>v[0]===s[0]&&v[1]===s[1])===i).map(s=><option key={s.join('x')} value={s.join('x')}>{s[0]} × {s[1]}</option>)}</Select></label>
          <label>实际时长<Select aria-label="视频时长" value={value.frames} onChange={e=>edit({frames:+e.target.value})}>{[...new Set([value.frames,...(profile?.frames||[124,192,243,345])])].map(n=><option key={n} value={n}>{frameLabel(n)}</option>)}</Select></label></div>
        <div className="generation-row"><label>采样步数<input aria-label="视频步数" type="number" min={1} max={50} value={value.steps} onChange={e=>edit({steps:Math.floor(Math.min(50,Math.max(1,+e.target.value)))})}/></label><label>随机种子<input aria-label="视频种子" type="number" min={0} max={Number.MAX_SAFE_INTEGER} value={value.seed} onChange={e=>edit({seed:Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(+e.target.value)))})}/></label></div>
        <label className="transparency-option"><input type="checkbox" checked={value.includeAudio} onChange={e=>edit({includeAudio:e.target.checked})}/>保留生成音频</label><small className="muted">H3 联合生成音画；关闭仅导出静音，不代表减少模型推理。</small>
        <label>执行配置<Select aria-label="视频执行配置" value={profile?.profileId||''} onChange={e=>edit({profileId:e.target.value})}><option value="" disabled>暂无已登记规格</option>{profiles.map(p=><option key={p.profileId} value={p.profileId}>{p.identity?.revision} · {p.identity?.quantization} · {p.profileId.slice(0,8)} · 图片 {p.referenceLimits.image} / 视频 {p.referenceLimits.video} / 音频 {p.referenceLimits.audio}</option>)}</Select></label><button onClick={()=>setRefresh(n=>n+1)}>刷新配置</button>
      <ExecutionTarget profile={profile} value={targetWorkerId} change={setTargetWorkerId} />
        <small className="muted">24 FPS · MP4；参考片段在执行端核对真实长度后才提交推理。</small>
      </FloatingPanel>}

  </ComposerLayout>;
}

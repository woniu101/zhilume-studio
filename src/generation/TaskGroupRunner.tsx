import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { videoReferences } from './video-draft';
export function TaskGroupRunner({ nodes, edges, projectId, prepare, flush, done }: { nodes: any[]; edges: any[]; projectId: string; prepare: (n: any) => any; flush: () => Promise<any>; done: () => void }) {
  const [models, setModels] = useState<any>(null), [mode,setMode] = useState('batch'), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const [language,setLanguage] = useState(''), [bindings,setBindings] = useState<Record<string,string>>({});
  const request = useRef<{ id:string; fingerprint:string } | null>(null);
  const seeds = useRef<Record<string,number>>({});
  useEffect(()=>{api('/models').then(setModels,e=>setError(e.message));},[]);
  const candidates = edges.filter(e=>nodes.some(n=>n.id===e.source)&&nodes.some(n=>n.id===e.target));
  async function submit() {
    setError(''); setBusy(true);
    try {
      const tasks = nodes.map(n=>{
        const d=prepare(n); let operation:string,input:any;
        if(n.data.kind==='text'){operation='text.generate.v1';input={profileId:language,text:n.data.textDraft??n.data.text};}
        else {
          const family=n.data.kind==='audio'?'speech':n.data.kind;
          const model=models[family].find((m:any)=>m.id===d.modelId), p=d.profileId?model?.profiles.find((p:any)=>p.profileId===d.profileId):model?.profiles[0];
          if(!p)throw Error(`${n.data.title}：请先选择已登记的模型规格`);
          const common={modelId:d.modelId,profileId:p.profileId,workflowRevision:p.workflowRevision};
          if(family==='image'){
            seeds.current[n.id]??=Math.floor(Math.random()*2**32);
            operation=d.operation;input={...common,prompt:d.prompt,negativePrompt:d.negative,referenceAssetIds:d.refs,outputFormat:d.format,steps:d.steps?+d.steps:p.defaultSteps,seed:d.seed?+d.seed:seeds.current[n.id],...(operation==='image.generate.v1'?{width:d.width,height:d.height}:{})};
          }else if(family==='video'){operation='video.generate.v1';input={...d,...common,references:videoReferences(d)};delete input.request;}
          else {operation='audio.speech.v1';input={...d,...common};delete input.request;}
        }
        return { key:n.id,nodeId:n.id,operation,input,bindings:mode==='workflow'?candidates.filter(e=>e.target===n.id&&bindings[e.id]).map(e=>({from:e.source,target:bindings[e.id]})):[] };
      });
      const body={projectId,mode,tasks};const fingerprint=JSON.stringify(body);
      if(request.current?.fingerprint!==fingerprint) request.current={id:crypto.randomUUID(),fingerprint};
      await flush();await api('/job-groups','POST',{...body,requestId:request.current!.id});done();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <div className="generation"><nav className="generation-tabs"><button className={mode==='batch'?'active':''} onClick={()=>setMode('batch')}>批量提交</button><button className={mode==='workflow'?'active':''} onClick={()=>setMode('workflow')}>运行流程</button></nav>
    <p>{mode==='batch'?'各节点使用当前参数与已有素材独立执行，可并行。':'请明确选择哪些输入使用上游新结果。其余输入保留当前素材；上游成功并归档后才执行下游。'}</p>
    <ul>{nodes.map(n=><li key={n.id}>{n.data.title} · {n.data.kind}</li>)}</ul>
    {nodes.some(n=>n.data.kind==='text')&&<label>文本节点使用的语言模型<select value={language} onChange={e=>setLanguage(e.target.value)}><option value="">请选择</option>{models?.language.map((m:any)=><option key={m.profileId} value={m.profileId}>{m.providerName} / {m.name}</option>)}</select></label>}
    {mode==='workflow'&&candidates.map(e=>{const source=nodes.find(n=>n.id===e.source),target=nodes.find(n=>n.id===e.target),d=prepare(target);const targets=source.data.kind==='text'?[target.data.kind==='audio'||target.data.kind==='text'?'text':'prompt']:target.data.kind==='image'?(d.refs||[]).map((_:any,i:number)=>`referenceAssetIds.${i}`):target.data.kind==='video'?videoReferences(d).map((_:any,i:number)=>`references.${i}.assetId`):target.data.kind==='audio'?['speaker.assetId','emotionReference.assetId']:[];
      return <label key={e.id}>{source.data.title} → {target.data.title}<select value={bindings[e.id]||''} onChange={v=>setBindings(b=>({...b,[e.id]:v.target.value}))}><option value="">保持已有输入</option>{targets.map((t:string)=><option key={t} value={t}>等待新结果 → {t === 'prompt' ? '提示词' : t === 'text' ? '文本' : t === 'speaker.assetId' ? '音色参考' : t === 'emotionReference.assetId' ? '情绪参考' : '参考素材 ' + (+t.split('.')[1] + 1)}</option>)}</select></label>;})}
    {mode==='workflow'&&<small>媒体输入需先在节点编辑区添加相应参考槽位。Server 会检查循环和类型，不会静默改变操作。</small>}
    {error&&<p role="alert">{error}</p>}<button className="primary" disabled={!models||busy||!nodes.length} onClick={()=>void submit()}>{busy?'提交中…':`提交 ${nodes.length} 个任务`}</button>
  </div>;
}

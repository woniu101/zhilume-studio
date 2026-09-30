import {ComposerLayout, ComposerPrompt} from './ComposerLayout';
import type { LanguageSelection } from './model-selection';
import { LanguageTools } from './LanguageTools';
import { useState } from "react";
import type { Kind } from "../canvas";

export function EmptyNodeEditor({ kind, value, draft, content, editDraft, editBody, save, upload, nodeId, prepare, submitted, selection, select, pending }: {
  content:string; editDraft?:string; editBody:(value:string|undefined)=>void; pending:(value:boolean)=>void; selection?: LanguageSelection; select: (value: LanguageSelection) => void; nodeId: string; prepare: () => Promise<void>; submitted: () => Promise<void>; kind: Kind; value: string; draft: (value: string) => void; save: (value: string) => void; upload: () => void;
}) {
  const [text, setText] = useState(value);
  const [mode,setMode]=useState<'edit'|'generate'>('edit');
  const modes=<div className="generation-tabs" role="group" aria-label="文本编辑方式"><button aria-pressed={mode==='edit'} onClick={()=>setMode('edit')}>编辑正文</button><button aria-pressed={mode==='generate'} onClick={()=>setMode('generate')}>生成文本</button></div>;
  const displayText=mode==='edit' ? editDraft ?? content : text;
  const body=<ComposerPrompt aria-label="文本内容" rows={4} maxLength={12000} value={displayText} placeholder={mode==='edit'?'记录提示词、脚本或创作想法…':'描述希望生成的内容、用途与要求…'} onChange={event=>{if(mode==='edit')editBody(event.target.value);else{setText(event.target.value);draft(event.target.value);}}}/>;
  if(kind==='text') return mode==='generate' ? <LanguageTools value={text} apply={v=>{setText(v);draft(v);}} generate pending={pending} selection={selection} select={select} nodeId={nodeId} prepare={prepare} submitted={submitted} modes={modes} body={<><small className="muted">输入生成要求，结果将作为当前节点正文；已有内容保留在历史中。</small>{body}</>}/> : <ComposerLayout modes={modes} actions={<>{editDraft!==undefined && <button className="panel-action" onClick={()=>editBody(undefined)}>放弃正文草稿</button>}<span className="character-count">{displayText.length}/12000</span></>} footer={<span className="muted">编辑后保存到当前节点</span>} submit={<button className="primary generate-submit" onClick={()=>{save(displayText);editBody(undefined);}}>保存文本</button>}>{body}</ComposerLayout>;
  return <ComposerLayout footer={<button onClick={upload}>选择素材</button>}><p>上传{kind==='video'?'视频':'音频'}，开始预览和整理素材。</p></ComposerLayout>;
}

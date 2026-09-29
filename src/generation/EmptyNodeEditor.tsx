import type { LanguageSelection } from './model-selection';
import { LanguageTools } from './LanguageTools';
import { useState } from "react";
import type { Kind } from "../canvas";

export function EmptyNodeEditor({ kind, value, draft, save, upload, nodeId, prepare, submitted, selection, select, pending }: {
  pending:(value:boolean)=>void; selection?: LanguageSelection; select: (value: LanguageSelection) => void; nodeId: string; prepare: () => Promise<void>; submitted: () => Promise<void>; kind: Kind; value: string; draft: (value: string) => void; save: (value: string) => void; upload: () => void;
}) {
  const [text, setText] = useState(value);
  return <div className="generation">
    {kind === "text" ? <><fieldset>
      <label>内容或生成要求<textarea aria-label="文本内容" rows={4} maxLength={12000} value={text}
        placeholder="记录提示词、脚本或创作想法…"
        onChange={event => { setText(event.target.value); draft(event.target.value); }} /></label>
      <LanguageTools value={text} apply={v => { setText(v); draft(v); }} generate pending={pending} selection={selection} select={select} nodeId={nodeId} prepare={prepare} submitted={submitted} /></fieldset><footer><span className="muted">输入可直接保存为内容，也可作为生成要求</span><button className="primary" onClick={() => save(text)}>保存文本</button></footer>
    </> : <>
      <p>上传{kind === "video" ? "视频" : "音频"}，开始预览和整理素材。</p>
      <footer><span className="muted">{kind === "video" ? "视频" : "音频"}生成尚未接入</span><button onClick={upload}>选择素材</button></footer>
    </>}
  </div>;
}

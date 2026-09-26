import { useState } from "react";
import type { Kind } from "../canvas";

export function EmptyNodeEditor({ kind, value, draft, save, upload }: {
  kind: Kind; value: string; draft: (value: string) => void; save: (value: string) => void; upload: () => void;
}) {
  const [text, setText] = useState(value);
  return <div className="generation">
    {kind === "text" ? <>
      <label>文本内容<textarea aria-label="文本内容" rows={4} maxLength={12000} value={text}
        placeholder="记录提示词、脚本或创作想法…"
        onChange={event => { setText(event.target.value); draft(event.target.value); }} /></label>
      <footer><span className="muted">本地编辑 · 文本生成尚未接入</span><button className="primary" onClick={() => save(text)}>保存文本</button></footer>
    </> : <>
      <p>上传{kind === "video" ? "视频" : "音频"}，开始预览和整理素材。</p>
      <footer><span className="muted">{kind === "video" ? "视频" : "音频"}生成尚未接入</span><button onClick={upload}>选择素材</button></footer>
    </>}
  </div>;
}

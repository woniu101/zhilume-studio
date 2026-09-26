import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Modal } from "./ui";

export function TextEditor({ html, text, save, close }: {
  html?: string; text?: string;
  save: (text: string, html: string) => void;
  close: () => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } })],
    content: html || {
      type: "doc",
      content: (text || "").split(/\r?\n/).map(line => ({
        type: "paragraph", content: line ? [{ type: "text", text: line }] : [],
      })),
    },
    editorProps: { attributes: { "aria-label": "文本内容", role: "textbox", "aria-multiline": "true" } },
    autofocus: "end",
  });
  const state = useEditorState({ editor, selector: ({ editor: e }) => e ? ({
    length: e.getText().length,
    active: ["bold", "italic", "underline", "strike", "bulletList", "orderedList", "blockquote", "codeBlock"].filter(mark => e.isActive(mark)),
    heading: [1, 2, 3].find(level => e.isActive("heading", { level })) || 0,
    undo: e.can().undo(), redo: e.can().redo(),
  }) : null });
  const formats = [
    ["bold", "粗体", () => editor?.chain().focus().toggleBold().run()],
    ["italic", "斜体", () => editor?.chain().focus().toggleItalic().run()],
    ["underline", "下划线", () => editor?.chain().focus().toggleUnderline().run()],
    ["strike", "删除线", () => editor?.chain().focus().toggleStrike().run()],
    ["bulletList", "无序列表", () => editor?.chain().focus().toggleBulletList().run()],
    ["orderedList", "有序列表", () => editor?.chain().focus().toggleOrderedList().run()],
    ["blockquote", "引用", () => editor?.chain().focus().toggleBlockquote().run()],
    ["codeBlock", "代码块", () => editor?.chain().focus().toggleCodeBlock().run()],
  ] as const;
  const overLimit = (state?.length || 0) > 12000;
  return <Modal title="编辑文本" close={close}>
    <div className="editor-toolbar" role="toolbar" aria-label="文本格式">
      <select aria-label="段落格式" value={state?.heading || 0} onChange={event => {
        const level = Number(event.target.value);
        if (level) editor?.chain().focus().setHeading({ level: level as 1 | 2 | 3 }).run();
        else editor?.chain().focus().setParagraph().run();
      }}>
        <option value={0}>正文</option><option value={1}>标题 1</option><option value={2}>标题 2</option><option value={3}>标题 3</option>
      </select>
      {formats.map(([key, label, run]) => <button key={key} type="button" aria-pressed={!!state?.active.includes(key)}
        onMouseDown={event => event.preventDefault()} onClick={run}>{label}</button>)}
      <button onMouseDown={event => event.preventDefault()} onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}>清除格式</button>
      <button aria-label="撤销文本编辑" disabled={!state?.undo} onClick={() => editor?.chain().focus().undo().run()}>撤销</button>
      <button aria-label="重做文本编辑" disabled={!state?.redo} onClick={() => editor?.chain().focus().redo().run()}>重做</button>
    </div>
    <EditorContent editor={editor} />
    <div className="row spread">
      <span className={overLimit ? "editor-limit" : "muted"} role="status">
        {state?.length || 0} 字 · 最多 12,000 字{overLimit ? "，请删减后保存" : ""}
      </span>
      <button className="primary" disabled={!editor || overLimit} onClick={() => {
        if (editor && !overLimit) save(editor.getText(), editor.getHTML());
      }}>保存文本</button>
    </div>
  </Modal>;
}

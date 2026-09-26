import { useEffect, useRef } from "react";
import type { Document } from "./canvas";

const format = "application/x-zhilume-selection";
const editing = (target: EventTarget | null) => target instanceof Element &&
  !!target.closest("input,textarea,select,[contenteditable=true],.media-player");

/** Native copy/paste events require no clipboard-read permission. Never execute pasted HTML. */
export function useCanvasClipboard(options: {
  blocked: boolean;
  document: () => Document;
  duplicate: (document: Document) => void;
  files: (files: File[]) => void;
  text: (text: string) => void;
}) {
  const current = useRef(options);
  current.current = options;
  const selection = useRef<{ token: string; document: Document } | null>(null);
  useEffect(() => {
    const copy = (event: ClipboardEvent) => {
      const state = current.current;
      if (state.blocked || editing(event.target) || !event.clipboardData || window.getSelection()?.toString()) return;
      const document = state.document();
      const selected = document.nodes.filter(n => n.selected && n.type === "media");
      if (!selected.length) return;
      const token = crypto.randomUUID();
      event.clipboardData.setData(format, token);
      event.clipboardData.setData("text/plain", selected.map(n => n.data.text || n.data.title).join("\n"));
      selection.current = { token, document: structuredClone(document) };
      event.preventDefault();
    };
    const paste = (event: ClipboardEvent) => {
      const state = current.current, data = event.clipboardData;
      if (state.blocked || editing(event.target) || !data) return;
      // A previous in-app selection must never override newer system clipboard content.
      if (selection.current && data.getData(format) === selection.current.token) {
        event.preventDefault();
        state.duplicate(selection.current.document);
        return;
      }
      const files = Array.from(data.files);
      if (files.length) {
        event.preventDefault();
        state.files(files);
        return;
      }
      const text = data.getData("text/plain");
      if (text) {
        event.preventDefault();
        state.text(text);
      }
    };
    window.addEventListener("copy", copy);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("copy", copy);
      window.removeEventListener("paste", paste);
    };
  }, []);
}

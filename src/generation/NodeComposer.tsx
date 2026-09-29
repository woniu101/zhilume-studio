import { hasOverlays } from '../overlays';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useViewport } from "@xyflow/react";
import { X, Maximize2, Minimize2 } from "lucide-react";
import "./generation.css";

/** A screen-sized editor anchored to a canvas node; not part of its drag geometry. */
export function NodeComposer({ nodeId, title, layout, close, children, typeControl }: {
  nodeId: string; title: string; layout: unknown; close: () => void; children: ReactNode; typeControl?: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const viewport = useViewport();
  const [expanded, setExpanded] = useState(false);
  const [placement, setPlacement] = useState({ left: 0, top: 0, maxHeight: 400, width: 600, visible: false });
  const getNode = () => document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`);
  useLayoutEffect(() => {
    const element = panel.current, node = getNode(), canvas = node?.closest(".canvas-area");
    if (!element || !node || !canvas) return;
    const position = () => {
      const n = node.getBoundingClientRect(), c = canvas.getBoundingClientRect();
      const width = Math.min(expanded ? 800 : 620, c.width - 24), bottom = Math.min(c.bottom, innerHeight) - 12;
      const top = Math.max(c.top, 0) + 12;
      if (expanded) {
        setPlacement({ width, maxHeight: bottom - top, left: c.left + (c.width - width) / 2, top, visible: true });
        return;
      }
      const below = bottom - n.bottom - 14, above = n.top - 86 - top;
      const goesBelow = below >= Math.min(element.scrollHeight, 300) || below >= above;
      const maxHeight = Math.max(140, goesBelow ? below : above);
      const height = Math.min(element.scrollHeight, maxHeight);
      const next = { width, maxHeight,
        left: Math.max(c.left + 12, Math.min(c.right - width - 12, n.left + n.width / 2 - width / 2)),
        top: Math.max(top, Math.min(bottom - height, goesBelow ? n.bottom + 14 : n.top - height - 86)),
        visible: n.right > c.left && n.left < c.right && n.bottom > top && n.top < bottom };
      setPlacement(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    position();
    let frame = 0;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(position); });
    observer.observe(element); observer.observe(node); observer.observe(canvas);
    window.addEventListener("resize", position);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", position); };
  }, [nodeId, layout, viewport.x, viewport.y, viewport.zoom, expanded]);
  useEffect(() => {
    const outside = (event: Event) => {
      if (hasOverlays()) return;
      const target = event.target as HTMLElement;
      if (target.closest?.(".asset-card, [data-editor-overlay]")) return; // Keep the destination open while dragging a library reference.
      if (!panel.current?.contains(target) && !getNode()?.contains(target)) close();
    };
    const key = (event: KeyboardEvent) => { if (hasOverlays()) return; if ((event.target as HTMLElement).closest?.("[data-editor-overlay]")) return; if (event.key === "Escape") { event.preventDefault(); close(); } };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", key);
    };
  }, [nodeId, close]);
  return <section ref={panel} className="node-composer nodrag nopan nowheel" role="region" aria-label={title}
    style={{ left: placement.left, top: placement.top, width: placement.width, maxHeight: placement.maxHeight, visibility: placement.visible ? "visible" : "hidden" }}
    onKeyDown={event => { if (event.key !== "Escape") event.stopPropagation(); }}>
    <header>{typeControl || <span>{title}</span>}<div><button className="icon-button" aria-label={expanded ? "还原编辑区" : "展开编辑区"} onClick={() => setExpanded(v => !v)}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button><button className="icon-button" aria-label="收起编辑区" onClick={close}><X size={15} /></button></div></header>
    {children}
  </section>;
}

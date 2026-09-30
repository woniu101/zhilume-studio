import { ComposerChrome } from './ComposerLayout';
import { hasOverlays } from '../overlays';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useViewport } from "@xyflow/react";
import { Maximize2, Minimize2 } from "lucide-react";
import "./generation.css";

/** A screen-sized editor anchored to a canvas node; not part of its drag geometry. */
export function NodeComposer({ nodeId, title, layout, close, children, typeControl, headerActions }: {
  nodeId: string; title: string; layout: unknown; close: () => void; children: ReactNode; typeControl?: ReactNode; headerActions?: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const viewport = useViewport();
  const toggle=useRef<HTMLButtonElement>(null), normalScroll=useRef(0);
  function changeExpanded(next:boolean) {
    const body=panel.current?.querySelector<HTMLElement>(".composer-body");
    if(next)normalScroll.current=body?.scrollTop || 0;
    setExpanded(next);
    requestAnimationFrame(()=>{if(!next && body)body.scrollTop=normalScroll.current;toggle.current?.focus();});
  }
  const [expanded, setExpanded] = useState(false);
  const [placement, setPlacement] = useState({ left: 0, top: 0, maxHeight: 400, width: 600, visible: false });
  const getNode = () => document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`);
  useLayoutEffect(() => {
    const element = panel.current, node = getNode(), canvas = node?.closest(".canvas-area");
    if (!element || !node || !canvas) return;
    const position = () => {
      const n = node.getBoundingClientRect(), c = canvas.getBoundingClientRect();
      if(expanded) {const next={left:16,top:16,width:innerWidth-32,maxHeight:innerHeight-32,visible:true};setPlacement(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);return;}
      const width = Math.min(620, c.width - 24), bottom = Math.min(c.bottom, innerHeight) - 12;
      const top = Math.max(c.top, 0) + 12;
      const below = bottom - n.bottom - 14, above = n.top - 86 - top;
      if (Math.max(below,above) < 400) {
        let panelWidth=width, panelTop=top, left=c.left+(c.width-width)/2;
        const toolbar=document.querySelector<HTMLElement>(`.node-tools[data-node-id="${CSS.escape(nodeId)}"]`)?.getBoundingClientRect();
        if(toolbar && left < toolbar.right && left+width > toolbar.left && top < toolbar.bottom && top+Math.min(element.scrollHeight,bottom-top) > toolbar.top) {
          const before=toolbar.left-c.left-24, after=c.right-toolbar.right-24;
          if(Math.max(before,after)>=360) {panelWidth=Math.min(width,Math.max(before,after));left=before>=after?c.left+12:c.right-panelWidth-12;}
          else if(bottom-toolbar.bottom-12>=280) panelTop=toolbar.bottom+12;
        }
        const next={width:panelWidth,maxHeight:bottom-panelTop,left,top:panelTop,visible:true};
        setPlacement(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
        return;
      }
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
      if(expanded)return;
      const target = event.target as HTMLElement;
      if (target.closest?.(".asset-card, [data-editor-overlay]")) return; // Keep the destination open while dragging a library reference.
      if (!panel.current?.contains(target) && !getNode()?.contains(target)) close();
    };
    const focus = (event:FocusEvent) => {
      const target=event.target as HTMLElement;
      if(expanded && !panel.current?.contains(target) && !target.closest?.('[data-editor-overlay]')) toggle.current?.focus();
      else if(!expanded)outside(event);
    };
    const key = (event: KeyboardEvent) => {
      if (hasOverlays() || (event.target as HTMLElement).closest?.('[data-editor-overlay]')) return;
      if (event.key === "Escape") { event.preventDefault(); if(expanded)changeExpanded(false);else close(); }
      if(expanded && event.key==='Tab') {
        const items=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"],a[href]') || []).filter(e=>e.getClientRects().length>0);
        const first=items[0],last=items.at(-1);
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", key);
    };
  }, [nodeId, close, expanded]);
  return <ComposerChrome.Provider value={{typeControl, expanded, controls:<>{headerActions}<button ref={toggle} className="icon-button" aria-label={expanded ? "还原编辑区" : "展开编辑区"} title={expanded ? "退出专注编辑（Esc）" : "专注编辑"} aria-pressed={expanded} onClick={() => changeExpanded(!expanded)}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button></>}}>
    {expanded && <div className="composer-backdrop" aria-hidden="true"/>}
    <section ref={panel} className={`node-composer nodrag nopan nowheel${expanded ? ' is-expanded' : ''}`} role={expanded ? "dialog" : "region"} aria-modal={expanded || undefined} aria-label={title}
      style={{ left: placement.left, top: placement.top, width: placement.width, height:expanded ? placement.maxHeight : undefined, maxHeight: placement.maxHeight, visibility: placement.visible ? "visible" : "hidden" }}
      onKeyDown={event => { if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation(); }}>
      {children}
    </section>
  </ComposerChrome.Provider>;
}

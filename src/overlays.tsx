import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import './overlays.css';

const Parent = createContext<string | null>(null);
type Entry = { id: string; parent: string | null; close: () => void };
const stack: Entry[] = [];
export const hasOverlays = () => stack.length > 0;
// A dismissal owns its pointer event even after React removes the closing surface.
const dismissalEvents=new WeakSet<Event>();
export const isOverlayDismissal=(event:Event)=>dismissalEvents.has(event);

/** Portal ownership, outside dismissal and Escape are shared by panels and menus. */
export function useOverlay(open: boolean, close: () => void, anchor: RefObject<HTMLElement | null>, surface: RefObject<HTMLElement | null>) {
  const id = useId(), parent = useContext(Parent), callback = useRef(close);
  callback.current = close;
  useEffect(() => {
    if (!open) return;
    for (const entry of [...stack]) if (entry.parent === parent) entry.close();
    const entry = { id, parent, close: () => callback.current() };
    stack.push(entry);
    const outside = (event: PointerEvent) => {
      if (stack.at(-1) !== entry) return;
      const target = event.target as Node;
      if (!surface.current?.contains(target) && !anchor.current?.contains(target)) {dismissalEvents.add(event);callback.current();}
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || stack.at(-1) !== entry) return;
      event.preventDefault(); event.stopImmediatePropagation(); callback.current(); anchor.current?.focus();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
    return () => {
      stack.splice(stack.indexOf(entry), 1);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [open, id, parent]);
  return { id, parent };
}

export function FloatingPanel({ anchor, close, title, children, wide = false, disabled = false }: {
  anchor: RefObject<HTMLElement | null>; close: () => void; title: string; children: ReactNode; wide?: boolean; disabled?: boolean;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const { id, parent } = useOverlay(true, close, anchor, surface);
  const [position, setPosition] = useState({ left: 12, top: 12, maxHeight: 400, width: 400 });
  useLayoutEffect(() => {
    const update = () => {
      const r = anchor.current?.getBoundingClientRect(); if (!r) { close(); return; }
      const margin = 12, gap = 8;
      const width = Math.min(wide ? 740 : 440, innerWidth - margin * 2);
      const availableBelow = innerHeight - r.bottom - margin - gap, availableAbove = r.top - margin - gap;
      const below = availableBelow >= Math.min(surface.current?.scrollHeight || 320, 320) || availableBelow >= availableAbove;
      const maxHeight = wide ? innerHeight - 2 * margin : Math.max(120, Math.max(availableAbove, availableBelow));
      const height = Math.min(surface.current?.scrollHeight || 320, maxHeight);
      const top = wide ? Math.max(margin, (innerHeight - height) / 2) : Math.max(margin, Math.min(innerHeight - height - margin, below ? r.bottom + gap : r.top - height - gap));
      const next = { width, maxHeight, top, left: wide ? (innerWidth-width)/2 : Math.max(margin,Math.min(r.right-width,innerWidth-width-margin)) };
      setPosition(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
    };
    update();
    let frame = 0;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame=requestAnimationFrame(update); });
    if(surface.current)observer.observe(surface.current);
    if(anchor.current)observer.observe(anchor.current);
    window.addEventListener('resize',update); window.addEventListener('scroll',update,true);
    const focus = requestAnimationFrame(() => surface.current?.focus());
    return () => {observer.disconnect();cancelAnimationFrame(frame);cancelAnimationFrame(focus);window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
  }, [wide]);
  return createPortal(<Parent.Provider value={id}><div ref={surface} role="dialog" aria-label={title} tabIndex={-1} data-editor-overlay className="floating-panel generation nodrag nopan nowheel" style={{...position,zIndex:parent ? 940 : 900}} onKeyDown={e => e.stopPropagation()}>
    <header><strong>{title}</strong><button aria-label={`关闭${title}`} onClick={() => {close();anchor.current?.focus();}}>×</button></header>
    <fieldset className="floating-body" disabled={disabled}>{children}</fieldset>
  </div></Parent.Provider>, document.body);
}

export function PanelAction({ title, label, children, wide = false, disabled = false, active=false }: { title: string; label: ReactNode; children: ReactNode; wide?: boolean; disabled?: boolean; active?:boolean }) {
  const anchor=useRef<HTMLButtonElement>(null),[open,setOpen]=useState(false);
  return <><button type="button" ref={anchor} className="panel-action" aria-label={typeof label === "string" ? undefined : `打开${title}`} data-active={active || undefined} title={title} disabled={disabled} aria-expanded={open} onClick={() => setOpen(v=>!v)}>{label}</button>
    {open && <FloatingPanel anchor={anchor} title={title} wide={wide} close={()=>setOpen(false)} disabled={disabled}>{children}</FloatingPanel>}</>;
}

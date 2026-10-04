import { useOverlay, OverlayLayer } from './overlays';
import { useContext, Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import './select.css';
import {ChevronDown, Check} from 'lucide-react';

type Option = { value: string; label: ReactNode; disabled: boolean };
function optionsFrom(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{value?: unknown; children?: ReactNode; disabled?: boolean}>(child)) return [];
    if (child.type === 'option') return [{ value: String(child.props.value ?? ''), label: child.props.children, disabled: !!child.props.disabled }];
    return optionsFrom(child.props.children);
  });
}
/** Theme-controlled, keyboard accessible single-value selector shared by all editors. */
export function Select({ children, value, onChange, className = '', displayValue, variant='field', disabled, 'aria-label': label, ...props }: SelectHTMLAttributes<HTMLSelectElement> & {displayValue?:ReactNode; variant?:'field'|'toolbar'}) {
  const layer = useContext(OverlayLayer);
  const options = optionsFrom(children), current = String(value ?? ''), id = useId();
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [index, setIndex] = useState(0);
  const [rect, setRect] = useState({ left: 0, top: 0, width: 240, maxHeight: 280 });
  useOverlay(open, () => setOpen(false), trigger, menu);
  const choose = (i: number) => {
    const option = options[i]; if (!option || option.disabled) return;
    onChange?.({ target: { value: option.value }, currentTarget: { value: option.value } } as ChangeEvent<HTMLSelectElement>);
    setOpen(false); trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const position = () => {
      const r = trigger.current!.getBoundingClientRect(), below = innerHeight - r.bottom - 12;
      const height = Math.min(300, Math.max(below, r.top - 12));
      const contentWidth=Math.max(160,...options.map(o=>Array.from(String(o.label)).reduce((sum,c)=>sum+(c.charCodeAt(0)>255?13:7),48)));
      const width = Math.min(innerWidth - 24, Math.max(r.width,Math.min(360,contentWidth)));
      setRect({ left: Math.max(12, Math.min(r.left, innerWidth - width - 12)), top: below >= Math.min(240, options.length * 40) ? r.bottom + 4 : Math.max(12, r.top - Math.min(height, options.length * 42 + 12) - 4), width, maxHeight: height });
    };
    position(); setIndex(Math.max(0, options.findIndex(o => o.value === current)));
    const frame = requestAnimationFrame(() => menu.current?.focus());
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [open]);
  useEffect(() => { menu.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' }); }, [index]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const textLabel = label || (typeof props.title === 'string' ? props.title : undefined);
  return <>
    <button ref={trigger} id={props.id} title={props.title} type="button" role="combobox" data-value={current} className={`select-trigger select-${variant} ${className}`} disabled={disabled} aria-label={textLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(!open)} onKeyDown={e => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true); } }}>
      <span>{displayValue ?? (options.find(o => o.value === current)?.label || '请选择…')}</span><ChevronDown className="select-chevron" size={14} aria-hidden="true"/>
    </button>
    {open && createPortal(<div ref={menu} id={id} role="listbox" aria-label={textLabel} tabIndex={-1} aria-activedescendant={`${id}-${index}`} data-editor-overlay className="select-options" style={{ position: 'fixed', ...rect, zIndex:layer+20 }}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); trigger.current?.focus(); if (e.key === 'Escape') e.preventDefault(); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(index); }
        else if (options.length && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) { e.preventDefault(); setIndex(i => e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length); }
        else if (e.key.length === 1) { const found = options.findIndex(o => String(o.label).toLowerCase().startsWith(e.key.toLowerCase())); if (found >= 0) setIndex(found); }
      }}>
      {options.map((o, i) => <div id={`${id}-${i}`} key={`${o.value}-${i}`} data-index={i} data-value={o.value} role="option" aria-selected={o.value === current} aria-disabled={o.disabled} className={i === index ? 'focused' : ''}
        onMouseEnter={() => setIndex(i)} onMouseDown={e => e.preventDefault()} onClick={() => choose(i)}><span>{o.label}</span>{o.value === current && <Check size={15} aria-hidden="true"/>}</div>)}
    </div>, document.body)}
  </>;
}

import {createContext, useContext, useLayoutEffect, useRef, type HTMLAttributes, type ReactNode, type TextareaHTMLAttributes} from 'react';
import {ArrowUp, LoaderCircle} from 'lucide-react';
import type {ButtonHTMLAttributes} from 'react';

export function GenerateButton({busy=false, ...props}:ButtonHTMLAttributes<HTMLButtonElement> & {busy?:boolean}) {
  return <button {...props} className="primary generate-submit" aria-busy={busy}>{busy ? <LoaderCircle size={16} className="generate-spinner"/> : <ArrowUp size={16}/>}<span>{busy ? '提交中…' : '生成'}</span></button>;
}

export const ComposerChrome = createContext<{typeControl?:ReactNode; controls?:ReactNode; expanded?:boolean}>({});

/** Shared slots keep creative content scrollable and controls continuously accessible. */
export function ComposerLayout({modes, actions, tools, status, footer, submit, children, disabled, className='', ...events}: HTMLAttributes<HTMLDivElement> & {
  modes?: ReactNode; actions?: ReactNode; tools?:ReactNode; status?: ReactNode; footer: ReactNode; submit?:ReactNode; disabled?: boolean;
}) {
  const chrome=useContext(ComposerChrome);
  return <div {...events} className={`generation composer-layout ${className}`}>
    <div className="composer-top"><div className="composer-modes">{modes}</div><div className="composer-window-controls">{chrome.controls}</div></div>
    <div className="composer-body"><fieldset disabled={disabled}>{children}</fieldset></div>
    {actions && <div className="composer-actions">{actions}</div>}
    {status && <div className="composer-status">{status}</div>}
    <footer className="composer-toolbar"><div className="composer-options"><div className="composer-type">{chrome.typeControl}</div>{footer}{tools}</div>{submit && <div className="composer-submit">{submit}</div>}</footer>
  </div>;
}

export function ComposerPrompt(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref=useRef<HTMLTextAreaElement>(null), {expanded}=useContext(ComposerChrome);
  useLayoutEffect(()=>{const el=ref.current;if(!el)return;if(expanded){el.style.height='';return;}el.style.height='0px';el.style.height=`${Math.min(180,Math.max(104,el.scrollHeight))}px`;},[props.value,expanded]);
  return <textarea {...props} ref={ref} className={`composer-prompt ${props.className||''}`} />;
}

export function OfflineNotice({profile}: {profile?: {readyCount?:number}}) {
  return profile && profile.readyCount===0 ? <p role="status" className="composer-validation">所选模型离线 · 生成后等待执行端上线</p> : null;
}

import {useLayoutEffect, useRef, type HTMLAttributes, type ReactNode, type TextareaHTMLAttributes} from 'react';

/** Shared slots keep creative content scrollable and controls continuously accessible. */
export function ComposerLayout({modes, actions, status, footer, children, disabled, className='', ...events}: HTMLAttributes<HTMLDivElement> & {
  modes?: ReactNode; actions?: ReactNode; status?: ReactNode; footer: ReactNode; disabled?: boolean;
}) {
  return <div {...events} className={`generation composer-layout ${className}`}>
    {modes && <div className="composer-modes">{modes}</div>}
    <fieldset className="composer-body" disabled={disabled}>{children}</fieldset>
    {actions && <div className="composer-actions">{actions}</div>}
    {status && <div className="composer-status">{status}</div>}
    <footer className="composer-toolbar">{footer}</footer>
  </div>;
}

export function ComposerPrompt(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref=useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(()=>{const el=ref.current;if(!el)return;el.style.height='0px';el.style.height=`${Math.min(180,Math.max(104,el.scrollHeight))}px`;},[props.value]);
  return <textarea {...props} ref={ref} className={`composer-prompt ${props.className||''}`} />;
}

export function OfflineNotice({profile}: {profile?: {readyCount?:number}}) {
  return profile && profile.readyCount===0 ? <p role="status" className="composer-validation">所选模型离线，提交后将等待上线。可在参数中查看执行设置。</p> : null;
}
export function submitLabel(profile?: {readyCount?:number}, normal='生成') {return profile?.readyCount===0 ? '加入队列' : normal;}

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, RefreshCw, Server } from 'lucide-react';
import { connection, login, logout, reconnect, forgetServer, setAutoConnect, useConnectionState, statusLabels } from './connection';
import { Modal } from './ui';
import './connection.css';

export function ConnectionForm({done}:{done:()=>void}) {
  const state=useConnectionState();
  const [base,setBase]=useState(connection.base),[name,setName]=useState(''),[token,setToken]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  return <form className="connection-form" onSubmit={async e=>{
    e.preventDefault();setBusy(true);setError('');controller.current=new AbortController();
    try { await login(base,token,controller.current.signal,name);done(); }
    catch(e:any){if(e.name!=='AbortError')setError(e.message);}
    finally{setBusy(false);controller.current=null;}
  }}>
    {state.profiles.length>0 && <div className="recent-servers"><span className="muted">最近使用</span>{state.profiles.map(p=><div className="recent-server" key={p.base}>
      <button type="button" disabled={busy} onClick={()=>{setBase(p.base);setName(p.name);setToken('');setError('');}}><Server size={16}/><span>{p.name}<small>{p.base}</small></span></button>
      <button type="button" disabled={busy} aria-label={'忘记连接 '+p.name} onClick={()=>void forgetServer(p.base).catch(e=>setError(e.message))}>忘记</button>
    </div>)}</div>}
    <label>Server 地址<input aria-label="Server 地址" disabled={busy} value={base} required onChange={e=>setBase(e.target.value)} placeholder="http://127.0.0.1:4310"/></label>
    <label>连接名称（可选）<input aria-label="连接名称" disabled={busy} value={name} onChange={e=>setName(e.target.value)} placeholder="例如：本地创作服务"/></label>
    <label>访问凭证<input aria-label="访问凭证" type="password" autoComplete="current-password" disabled={busy} value={token} onChange={e=>setToken(e.target.value)} placeholder="已保存授权时可留空"/></label>
    <label className="connection-check"><input type="checkbox" checked={state.autoConnect} onChange={e=>setAutoConnect(e.target.checked)}/>启动时自动连接上次使用的 Server</label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="row connection-actions">{busy&&<button type="button" onClick={()=>controller.current?.abort()}>取消连接</button>}<button className="primary" disabled={busy}>{busy?'正在连接…':'连接 Server'}</button></div>
    <small className="muted">访问凭证由 Server 启动器提供。切换服务会保留当前项目的本地草稿。</small>
  </form>;
}
export function ConnectionControl() {
  const state=useConnectionState(),[open,setOpen]=useState(false);
  useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('zhilume:open-connection',show);return()=>window.removeEventListener('zhilume:open-connection',show);},[]);
  return <><button className="connection-pill connection-button" data-status={state.status} onClick={()=>setOpen(true)} aria-label="管理 Server 连接"><span className="dot"/>{state.status==='online'?state.name:statusLabels[state.status]}<ChevronDown size={13}/></button>
    {open&&<Modal title="创作服务连接" close={()=>setOpen(false)}><div className="connection-summary"><strong>{statusLabels[state.status]}</strong><span>{connection.base}</span>{state.detail&&<p className="muted">{state.detail}</p>}
      {connection.token&&<div className="row"><button onClick={()=>void reconnect()}><RefreshCw size={14}/>立即重连</button><button onClick={()=>{logout();setOpen(false);}}>断开连接</button></div>}</div><ConnectionForm done={()=>setOpen(false)}/></Modal>}
  </>;
}

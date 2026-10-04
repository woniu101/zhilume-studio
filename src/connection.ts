import { useSyncExternalStore } from 'react';

export type ConnectionStatus = 'disconnected' | 'checking' | 'online' | 'offline' | 'unauthorized' | 'incompatible';
export type SessionVault = {base:string;token:string;serverId?:string;refreshToken?:string;expiresAt?:number;profiles?:ServerProfile[]};
export type ServerProfile = { base: string; name: string; serverId?: string; token?: string; refreshToken?: string; expiresAt?: number };
const read = (storage: Storage, key: string, fallback: any) => { try { return JSON.parse(storage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
export const connection = {
  base: localStorage.getItem('zhilume.server') || (location.protocol === 'app:' ? 'http://127.0.0.1:4310' : location.origin),
  token: sessionStorage.getItem('zhilume.session') || '', serverId: '', refreshToken: '', expiresAt: 0,
};
let profiles: ServerProfile[] = read(localStorage, 'zhilume.servers', []), epoch = 0;
let state = { status: (connection.token ? 'checking' : 'disconnected') as ConnectionStatus, name: '创作服务', detail: '', revision: 0, autoConnect: localStorage.getItem('zhilume.autoConnect') !== 'false', profiles };
const listeners = new Set<() => void>();
let probeTask:Promise<void>|undefined, connecting=false;
let timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined, failures = 0, started = false;
const publish = (patch: Partial<typeof state>) => { state = { ...state, ...patch, revision: state.revision + 1 }; listeners.forEach(f => f()); };
export const connectionEpoch = () => epoch;
export const useConnectionState = () => useSyncExternalStore(f => { listeners.add(f); return () => { listeners.delete(f); }; }, () => state);
export const statusLabels: Record<ConnectionStatus,string> = { disconnected:'未连接创作服务', checking:'正在连接…', online:'已连接', offline:'连接中断，正在重试', unauthorized:'需要重新验证', incompatible:'当前版本无法连接' };
export function normalizeServer(base: string) {
  const url = new URL(base.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('请输入有效的 http:// 或 https:// Server 地址');
  return url.href.replace(/\/$/, '');
}
async function request(base: string, path: string, options: RequestInit = {}) {
  const response = await fetch(base + '/api/v1' + path, { cache:'no-store', ...options, signal: options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(value?.message || `请求失败 (${response.status})`), { status: response.status });
  if (!value) throw new Error('目标地址没有返回有效的 Zhilume 服务信息');
  return value;
}
async function system(base: string, signal?: AbortSignal) {
  const info = await request(base, '/system', { signal });
  const [major,minor] = String(info.protocolVersion).split('.').map(Number);
  if (major !== 3 || !Number.isInteger(minor) || minor < 2 || typeof info.serverId !== 'string') throw Object.assign(new Error(`服务协议 ${info.protocolVersion || '未知'}，需要 3.2；请更新 Server`), { incompatible: true });
  return info;
}
const post = (base: string, path: string, body: object, signal?: AbortSignal) => request(base, path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal });
let persistence = Promise.resolve();
function persist() {
  localStorage.setItem('zhilume.servers', JSON.stringify(profiles.map(({token,refreshToken,expiresAt,...p}) => p)));
  localStorage.setItem('zhilume.server', connection.base);
  // Browser credentials last for this tab only; desktop credentials use OS encryption.
  if(!window.zhilumeDesktop) { sessionStorage.setItem('zhilume.session', connection.token); sessionStorage.setItem('zhilume.sessions', JSON.stringify(profiles)); }
  const value = { ...connection, profiles: structuredClone(profiles) };
  persistence = persistence.catch(() => {}).then(async () => { if (window.zhilumeDesktop && !await window.zhilumeDesktop.writeSession(value)) throw new Error('无法安全保存设备授权，本次连接退出后需要重新验证'); });
  return persistence;
}
function remember(profile: ServerProfile) {
  profiles = [profile, ...profiles.filter(p => p.base !== profile.base)];
  publish({ profiles, name:profile.name });
}
export async function login(base: string, credential: string, signal?: AbortSignal, name?: string) {
  if(connecting)throw new Error('已有连接操作正在进行');
  connecting=true;
  const version = epoch;
  try { await probeTask; await connectCandidate(base,credential,signal,name,version); }
  finally { connecting=false; if(connection.token && !['unauthorized','incompatible'].includes(state.status))schedule(state.status==='offline'?1000:15000); }
}
async function connectCandidate(base: string, credential: string, signal?: AbortSignal, name?: string, version = epoch) {
  base = normalizeServer(base);
  const info = await system(base, signal);
  const saved = profiles.find(p => p.base === base && p.serverId === info.serverId);
  const switching = connection.base !== base || (!!connection.serverId && connection.serverId !== info.serverId);
  let session: any;
  if (credential) session = await post(base, '/session', { token:credential }, signal);
  else if (saved?.token) {
    try {
      await request(base, '/session/status', { headers:{Authorization:'Bearer '+saved.token}, signal });
      session = saved;
    } catch (error:any) {
      if (error.status !== 401 || !saved.refreshToken) throw error;
      session = await post(base, '/session/renew', { refreshToken:saved.refreshToken }, signal);
    }
  }
  else if (saved?.refreshToken) session = await post(base, '/session/renew', { refreshToken:saved.refreshToken }, signal);
  else throw new Error('请输入此 Server 的访问凭证');
  if (signal?.aborted || version !== epoch) throw new DOMException('连接已取消','AbortError');
  if (switching && !window.dispatchEvent(new Event('zhilume:before-switch', {cancelable:true}))) {
    profiles=[{base,...session,serverId:info.serverId,name:name?.trim()||saved?.name||new URL(base).host},...profiles.filter(p=>p.base!==base)];
    publish({profiles});await persist();throw new Error('当前草稿无法保存，请先导出画布再切换服务');
  }
  stopProbe(); epoch++;
  Object.assign(connection, { base, token:session.token, serverId:info.serverId, refreshToken:session.refreshToken || '', expiresAt:session.expiresAt || 0 });
  remember({ ...connection, name:name?.trim() || saved?.name || new URL(base).host });
  publish({ status:'online', detail:'' }); window.dispatchEvent(new Event('zhilume:session-restored')); failures = 0;
  await persist().catch(e => publish({detail:e.message}));
  schedule(15000);
}
function stopProbe() { clearTimeout(timer); controller?.abort(); controller = undefined; }
function schedule(delay: number) { clearTimeout(timer); if (started && connection.token) timer = setTimeout(() => void reconnect(), delay); }
export function reconnect():Promise<void> {
  if(connecting)return Promise.resolve();
  if(probeTask)return probeTask;
  probeTask=probe().finally(()=>{probeTask=undefined;});return probeTask;
}
async function probe() {
  if (!connection.token || controller) return;
  clearTimeout(timer);
  const current = new AbortController(), version = epoch;
  controller = current;
  const timeout = setTimeout(() => current.abort(), 8000);
  if(state.status!=='online')publish({status:'checking',detail:''});
  try {
    const info = await system(connection.base, current.signal);
    if (connection.serverId && info.serverId !== connection.serverId) throw Object.assign(new Error('此地址的 Server 身份已变化，请重新验证'), {status:401});
    try {
      await request(connection.base, '/session/status', {headers:{Authorization:'Bearer '+connection.token},signal:current.signal});
      if (connection.expiresAt && connection.expiresAt < Date.now()+300000) throw Object.assign(new Error('会话即将过期'),{status:401});
    } catch (e:any) {
      if (e.status !== 401 || !connection.refreshToken) throw e;
      const session = await post(connection.base, '/session/renew', {refreshToken:connection.refreshToken}, current.signal);
      if (version !== epoch) return;
      Object.assign(connection, session);
      remember({...connection,name:state.name}); await persist().catch(e => publish({detail:e.message}));
      if (version !== epoch) return;
      window.dispatchEvent(new Event('zhilume:session-restored'));
    }
    if (version !== epoch) return;
    connection.serverId = info.serverId;
    failures = 0; publish({status:'online'}); schedule(15000);
  } catch(e:any) {
    if (version !== epoch) return;
    const status = e.incompatible ? 'incompatible' : [401,403].includes(e.status) ? 'unauthorized' : 'offline';
    publish({status,detail:status==='offline'?'暂时无法连接 Server，请检查地址和服务是否启动。':e.message});
    if (status === 'offline') schedule(Math.min(30000, 1000 * 2 ** failures++));
  } finally { clearTimeout(timeout); if(controller===current) controller=undefined; }
}
export function reportFailure(status: number) { if ((status===0 || status===401 || status>=500) && state.status==='online') void reconnect(); }
export function startConnectionMonitor() {
  if (started) return; started=true;
  const wake=()=>{if(state.status==='offline'||state.status==='online')void reconnect();};
  window.addEventListener('online',wake); window.addEventListener('focus',wake);
  if(connection.token)void reconnect();
}
export function setAutoConnect(value:boolean) { localStorage.setItem('zhilume.autoConnect',String(value));publish({autoConnect:value}); }
export function logout() {
  if (!window.dispatchEvent(new Event('zhilume:before-switch',{cancelable:true}))) return;
  stopProbe();epoch++;connection.token='';connection.refreshToken='';
  publish({status:'disconnected',detail:''});void persist().catch(e=>publish({detail:e.message}));
}
export async function forgetServer(base:string) {
  const profile=profiles.find(p=>p.base===base);
  if(base===connection.base) { logout(); if(connection.token)throw new Error('请先保存当前草稿'); }
  if(profile?.refreshToken) await post(base,'/session/revoke',{refreshToken:profile.refreshToken}).catch(()=>{});
  profiles=profiles.filter(p=>p.base!==base);publish({profiles});await persist();
}
export async function restoreDesktopSession() {
  const saved=await window.zhilumeDesktop?.readSession();
  profiles=saved?.profiles || read(sessionStorage,'zhilume.sessions',profiles);
  if(saved && state.autoConnect) Object.assign(connection,{base:saved.base,token:saved.token,serverId:saved.serverId||'',refreshToken:saved.refreshToken||'',expiresAt:saved.expiresAt||0});
  const profile=profiles.find(p=>p.base===connection.base);
  if(!saved && state.autoConnect && connection.token && profile) Object.assign(connection,profile);
  if(!state.autoConnect)connection.token='';
  publish({profiles,name:profile?.name||'创作服务',status:connection.token?'checking':'disconnected'});
}

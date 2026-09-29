import { useEffect, useState } from 'react';
import { connection } from './api';
import { probeServer, type ServerHealth } from './server-health';

export function useServerHealth(active: boolean) {
  const [health, setHealth] = useState<ServerHealth>('checking');
  useEffect(() => {
    if (!active) { setHealth('checking'); return; }
    let disposed = false;
    let controller: AbortController | null = null;
    const poll = async () => {
      if (disposed || controller) return;
      controller = new AbortController();
      const current = controller;
      const timeout = setTimeout(() => current.abort(), 3000);
      const status = await probeServer(connection.base, connection.token, current.signal);
      clearTimeout(timeout);
      controller = null;
      if (!disposed) setHealth(status);
    };
    setHealth('checking');
    void poll();
    const timer = setInterval(poll, 3000);
    window.addEventListener('focus', poll);
    window.addEventListener('online', poll);
    return () => {
      disposed = true;
      clearInterval(timer);
      controller?.abort();
      window.removeEventListener('focus', poll);
      window.removeEventListener('online', poll);
    };
  }, [active]);
  return health;
}

export const serverHealthLabel = {
  checking: '正在检查 Server', online: 'Server 已连接',
  offline: 'Server 连接中断 · 正在重连', unauthorized: '登录已失效，请重新连接',
};

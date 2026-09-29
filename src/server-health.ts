export type ServerHealth = 'checking' | 'online' | 'offline' | 'unauthorized';

export async function probeServer(base: string, token: string, signal: AbortSignal): Promise<ServerHealth> {
  try {
    const response = await fetch(base + '/api/v1/workers', {
      headers: { Authorization: 'Bearer ' + token }, signal, cache: 'no-store',
    });
    if (response.status === 401 || response.status === 403) return 'unauthorized';
    if (!response.ok || !Array.isArray(await response.json())) return 'offline';
    return 'online';
  } catch { return 'offline'; }
}

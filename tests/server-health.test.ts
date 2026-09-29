import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { probeServer } from '../src/server-health';

test('health follows actual availability, recovery, authentication and invalid responses', async () => {
  let status = 200, payload = '[]';
  const server = createServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer fixture-session');
    res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(payload);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const address = server.address() as { port: number };
  const probe = () => probeServer(`http://127.0.0.1:${address.port}`, 'fixture-session', AbortSignal.timeout(500));
  try {
    assert.equal(await probe(), 'online');
    status = 503; assert.equal(await probe(), 'offline');
    status = 200; assert.equal(await probe(), 'online');
    status = 401; assert.equal(await probe(), 'unauthorized');
    status = 200; payload = '<html>not a Server</html>'; assert.equal(await probe(), 'offline');
    payload = '[]'; assert.equal(await probe(), 'online');
  } finally { await new Promise<void>(r => server.close(() => r())); }
  assert.equal(await probe(), 'offline');
});

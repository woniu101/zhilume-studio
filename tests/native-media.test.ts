import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const { installMedia } = require('../electron/media.cjs');
const ffmpeg = require('ffmpeg-static');

test('main process uses local originals, downloads/cache, sync retry, ownership and cancellation', { timeout: 45000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'zhilume-native-test-')), input = join(root, 'input.mp4');
  execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=128x72:r=10:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', input], { windowsHide: true, stdio: 'ignore' });
  const bytes = await readFile(input), assetId = randomUUID(), asset = { id: assetId, kind: 'video', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  const imagePath = resolve('e2e/fixtures/portrait.png'), imageBytes = await readFile(imagePath), imageId = randomUUID();
  const imageAsset = { id: imageId, kind: 'image', size: imageBytes.length, sha256: createHash('sha256').update(imageBytes).digest('hex') };
  let downloads = 0, failSync = false, uploads: Buffer[] = [];
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer fixture-token');
    if (req.url === '/api/v1/assets/' + imageId) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(imageAsset)); }
    else if (req.url === '/api/v1/assets/' + imageId + '/content') { downloads++; res.end(imageBytes); }
    else if (req.url === '/api/v1/assets/' + assetId) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(asset)); }
    else if (req.url === '/api/v1/assets/' + assetId + '/content') { downloads++; res.end(bytes); }
    else if (req.url?.startsWith('/api/v1/assets/uploads?')) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      if (failSync) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: 'test_offline', message: '同步连接中断' })); return; }
      uploads.push(Buffer.concat(chunks));
      assert.equal(JSON.parse(req.headers['x-asset-provenance'] as string).sourceAssetIds[0], assetId);
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ id: randomUUID(), kind: req.url.includes('wav') ? 'audio' : 'video' }));
    } else { res.writeHead(404); res.end(); }
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + (server.address() as any).port;
  const handlers = new Map<string, Function>(), phases: string[] = [];
  const dispose = installMedia({ handle: (name: string, fn: Function) => handlers.set(name, fn) }, { executable: ffmpeg, root: join(root, 'runtime'), getSession: () => ({ base, token: 'fixture-token' }) });
  t.after(async () => { await dispose(); await new Promise<void>(r => server.close(() => r())); await rm(root, { recursive: true, force: true }); });
  const event = { sender: { id: 99, isDestroyed: () => false, send: (_: string, value: any) => phases.push(value.phase) } };
  const call = (name: string, ...args: any[]) => handlers.get('media:' + name)!(event, ...args);
  await call('remember', assetId, input, base);
  for (const operation of ['media.video.trim.v1', 'media.audio.extract.v1']) {
    const id = await call('create', assetId, operation, { start: .5, end: 1.5 });
    assert.throws(() => handlers.get('media:run')!({ sender: { id: 100 } }, id), /不存在/);
    const result = await call('run', id);
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.sourceKind, 'local'); assert.equal(downloads, 0);
    const output = join(root, operation.includes('audio') ? 'audio.wav' : 'clip.mp4'); await writeFile(output, uploads.at(-1)!);
    execFileSync(ffmpeg, ['-v', 'error', '-i', output, '-f', 'null', '-'], { windowsHide: true, stdio: 'pipe' });
    if (operation.includes('audio')) { assert.equal(uploads.at(-1)!.subarray(0, 4).toString(), 'RIFF'); assert.ok(uploads.at(-1)!.length > 80000 && uploads.at(-1)!.length < 100000); }
    await call('dispose', id);
  }
  // Changed originals must never be used for the old asset.
  await writeFile(input, 'changed');
  let id = await call('create', assetId, 'media.video.trim.v1', { start: 0, end: 1 });
  let result = await call('run', id); assert.equal(result.sourceKind, 'download'); assert.equal(downloads, 1); assert.ok(phases.includes('downloading')); await call('dispose', id);
  failSync = true; phases.length = 0;
  id = await call('create', assetId, 'media.audio.extract.v1', { start: 0, end: 1 });
  result = await call('run', id); assert.equal(result.ok, false); assert.equal(result.canRetrySync, true); assert.ok(phases.includes('sync_failed'));
  failSync = false; phases.length = 0;
  result = await call('retry-sync', id); assert.equal(result.ok, true); assert.equal(result.sourceKind, 'cache'); assert.equal(downloads, 1); assert.ok(!phases.includes('processing')); await call('dispose', id);
  await assert.rejects(call('create', assetId, 'media.video.trim.v1', { start: 2, end: 1 }), /结束/);
  id = await call('create', assetId, 'media.video.trim.v1', { start: 0, end: 2 });
  const running = call('run', id); await call('cancel', id); result = await running;
  assert.equal(result.error.code, 'cancelled'); await call('dispose', id);
  await call('remember', imageId, imagePath, base);
  const imageJob = await call('create-source', imageId);
  assert.deepEqual(Buffer.from(await call('read-image', imageJob)), imageBytes);
  assert.equal(downloads, 1, 'original image is read without downloading');
  await call('dispose', imageJob);
  assert.deepEqual(await readdir(join(root, 'runtime/tasks')), []);
});

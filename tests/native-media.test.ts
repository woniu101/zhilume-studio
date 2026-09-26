import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const { installMedia } = require('../electron/media.cjs');
const ffmpeg = require('ffmpeg-static');

test('bundled native FFmpeg extracts and trims through bounded IPC, rejects other owners', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zhilume-native-test-'));
  const input = join(root, 'input.mp4');
  execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=128x72:r=10:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', input], { windowsHide: true, stdio: 'ignore' });
  const handlers = new Map<string, Function>();
  const dispose = installMedia({ handle: (name: string, fn: Function) => handlers.set(name, fn) }, ffmpeg);
  t.after(async () => { await dispose(); if (resolve(root).startsWith(resolve(tmpdir()) + sep + 'zhilume-native-test-')) await rm(root, { recursive: true, force: true }); });
  const event = { sender: { id: 99, isDestroyed: () => false, send: () => {} } };
  const call = (name: string, ...args: any[]) => handlers.get('media:' + name)!(event, ...args);
  for (const operation of ['media.video.trim.v1', 'media.audio.extract.v1']) {
    const id = await call('begin');
    await assert.rejects(handlers.get('media:read')!({ sender: { id: 100 } }, id, 0));
    await call('append', id, new Uint8Array(await readFile(input)));
    const result = await call('run', id, operation, { start: .5, end: 1.5 });
    const bytes = await call('read', id, 0);
    assert.equal(bytes.length, result.size);
    const output = join(root, result.filename); await writeFile(output, bytes);
    const log = execFileSync(ffmpeg, ['-i', output, '-f', 'null', '-'], { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(typeof log, 'string');
    if (operation.includes('audio')) {
      assert.equal(Buffer.from(bytes.subarray(0, 4)).toString(), 'RIFF');
      assert.ok(bytes.length > 80000 && bytes.length < 100000, 'one second of mono 44.1kHz PCM');
    }
    await call('dispose', id);
  }
  const id = await call('begin');
  await call('append', id, new Uint8Array(await readFile(input)));
  await assert.rejects(call('run', id, 'media.video.trim.v1', { start: 2, end: 1 }));
  await call('dispose', id);
  const cancelledId = await call('begin');
  await call('append', cancelledId, new Uint8Array(await readFile(input)));
  const running = call('run', cancelledId, 'media.video.trim.v1', { start: 0, end: 2 });
  const rejected = assert.rejects(running, /取消|处理/);
  await call('dispose', cancelledId);
  await rejected;
  await assert.rejects(call('read', cancelledId, 0), /不存在/);
});

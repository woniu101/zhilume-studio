const { spawn } = require('node:child_process');
const { mkdtemp, open, rm, stat } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { randomUUID } = require('node:crypto');

function argumentsFor(operation, params, source, output) {
  const { start, end } = params || {};
  if (!['media.video.trim.v1', 'media.audio.extract.v1'].includes(operation) || ![start, end].every(Number.isFinite) || start < 0 || end <= start || end > 86400) throw new Error('无效的媒体操作或时间范围');
  return ['-hide_banner', '-nostdin', '-y', '-i', source, '-ss', String(start), '-t', String(end - start), ...(operation === 'media.video.trim.v1'
    ? ['-map', '0:v:0', '-map', '0:a:0?', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart']
    : ['-map', '0:a:0', '-vn', '-c:a', 'pcm_s16le']), '-threads', '2', '-progress', 'pipe:1', '-nostats', output];
}

function installMedia(ipcMain, executable) {
  const jobs = new Map();
  function get(event, id) {
    const job = jobs.get(id);
    if (!job || job.owner !== event.sender.id) throw new Error('处理会话不存在');
    return job;
  }
  ipcMain.handle('media:begin', async event => {
    if ([...jobs.values()].some(j => j.owner === event.sender.id)) throw new Error('已有媒体任务，请先完成或取消');
    const id = randomUUID(), root = await mkdtemp(join(tmpdir(), 'zhilume-media-'));
    jobs.set(id, { root, owner: event.sender.id, size: 0 });
    return id;
  });
  ipcMain.handle('media:append', async (event, id, bytes) => {
    const job = get(event, id);
    if (job.process || job.result || !(bytes instanceof Uint8Array) || bytes.length > 4 * 1024 ** 2 || job.size + bytes.length > 1024 ** 3) throw new Error('输入超出处理限制');
    const file = await open(join(job.root, 'input'), 'a');
    try { await file.write(bytes); job.size += bytes.length; } finally { await file.close(); }
  });
  ipcMain.handle('media:run', async (event, id, operation, params) => {
    const job = get(event, id);
    if (job.process || job.result) throw new Error('任务已开始');
    const filename = operation === 'media.video.trim.v1' ? 'clip.mp4' : 'audio.wav';
    const output = join(job.root, filename);
    const args = argumentsFor(operation, params, join(job.root, 'input'), output);
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    job.process = child;
    let errorTail = '', pending = '';
    child.stderr.on('data', chunk => { errorTail = (errorTail + chunk).slice(-2000); });
    child.stdout.on('data', chunk => {
      pending += chunk;
      const lines = pending.split(/\r?\n/); pending = lines.pop();
      for (const line of lines) if (line.startsWith('out_time_us=')) {
        const progress = Math.min(.95, Math.max(0, Number(line.slice(12)) / 1e6 / (params.end - params.start)));
        if (!event.sender.isDestroyed()) event.sender.send('media:progress', { id, progress });
      }
    });
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve() : reject(new Error(errorTail.includes('matches no streams') ? '视频没有可提取的音轨' : '处理已取消，或媒体编码/截取范围不支持')));
    });
    const info = await stat(output);
    if (info.size < 64 || info.size > 1024 ** 3) throw new Error('处理结果为空或超过 1 GB 限制');
    job.result = output;
    return { filename, size: info.size };
  });
  ipcMain.handle('media:read', async (event, id, offset) => {
    const job = get(event, id);
    if (!job.result || !Number.isSafeInteger(offset) || offset < 0) throw new Error('无效的输出读取');
    const file = await open(job.result, 'r');
    try { const bytes = Buffer.alloc(4 * 1024 ** 2); const { bytesRead } = await file.read(bytes, 0, bytes.length, offset); return bytes.subarray(0, bytesRead); }
    finally { await file.close(); }
  });
  async function dispose(id, job) {
    if (job.process && job.process.exitCode === null && job.process.signalCode === null) {
      const exited = new Promise(resolve => job.process.once('close', resolve));
      job.process.kill(); await exited;
    }
    jobs.delete(id);
    await rm(job.root, { recursive: true, force: true, maxRetries: 3 });
  }
  ipcMain.handle('media:dispose', async (event, id) => { const job = jobs.get(id); if (job) await dispose(id, get(event, id)); });
  return async () => { await Promise.all([...jobs].map(([id, job]) => dispose(id, job))); };
}
module.exports = { installMedia, argumentsFor };

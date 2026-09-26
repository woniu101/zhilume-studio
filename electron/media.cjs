const media = require('@zhilume/media');
const { createReadStream, createWriteStream, readFileSync } = require('node:fs');
const { mkdir, mkdtemp, readFile, writeFile, rename, rm, stat } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

function installMedia(ipcMain, { executable, root, getSession }) {
  const jobs = new Map(), indexFile = join(root, 'local-sources.json');
  let sources = {};
  try { sources = JSON.parse(readFileSync(indexFile, 'utf8')); } catch {}
  const session = () => {
    const value = getSession();
    if (!value || !/^https?:\/\//.test(value.base) || !value.token) throw new media.MediaError('not_connected', '请先连接项目 Server');
    return { base: new URL(value.base).href.replace(/\/$/, ''), token: value.token };
  };
  const owned = (event, id) => {
    const job = jobs.get(id);
    if (!job || job.owner !== event.sender.id) throw new Error('处理会话不存在');
    return job;
  };
  function progress(job, phase, value = null) {
    job.phase = phase;
    if (!job.sender.isDestroyed()) job.sender.send('media:progress', { id: job.id, phase, progress: value });
  }
  async function matches(path, asset, signal) {
    if (!path) return false;
    const info = await stat(path).catch(() => null);
    if (!info?.isFile() || info.size !== asset.size) return false;
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(path, { signal })) digest.update(chunk);
    return digest.digest('hex') === asset.sha256;
  }
  async function request(job, path, init = {}) {
    const response = await fetch(job.session.base + '/api/v1' + path, { ...init, headers: { ...init.headers, Authorization: 'Bearer ' + job.session.token }, redirect: 'error', signal: job.abort.signal });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new media.MediaError(error.code || 'server_error', error.message || 'Server 请求失败，请检查连接后重试');
    }
    return response;
  }
  async function source(job) {
    const asset = await (await request(job, '/assets/' + encodeURIComponent(job.assetId))).json();
    const image = job.operation === 'image.source';
    if (asset.kind !== (image ? 'image' : 'video') || asset.staged || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > (image ? 64 * 1024 ** 2 : media.MAX_BYTES))
      throw new media.MediaError('invalid_media', image ? '原素材必须为已归档图片且不超过 64 MB' : '原素材必须为已归档的视频且不超过 1 GB');
    job.asset = asset; progress(job, 'validating');
    const original = sources[job.session.base + '/' + asset.id];
    if (await matches(original, asset, job.abort.signal)) { job.sourceKind = 'local'; return original; }
    const folder = join(root, 'cache'); await mkdir(folder, { recursive: true });
    const cached = join(folder, asset.sha256);
    if (await matches(cached, asset, job.abort.signal)) { job.sourceKind = 'cache'; return cached; }
    job.sourceKind = 'download'; progress(job, 'downloading', 0);
    const response = await request(job, '/assets/' + encodeURIComponent(asset.id) + '/content');
    if (!response.body) throw new media.MediaError('download_failed', '素材响应为空');
    const temporary = cached + '.' + job.id + '.part';
    let count = 0; const digest = createHash('sha256');
    try {
      await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, _encoding, callback) {
        count += chunk.length; digest.update(chunk);
        if (count > asset.size) return callback(new media.MediaError('download_invalid', '下载素材超过声明大小'));
        progress(job, 'downloading', count / asset.size); callback(null, chunk);
      } }), createWriteStream(temporary, { flags: 'wx' }), { signal: job.abort.signal });
      if (count !== asset.size || digest.digest('hex') !== asset.sha256) throw new media.MediaError('download_invalid', '下载素材校验失败，请重试');
      await rename(temporary, cached); return cached;
    } catch (error) { await rm(temporary, { force: true }); throw error; }
  }
  async function sync(job) {
    progress(job, 'syncing', 0);
    let count = 0;
    const input = createReadStream(job.result.path, { signal: job.abort.signal });
    const stream = new Transform({ transform(chunk, _encoding, callback) {
      count += chunk.length; progress(job, 'syncing', count / job.result.size); callback(null, chunk);
    } });
    input.on('error', error => stream.destroy(error)); input.pipe(stream);
    try {
      const response = await request(job, '/assets/uploads?filename=' + encodeURIComponent(job.result.filename), {
        method: 'POST', duplex: 'half', headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(job.result.size), 'X-Media-Sync-Id': job.id,
          'X-Asset-Provenance': JSON.stringify({ operation: job.operation, sourceAssetIds: [job.assetId], parameters: job.parameters }) }, body: stream,
      });
      const asset = await response.json(); progress(job, 'succeeded', 1);
      return { ok: true, asset, sourceKind: job.sourceKind };
    } finally { input.destroy(); stream.destroy(); }
  }
  function run(job, retry) {
    if (job.work) throw new Error('任务正在处理');
    job.abort = new AbortController();
    job.work = (async () => {
      try {
        if (!retry) {
          const input = await source(job);
          job.result = await media.processFile({ executable, input, output: join(job.directory, media.format(job.operation).filename), operation: job.operation, parameters: job.parameters, signal: job.abort.signal,
            onProgress: value => progress(job, value.phase, value.progress) });
        }
        return await sync(job);
      } catch (error) {
        const cancelled = job.abort.signal.aborted;
        const code = cancelled ? 'cancelled' : error instanceof media.MediaError ? error.code : 'io_error';
        const message = cancelled ? '已取消处理' : error instanceof media.MediaError ? error.message : '文件传输或读写失败，请检查连接和磁盘';
        progress(job, cancelled ? 'cancelled' : job.result ? 'sync_failed' : 'failed');
        return { ok: false, error: { code, message }, canRetrySync: !!job.result };
      } finally { job.work = undefined; }
    })();
    return job.work;
  }
  ipcMain.handle('media:remember', async (_event, assetId, path, base) => {
    const current = session();
    if (base.replace(/\/$/, '') !== current.base || typeof assetId !== 'string' || typeof path !== 'string' || !path) return;
    const absolute = resolve(path), info = await stat(absolute);
    if (!info.isFile()) return;
    sources[current.base + '/' + assetId] = absolute;
    await mkdir(root, { recursive: true }); await writeFile(indexFile, JSON.stringify(sources), { mode: 0o600 });
  });
  async function create(event, assetId, operation, parameters) {
    if (operation !== 'image.source' && [...jobs.values()].some(j => j.owner === event.sender.id && j.operation !== 'image.source')) throw new Error('已有媒体任务，请先完成或取消');
    if ([...jobs.values()].filter(j => j.owner === event.sender.id).length >= 4) throw new Error('正在读取素材，请稍后重试');
    if (typeof assetId !== 'string' || !/^[a-f0-9-]{36}$/.test(assetId)) throw new Error('无效的素材');
    const validated = operation === 'image.source' ? {} : media.validate(operation, parameters), current = session();
    const directoryRoot = join(root, 'tasks'); await mkdir(directoryRoot, { recursive: true });
    const directory = await mkdtemp(join(directoryRoot, 'task-')), id = randomUUID();
    jobs.set(id, { id, directory, owner: event.sender.id, sender: event.sender, assetId, operation, parameters: validated, session: current });
    return id;
  }
  ipcMain.handle('media:create', async (event, assetId, operation, parameters) => {
    media.validate(operation, parameters);
    return create(event, assetId, operation, parameters);
  });
  ipcMain.handle('media:create-source', (event, assetId) => create(event, assetId, 'image.source', {}));
  ipcMain.handle('media:read-image', (event, id) => {
    const job = owned(event, id);
    if (job.operation !== 'image.source' || job.work) throw new Error('图片读取会话无效');
    job.abort = new AbortController();
    job.work = (async () => {
      try { return new Uint8Array(await readFile(await source(job), { signal: job.abort.signal })); }
      finally { job.work = undefined; }
    })();
    return job.work;
  });
  ipcMain.handle('media:run', (event, id) => run(owned(event, id), false));
  ipcMain.handle('media:retry-sync', (event, id) => {
    const job = owned(event, id); if (!job.result) throw new Error('没有可同步的处理结果');
    const current = session();
    if (current.base !== job.session.base) throw new Error('请重新连接原项目 Server 后再同步');
    job.session = current; return run(job, true);
  });
  ipcMain.handle('media:cancel', async (event, id) => { const job = owned(event, id); job.abort?.abort(); await job.work; });
  async function dispose(id, job) {
    job.abort?.abort(); await job.work?.catch(() => {}); jobs.delete(id);
    await rm(job.directory, { recursive: true, force: true, maxRetries: 3 });
  }
  ipcMain.handle('media:dispose', async (event, id) => { if (jobs.has(id)) await dispose(id, owned(event, id)); });
  return async () => { await Promise.all([...jobs].map(([id, job]) => dispose(id, job))); };
}
module.exports = { installMedia };

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
const catalog = JSON.parse(readFileSync(new URL('../src/contracts/operation-catalog.json', import.meta.url), 'utf8'));
const base = 'http://127.0.0.1:4319/api/v1';
const headers = { Authorization: 'Bearer e2e-local-fixture-only' };
const models = catalog.imageModels.map((m: any, i: number) => ({ ...m, ready: true, profiles: [{ modelId: m.id, profileId: String(i + 1).repeat(64), workflowRevision: m.workflowRevision,
  operations: m.operations, maxReferences: i ? 4 : 0, formats: m.formats, maxSize: 1536, referenceResolution: 1024, defaultSteps: i ? 25 : 50 }] }));

async function setup(page: any, request: any) {
  const project = await (await request.post(base + '/projects', { headers, data: { name: '图片工作流 ' + Date.now() } })).json();
  const assets = [];
  for (const file of ['interaction-test.png', 'portrait.png']) assets.push(await (await request.post(base + '/assets/uploads?filename=' + file, { headers: { ...headers, 'Content-Type': 'application/octet-stream' }, data: await readFile('e2e/fixtures/' + file) })).json());
  const nodes = [
    { id: 'text', type: 'media', style: { width: 280 }, position: { x: 40, y: 200 }, data: { kind: 'text', title: '创作提示', text: '把两张图融合为水彩插画' } },
    { id: 'image', type: 'media', style: { width: 280 }, position: { x: 400, y: 200 }, data: { kind: 'image', title: '主要参考', assetId: assets[0].id } },
  ];
  await request.put(base + `/projects/${project.id}/canvas`, { headers, data: { schemaVersion: 1, baseRevision: 0, viewport: { x: 0, y: 0, zoom: 1 }, nodes, edges: [{ id: 'e', source: 'text', target: 'image' }] } });
  await page.addInitScript(() => sessionStorage.setItem('zhilume.session', 'e2e-local-fixture-only'));
  await page.goto('/'); await page.getByText(project.name, { exact: true }).click();
  await page.locator('.react-flow__node[data-id="image"]').click();
  await page.getByRole('button', { name: '图片生成与编辑', exact: true }).click();
  return { project, assets, dialog: page.getByRole('region', { name: '图片生成与编辑' }) };
}

test('generation preserves inputs across models, orders references and retries with the same request id', async ({ page, request }) => {
  await page.route('**/api/v1/image-models', route => route.fulfill({ json: models }));
  const { project, assets, dialog } = await setup(page, request);
  await expect(dialog.getByLabel('提示词', { exact: true })).toHaveValue('把两张图融合为水彩插画');
  await dialog.getByRole('button', { name: '多图参考', exact: true }).click();
  await dialog.getByLabel('添加参考图').selectOption(assets[1].id);
  await dialog.getByRole('button', { name: '将参考图 2 向前移动' }).click();
  await dialog.getByLabel('模型', { exact: true }).selectOption('qwen-image-2512');
  await expect(dialog.getByRole('status')).toContainText('不支持当前操作');
  await expect(dialog.getByRole('button', { name: '提交生成' })).toBeDisabled();
  await expect(dialog.locator('.generation-references li')).toHaveCount(2);
  await dialog.getByLabel('模型', { exact: true }).selectOption('qwen-image-2.1');
  await expect(dialog.getByRole('button', { name: '提交生成' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/generation-dark.png' });
  const bodies: any[] = [];
  await page.route('**/api/v1/jobs', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postDataJSON());
    await route.fulfill(bodies.length === 1 ? { status: 503, json: { message: '暂时无法提交' } } : { status: 201, json: { id: 'fake-generation' } });
  });
  await dialog.getByRole('button', { name: '提交生成' }).click();
  await expect(dialog.getByRole('alert')).toContainText('暂时无法提交');
  await expect.poll(async () => (await (await request.get(base + `/projects/${project.id}/canvas`, { headers })).json()).nodes.find((n: any) => n.id === 'image').data.generationDraft?.request?.id).toBe(bodies[0].requestId);
  await page.reload(); await page.getByText(project.name, { exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.locator('.react-flow__node[data-id="image"]').click();
  await page.getByRole('button', { name: '图片生成与编辑', exact: true }).click();
  await expect(dialog.getByLabel('提示词', { exact: true })).toHaveValue('把两张图融合为水彩插画');
  await dialog.getByRole('button', { name: '提交生成' }).click();
  await expect(dialog).toHaveCount(0);
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toEqual(bodies[1]);
  expect(bodies[0].operation).toBe('image.reference.v1');
  expect(bodies[0].input.referenceAssetIds).toEqual([assets[1].id, assets[0].id]);
  expect(bodies[0].input.width).toBeUndefined();
});

test('offline worker keeps the draft editable and blocks execution', async ({ page, request }) => {
  await page.route('**/api/v1/image-models', route => route.fulfill({ json: models.map(m => ({ ...m, ready: false, profiles: [] })) }));
  const { dialog } = await setup(page, request);
  await dialog.getByLabel('提示词', { exact: true }).fill('保留角色，更换背景');
  await expect(dialog.getByRole('status')).toContainText('暂无已启用此模型');
  await expect(dialog.getByRole('button', { name: '提交生成' })).toBeDisabled();
  await page.evaluate(() => document.documentElement.dataset.theme = 'light');
  await page.screenshot({ path: 'test-results/generation-light.png' });
});


test('empty nodes open on a single click, drafts survive closing, and panels remain inside the canvas', async ({ page, request }) => {
  await page.route('**/api/v1/image-models', route => route.fulfill({ json: models.map(m => ({ ...m, profiles: [] })) }));
  const project = await (await request.post(base + '/projects', { headers, data: { name: '单击编辑 ' + Date.now() } })).json();
  const kinds = ['image', 'text', 'video', 'audio'];
  await request.put(base + `/projects/${project.id}/canvas`, { headers, data: { schemaVersion: 1, baseRevision: 0,
    nodes: kinds.map((kind, i) => ({ id: kind, type: 'media', style: { width: 280 }, position: { x: 40 + (i % 2) * 520, y: 65 + Math.floor(i / 2) * 540 }, data: { kind, title: kind } })),
    edges: [], viewport: { x: 0, y: 0, zoom: 1 } } });
  await page.addInitScript(() => sessionStorage.setItem('zhilume.session', 'e2e-local-fixture-only'));
  await page.goto('/'); await page.getByText(project.name, { exact: true }).click();
  const panel = page.locator('.node-composer');
  const node = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
  await node('image').click({ position: { x: 35, y: 30 } });
  await expect(panel).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await panel.getByLabel('提示词', { exact: true }).fill('晨光中的森林');
  await panel.getByLabel('画面比例').selectOption('custom');
  await panel.getByLabel('宽度', { exact: true }).fill('1280');
  await expect(panel).toBeVisible();
  await page.mouse.click(1370, 150);
  await expect(panel).toHaveCount(0);
  await node('image').click({ position: { x: 35, y: 30 } });
  await expect(panel.getByLabel('提示词', { exact: true })).toHaveValue('晨光中的森林');
  await expect(panel.getByLabel('宽度', { exact: true })).toHaveValue('1280');
  await page.screenshot({ path: 'test-results/composer-image-dark.png' });
  await node('text').click({ position: { x: 35, y: 30 } });
  await expect(panel).toHaveAttribute('aria-label', '文本内容');
  await panel.getByLabel('文本内容', { exact: true }).fill('分镜草稿');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await node('text').click({ position: { x: 35, y: 30 } });
  await expect(panel.getByLabel('文本内容', { exact: true })).toHaveValue('分镜草稿');
  await panel.getByRole('button', { name: '保存文本' }).click();
  await expect(node('text')).toContainText('分镜草稿');
  for (const kind of ['video', 'audio']) {
    await node(kind).click({ position: { x: 35, y: 30 } });
    await expect(panel).toContainText('生成尚未接入');
    const b = (await panel.boundingBox())!, c = (await page.locator('.canvas-area').boundingBox())!, n = (await node(kind).boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(c.x); expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width);
    expect(b.y).toBeGreaterThanOrEqual(c.y); expect(b.y + b.height).toBeLessThanOrEqual(c.y + c.height);
    expect(b.y + b.height < n.y || b.y > n.y + n.height).toBe(true);
    if (kind === "video") expect(b.y + b.height).toBeLessThan(n.y);
  }
  await page.mouse.click(1370, 150);
  const before = (await node('image').boundingBox())!;
  await page.mouse.move(before.x + 35, before.y + 30); await page.mouse.down();
  await page.mouse.move(before.x + 155, before.y + 60, { steps: 12 }); await page.mouse.up();
  await expect(panel).toHaveCount(0);
  expect((await node('image').boundingBox())!.x).toBeGreaterThan(before.x + 100);
  await node('image').click({ position: { x: 35, y: 30 } });
  await page.evaluate(() => document.documentElement.dataset.theme = 'light');
  await page.screenshot({ path: 'test-results/composer-image-light.png' });
});


test('reference upload and library drag save to the project without creating canvas nodes', async ({ page, request }) => {
  await page.route('**/api/v1/image-models', route => route.fulfill({ json: models.map(m => ({ ...m, profiles: [] })) }));
  const { project, assets, dialog } = await setup(page, request);
  await request.post(base + `/projects/${project.id}/library`, { headers, data: { assetId: assets[1].id, name: '竖版参考' } });
  await page.reload(); await page.getByText(project.name, { exact: true }).click();
  await page.locator('.react-flow__node[data-id="image"]').click();
  await page.getByRole('button', { name: '图片生成与编辑', exact: true }).click();
  await dialog.getByLabel('上传参考图片').setInputFiles('e2e/fixtures/interaction-test.png');
  await expect(dialog.locator('.generation-references li')).toHaveCount(2);
  await page.locator('.asset-card').filter({ hasText: '竖版参考' }).dragTo(dialog.locator('textarea').first());
  await expect(dialog.locator('.generation-references li')).toHaveCount(3);
  await dialog.getByRole('button', { name: '将参考图 3 向前移动' }).click();
  await dialog.getByLabel('提示词', { exact: true }).fill('重启后保留参考顺序');
  await expect.poll(async () => (await (await request.get(base + `/projects/${project.id}/canvas`, { headers })).json()).nodes.find((n: any) => n.id === 'image').data.generationDraft?.prompt).toBe('重启后保留参考顺序');
  await page.reload(); await page.getByText(project.name, { exact: true }).click();
  await page.locator('.react-flow__node[data-id="image"]').click();
  await page.getByRole('button', { name: '图片生成与编辑', exact: true }).click();
  await expect(dialog.getByLabel('提示词', { exact: true })).toHaveValue('重启后保留参考顺序');
  await expect(dialog.locator('.generation-references li').nth(1)).toContainText('portrait.png');
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await expect(dialog.getByLabel('模型', { exact: true })).toHaveValue('qwen-image-2.1');
  await page.screenshot({ path: 'test-results/generation-persistent-references.png' });
});


test('node failure exposes retry and cancellation without opening task history', async ({ page, request }) => {
  let status = 'failed';
  const job = () => ({ id: 'fixture-job', nodeId: 'image', status, operation: 'image.generate.v1', simulation: false, stage: status === 'failed' ? '执行失败' : '等待执行端', error: status === 'failed' ? '显存不足，请降低尺寸' : null, progress: null, createdAt: new Date().toISOString() });
  await page.route('**/api/v1/jobs?*', route => route.fulfill({ json: [job()] }));
  await page.route('**/api/v1/jobs/fixture-job/retry', route => { status = 'queued'; return route.fulfill({ json: job() }); });
  await page.route('**/api/v1/jobs/fixture-job/cancel', route => { status = 'cancelled'; return route.fulfill({ json: job() }); });
  const { dialog } = await setup(page, request);
  await dialog.getByRole('button', { name: '收起编辑区' }).click();
  const node = page.locator('.react-flow__node[data-id="image"]');
  await expect(node.locator('.node-status')).toContainText('显存不足');
  await node.getByRole('button', { name: '重试节点任务' }).click();
  await expect(node.locator('.node-status')).toContainText('排队中');
  await node.getByRole('button', { name: '取消节点任务' }).click();
  await expect(node.locator('.node-status')).toContainText('已取消');
});

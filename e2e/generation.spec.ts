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
    { id: 'text', type: 'media', position: { x: 40, y: 200 }, data: { kind: 'text', title: '创作提示', text: '把两张图融合为水彩插画' } },
    { id: 'image', type: 'media', position: { x: 400, y: 200 }, data: { kind: 'image', title: '主要参考', assetId: assets[0].id } },
  ];
  await request.put(base + `/projects/${project.id}/canvas`, { headers, data: { schemaVersion: 1, baseRevision: 0, nodes, edges: [{ id: 'e', source: 'text', target: 'image' }] } });
  await page.addInitScript(() => sessionStorage.setItem('zhilume.session', 'e2e-local-fixture-only'));
  await page.goto('/'); await page.getByText(project.name, { exact: true }).click();
  await page.locator('.react-flow__node[data-id="image"]').click();
  await page.getByRole('button', { name: '图片生成与编辑', exact: true }).click();
  return { project, assets, dialog: page.getByRole('dialog') };
}

test('generation preserves inputs across models, orders references and retries with the same request id', async ({ page, request }) => {
  await page.route('**/api/v1/image-models', route => route.fulfill({ json: models }));
  const { assets, dialog } = await setup(page, request);
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

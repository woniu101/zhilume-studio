import { selectOption } from './select';
import { test, expect } from '@playwright/test';
import { readFile, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
const catalog = JSON.parse(readFileSync(new URL('../src/contracts/operation-catalog.json', import.meta.url), 'utf8'));
const base = 'http://127.0.0.1:4319/api/v1';
const headers = { Authorization: 'Bearer e2e-local-fixture-only' };
const profile = { ...catalog.speechModels[0], modelId: 'indextts-2.5', profileId: 'a'.repeat(64), emotionModes: ['follow','reference','vector'], maxTextCharacters: 1000 };
async function setup(page: any, request: any, online = true) {
  await page.route('**/api/v1/speech-models', (r: any) => r.fulfill({ json: [{ ...catalog.speechModels[0], ready: online, profiles: online ? [profile] : [] }] }));
  const project = await (await request.post(base + '/projects', { headers, data: { name: '语音测试 ' + Date.now() } })).json();
  const asset = await (await request.post(base + '/assets/uploads?filename=voice.wav', { headers: { ...headers, 'Content-Type': 'application/octet-stream' }, data: await promisify(readFile)('e2e/fixtures/interaction-test.wav') })).json();
  await request.put(base + `/projects/${project.id}/canvas`, { headers, data: { schemaVersion: 1, baseRevision: 0, viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [{ id: 'speech', type: 'media', style: { width: 320 }, position: { x: 220, y: 80 }, data: { kind: 'audio', title: '配音' } }], edges: [] } });
  await page.addInitScript(() => sessionStorage.setItem('zhilume.session', 'e2e-local-fixture-only'));
  await page.goto('/'); await page.getByText(project.name, { exact: true }).click();
  await page.locator('.react-flow__node[data-id="speech"]').click({ position: { x: 40, y: 35 } });
  const panel = page.getByRole('region', { name: '语音合成', exact: true });
  await expect(panel).toBeVisible();
  await panel.getByRole('button',{name:/音色参考 ·/}).click();
  await selectOption(page.getByRole('combobox', { name: '音色参考', exact: true }), asset.id);

  await page.getByLabel('音色参考终点').fill('1.5');await page.keyboard.press('Escape');
  await panel.getByLabel('合成文字').fill('欢迎来到织镜。');
  return { panel, project, asset };
}
test('speech drafts, reference roles, model limits and retry idempotency', async ({ page, request }) => {
  const { panel, project, asset } = await setup(page, request);
  await panel.getByRole('button', { name: '语音参数', exact: true }).click();
  await page.getByLabel('语速', { exact: true }).fill('1.25');
  await page.keyboard.press('Escape');await panel.getByRole('button',{name:/情绪 ·/}).click();
  await selectOption(page.getByLabel('情绪方式'), 'reference');
  await page.getByRole('dialog',{name:'情绪设置'}).getByRole('button',{name:/情绪参考 ·/}).click();
  await selectOption(page.getByRole('combobox', { name: '情绪参考', exact: true }), asset.id);
  await page.getByLabel('情绪参考起点').fill('0.5');
  await page.getByLabel('情绪参考终点').fill('2');
  await page.keyboard.press('Escape');await page.getByLabel('情绪方式').click();
  await expect(page.getByRole('listbox').locator('[data-value="text"]')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(panel.getByRole('button', { name: '合成语音' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/speech-dark.png' });
  const bodies: any[] = [];
  await page.route('**/api/v1/jobs', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postDataJSON());
    await route.fulfill(bodies.length === 1 ? { status: 503, json: { message: '暂时无法提交' } } : { status: 201, json: { id: 'fixture-speech' } });
  });
  await panel.getByRole('button', { name: '合成语音' }).click();
  await expect(panel.getByRole('alert')).toContainText('暂时无法提交');
  await expect.poll(async () => (await (await request.get(base + `/projects/${project.id}/canvas`, { headers })).json()).nodes[0].data.speechDraft?.request?.id).toBe(bodies[0].requestId);
  await page.reload(); await page.getByText(project.name, { exact: true }).click();
  await page.locator('.react-flow__node[data-id="speech"]').click({ position: { x: 40, y: 35 } });
  await expect(panel.getByLabel('合成文字')).toHaveValue('欢迎来到织镜。');
  await panel.getByRole('button', { name: '合成语音' }).click();
  await expect(panel).toBeVisible();
  expect(bodies[0]).toEqual(bodies[1]); expect(bodies[0].operation).toBe('audio.speech.v1');
  expect(bodies[0].input.speed).toBe(1.25);
  expect(bodies[0].input.speaker).toEqual({ assetId: asset.id, start: 0, end: 1.5 });
  expect(bodies[0].input.emotionReference.start).toBe(.5);
});
test('offline speech remains editable and hides when canvas loses focus', async ({ page, request }) => {
  const { panel } = await setup(page, request, false);
  await expect(panel.getByRole('status')).toContainText('尚未配置 IndexTTS');
  await expect(panel.getByRole('button', { name: '合成语音' })).toBeDisabled();
  await panel.getByRole('button',{name:/情绪 ·/}).click();
  await selectOption(page.getByLabel('情绪方式'), 'vector');
  await page.getByLabel('高兴强度').fill('0.65');
  await page.evaluate(() => document.documentElement.dataset.theme = 'light');
  await page.screenshot({ path: 'test-results/speech-light.png' });
  await page.keyboard.press('Escape');await page.mouse.click(1380, 100); await expect(panel).toHaveCount(0);
});

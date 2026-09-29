import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:4319/api/v1';
const headers = { Authorization: 'Bearer e2e-local-fixture-only' };

async function setup(page: any, request: any, file: string, kind: string) {
  const project = await (await request.post(base + '/projects', { headers, data: { name: '媒体处理 ' + Date.now() } })).json();
  const response = await request.post(base + '/assets/uploads?filename=' + file, { headers: { ...headers, 'Content-Type': 'application/octet-stream' }, data: await readFile('e2e/fixtures/' + file) });
  expect(response.status()).toBe(201);
  const asset = await response.json();
  const saved = await request.put(base + `/projects/${project.id}/canvas`, { headers, data: { schemaVersion: 1, baseRevision: 0, nodes: [{ id: 'source', type: 'media', position: { x: 300, y: 180 }, data: { title: '原始素材', kind, assetId: asset.id } }], edges: [] } });
  expect(saved.status()).toBe(200);
  await page.addInitScript(() => sessionStorage.setItem('zhilume.session', 'e2e-local-fixture-only'));
  await page.goto('/'); await page.getByText(project.name, { exact: true }).click();
  await page.locator('.react-flow__node-media').click();
  await page.getByRole('button', { name: kind === 'image' ? '图片工具' : '视频工具', exact: true }).click();
  return { project, asset };
}

test('crop original pixels, retry failed upload, grid splitting and undo preserve source', async ({ page, request }) => {
  const { project, asset } = await setup(page, request, 'interaction-test.png', 'image');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByAltText('原图')).toBeVisible();
  await page.screenshot({ path: 'test-results/crop-editor.png' });
  await dialog.getByRole('spinbutton', { name: 'X', exact: true }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Y', exact: true }).fill('20');
  await dialog.getByRole('spinbutton', { name: '宽度', exact: true }).fill('80');
  await dialog.getByRole('spinbutton', { name: '高度', exact: true }).fill('60');
  await dialog.getByRole('button', { name: '处理并预览' }).click();
  const outputImage = dialog.locator('.media-tool-results img');
  await expect(outputImage).toBeVisible();
  await expect.poll(() => outputImage.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([80, 60]);
  await page.route('**/api/v1/assets/uploads?*', route => route.abort());
  await dialog.getByRole('button', { name: '保存到画布' }).click();
  await expect(dialog.getByRole('alert')).toContainText('处理结果仍保留');
  await expect(outputImage).toBeVisible();
  await page.unroute('**/api/v1/assets/uploads?*');
  await dialog.getByRole('button', { name: '保存到画布' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.react-flow__node-media')).toHaveCount(1);
  await expect.poll(() => page.locator('.kind-image > .node-content img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(80);
  const all = await (await request.get(base + '/assets', { headers })).json();
  const crop = all.find((a: any) => a.provenance?.sourceAssetIds?.[0] === asset.id);
  expect(crop.provenance.operation).toBe('image.crop.v1');
  expect(crop.provenance.parameters.width).toBe(80);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.react-flow__node-media')).toHaveCount(1);
  await page.locator('.react-flow__node-media').click();
  await page.getByRole('button', { name: '图片工具', exact: true }).click();
  await dialog.getByRole('button', { name: '宫格切分', exact: true }).click();
  await dialog.getByRole('button', { name: '处理并预览' }).click();
  await expect(dialog.locator('.media-tool-results img')).toHaveCount(4);
  await dialog.getByRole('button', { name: '保存到画布' }).click();
  await expect(page.locator('.react-flow__node-media')).toHaveCount(5);
  await expect.poll(async () => (await (await request.get(base + `/projects/${project.id}/canvas`, { headers })).json()).nodes.length).toBe(5);
  await page.screenshot({ path: 'test-results/image-tools.png' });
});

test('collage uses selected order and exports the configured pixel size', async ({ page, request }) => {
  await request.post(base + '/assets/uploads?filename=collage-portrait.png', { headers: { ...headers, 'Content-Type': 'application/octet-stream' }, data: await readFile('e2e/fixtures/portrait.png') });
  await setup(page, request, 'interaction-test.png', 'image');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '拼图', exact: true }).click();
  await dialog.locator('.media-tool-assets button[title="collage-portrait.png"]').last().click();
  await dialog.getByLabel('单格像素').fill('64');
  await dialog.getByLabel('间隔', { exact: true }).fill('0');
  await dialog.getByRole('button', { name: '将第 2 张向前移动' }).click();
  await expect(dialog.locator('.collage-order li').first()).toContainText('collage-portrait.png');
  await expect(dialog.getByAltText('拼图预览')).toBeVisible();
  await page.screenshot({ path: 'test-results/collage-editor.png' });
  await dialog.getByRole('button', { name: '处理并预览' }).click();
  const result = dialog.locator('.media-tool-results img');
  await expect.poll(() => result.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([128, 64]);
});

test('Web Server queue handles silence and trimmed video without any Worker', async ({ page, request }) => {
  const { project } = await setup(page, request, 'interaction-test.mp4', 'video');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '提取音轨', exact: true }).click();
  await dialog.getByRole('button', { name: '提交后台任务' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('视频没有可提取的音轨', { exact: true }).first()).toBeVisible();
  const jobs = await (await request.get(base + '/jobs?projectId=' + project.id, { headers })).json();
  expect(jobs[0].executor).toBe('server'); expect(jobs[0].errorCode).toBe('no_audio');
  await page.keyboard.press('Escape');
  await page.locator('.react-flow__node-media[data-id="source"]').click();
  await page.getByRole('button', { name: '视频工具', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: '开始秒数' }).fill('0.5');
  await dialog.getByRole('spinbutton', { name: '结束秒数' }).fill('1.5');
  await dialog.getByRole('button', { name: '提交后台任务' }).click();
  await expect(page.locator('.react-flow__node-media')).toHaveCount(2);
  await expect.poll(() => page.locator('.kind-video video').last().evaluate((video: HTMLVideoElement) => video.duration), {timeout:15000}).toBeCloseTo(1, 1);
});

test('Web submits Server audio job then archives a playable audio node', async ({ page, request }) => {
  const { project } = await setup(page, request, 'audio-video.mp4', 'video');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '提取音轨', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: '开始秒数' }).fill('0.5');
  await dialog.getByRole('spinbutton', { name: '结束秒数' }).fill('1.5');
  await dialog.getByRole('button', { name: '提交后台任务' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.kind-audio')).toHaveCount(1);
  await expect.poll(() => page.locator('.kind-audio audio').evaluate((audio: HTMLAudioElement) => audio.duration), {timeout:15000}).toBeCloseTo(1, 1);
  const jobs = await (await request.get(base + '/jobs?projectId=' + project.id, { headers })).json();
  expect(jobs[0].executor).toBe('server'); expect(jobs[0].workerId).toBeNull(); expect(jobs[0].status).toBe('succeeded');
  await page.screenshot({ path: 'test-results/web-server-audio.png' });
});

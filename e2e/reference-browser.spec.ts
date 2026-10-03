import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

test('reference browser searches, pages and previews without selecting; selection persists', async ({ page, request }) => {
  const base = 'http://127.0.0.1:4319/api/v1', headers = { Authorization: 'Bearer e2e-local-fixture-only' };
  const project = await (await request.post(base + '/projects', { headers, data: { name: '搜索参考 ' + Date.now() } })).json();
  const assets: any[] = [];
  for (const [kind, file] of [['image', 'portrait.png'], ['audio', 'interaction-test.wav'], ['video', 'interaction-test.mp4']]) {
    const asset = await (await request.post(base + '/assets/uploads?filename=' + file, { headers: { ...headers, 'Content-Type': 'application/octet-stream' }, data: await readFile('e2e/fixtures/' + file) })).json();
    assets.push({ ...asset, filename: `目标-${kind}` });
  }
  // Many visible records, with real media URLs. Only actual uploaded IDs are selected/saved.
  const fillers = Array.from({ length: 26 }, (_, i) => ({ ...assets[0], id: randomUUID(), filename: `示例-${i}.png` }));
  await page.route('**/api/v1/assets', r => r.fulfill({ json: [...fillers, ...assets] }));
  const canvas = base + `/projects/${project.id}/canvas`;
  await request.put(canvas, { headers, data: { schemaVersion: 1, baseRevision: 0, viewport: { x: 0, y: 0, zoom: 1 }, nodes: ['image', 'audio', 'video'].map((kind, i) => ({
    id: kind, type: 'media', position: { x: 60 + i * 330, y: 80 }, style: { width: 280, height: 176 }, data: { kind, title: kind },
  })), edges: [] } });
  await page.addInitScript(() => sessionStorage.setItem('zhilume.session', 'e2e-local-fixture-only'));
  await page.goto('/'); await page.getByText(project.name, { exact: true }).click();
  await page.locator('.react-flow__node[data-id="image"]').click();
  const panel = page.locator('.node-composer');
  await panel.getByRole('button', { name: '指令编辑', exact: true }).click();
  await panel.getByRole('button', { name: '添加参考素材' }).click();
  const browser = page.getByRole('group', { name: '添加参考图', exact: true });
  await expect(browser.locator('[data-asset-id]')).toHaveCount(24);
  await browser.getByRole('button', { name: /显示更多/ }).click();
  await expect(browser.locator('[data-asset-id]')).toHaveCount(27);
  await browser.getByRole('searchbox').fill('无匹配内容');
  await expect(browser).toContainText('没有匹配的素材');
  await browser.getByRole('searchbox').fill('目标');
  await expect(browser.locator('[data-asset-id]')).toHaveCount(1);
  await browser.getByRole('button', { name: '预览 目标-image', exact: true }).click();
  await expect(browser.getByRole('region', { name: '素材预览' }).locator('img')).toBeVisible();
  await expect(panel.locator('.generation-references li')).toHaveCount(0);
  for (const theme of ['dark', 'light']) {
    await page.setViewportSize({ width: 900, height: 600 });
    await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
    const popup = page.getByRole('dialog', { name: '选择参考图片', exact: true });
    await expect.poll(async () => { const b = (await popup.boundingBox())!; return b.x >= 0 && b.y >= 0 && b.x + b.width <= 900 && b.y + b.height <= 600; }).toBe(true);
    await page.screenshot({ path: `test-results/reference-browser-${theme}.png` });
  }
  const choice = browser.getByRole('button', { name: '选择 目标-image', exact: true });
  await choice.focus(); await page.keyboard.press('Enter');
  await expect(choice).toBeDisabled(); await expect(panel.locator('.generation-references li')).toHaveCount(1);
  await page.keyboard.press('Escape'); await expect(browser).toHaveCount(0); await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: '添加参考素材' })).toBeFocused();
  await expect.poll(async () => (await (await request.get(canvas, { headers })).json()).nodes.find((n: any) => n.id === 'image').data.generationDraft?.refs).toEqual([assets[0].id]);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.react-flow__node[data-id="audio"]').click();
  await panel.getByRole('button', { name: /音色参考 ·/ }).click();
  const audio = page.getByRole('group', { name: '音色参考', exact: true });
  await expect(audio.locator('[data-asset-id]')).toHaveCount(1);
  await expect(audio.locator('audio')).toHaveCount(0);
  await audio.getByRole('button', { name: '预览 目标-audio', exact: true }).click();
  const player = audio.getByLabel('试听参考音频');
  await expect(player).toBeVisible(); expect(await player.evaluate((e: HTMLMediaElement) => e.paused)).toBe(true);
  await expect(panel.locator('.reference-card audio')).toHaveCount(0);
  await audio.getByRole('button', { name: '选择 目标-audio', exact: true }).click();
  await page.keyboard.press('Escape'); await expect(panel.locator('.reference-card audio')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.locator('.react-flow__node[data-id="video"]').click();
  await panel.getByRole('button', { name: '全能参考', exact: true }).click();
  await panel.getByRole('button', { name: /添加视频 ·/ }).click();
  const video = page.getByRole('group', { name: '添加视频', exact: true });
  await expect(video.locator('[data-asset-id]')).toHaveCount(1);
  await video.getByRole('button', { name: '预览 目标-video', exact: true }).click();
  await expect(video.getByLabel('预览参考视频')).toBeVisible();
  await expect(panel.locator('.reference-card')).toHaveCount(0);
  await video.getByRole('button', { name: '选择 目标-video', exact: true }).click();
  await page.keyboard.press('Escape'); await expect(panel.locator('.reference-card')).toHaveCount(1);
  await expect.poll(async () => (await (await request.get(canvas, { headers })).json()).nodes.find((n: any) => n.id === 'video').data.videoDraft?.references[0]?.assetId).toBe(assets[2].id);
  await page.reload(); await page.getByText(project.name, { exact: true }).click();
  await page.locator('.react-flow__node[data-id="image"]').click();
  await expect(panel.locator('.generation-references li')).toHaveCount(1);
});

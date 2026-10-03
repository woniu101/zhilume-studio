import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('result expansion reflows neighbours once, undoes with adoption and persists after reopen', async ({ page, request }) => {
  const base = 'http://127.0.0.1:4319/api/v1', headers = { Authorization: 'Bearer e2e-local-fixture-only' };
  const project = await (await request.post(base + '/projects', { headers, data: { name: '内容避让 ' + Date.now() } })).json();
  const asset = await (await request.post(base + '/assets/uploads?filename=portrait.png', {
    headers: { ...headers, 'Content-Type': 'application/octet-stream' }, data: await readFile('e2e/fixtures/portrait.png'),
  })).json();
  const canvas = base + `/projects/${project.id}/canvas`;
  const nodes = ['image', 'below', 'other'].map((id, i) => ({ id, type: 'media', position: { x: i === 2 ? 420 : 40, y: i === 0 ? 60 : 300 },
    style: { width: 280, height: 176 }, data: { kind: i === 0 ? 'image' : 'text', title: id, contentRevision: 0 } }));
  await request.put(canvas, { headers, data: { schemaVersion: 1, baseRevision: 0, nodes, edges: [], viewport: { x: 0, y: 0, zoom: 1 } } });
  let results: any[] = [];
  await page.route('**/api/v1/projects/*/node-results', r => r.fulfill({ json: results }));
  await page.addInitScript(() => sessionStorage.setItem('zhilume.session', 'e2e-local-fixture-only'));
  await page.goto('/'); await page.getByText(project.name, { exact: true }).click();
  const image = page.locator('.react-flow__node[data-id="image"]'), below = page.locator('.react-flow__node[data-id="below"]');
  await expect(image).toBeVisible();
  results = [{ version: 1, id: 'result', nodeId: 'image', base: { kind: 'image', revision: 0 }, createdAt: new Date().toISOString(), operation: 'image.generate.v1', output: asset }];
  await expect(image.locator('img')).toBeVisible({ timeout: 12000 });
  const saved = async () => (await (await request.get(canvas, { headers })).json()).nodes;
  await expect.poll(async () => (await saved()).find((n: any) => n.id === 'below').position.y).toBeCloseTo(60 + 280 * 320 / 180 + 64, 1);
  expect((await saved()).find((n: any) => n.id === 'other').position).toEqual({ x: 420, y: 300 });
  // Adoption plus asynchronous metadata/layout is one undo step, not two.
  await page.getByRole('button', { name: '撤销 Ctrl+Z', exact: true }).click();
  await expect(image.locator('img')).toHaveCount(0);
  await expect.poll(async () => (await saved()).find((n: any) => n.id === 'below').position.y).toBe(300);
  await page.getByRole('button', { name: '重做 Ctrl+Shift+Z', exact: true }).click();
  await expect(image.locator('img')).toBeVisible();
  await expect.poll(async () => (await saved()).find((n: any) => n.id === 'below').position.y).toBeGreaterThan(600);
  // Manual movement is free; later media loads cannot reflow an already fitted result.
  const box = (await below.boundingBox())!;
  await page.mouse.move(box.x + 130, box.y + 80); await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 110, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => (await saved()).find((n: any) => n.id === 'below').position.x).toBeGreaterThan(60);
  const positions = (await saved()).map((n: any) => ({ id: n.id, position: n.position, style: n.style }));
  await page.reload(); await page.getByText(project.name, { exact: true }).click();
  await expect(image.locator('img')).toBeVisible();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  expect((await saved()).map((n: any) => ({ id: n.id, position: n.position, style: n.style }))).toEqual(positions);
  await page.screenshot({ path: 'test-results/content-layout.png' });
});

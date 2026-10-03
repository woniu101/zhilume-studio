import { test, expect } from '@playwright/test';
const base = 'http://127.0.0.1:4319/api/v1', headers = { Authorization: 'Bearer e2e-local-fixture-only' };

test('lost save response followed by newer edits recovers without a false conflict or job submission', async ({ page, request }) => {
  const project = await (await request.post(base + '/projects', { headers, data: { name: '丢失保存响应 ' + Date.now() } })).json();
  await request.put(base + `/projects/${project.id}/canvas`, { headers, data: { schemaVersion: 1, baseRevision: 0, nodes: [{ id: 'text', type: 'media', position: { x: 350, y: 150 }, data: { kind: 'text', title: '文本1' } }], edges: [] } });
  await page.addInitScript(() => sessionStorage.setItem('zhilume.session', 'e2e-local-fixture-only'));
  await page.goto('/'); await page.getByText(project.name, { exact: true }).click();
  await page.locator('[data-id="text"]').click();
  let lose = true, lost = false, jobs = 0;
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/jobs')) jobs++; });
  await page.route(`**/api/v1/projects/${project.id}/canvas`, async route => {
    if (route.request().method() === 'PUT' && lose) {
      lose = false; const result = await route.fetch(); expect(result.ok()).toBeTruthy();
      lost = true; await route.abort('connectionreset'); return;
    }
    await route.continue();
  });
  await page.getByRole('textbox', { name: '文本内容', exact: true }).fill('已到达 Server 但响应丢失');
  await expect.poll(() => lost).toBe(true);
  await page.getByRole('textbox', { name: '文本内容', exact: true }).fill('断线后继续输入的新草稿');
  await expect.poll(async () => (await (await request.get(base + `/projects/${project.id}/canvas`, { headers })).json()).nodes[0].data.textEditDraft).toBe('断线后继续输入的新草稿');
  await expect(page.getByRole('dialog', { name: '画布已在其他窗口更新' })).toHaveCount(0);
  await page.reload(); await page.getByText(project.name, { exact: true }).click();
  await page.locator('[data-id="text"]').click();
  await expect(page.getByRole('textbox', { name: '文本内容', exact: true })).toHaveValue('断线后继续输入的新草稿');
  expect(jobs).toBe(0);
});

test('automatic session renewal resumes a failed save even while health stayed online', async ({ page, request }) => {
  const project = await (await request.post(base + '/projects', { headers, data: { name: '续期后保存 ' + Date.now() } })).json();
  await request.put(base + `/projects/${project.id}/canvas`, { headers, data: { schemaVersion: 1, baseRevision: 0, nodes: [{ id: 'text', type: 'media', position: { x: 350, y: 150 }, data: { kind: 'text', title: '文本1' } }], edges: [] } });
  await page.goto('/');
  await page.getByLabel('Server 地址', { exact: true }).fill('http://127.0.0.1:4319');
  await page.getByLabel('访问凭证', { exact: true }).fill('e2e-local-fixture-only');
  await page.getByRole('button', { name: '连接 Server', exact: true }).click();
  await page.getByText(project.name, { exact: true }).click(); await page.locator('[data-id="text"]').click();
  let rejectSave = true, expire = true, renewals = 0;
  page.on('request', r => { if (r.url().endsWith('/session/renew')) renewals++; });
  await page.route('**/api/v1/session/status', route => {
    if (expire) { expire = false; return route.fulfill({ status: 401, json: { message: 'expired' } }); }
    return route.continue();
  });
  await page.route(`**/api/v1/projects/${project.id}/canvas`, route => {
    if (route.request().method() === 'PUT' && rejectSave) { rejectSave = false; return route.fulfill({ status: 401, json: { message: 'expired' } }); }
    return route.continue();
  });
  await page.getByRole('textbox', { name: '文本内容', exact: true }).fill('自动续期后应保存，不需要再次编辑');
  await expect.poll(async () => (await (await request.get(base + `/projects/${project.id}/canvas`, { headers })).json()).nodes[0].data.textEditDraft).toBe('自动续期后应保存，不需要再次编辑');
  expect(renewals).toBe(1);
});

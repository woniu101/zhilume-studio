import { test, expect } from '@playwright/test';

test('admin displays model job names, visible errors and current worker diagnostics', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('zhilume.admin.session', 'e2e-local-fixture-only'));
  await page.route('**/api/v1/workers', route => route.fulfill({ json: [{ id: 'worker-test', name: '云端执行器', platform: 'Linux', connected: true, disabled: false, draining: false,
    state: 'busy', reason: '正在执行任务', heartbeatAgeSeconds: 2, lastHeartbeat: Date.now() - 2000, capabilities: ['image.generate.v1'], imageProfiles: [],
    activeJobs: [{ id: 'job-test', stage: '采样中', status: 'running' }] }] }));
  await page.route('**/api/v1/jobs', route => route.fulfill({ json: [{ id: 'job-test', projectId: 'project-test', workerId: 'worker-test', attemptId: 'attempt-test', operation: 'image.edit.v1',
    simulation: false, status: 'failed', stage: '模型执行失败', progress: null, error: '显存不足，请降低尺寸后重试' }] }));
  await page.goto('http://127.0.0.1:4319/admin/');
  await expect(page.getByText('云端执行器', { exact: true })).toBeVisible();
  await expect(page.getByText('忙碌', { exact: true })).toBeVisible();
  await expect(page.getByText('图片指令编辑', { exact: true })).toBeVisible();
  await expect(page.getByText('显存不足，请降低尺寸后重试', { exact: true })).toBeVisible();
  await expect(page.getByText('2 秒前', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-worker-diagnostics.png' });
});


test('admin connects by Worker address and secret without network-tool setup', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('zhilume.admin.session', 'e2e-local-fixture-only'));
  let saved: any = null;
  const secret = 'fixture-worker-secret-only';
  await page.route('**/api/v1/workers', async route => {
    if (route.request().method() === 'POST') {
      saved = route.request().postDataJSON();
      await route.fulfill({ status: 201, json: { id: 'worker-test' } });
    } else await route.fulfill({ json: [] });
  });
  await page.route('**/api/v1/workers/probe', route => route.fulfill({ json: { workerName: '测试 Worker', platform: 'Linux', protocolVersion: '2.0' } }));
  await page.goto('http://127.0.0.1:4319/admin/');
  await page.getByRole('button', { name: '接入执行端', exact: true }).click();
  await page.getByLabel('Worker 地址', { exact: true }).fill('http://127.0.0.1:4320');
  await page.getByLabel('接入密钥', { exact: true }).fill(secret);
  await expect(page.getByLabel('接入密钥')).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('HTTP 校验通过，保存后建立 WebSocket：测试 Worker');
  await expect(page.getByText('复制接入命令', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/admin-worker-connect.png' });
  await page.getByRole('button', { name: '保存连接', exact: true }).click();
  await expect.poll(() => saved?.address).toBe('http://127.0.0.1:4320');
  expect(saved.credential).toBe(secret);
  await expect(page.getByLabel('Worker 地址', { exact: true })).toHaveCount(0);
});

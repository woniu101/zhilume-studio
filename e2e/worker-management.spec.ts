import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWorker, stopWorker } from '../../zhilume-server/tests/worker-helper';

test('Worker management is usable without Server binding and rejects scheduling authority', async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), 'zhilume-admin-browser-'));
  const worker = await startWorker(root);
  try {
    const token = (await readFile(join(root,'credentials/management-token'),'utf8')).trim();
    const rejected = await request.get(worker.address + '/management/api/overview', {headers:{Authorization:'Bearer '+worker.credential}});
    expect(rejected.status()).toBe(401);
    await page.goto(worker.address + '/management');
    await page.getByLabel('部署管理凭证').fill(token);
    await page.getByRole('button',{name:'连接',exact:true}).click();
    await expect(page.getByText('服务在线',{exact:true})).toBeVisible();
    await expect(page.getByText('未绑定',{exact:true})).toBeVisible();
    await page.screenshot({path:'test-results/worker-overview.png'});
    await page.getByRole('button',{name:'环境',exact:true}).click();
    await page.getByLabel('部署配置 JSON').fill(JSON.stringify({exclusive:true,url:'http://127.0.0.1:1',profiles:[]}));
    await page.getByRole('button',{name:'保存配置并停用'}).click();
    await expect(page.getByText('image:configure · succeeded')).toBeVisible();
    await page.getByRole('button',{name:'执行器',exact:true}).click();
    const image = page.locator('article').filter({has:page.getByRole('heading',{name:'Qwen / ComfyUI'})});
    await image.getByRole('button',{name:'检查环境与模型'}).click();
    await expect(image.getByText('状态：故障', {exact:false})).toBeVisible();
    await expect(image.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading',{name:'IndexTTS',exact:true})).toBeVisible();
    await page.screenshot({path:'test-results/worker-executor-isolation.png'});
    await page.getByRole('button',{name:'诊断',exact:true}).click();
    await page.getByRole('button',{name:'生成脱敏诊断报告'}).click();
    const report=page.locator('pre'); await expect(report).toContainText('executors');
    expect(await report.textContent()).not.toContain(token);
    expect(await report.textContent()).not.toContain(worker.credential);
  } finally { await stopWorker(worker.child); await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}); }
});

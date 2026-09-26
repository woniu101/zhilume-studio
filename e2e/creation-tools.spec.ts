import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const base = "http://127.0.0.1:4319/api/v1";
const headers = { Authorization: "Bearer e2e-local-fixture-only" };

test("system clipboard, node copies and rich text survive save/reopen", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const project = await (await request.post(base + "/projects", { headers, data: { name: "创作工具 " + Date.now() } })).json();
  await page.addInitScript(() => sessionStorage.setItem("zhilume.session", "e2e-local-fixture-only"));
  await page.goto("/");
  await page.getByText(project.name, { exact: true }).click();
  const nodes = page.locator('.react-flow__node-media');
  const pasteText = async (text: string) => {
    await page.evaluate(value => navigator.clipboard.writeText(value), text);
    await page.keyboard.press('Control+v');
  };
  await pasteText('第一段\n第二段');
  await expect(nodes).toHaveCount(1);
  await expect(nodes.first()).toContainText('第一段');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(nodes).toHaveCount(2);
  await pasteText('外部新文字');
  await expect(nodes).toHaveCount(3);
  await expect(nodes.filter({ hasText: '外部新文字' })).toHaveCount(1);
  // Text inputs retain their ordinary clipboard behavior even with a selected node.
  const search = page.getByPlaceholder(/搜索素材/);
  await search.focus();
  await pasteText('只进入搜索框');
  await expect(search).toHaveValue('只进入搜索框');
  await expect(nodes).toHaveCount(3);
  await search.fill('');
  await page.locator('.text-preview').nth(1).dblclick();
  const editor = page.getByRole('textbox', { name: '文本内容' });
  await expect(editor.locator('p')).toHaveCount(2);
  await editor.press('Control+a');
  await page.getByRole('button', { name: '下划线', exact: true }).click();
  await expect(page.getByRole('button', { name: '下划线', exact: true })).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button', { name: '删除线', exact: true }).click();
  await expect(editor.locator('u')).toHaveCount(2);
  await page.getByRole('button', { name: '清除格式', exact: true }).click();
  await expect(editor.locator('u')).toHaveCount(0);
  await page.getByRole('button', { name: '撤销文本编辑', exact: true }).click();
  await expect(editor.locator('u')).toHaveCount(2);
  await page.getByRole('button', { name: '重做文本编辑', exact: true }).click();
  await expect(editor.locator('u')).toHaveCount(0);
  await page.getByRole('button', { name: '有序列表', exact: true }).click();
  await expect(editor.locator('ol li')).toHaveCount(2);
  await page.screenshot({path:'test-results/text-editor.png'});
  await page.getByRole('button', { name: '保存文本', exact: true }).click();
  await expect.poll(async () => (await (await request.get(base + `/projects/${project.id}/canvas`, {headers})).json()).nodes[1].data.html).toContain('<ol>');
  // Image clipboard writes go through the same upload and node flow as file import.
  const bytes = [...await readFile(resolve('e2e/fixtures/interaction-test.png'))];
  await page.evaluate(async data => {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(data)], { type: 'image/png' }) })]);
  }, bytes);
  await page.keyboard.press('Control+v');
  await expect(page.locator('.kind-image img')).toBeVisible();
  await expect.poll(async () => (await (await request.get(base + `/projects/${project.id}/canvas`, {headers})).json()).nodes.length).toBe(4);
  await page.reload();
  await page.getByText(project.name, { exact: true }).click();
  await expect(nodes).toHaveCount(4);
  await page.locator('.text-preview').nth(1).dblclick();
  await expect(editor.locator('ol li')).toHaveCount(2);
  // Editor paste must not create canvas nodes; length enforcement reacts immediately.
  await editor.press('Control+a');
  await pasteText('超'.repeat(12001));
  await expect(page.getByRole('button', { name: '保存文本', exact: true })).toBeDisabled();
  await expect(page.getByRole('status').filter({hasText:'12,000'})).toContainText('12001');
  await expect(nodes).toHaveCount(4);
  await editor.press('Control+a');
  await pasteText('可继续编辑');
  await page.getByRole('button', { name: '保存文本', exact: true }).click();
  await page.screenshot({ path:'test-results/creation-tools.png' });
});

test("media thumbnails, metadata, cache and decode failure", async ({ page, request }) => {
  const project = await (await request.post(base + "/projects", { headers, data: { name: "素材信息 " + Date.now() } })).json();
  for (const ext of ['png', 'mp4', 'wav']) {
    const asset = await (await request.post(base + '/assets/uploads?filename=preview.' + ext, {
      headers: { ...headers, 'Content-Type': 'application/octet-stream' },
      data: await readFile(resolve('e2e/fixtures/interaction-test.' + ext)),
    })).json();
    await request.post(base + `/projects/${project.id}/library`, {headers, data:{assetId:asset.id}});
  }
  const broken = await (await request.post(base + '/assets/uploads?filename=broken.mp4', {
    headers: { ...headers, 'Content-Type': 'application/octet-stream' },
    data: Buffer.from([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]),
  })).json();
  await request.post(base + `/projects/${project.id}/library`, {headers, data:{assetId:broken.id}});
  await page.addInitScript(() => {
    sessionStorage.setItem('zhilume.session','e2e-local-fixture-only');
    localStorage.setItem('zhilume.server','http://127.0.0.1:4319');
  });
  await page.goto('/');
  await page.getByText(project.name, {exact:true}).click();
  const video = page.locator('.asset-card').filter({hasText:'preview.mp4'});
  const audio = page.locator('.asset-card').filter({hasText:'preview.wav'});
  const image = page.locator('.asset-card').filter({hasText:'preview.png'});
  await expect(video.locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);
  await expect(video.locator('.asset-meta')).toContainText('640 × 360');
  await expect(video.locator('.asset-duration')).toHaveText('0:02');
  await expect(audio.locator('.asset-meta')).toContainText('0:02');
  await expect(image.locator('.asset-meta')).toContainText('640 × 360');
  const bad = page.locator('.asset-card').filter({hasText:'broken.mp4'});
  await expect(bad).toContainText('预览不可用');
  await bad.click({button:'right'});
  await expect(page.locator('.asset-info-error')).toContainText('无法读取媒体');
  await page.getByRole('button',{name:'重新读取',exact:true}).click();
  await expect(page.locator('.asset-info-error')).toContainText('无法读取媒体');
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'切换主题'}).click();
  await page.screenshot({path:'test-results/asset-information-light.png'});
  // Persistent previews still appear after reload without downloading the source video.
  await page.route('**/assets/*/content?**', route => route.abort());
  await page.reload();
  await page.getByText(project.name, {exact:true}).click();
  await expect(video.locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);
  await expect(video.locator('.asset-meta')).toContainText('640 × 360');
});

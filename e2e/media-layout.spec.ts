import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('intrinsic image/video ratio, fixed play button, compact controls and proportional resize', async ({ page, request }) => {
  const base = 'http://127.0.0.1:4319/api/v1', headers = { Authorization: 'Bearer e2e-local-fixture-only' };
  const project = await (await request.post(base + '/projects', { headers, data: { name: '媒体比例 ' + Date.now() } })).json();
  const definitions = [
    {id:'image', kind:'image', file:'e2e/fixtures/portrait.png', x:35, y:60, ratio:180/320},
    {id:'portrait', kind:'video', file:'e2e/fixtures/portrait.mp4', x:350, y:60, ratio:180/320},
    {id:'landscape', kind:'video', file:'e2e/fixtures/interaction-test.mp4', x:680, y:60, ratio:640/360},
    {id:'wide', kind:'video', file:'e2e/fixtures/wide.mp4', x:350, y:640, ratio:4},
    {id:'audio', kind:'audio', file:'e2e/fixtures/interaction-test.wav', x:35, y:640},
  ];
  const nodes = [];
  for (const d of definitions) {
    const asset = await (await request.post(base + '/assets/uploads?filename=' + d.file.split('/').pop(), {
      headers: {...headers,'Content-Type':'application/octet-stream'}, data:await readFile(resolve(d.file)),
    })).json();
    nodes.push({ id:d.id,type:'media',position:{x:d.x,y:d.y},width:280,height:235,
      style:{width:280,height:235},data:{kind:d.kind,title:d.id,assetId:asset.id} });
  }
  const canvas = base + `/projects/${project.id}/canvas`;
  await request.put(canvas,{headers,data:{schemaVersion:1,baseRevision:0,nodes,edges:[],viewport:{x:0,y:0,zoom:1}}});
  await page.addInitScript(() => sessionStorage.setItem('zhilume.session','e2e-local-fixture-only'));
  await page.goto('/');
  await page.getByText(project.name,{exact:true}).click();
  for (const d of definitions.filter(d=>d.ratio)) {
    const node = page.locator(`[data-id="${d.id}"] .media-node`);
    await expect.poll(async()=>{const b=(await node.boundingBox())!;return b.width/b.height;}).toBeCloseTo(d.ratio!,2);
    const content = node.locator(d.kind === 'image' ? 'img' : 'video');
    const bounds = (await node.boundingBox())!, media = (await content.boundingBox())!;
    expect(Math.abs(bounds.height-media.height)).toBeLessThan(1);
    expect(Math.abs(bounds.width-media.width)).toBeLessThan(1);
  }
  const audio = page.locator('[data-id="audio"] .media-node');
  expect((await audio.boundingBox())!.height).toBe(108);
  const wave = (await audio.locator('.waveform-track').boundingBox())!;
  const row = (await audio.locator('.player-control-row').boundingBox())!;
  expect(row.y-wave.y-wave.height).toBeLessThan(4);
  await audio.hover();
  const audioReplace = audio.locator('.node-replace');
  await expect.poll(async () => (await audioReplace.boundingBox())!.y - wave.y - wave.height).toBeGreaterThanOrEqual(1);
  const replacementSize = (await audioReplace.boundingBox())!;
  const audioTime = (await audio.locator('.media-time').boundingBox())!;
  const audioActions = (await audio.locator('.player-actions').boundingBox())!;
  expect(replacementSize.x).toBeGreaterThan(audioTime.x + audioTime.width);
  expect(replacementSize.x + replacementSize.width).toBeLessThan(audioActions.x);
  const imageReplacement = (await page.locator('[data-id="image"] .node-replace').boundingBox())!;
  expect(imageReplacement.width).toBeCloseTo(replacementSize.width, 1);
  expect(imageReplacement.height).toBe(24);
  for (const id of ['portrait','landscape','wide']) {
    const node = page.locator(`[data-id="${id}"] .media-node`);
    await page.getByRole('button',{name:'项目素材',exact:true}).hover();
    const idle = (await node.locator('.video-play-overlay').boundingBox())!;
    await node.hover();
    const hover = (await node.locator('.video-play-overlay').boundingBox())!;
    expect(hover.x).toBeCloseTo(idle.x,1); expect(hover.y).toBeCloseTo(idle.y,1);
    expect(hover.width).toBe(idle.width);
    const bounds = (await node.boundingBox())!;
    expect(hover.y+hover.height/2).toBeCloseTo(bounds.y+bounds.height/2,1);
    const controls=(await node.locator('.player-controls').boundingBox())!;
    expect(controls.height).toBeLessThanOrEqual(34);
    await expect.poll(async()=>{
      const replace=(await node.locator('.node-replace').boundingBox())!;
      return replace.y-(hover.y+hover.height);
    }).toBeGreaterThanOrEqual(3);
    const replacement=(await node.locator('.node-replace').boundingBox())!;
    expect(replacement.width).toBeCloseTo(replacementSize.width, 1);
    expect(replacement.height).toBe(replacementSize.height);
    const seek=(await node.locator('.media-seek').boundingBox())!;
    expect(seek.y-replacement.y-replacement.height).toBeGreaterThan(8);
  }
  await page.screenshot({path:'test-results/media-aspect-dark.png'});
  // Drag a corner: both the visible rectangle and saved style retain image ratio.
  const image = page.locator('.react-flow__node[data-id="image"]');
  await image.locator('.node-title > span').click();
  const corner=(await image.locator('.react-flow__resize-control.handle.bottom.right').boundingBox())!;
  await page.mouse.move(corner.x+corner.width/2,corner.y+corner.height/2);
  await page.mouse.down();
  await page.mouse.move(corner.x+40,corner.y+55,{steps:10});
  await page.mouse.up();
  const resized=(await image.boundingBox())!;
  expect(resized.width).toBeGreaterThan(300);
  expect(resized.width/resized.height).toBeCloseTo(180/320,2);
  await expect.poll(async()=>{
    const doc=await(await request.get(canvas,{headers})).json();
    return doc.nodes.find((n:any)=>n.id==='image').style.width;
  }).toBeGreaterThan(300);
  await page.reload(); await page.getByText(project.name,{exact:true}).click();
  await expect.poll(async()=> (await image.boundingBox())!.width).toBeCloseTo(resized.width,0);
  await page.getByRole('button',{name:'切换主题'}).click();
  await page.screenshot({path:'test-results/media-aspect-light.png'});
  // Replacing portrait with landscape keeps ID/position but fits the new media.
  await image.locator('.media-node').hover();
  await image.getByRole('button',{name:'替换素材',exact:true}).click();
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'从电脑选择文件'}).click();
  await(await chooser).setFiles(resolve('e2e/fixtures/interaction-test.png'));
  await expect.poll(async()=>{const b=(await image.boundingBox())!;return b.width/b.height;}).toBeCloseTo(640/360,2);
  await page.getByRole('button',{name:'撤销 Ctrl+Z',exact:true}).click();
  await expect.poll(async()=>{const b=(await image.boundingBox())!;return b.width/b.height;}).toBeCloseTo(180/320,2);
});

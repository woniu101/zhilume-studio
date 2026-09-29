import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {selectOption} from './select';
import {createServer} from 'node:http';
import {once} from 'node:events';
const base='http://127.0.0.1:4319/api/v1',headers={Authorization:'Bearer e2e-local-fixture-only'};
test('in-place results, persistent versions, keyboard themes, empty type switch and explicit cross-type destination',async({page,request})=>{
  const project=await(await request.post(base+'/projects',{headers,data:{name:'节点版本 '+Date.now()}})).json();
  const asset=await(await request.post(base+'/assets/uploads?filename=result.png',{headers:{...headers,'Content-Type':'application/octet-stream'},data:await readFile('e2e/fixtures/portrait.png')})).json();
  await request.put(base+`/projects/${project.id}/canvas`,{headers,data:{schemaVersion:1,baseRevision:0,viewport:{x:0,y:0,zoom:1},nodes:[{id:'destination',type:'media',style:{width:280},position:{x:340,y:40},data:{kind:'image',title:'图片1',titleSource:'automatic',contentRevision:0,contentSchemaVersion:1}}],edges:[]}});
  let results:any[]=[],jobs:any[]=[],submitted:any;
  await page.route('**/api/v1/projects/*/node-results',r=>r.fulfill({json:results}));
  await page.route('**/api/v1/jobs?*',r=>r.fulfill({json:jobs}));
  await page.route('**/api/v1/image-models',r=>r.fulfill({json:[{id:'qwen-image-2512',name:'Qwen Image 2512',operations:['image.generate.v1'],formats:['png'],referenceLimits:{maximum:0},profiles:[{profileId:'fixture',workflowRevision:'test',operations:['image.generate.v1'],formats:['png'],maxReferences:0,maxSize:1536,defaultSteps:50,readyCount:2,workers:[{id:'a',name:'Worker A',ready:true},{id:'b',name:'Worker B',ready:true}]}]}]}));
  await page.route('**/api/v1/jobs',async r=>{
    submitted=r.request().postDataJSON();jobs=[{id:'render',nodeId:submitted.nodeId,status:'running',operation:submitted.operation,stage:'推理中',progress:.44,createdAt:new Date().toISOString()}];
    await r.fulfill({status:201,json:jobs[0]});
  });
  await page.addInitScript(()=>sessionStorage.setItem('zhilume.session','e2e-local-fixture-only'));
  await page.goto('/');await page.getByText(project.name,{exact:true}).click();
  const node=page.locator('.react-flow__node[data-id="destination"]'),panel=page.locator('.node-composer');
  await node.click();
  await selectOption(panel.getByRole('combobox',{name:'节点内容类型'}),'video');
  await expect(node).toContainText('视频1');
  await selectOption(panel.getByRole('combobox',{name:'节点内容类型'}),'image');
  await expect(node).toContainText('图片1');
  await panel.getByLabel('提示词',{exact:true}).fill('初次生成');
  const model=panel.getByRole('combobox',{name:'模型',exact:true});
  for(const theme of ['dark','light']) {
    await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);
    await model.focus();await page.keyboard.press('ArrowDown');
    const popup=page.getByRole('listbox');await expect(popup).toBeVisible();
    expect(await popup.evaluate(e=>getComputedStyle(e).color)).not.toBe(await popup.evaluate(e=>getComputedStyle(e).backgroundColor));
    await page.screenshot({path:`test-results/node-model-${theme}.png`});
    await page.keyboard.press('Escape');await expect(popup).toHaveCount(0);await expect(panel).toBeVisible();await expect(model).toBeFocused();
  }
  await panel.getByRole('button',{name:'提交生成'}).click();
  await expect(panel).toBeVisible();await expect(node.locator('.node-task-overlay')).toContainText('44%');
  await expect(panel.getByRole('button',{name:'提交生成'})).toBeDisabled();
  expect(submitted.nodeId).toBe('destination');
  await panel.getByLabel('提示词',{exact:true}).fill('下一次生成要求');
  results=[{version:1,id:'render',jobId:'render',nodeId:'destination',base:{kind:'image',revision:0},createdAt:new Date().toISOString(),operation:'image.generate.v1',output:asset}];jobs=[{...jobs[0],status:'succeeded',progress:1}];
  await expect(node.locator('.node-content img')).toBeVisible({timeout:12000});
  await expect(page.locator('.react-flow__node-media')).toHaveCount(1);await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect(panel.getByLabel('提示词',{exact:true})).toHaveValue('下一次生成要求');
  await expect(panel.getByRole('combobox',{name:'节点内容类型'})).toBeDisabled();
  await expect.poll(async()=>(await(await request.get(base+`/projects/${project.id}/canvas`,{headers})).json()).nodes[0].data.assetId).toBe(asset.id);
  await page.reload();await page.getByText(project.name,{exact:true}).click();await node.click();
  await panel.locator('.node-versions > summary').click();await expect(panel.locator('.node-versions article')).toHaveCount(1);
  await panel.getByRole('button',{name:'另存为新节点'}).click();await expect(page.locator('.react-flow__node-media')).toHaveCount(2);
  await panel.getByRole('button',{name:'收起编辑区'}).click();await node.click();
  await page.getByRole('button',{name:'视频生成与参考编辑',exact:true}).click();
  await expect(page.locator('.kind-video')).toHaveCount(1);await expect(page.locator('.kind-image')).toHaveCount(2);
  await expect(page.getByRole('region',{name:'视频生成与参考编辑'})).toBeVisible();
});

test('text generation uses Server archived results and retains an independent prompt draft',async({page,request})=>{
  const provider=createServer(async(req,res)=>{for await(const _ of req){}res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'这是完成的生成正文。'}}]}));});
  provider.listen(0,'127.0.0.1');await once(provider,'listening');
  try {
    await request.post(base+'/language/providers',{headers,data:{name:'Node text fixture '+Date.now(),baseUrl:`http://127.0.0.1:${(provider.address() as any).port}/v1`,apiKey:'fixture',models:[{model:'node-text',capabilities:['text']}],defaults:{text:'node-text'}}});
    const project=await(await request.post(base+'/projects',{headers,data:{name:'文本版本 '+Date.now()}})).json();
    await request.put(base+`/projects/${project.id}/canvas`,{headers,data:{schemaVersion:1,baseRevision:0,viewport:{x:0,y:0,zoom:1},nodes:[{id:'text',type:'media',position:{x:350,y:100},data:{kind:'text',title:'文本1',contentRevision:0}}],edges:[]}});
    await page.addInitScript(()=>sessionStorage.setItem('zhilume.session','e2e-local-fixture-only'));
    await page.goto('/');await page.getByText(project.name,{exact:true}).click();await page.locator('[data-id="text"]').click();
    const panel=page.locator('.node-composer');
    await panel.getByLabel('文本内容',{exact:true}).fill('写一段正文');
    const models=await(await request.get(base+'/language/models',{headers})).json(),model=models.find((m:any)=>m.model==='node-text');
    await selectOption(panel.getByLabel('语言模型',{exact:true}),model.profileId);
    await panel.getByRole('button',{name:'生成文本',exact:true}).click();
    await expect(page.locator('[data-id="text"] .text-preview')).toHaveText('这是完成的生成正文。',{timeout:12000});
    await expect(panel.getByLabel('文本内容',{exact:true})).toHaveValue('写一段正文');
    await expect(page.locator('.react-flow__node-media')).toHaveCount(1);
    const ledger=await(await request.get(base+`/projects/${project.id}/node-results`,{headers})).json();expect(ledger).toHaveLength(1);
    expect(ledger[0].output.text).toBe('这是完成的生成正文。');
    await expect.poll(async()=>(await(await request.get(base+`/projects/${project.id}/canvas`,{headers})).json()).nodes[0].data.languageSelection.profileId).toBe(model.profileId);
  } finally {provider.closeAllConnections();await new Promise<void>(r=>provider.close(()=>r()));}
});

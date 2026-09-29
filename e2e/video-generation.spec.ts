import { selectOption } from './select';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../src/contracts/operation-catalog.json',import.meta.url),'utf8'));
const base='http://127.0.0.1:4319/api/v1',headers={Authorization:'Bearer e2e-local-fixture-only'};
async function setup(page:any,request:any,online=true){
  await page.route('**/api/v1/video-models',(r:any)=>r.fulfill({json:catalog.videoModels.map((m:any,i:number)=>({...m,ready:online,profiles:online?[{modelId:m.id,workflowRevision:m.workflowRevision,profileId:String(i+1).repeat(64),sizes:[[512,288],[288,512]],frames:[124,243],referenceLimits:{image:2,video:1,audio:1}}]:[]}))}));
  const project=await(await request.post(base+'/projects',{headers,data:{name:'H3 test '+Date.now()}})).json();
  const asset=await(await request.post(base+'/assets/uploads?filename=reference.png',{headers:{...headers,'Content-Type':'application/octet-stream'},data:readFileSync('e2e/fixtures/interaction-test.png')})).json();
  await request.put(base+`/projects/${project.id}/canvas`,{headers,data:{schemaVersion:1,baseRevision:0,viewport:{x:0,y:0,zoom:1},nodes:[{id:'video',type:'media',style:{width:320},position:{x:220,y:80},data:{kind:'video',title:'视频测试'}}],edges:[]}});
  await page.addInitScript(()=>sessionStorage.setItem('zhilume.session','e2e-local-fixture-only'));
  await page.goto('/');await page.getByText(project.name,{exact:true}).click();
  await page.locator('.react-flow__node[data-id="video"]').click({position:{x:40,y:35}});
  const panel=page.getByRole('region',{name:'视频生成与参考编辑',exact:true});await expect(panel).toBeVisible();
  return {panel,project,asset};
}
test('H3 single-click composer preserves modes and drafts, exact duration and retry identity',async({page,request})=>{
  const {panel,project,asset}=await setup(page,request);
  await panel.getByRole('button',{name:'首尾帧',exact:true}).click();
  await selectOption(panel.getByLabel('首帧图片',{exact:true}), asset.id);
  await selectOption(panel.getByLabel('尾帧图片',{exact:true}), asset.id);
  await panel.getByLabel('视频提示词').fill('镜头缓慢推近，海浪声。');
  await panel.getByRole('button',{name:'全能参考',exact:true}).click();
  await selectOption(panel.getByLabel('添加参考',{exact:true}), asset.id);
  await panel.getByRole('button',{name:'<Picture 1>',exact:true}).click();
  await panel.getByRole('button',{name:'视频参数',exact:true}).click();
  await expect(panel.getByLabel('视频时长')).toContainText('5.17 秒 · 124 帧');
  await page.screenshot({path:'test-results/video-generation-dark.png'});
  await panel.getByRole('button',{name:'首尾帧',exact:true}).click();
  await expect(panel.getByLabel('首帧图片',{exact:true})).toHaveAttribute('data-value', asset.id);
  await expect(panel.getByLabel('尾帧图片',{exact:true})).toHaveAttribute('data-value', asset.id);
  const bodies:any[]=[];
  await page.route('**/api/v1/jobs',async route=>{
    if(route.request().method()!=='POST')return route.continue();bodies.push(route.request().postDataJSON());
    await route.fulfill(bodies.length===1?{status:503,json:{message:'测试提交失败'}}:{status:201,json:{id:'video-fixture'}});
  });
  await panel.getByRole('button',{name:'生成视频',exact:true}).click();
  await expect(panel.getByRole('alert')).toContainText('测试提交失败');
  await expect.poll(async()=>(await(await request.get(base+`/projects/${project.id}/canvas`,{headers})).json()).nodes[0].data.videoDraft?.request?.id).toBe(bodies[0].requestId);
  await page.reload();await page.getByText(project.name,{exact:true}).click();
  await page.locator('.react-flow__node[data-id="video"]').click({position:{x:40,y:35}});
  await panel.getByRole('button',{name:'生成视频',exact:true}).click();await expect(panel).toBeVisible();
  expect(bodies[0]).toEqual(bodies[1]);expect(bodies[0].operation).toBe('video.generate.v1');
  expect(bodies[0].input.references).toEqual([{role:'first',assetId:asset.id},{role:'last',assetId:asset.id}]);
});
test('offline H3 remains editable, theme and focus dismissal',async({page,request})=>{
  const {panel}=await setup(page,request,false);
  await panel.getByLabel('视频提示词').fill('保留草稿');
  await expect(panel.getByRole('status')).toContainText('暂无已登记的 H3 规格');
  await expect(panel.getByRole('button',{name:'生成视频'})).toBeDisabled();
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  await page.screenshot({path:'test-results/video-generation-light.png'});
  await page.mouse.click(1380,100);await expect(panel).toHaveCount(0);
});

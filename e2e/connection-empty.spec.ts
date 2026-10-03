import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4319/api/v1',headers={Authorization:'Bearer e2e-local-fixture-only'};
async function signIn(page:any) {
  await page.goto('/');await page.getByLabel('Server 地址',{exact:true}).fill('http://127.0.0.1:4319');
  await page.getByLabel('访问凭证',{exact:true}).fill('e2e-local-fixture-only');await page.getByRole('button',{name:'连接 Server',exact:true}).click();
  await expect(page.getByRole('heading',{name:'我的创作空间'})).toBeVisible();
}
test('connection recovery, failed switch and revoked authorization preserve the workspace',async({page,request})=>{
  const project=await(await request.post(base+'/projects',{headers,data:{name:'连接测试 '+Date.now()}})).json();
  await signIn(page);await page.getByText(project.name,{exact:true}).click();
  await page.getByRole('button',{name:'管理 Server 连接'}).click();
  await page.getByLabel('Server 地址',{exact:true}).fill('http://127.0.0.1:49999');await page.getByLabel('访问凭证',{exact:true}).fill('wrong');
  await page.getByRole('button',{name:'连接 Server',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.getByText(project.name,{exact:true})).toBeVisible();
  let offline=true;
  await page.route('**/api/v1/**',route=>offline?route.abort():route.continue());
  await page.getByRole('button',{name:'管理 Server 连接'}).click();await page.getByRole('button',{name:'立即重连'}).click();
  await expect(page.getByRole('button',{name:'管理 Server 连接'})).toContainText('连接中断');
  offline=false;await page.getByRole('button',{name:'立即重连'}).click();await expect(page.locator('.connection-summary strong')).toHaveText('已连接');
  await page.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.getByText(project.name,{exact:true})).toBeVisible();
  // Force both access validation and renewal to be rejected; keep the editor visible.
  await page.route('**/api/v1/session/status',r=>r.fulfill({status:401,json:{message:'需要重新验证'}}));
  await page.route('**/api/v1/session/renew',r=>r.fulfill({status:401,json:{message:'设备授权已失效'}}));
  await page.getByRole('button',{name:'管理 Server 连接'}).click();await page.getByRole('button',{name:'立即重连'}).click();
  await expect(page.getByRole('button',{name:'管理 Server 连接'})).toContainText('需要重新验证');await page.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(page.getByText(project.name,{exact:true})).toBeVisible();
});
test('project load failure never masquerades as an empty project list',async({page})=>{
  await page.route('**/api/v1/projects',r=>r.fulfill({status:503,json:{message:'暂时无法获取项目'}}));
  await signIn(page);await expect(page.getByRole('heading',{name:'你的第一张画布，留给第一个想法。'})).toHaveCount(0);
  await expect(page.getByText('暂时无法获取项目',{exact:true}).first()).toBeVisible();
});
test('four empty nodes share geometry and actions',async({page,request})=>{
  const project=await(await request.post(base+'/projects',{headers,data:{name:'空节点测试 '+Date.now()}})).json();
  const nodes=['text','image','video','audio'].map((kind,i)=>({id:kind,type:'media',position:{x:80+(i%2)*340,y:110+Math.floor(i/2)*230},style:{width:280,height:176},data:{kind,title:kind+'空节点'}}));
  await request.put(base+`/projects/${project.id}/canvas`,{headers,data:{schemaVersion:1,baseRevision:0,viewport:{x:0,y:0,zoom:1},nodes,edges:[]}});
  await signIn(page);await page.getByText(project.name,{exact:true}).click();
  const cards=page.locator('.media-node.is-empty');await expect(cards).toHaveCount(4);
  for(let i=0;i<4;i++){const box=await cards.nth(i).boundingBox();expect(box!.width).toBe(280);expect(box!.height).toBe(176);await expect(cards.nth(i).locator('.empty-node-content button')).toBeVisible();}
  await page.screenshot({path:'test-results/unified-empty-nodes.png'});
  await page.locator('.react-flow__node[data-id="text"]').getByRole('button',{name:'编写文本'}).click();await expect(page.getByRole('textbox',{name:'文本内容',exact:true})).toBeVisible();
});
test('saved device session renews once after expiry and can reconnect after explicit disconnect',async({page})=>{
  await signIn(page);
  let first=true, renewals=0;
  await page.route('**/api/v1/session/status',route=>{if(first){first=false;return route.fulfill({status:401,json:{message:'expired'}});}return route.continue();});
  page.on('request',r=>{if(r.url().endsWith('/session/renew'))renewals++;});
  await page.getByRole('button',{name:'管理 Server 连接'}).click();await page.getByRole('button',{name:'立即重连'}).click();await expect.poll(()=>renewals).toBe(1);
  await expect(page.locator('.connection-summary strong')).toHaveText('已连接');await page.getByRole('button',{name:'断开连接',exact:true}).click();
  await expect(page.getByRole('heading',{name:'连接你的创作服务'})).toBeVisible();
  await page.getByRole('button',{name:'连接 Server',exact:true}).click();await expect(page.getByRole('heading',{name:'我的创作空间'})).toBeVisible();
});

test('switching services isolates data and restores a locally retained draft',async({page,request})=>{
  const project=await(await request.post(base+'/projects',{headers,data:{name:'草稿隔离 '+Date.now()}})).json();
  await request.put(base+`/projects/${project.id}/canvas`,{headers,data:{schemaVersion:1,baseRevision:0,viewport:{x:0,y:0,zoom:1},nodes:[{id:'text',type:'media',position:{x:180,y:100},style:{width:280,height:176},data:{kind:'text',title:'文本1'}}],edges:[]}});
  const identity=(await(await request.get(base+'/system')).json()).serverId;
  await signIn(page);await page.getByText(project.name,{exact:true}).click();await page.locator('.react-flow__node[data-id="text"]').click();
  await page.route('**/api/v1/projects/*/canvas',r=>r.request().method()==='PUT'?r.fulfill({status:503,json:{message:'save unavailable'}}):r.continue());
  await page.getByRole('textbox',{name:'文本内容',exact:true}).fill('只能回到原服务的草稿');
  await page.keyboard.press('Escape');
  await expect.poll(()=>page.evaluate(id=>Object.keys(localStorage).some(k=>k.startsWith('zhilume.draft.'+id)&&localStorage.getItem(k)!.includes('只能回到原服务的草稿')),identity)).toBe(true);
  await page.route('http://second.test/**',r=>{
    const path=new URL(r.request().url()).pathname;
    const result=path.endsWith('/system')?{name:'Second',protocolVersion:'3.2',serverId:'second-id'}:path.endsWith('/session')?{token:'second-token',serverId:'second-id'}:path.endsWith('/session/status')?{serverId:'second-id'}:[];
    return r.fulfill({json:result});
  });
  await page.getByRole('button',{name:'管理 Server 连接'}).click();await page.getByLabel('Server 地址',{exact:true}).fill('http://second.test');await page.getByLabel('访问凭证',{exact:true}).fill('fixture');
  await page.getByRole('button',{name:'连接 Server',exact:true}).click();await expect(page.getByRole('heading',{name:'我的创作空间'})).toBeVisible();await expect(page.getByText(project.name,{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'管理 Server 连接'}).click();await page.getByLabel('Server 地址',{exact:true}).fill('http://127.0.0.1:4319');await page.getByRole('button',{name:'连接 Server',exact:true}).click();
  await page.getByText(project.name,{exact:true}).click();await expect(page.getByRole('dialog')).toContainText('草稿');
});
test('missing asset keeps a retry state instead of an upload placeholder',async({page,request})=>{
  const project=await(await request.post(base+'/projects',{headers,data:{name:'素材加载失败 '+Date.now()}})).json();
  const uploaded=await(await request.post(base+'/assets/uploads?filename=missing.png',{headers:{...headers,'Content-Type':'application/octet-stream'},data:await (await import('node:fs/promises')).readFile('e2e/fixtures/portrait.png')})).json();
  await request.put(base+`/projects/${project.id}/canvas`,{headers,data:{schemaVersion:1,baseRevision:0,nodes:[{id:'missing',type:'media',position:{x:100,y:100},data:{kind:'image',title:'图片1',assetId:uploaded.id}}],edges:[]}});
  await page.route('**/api/v1/assets',r=>r.fulfill({json:[]}));
  await signIn(page);await page.getByText(project.name,{exact:true}).click();
  await expect(page.getByText('素材暂时无法加载')).toBeVisible();await expect(page.getByRole('button',{name:'上传图片',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'重试加载',exact:true})).toBeVisible();
});

test('reconnecting with valid saved authorization does not rotate it unnecessarily',async({page})=>{
  await signIn(page);let renewals=0;
  page.on('request',r=>{if(r.url().endsWith('/session/renew'))renewals++;});
  await page.getByRole('button',{name:'管理 Server 连接'}).click();
  await page.getByRole('button',{name:'连接 Server',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(renewals).toBe(0);
});

test('a captured operation cannot send a job after the connection changes',async({page})=>{
  await signIn(page);let submissions=0;
  page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/jobs'))submissions++;});
  const code=await page.evaluate(async()=>{
    const {captureApi}=await import('/src/api.ts');
    const {logout}=await import('/src/connection.ts');
    const send=captureApi();logout();
    try{await send('/jobs','POST',{projectId:'must-not-send'});return 'unexpected';}
    catch(e:any){return e.code;}
  });
  expect(code).toBe('connection_changed');expect(submissions).toBe(0);
});

test('disconnect while a connection response is delayed cannot resurrect that connection',async({page})=>{
  await signIn(page);
  let release!:()=>void, received=false;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/v1/session',async route=>{
    const response=await route.fetch();received=true;await gate;await route.fulfill({response});
  });
  await page.evaluate(async()=>{
    const {login}=await import('/src/connection.ts');
    (window as any).pendingLogin=login('http://127.0.0.1:4319','e2e-local-fixture-only').then(()=> 'connected',e=>e.name);
  });
  await expect.poll(()=>received).toBe(true);
  await page.evaluate(async()=>{const {logout}=await import('/src/connection.ts');logout();});
  release();
  expect(await page.evaluate(()=>(window as any).pendingLogin)).toBe('AbortError');
  await expect(page.getByRole('heading',{name:'连接你的创作服务'})).toBeVisible();
});

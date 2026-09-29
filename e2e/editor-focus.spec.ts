import {test, expect, type Locator} from '@playwright/test';
import {selectOption} from './select';
const base='http://127.0.0.1:4319/api/v1',headers={Authorization:'Bearer e2e-local-fixture-only'};

async function expectVisibleFocus(control: Locator) {
  await control.page().keyboard.press("Tab");
  await control.focus();
  await expect(control).toBeFocused();
  const result=await control.evaluate(element=>{
    const style=getComputedStyle(element),r=element.getBoundingClientRect();
    const expansion=Math.max(0,parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset));
    const ring={left:r.left-expansion,right:r.right+expansion,top:r.top-expansion,bottom:r.bottom+expansion};
    const clipped=[];
    for(let parent=element.parentElement;parent;parent=parent.parentElement){
      const css=getComputedStyle(parent),box=parent.getBoundingClientRect();
      if(css.overflowX!=='visible'&&(ring.left<box.left-1||ring.right>box.right+1))clipped.push(parent.className);
      if(css.overflowY!=='visible'&&(ring.top<box.top-1||ring.bottom>box.bottom+1))clipped.push(parent.className);
    }
    return {visible:style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>0,clipped};
  });
  expect(result).toEqual({visible:true,clipped:[]});
}

test('form focus remains visible and all node types omit simulation controls',async({page,request})=>{
  const project=await(await request.post(base+'/projects',{headers,data:{name:'焦点验收 '+Date.now()}})).json();
  await request.put(base+`/projects/${project.id}/canvas`,{headers,data:{schemaVersion:1,baseRevision:0,viewport:{x:0,y:0,zoom:1},nodes:[{id:'target',type:'media',style:{width:280},position:{x:380,y:70},data:{kind:'image',title:'图片1',titleSource:'automatic',contentRevision:0,contentSchemaVersion:1}}],edges:[]}});
  await page.goto('/');
  await expectVisibleFocus(page.getByLabel('访问凭证'));
  await page.evaluate(()=>sessionStorage.setItem('zhilume.session','e2e-local-fixture-only'));
  await page.reload();await page.getByText(project.name,{exact:true}).click();
  const node=page.locator('.react-flow__node[data-id="target"]'),panel=page.locator('.node-composer');
  await node.click();
  for(const [kind,label] of [['image','提示词'],['video','视频提示词'],['audio','合成文字'],['text','文本内容']]) {
    await selectOption(panel.getByRole('combobox',{name:'节点内容类型'}),kind);
    for(const theme of ['dark','light']) {
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      await expectVisibleFocus(panel.getByRole('combobox',{name:'节点内容类型'}));
      if(kind==='image')await expectVisibleFocus(panel.getByRole('button',{name:'文生图',exact:true}));
      await expectVisibleFocus(panel.getByRole('textbox',{name:label,exact:true}));
      await page.screenshot({path:`test-results/focus-${kind}-${theme}.png`});
    }
    await expect(page.getByRole('button',{name:'模拟',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'运行模拟任务',exact:true})).toHaveCount(0);
    await panel.getByRole('button',{name:'收起编辑区'}).click();
    await node.click({button:'right'});
    await expect(page.locator('.menu')).toBeVisible();
    await expect(page.locator('.menu')).not.toContainText('模拟');
    await page.keyboard.press('Escape');await node.click();
  }
});


test('compact layouts keep auxiliary actions, offline reason and footer visible without scrolling',async({page,request})=>{
  const project=await(await request.post(base+'/projects',{headers,data:{name:'紧凑布局 '+Date.now()}})).json();
  await request.put(base+`/projects/${project.id}/canvas`,{headers,data:{schemaVersion:1,baseRevision:0,viewport:{x:0,y:0,zoom:1},nodes:[{id:'target',type:'media',style:{width:280},position:{x:80,y:180},data:{kind:'image',title:'图片1',contentRevision:0,contentSchemaVersion:1}}],edges:[]}});
  await page.route('**/api/v1/image-models',r=>r.fulfill({json:[{id:'qwen-image-2512',name:'Qwen Image 2512',operations:['image.generate.v1'],formats:['png'],referenceLimits:{maximum:0},profiles:[{profileId:'offline',operations:['image.generate.v1'],formats:['png'],maxReferences:0,maxSize:1536,defaultSteps:50,readyCount:0,workers:[]}]}]}));
  await page.addInitScript(()=>sessionStorage.setItem('zhilume.session','e2e-local-fixture-only'));
  await page.goto('/');await page.getByText(project.name,{exact:true}).click();await page.locator('[data-id="target"]').click();
  const panel=page.locator('.node-composer');
  for(const width of [1100,900,700]) {
    await page.setViewportSize({width,height:720});
    for(const kind of ['image','video','audio','text']) {
      await selectOption(panel.getByRole('combobox',{name:'节点内容类型'}),kind);
      await panel.locator('textarea').first().fill('测试创作内容\n'.repeat(30));
      if(kind==='image') {
        await expect(panel.locator('.composer-status')).toContainText('所选模型离线');
        await expect(panel.getByRole('button',{name:'提交生成'})).toHaveText('加入队列');
        await expect(panel.getByRole('button',{name:'提交生成'})).toBeEnabled();
        await expect(panel.locator('.composer-body')).not.toContainText('执行设置');
      }
      await expect.poll(()=>panel.evaluate(el=>{
        const p=el.getBoundingClientRect(),selectors=['.composer-actions','.composer-status','.composer-toolbar'];
        return selectors.every(selector=>{const e=el.querySelector(selector);if(!e||!e.getBoundingClientRect().height)return true;const r=e.getBoundingClientRect();return r.top>=p.top && r.bottom<=p.bottom+1 && r.right<=p.right+1;}) && p.bottom<=innerHeight && p.right<=innerWidth;
      })).toBe(true);
      await page.screenshot({path:`test-results/layout-${kind}-${width}.png`});
    }
  }
});

import {test,expect} from '@playwright/test';
import {selectOption} from './select';
const base='http://127.0.0.1:4319/api/v1',headers={Authorization:'Bearer e2e-local-fixture-only'};
test('all four composers use the bottom type control and preserve drafts across focus mode and layered Escape',async({page,request})=>{
  test.setTimeout(90000);
  const project=await(await request.post(base+'/projects',{headers,data:{name:'专注编辑 '+Date.now()}})).json();
  await request.put(base+`/projects/${project.id}/canvas`,{headers,data:{schemaVersion:1,baseRevision:0,viewport:{x:0,y:0,zoom:1},nodes:[{id:'target',type:'media',style:{width:280},position:{x:180,y:160},data:{kind:'image',title:'图片1',contentRevision:0,contentSchemaVersion:1}}],edges:[]}});
  await page.addInitScript(()=>sessionStorage.setItem('zhilume.session','e2e-local-fixture-only'));
  await page.goto('/');await page.getByText(project.name,{exact:true}).click();await page.locator('.react-flow__node[data-id="target"]').click();
  const panel=page.locator('.node-composer');
  for(const [kind,label,parameter] of [['image','提示词','输出参数'],['video','视频提示词','视频参数'],['audio','合成文字','语音参数'],['text','文本内容','']]) {
    await selectOption(panel.getByRole('combobox',{name:'节点内容类型'}),kind);
    const input=panel.getByRole('textbox',{name:label,exact:true}),draft=`${kind} 草稿\n`+'需要保留的内容\n'.repeat(20);
    await input.fill(draft);
    await expect(panel.locator('.composer-toolbar').getByRole('combobox',{name:'节点内容类型'})).toBeVisible();
    await expect(panel.getByRole('button',{name:'收起编辑区'})).toHaveCount(0);
    await panel.getByRole('button',{name:'展开编辑区'}).click();
    await expect(panel).toHaveAttribute('aria-modal','true');
    await expect.poll(async()=>{const r=await input.boundingBox();return r!.height;}).toBeGreaterThan(200);
    await expect.poll(async()=>{const r=await panel.boundingBox();return [r!.x,r!.y,r!.width,r!.height];}).toEqual([16,16,1408,968]);
    await expect(input).toHaveValue(draft);
    // Background programmatic focus cannot escape the modal scope.
    await page.getByRole('button',{name:'返回项目',exact:true}).focus();
    await expect(panel.getByRole('button',{name:'还原编辑区'})).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await panel.evaluate(el=>el.contains(document.activeElement))).toBe(true);
    await page.screenshot({path:`test-results/focus-mode-${kind}.png`});
    if(parameter) {
      await panel.getByRole('button',{name:parameter,exact:true}).click();
      await expect(page.locator('.floating-panel')).toBeVisible();
      await page.keyboard.press('Escape');await expect(page.locator('.floating-panel')).toHaveCount(0);
      await expect(panel).toHaveAttribute('aria-modal','true');
    }
    // Type selector is a portaled child of the same focus scope.
    await panel.getByRole('combobox',{name:'节点内容类型'}).click();await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');await expect(panel).toHaveAttribute('aria-modal','true');
    await page.keyboard.press('Escape');await expect(panel).not.toHaveClass(/is-expanded/);await expect(input).toHaveValue(draft);
    await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);
    await page.locator('.react-flow__node[data-id="target"]').click();await expect(input).toHaveValue(draft);
    for(const theme of ['dark','light']) {
      await page.setViewportSize({width:900,height:600});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      await expect.poll(()=>panel.evaluate(el=>{const p=el.getBoundingClientRect(),b=el.querySelector('.composer-body')!.getBoundingClientRect(),f=el.querySelector('footer')!.getBoundingClientRect();return p.bottom<=innerHeight && p.right<=innerWidth && b.bottom<=f.top && f.bottom<=p.bottom;})).toBe(true);
      await page.screenshot({path:`test-results/bottom-toolbar-${kind}-${theme}.png`});
    }
    await page.setViewportSize({width:1440,height:1000});
  }
});

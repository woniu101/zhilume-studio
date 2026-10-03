import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {initialVideoDraft} from '../src/generation/video-draft';
import {selectOption,chooseReference} from './select';
const base='http://127.0.0.1:4319/api/v1',headers={Authorization:'Bearer e2e-local-fixture-only'};
test('mixed references stay directly usable and never overlap the fixed actions at short heights',async({page,request})=>{
  const assets=[];
  for(const [filename,file] of [['很长的参考图片名称'.repeat(8)+'.png','interaction-test.png'],['声音.wav','interaction-test.wav'],['视频.mp4','audio-video.mp4']]){
    const response=await request.post(base+'/assets/uploads?filename='+encodeURIComponent(filename),{headers:{...headers,'Content-Type':'application/octet-stream'},data:readFileSync('e2e/fixtures/'+file)});expect(response.ok()).toBeTruthy();assets.push(await response.json());
  }
  const project=await(await request.post(base+'/projects',{headers,data:{name:'参考布局 '+Date.now()}})).json();
  const draft=initialVideoDraft('测试视频参考',assets.map(a=>({role:a.kind,assetId:a.id,start:0,frames:56})));
  await request.put(base+`/projects/${project.id}/canvas`,{headers,data:{schemaVersion:1,baseRevision:0,viewport:{x:0,y:0,zoom:1},nodes:[{id:'video',type:'media',position:{x:100,y:80},data:{kind:'video',title:'视频',videoDraft:draft}}],edges:[]}});
  await page.addInitScript(()=>sessionStorage.setItem('zhilume.session','e2e-local-fixture-only'));
  await page.goto('/');await page.getByText(project.name,{exact:true}).click();await page.locator('[data-id="video"]').click();
  const panel=page.locator('.node-composer');
  await expect(panel.locator('.reference-card')).toHaveCount(3);
  await expect(panel.getByLabel('试听参考 2')).toBeVisible();
  await panel.getByRole('button',{name:'<Picture 1>',exact:true}).click();
  await expect(panel.getByLabel('视频提示词')).toHaveValue('测试视频参考<Picture 1>');
  await panel.locator('.reference-card').nth(2).getByRole('button',{name:'编辑参考'}).click();
  await page.getByLabel('参考 3 起点').fill('0.5');await page.keyboard.press('Escape');
  await expect(panel.locator('.reference-card').nth(2)).toContainText('0.50 秒起');
  for(const [width,height] of [[900,600],[700,520],[1100,720]])for(const theme of ['dark','light']){
    await page.setViewportSize({width,height});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    await panel.getByLabel('视频提示词').fill('带参考的长提示词\n'.repeat(30));
    await panel.getByLabel('视频提示词').scrollIntoViewIfNeeded();
    await expect.poll(()=>panel.evaluate(el=>{
      const body=el.querySelector('.composer-body')!,actions=el.querySelector('.composer-actions')!,footer=el.querySelector('.composer-toolbar')!;
      const b=body.getBoundingClientRect(),a=actions.getBoundingClientRect(),f=footer.getBoundingClientRect(),p=el.getBoundingClientRect();
      const hit=document.elementFromPoint(a.left+12,a.top+a.height/2);
      return b.bottom<=a.top && a.bottom<=f.top && f.bottom<=p.bottom && p.bottom<=innerHeight && a.width>0 && !!hit && actions.contains(hit);
    })).toBe(true);
    await page.screenshot({path:`test-results/reference-${theme}-${width}-${height}.png`});
  }
  await panel.getByRole('button',{name:'移除参考 1',exact:true}).click();await expect(panel.locator('.reference-card')).toHaveCount(2);
  await panel.getByRole('button',{name:/添加图片 ·/}).click();
  await chooseReference(page.getByRole('group',{name:'添加图片',exact:true}),assets[0].id);
  await page.keyboard.press('Escape');await expect(panel.locator('.reference-card')).toHaveCount(3);
});

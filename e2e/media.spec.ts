import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
test("media playback, waveform seek, replacement and viewport survive reload", async ({
  page,
  request,
}) => {
  const base = "http://127.0.0.1:4319/api/v1",
    headers = { Authorization: "Bearer e2e-local-fixture-only" };
  const project = await (
    await request.post(base + "/projects", {
      headers,
      data: { name: "播放器验收 " + Date.now() },
    })
  ).json();
  const media: any[] = [];
  for (const ext of ["wav", "mp4", "png"]) {
    const asset = await (
      await request.post(
        base + "/assets/uploads?filename=interaction-test." + ext,
        {
          headers: { ...headers, "Content-Type": "application/octet-stream" },
          data: await readFile(
            resolve("e2e/fixtures/interaction-test." + ext),
          ),
        },
      )
    ).json();
    expect(asset.id).toBeTruthy();
    media.push(asset);
    await request.post(base + `/projects/${project.id}/library`, {
      headers,
      data: { assetId: asset.id },
    });
  }
  await request.put(base + `/projects/${project.id}/canvas`, {
    headers,
    data: {
      schemaVersion: 1,
      baseRevision: 0,
      viewport: { x: 60, y: 80, zoom: 1 },
      nodes: media.map((a, i) => ({
        id: a.kind,
        type: "media",
        position: { x: i === 1 ? 440 : 50, y: i === 2 ? 380 : 100 },
        style: { width: 330 },
        data: { kind: a.kind, title: a.kind, assetId: a.id },
      })),
      edges: [],
    },
  });
  await page.addInitScript(() => {
    sessionStorage.setItem("zhilume.session", "e2e-local-fixture-only");
  });
  await page.goto("/");
  await page.getByText(project.name, { exact: true }).click();
  const audio = page
    .locator(".react-flow__node")
    .filter({ has: page.locator("audio") });
  const wave = audio.getByRole("slider", { name: "音频波形进度" });
  await expect(audio.locator(".waveform-track")).toHaveClass(/ready/);
  await audio.getByRole("button", { name: "播放音频", exact: true }).click();
  await expect.poll(() => wave.getAttribute("aria-valuenow")).not.toBe("0");
  await audio.getByRole("button", { name: "暂停音频", exact: true }).click();
  const box = await wave.boundingBox();
  await wave.click({ position: { x: box!.width * 0.6, y: 35 } });
  await expect
    .poll(async () => Number(await wave.getAttribute("aria-valuenow")))
    .toBeGreaterThan(1);
  expect(
    await audio
      .locator(".waveform-playhead")
      .evaluate((el) => (el as HTMLElement).style.left),
  ).not.toBe("0%");
  const video = page.locator(".video-player");
  await video.locator(".video-play-overlay").click();
  await expect
    .poll(() =>
      video.locator("video").evaluate((el: HTMLVideoElement) => el.currentTime),
    )
    .toBeGreaterThan(0.1);
  await video.hover();
  await video.getByRole("button", { name: "暂停视频", exact: true }).click();
  await video.getByRole("slider", { name: "视频播放进度" }).fill("1.2");
  await expect
    .poll(() =>
      video.locator("video").evaluate((el: HTMLVideoElement) => el.currentTime),
    )
    .toBeGreaterThan(1);
  await audio.hover();
  await audio.getByRole("button", { name: "替换素材", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("从项目素材库选择");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "从电脑选择文件" }).click();
  await (
    await chooser
  ).setFiles(resolve("e2e/fixtures/interaction-test.wav"));
  await expect(
    page.getByText("已导入：interaction-test.wav", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const doc = await (
        await request.get(base + `/projects/${project.id}/canvas`, { headers })
      ).json();
      return doc.nodes.find((n: any) => n.id === "audio").data.assetId;
    })
    .not.toBe(media[0].id);
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect
    .poll(async () => {
      const doc = await (
        await request.get(base + `/projects/${project.id}/canvas`, { headers })
      ).json();
      return doc.viewport.zoom;
    })
    .toBeGreaterThan(1);
  const zoom = await page.locator(".zoom").innerText();
  await page.reload();
  await page.getByText(project.name, { exact: true }).click();
  await expect(page.locator(".zoom")).toHaveText(zoom);
  await audio.getByRole('slider', {name:'音频波形进度'}).focus();
  await page.keyboard.press('End');
  await page.screenshot({ path: "test-results/media-dark.png" });
  await page.getByRole('button',{name:'切换主题'}).click();
  await page.screenshot({path:'test-results/media-light.png'});
});

test('expired save session can reconnect without losing a 100-node draft', async ({page, request}) => {
  const base='http://127.0.0.1:4319/api/v1',headers={Authorization:'Bearer e2e-local-fixture-only'};
  const p=await (await request.post(base+'/projects',{headers,data:{name:'百节点草稿 '+Date.now()}})).json();
  const canvasUrl=base+`/projects/${p.id}/canvas`;
  const nodes=Array.from({length:100},(_,i)=>({id:'node'+i,type:'media',position:{x:i%10*340,y:Math.floor(i/10)*230},data:{kind:'text',title:'节点'+i,text:'草稿内容 '+i}}));
  await request.put(canvasUrl,{headers,data:{schemaVersion:1,baseRevision:0,nodes,edges:[],viewport:{x:0,y:0,zoom:1}}});
  await page.addInitScript(()=>sessionStorage.setItem('zhilume.session','e2e-local-fixture-only'));
  await page.goto('/');await page.getByText(p.name,{exact:true}).click();await expect(page.locator('.react-flow__node')).toHaveCount(100);
  const pattern=`**/api/v1/projects/${p.id}/canvas`;
  await page.route(pattern,async route=>route.request().method()==='PUT'?route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:'unauthorized',message:'会话已过期'})}):route.continue());
  await page.getByRole('button',{name:'放大',exact:true}).click();await expect(page.getByRole('alert')).toContainText('访问会话已过期');
  await page.getByRole('button',{name:'重新连接',exact:true}).click();
  await page.locator('input[type=password]').fill('e2e-local-fixture-only');
  await page.unroute(pattern);await page.getByRole('button',{name:'确定',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.locator('.react-flow__node')).toHaveCount(100);
  const saved=await (await request.get(canvasUrl,{headers})).json();expect(saved.nodes).toHaveLength(100);expect(saved.nodes[99].data.text).toBe('草稿内容 99');expect(saved.viewport.zoom).toBeGreaterThan(1);
});

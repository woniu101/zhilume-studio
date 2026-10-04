import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
test("cross-origin saves, compact audio, hover actions, names, ports and desktop draft close", async ({
  page,
  context,
  request,
}) => {
  const base = "http://127.0.0.1:4319",
    headers = { Authorization: "Bearer e2e-local-fixture-only" };
  const project = await (
    await request.post(base + "/api/v1/projects", {
      headers,
      data: { name: "跨域与节点验收 " + Date.now() },
    })
  ).json();
  const nodes: any[] = [];
  for (const [kind, ext] of [
    ["audio", "wav"],
    ["video", "mp4"],
  ]) {
    const asset = await (
      await request.post(base + "/api/v1/assets/uploads?filename=test." + ext, {
        headers: { ...headers, "Content-Type": "application/octet-stream" },
        data: await readFile(
          resolve("e2e/fixtures/interaction-test." + ext),
        ),
      })
    ).json();
    nodes.push({
      id: kind,
      type: "media",
      position: { x: kind === "audio" ? 50 : 470, y: 100 },
      height: 235,
      style: { width: 330, height: 235 },
      data: {
        kind,
        title: kind === "audio" ? "音频1" : "视频1",
        assetId: asset.id,
      },
    });
  }
  const canvas = base + `/api/v1/projects/${project.id}/canvas`;
  await request.put(canvas, {
    headers,
    data: {
      schemaVersion: 1,
      baseRevision: 0,
      nodes,
      edges: [],
      viewport: { x: 40, y: 40, zoom: 1 },
    },
  });
  await context.addInitScript(() => {
    localStorage.setItem("zhilume.server", "http://127.0.0.1:4319");
    // Exercise renderer close persistence using the same bridge contract as desktop.
    window.zhilumeDesktop = {
      readSession: async () => ({
        base: "http://127.0.0.1:4319",
        token: "e2e-local-fixture-only",
      }),
      writeSession: async () => true,
    };
  });
  await page.goto("/");
  await page.getByText(project.name, { exact: true }).click();
  const audio = page.locator(".kind-audio"),
    video = page.locator(".kind-video");
  await expect(audio).toBeVisible();
  await expect.poll(async () => (await audio.boundingBox())!.height).toBe(108);
  await audio.hover();
  await expect(
    audio.getByRole("button", { name: "替换素材", exact: true }),
  ).toBeVisible();
  const ab = (await audio.boundingBox())!,
    rb = (await audio.locator(".node-replace").boundingBox())!;
  // Audio replacement is an inline player action; it must stay within the node.
  expect(rb.x).toBeGreaterThanOrEqual(ab.x);
  expect(rb.x + rb.width).toBeLessThanOrEqual(ab.x + ab.width);
  expect(rb.y).toBeGreaterThan(ab.y);
  expect(rb.y + rb.height).toBeLessThan(ab.y + ab.height);
  await expect(audio.locator(".node-port svg").first()).toHaveCSS(
    "opacity",
    "1",
  );
  await audio.getByRole("button", { name: "重命名节点", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("片头旁白");
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await expect
    .poll(async () => {
      const d = await (await request.get(canvas, { headers })).json();
      return d.nodes.find((n: any) => n.id === "audio").data.title;
    })
    .toBe("片头旁白");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await video.hover();
  const replace = (await video.locator(".node-replace").boundingBox())!,
    seek = (await video
      .getByRole("slider", { name: "视频播放进度" })
      .boundingBox())!;
  await expect.poll(async()=>{const replacement=(await video.locator('.node-replace').boundingBox())!;const timeline=(await video.getByRole('slider',{name:'视频播放进度'}).boundingBox())!;return timeline.y-replacement.y-replacement.height;}).toBeGreaterThan(8);
  // Start/end ten pixels outside the anchor to exercise the enlarged hit area.
  const output = (await audio.getByRole('button', {name:'输出连接点'}).boundingBox())!;
  const input = (await video.getByRole('button', {name:'输入连接点'}).boundingBox())!;
  await page.mouse.move(output.x + output.width / 2 + 10, output.y + output.height / 2);
  await page.mouse.down();
  const targetBody = (await video.boundingBox())!;
  await page.mouse.move(output.x + 50, output.y + 95, {steps:5});
  await expect(page.locator('.media-node.is-connecting')).toHaveCount(2);
  const hiddenPorts = async () => page.locator('.node-port').evaluateAll(elements => elements.every(el =>
    getComputedStyle(el, '::before').opacity === '0' && getComputedStyle(el.querySelector('svg')!).opacity === '0'));
  await expect.poll(hiddenPorts).toBe(true);
  const dot = page.locator('.canvas-connection-preview circle');
  await expect(dot).toHaveAttribute('r','2.5');
  await expect(dot).toHaveCSS('stroke','none');
  await expect.poll(async () => dot.evaluate(el => getComputedStyle(el).fill === getComputedStyle(el.parentElement!).color)).toBe(true);
  await page.screenshot({path:'test-results/connection-free-preview.png'});
  await page.mouse.move(targetBody.x + targetBody.width * 0.7, targetBody.y + 40, {steps:12});
  await expect(video.locator('..')).toHaveAttribute('data-connect-drop','ready');
  await expect.poll(() => video.evaluate(el => getComputedStyle(el).boxShadow)).toContain('2px');
  await expect(page.locator('.canvas-connection-preview')).toHaveClass(/ready/);
  await expect(dot).toHaveCount(0);
  await expect.poll(hiddenPorts).toBe(true);
  await page.screenshot({path:'test-results/connection-body-preview.png'});
  await page.mouse.up();
  await expect(page.locator('.media-node.is-connecting')).toHaveCount(0);
  await expect(video.locator('.node-port svg').first()).toHaveCSS('opacity','1');
  await expect
    .poll(async () => {
      const d = await (await request.get(canvas, { headers })).json();
      return d.edges.length;
    })
    .toBe(1);
  // Duplicate and reverse-cycle drops do not create extra edges.
  const begin = async (x: number, y: number) => { await page.mouse.move(x,y); await page.mouse.down(); };
  await begin(output.x + 14, output.y);
  await page.mouse.move(targetBody.x + 120, targetBody.y + 40,{steps:8});
  await expect(video.locator('..')).toHaveAttribute('data-connect-drop','invalid');
  await expect.poll(() => video.evaluate(el => getComputedStyle(el).boxShadow)).toContain('201, 122, 122');
  await page.mouse.up();
  const videoOutput = (await video.getByRole('button',{name:'输出连接点'}).boundingBox())!;
  await begin(videoOutput.x + 14, videoOutput.y);
  await page.mouse.move(ab.x + 120, ab.y + 30,{steps:8});
  await expect(audio.locator('..')).toHaveAttribute('data-connect-drop','invalid');
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge-path')).toHaveCount(1);
  // Undo, then cancel an otherwise-valid body drop with Escape.
  await page.getByRole('button',{name:'撤销 Ctrl+Z',exact:true}).click();
  await expect(page.locator('.react-flow__edge-path')).toHaveCount(0);
  await begin(output.x + 14, output.y);
  await page.mouse.move(targetBody.x + 120, targetBody.y + 40,{steps:8});
  await expect(video.locator('..')).toHaveAttribute('data-connect-drop','ready');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge-path')).toHaveCount(0);
  await expect(page.locator('.canvas-connection-preview')).toHaveCount(0);
  await expect(page.locator('.media-node.is-connecting')).toHaveCount(0);
  await expect(video.locator('.node-port svg').first()).toHaveCSS('opacity','1');
  // Empty-canvas drop cancels without creating a node or edge.
  await begin(output.x + 14, output.y);
  await page.mouse.move(1150,650,{steps:8});
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge-path')).toHaveCount(0);
  await expect(page.locator('.react-flow__node-media')).toHaveCount(2);
  // Drag backwards from the input to the source card body.
  await begin(input.x - 14, input.y);
  await page.mouse.move(ab.x + 100, ab.y + 30,{steps:8});
  await expect(audio.locator('..')).toHaveAttribute('data-connect-drop','ready');
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge-path')).toHaveCount(1);
  // Edge endpoints must reach the node borders, not the outer edge of a
  // generous pointer target. Check rendered SVG geometry in screen space.
  const endpoints = async () => page.locator('.react-flow__edge-path').evaluate((element) => {
    const path = element as SVGPathElement;
    const matrix = path.getScreenCTM()!;
    const start = path.getPointAtLength(0).matrixTransform(matrix);
    const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix);
    const source = document.querySelector('.kind-audio')!.getBoundingClientRect();
    const target = document.querySelector('.kind-video')!.getBoundingClientRect();
    return { gap: Math.max(Math.abs(start.x - source.right), Math.abs(end.x - target.left)), start: start.x, end: end.x };
  });
  await page.getByRole('button', {name:'项目素材', exact:true}).hover();
  await expect(audio.locator('.node-port svg').first()).toHaveCSS('opacity', '0');
  await expect.poll(async () => audio.locator('.node-port').first().evaluate(el => getComputedStyle(el, '::before').opacity)).toBe('0');
  await expect.poll(async () => (await endpoints()).gap).toBeLessThan(2);
  const resting = await endpoints();
  await page.screenshot({path:'test-results/ports-idle-dark.png'});
  await audio.hover();
  await expect(audio.locator('.node-port svg').first()).toHaveCSS('opacity', '1');
  const hovering = await endpoints();
  expect(hovering.start).toBeCloseTo(resting.start, 1);
  expect(hovering.end).toBeCloseTo(resting.end, 1);
  // Both circles sit wholly outside the content; the hit area bridges the gap.
  await expect.poll(async () => audio.locator('.node-port').evaluateAll(elements =>
    elements.every(el => {
      const style = getComputedStyle(el, '::before');
      const matrix = new DOMMatrixReadOnly(style.transform);
      const handle = el.getBoundingClientRect();
      const node = el.closest('.media-node')!.getBoundingClientRect();
      const circleLeft = handle.x + parseFloat(style.left) + matrix.e;
      const circleRight = circleLeft + parseFloat(style.width);
      return style.width === '18px' && Math.abs(matrix.a - 1) < 0.001 &&
        (el.classList.contains('react-flow__handle-left')
          ? node.left - circleRight >= 3
          : circleLeft - node.right >= 3);
    })
  )).toBe(true);
  const outsidePort = (await audio.getByRole('button', {name:'输出连接点'}).boundingBox())!;
  await page.mouse.move(outsidePort.x + outsidePort.width / 2 + 14, outsidePort.y + outsidePort.height / 2);
  await expect(audio.locator('.node-port svg').last()).toHaveCSS('opacity', '1');
  await page.screenshot({ path: "test-results/node-interactions-dark.png" });
  await audio.locator('.node-title > span').click();
  await expect(audio).toHaveClass(/selected/);
  await page.getByRole('button', {name:'项目素材', exact:true}).hover();
  await expect(audio.locator('.node-port svg').first()).toHaveCSS('opacity', '0');
  await page.getByRole("button", { name: "切换主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await audio.hover();
  await page.screenshot({ path: "test-results/node-interactions-light.png" });
  // A genuine network failure must preserve the last edit even when the window closes.
  await page.route("**/api/v1/projects/" + project.id + "/canvas", (r) =>
    r.request().method() === "PUT" ? r.abort("failed") : r.continue(),
  );
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("无法连接 Server");
  let closePrompt = false;
  page.on("dialog", () => {
    closePrompt = true;
  });
  const closed = page.waitForEvent("close");
  await page.close({ runBeforeUnload: true });
  await closed;
  expect(closePrompt).toBe(false);
  const reopened = await context.newPage();
  await reopened.goto("/");
  await reopened.getByText(project.name, { exact: true }).click();
  await expect(
    reopened.getByRole("button", { name: "恢复草稿", exact: true }),
  ).toBeVisible();
  await reopened.getByRole("button", { name: "恢复草稿", exact: true }).click();
  await expect
    .poll(async () => {
      const d = await (await request.get(canvas, { headers })).json();
      return d.viewport.zoom;
    })
    .toBeGreaterThan(1);
  await expect(reopened.getByText("片头旁白", { exact: true })).toBeVisible();
});

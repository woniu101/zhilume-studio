export type Crop = { x: number; y: number; width: number; height: number };
export type ImageOperation = "image.crop.v1" | "image.grid.v1" | "image.collage.v1";
export type ImageParameters = Crop & { rows: number; columns: number; gap: number; cell: number; background: string };
export function gridRects(width: number, height: number, rows: number, columns: number): Crop[] {
  if (![width, height, rows, columns].every(n => Number.isInteger(n) && n > 0) || rows > 8 || columns > 8 || rows * columns > 64 || width < columns || height < rows)
    throw new Error("宫格数量超出图片尺寸或 8 × 8 上限");
  return Array.from({ length: rows * columns }, (_, i) => {
    const x = Math.floor((i % columns) * width / columns), y = Math.floor(Math.floor(i / columns) * height / rows);
    return { x, y, width: Math.floor((i % columns + 1) * width / columns) - x, height: Math.floor((Math.floor(i / columns) + 1) * height / rows) - y };
  });
}
export function validateCrop(crop: Crop, width: number, height: number) {
  if (!Object.values(crop).every(Number.isInteger) || crop.x < 0 || crop.y < 0 || crop.width < 1 || crop.height < 1 || crop.x + crop.width > width || crop.y + crop.height > height)
    throw new Error("裁剪框必须位于原图内，宽高至少为 1 像素");
}
function canvas(width: number, height: number) {
  if (width * height > 32_000_000 || width > 16384 || height > 16384) throw new Error("单张输出上限为 3200 万像素，边长不超过 16384");
  const c = document.createElement("canvas"); c.width = width; c.height = height;
  return c;
}
async function png(c: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error("图片导出失败")), "image/png"));
  c.width = c.height = 0;
  return blob;
}
export async function processImages(operation: ImageOperation, images: ImageBitmap[], params: ImageParameters, signal: AbortSignal): Promise<Blob[]> {
  signal.throwIfAborted();
  const first = images[0];
  if (!first) throw new Error("请先选择图片");
  if (operation === "image.collage.v1") {
    if (!images.length || images.length > 16 || !Number.isInteger(params.columns) || params.columns < 1 || params.columns > 8 || !Number.isInteger(params.cell) || params.cell < 64 || params.cell > 2048 || !Number.isInteger(params.gap) || params.gap < 0 || params.gap > 100) throw new Error("拼图参数超出允许范围");
    const cols = Math.min(params.columns, images.length), rows = Math.ceil(images.length / cols), { cell, gap } = params;
    const c = canvas(cols * cell + (cols + 1) * gap, rows * cell + (rows + 1) * gap), ctx = c.getContext("2d")!;
    ctx.fillStyle = params.background; ctx.fillRect(0, 0, c.width, c.height);
    images.forEach((img, i) => {
      const scale = Math.min(cell / img.width, cell / img.height), w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, gap + (i % cols) * (cell + gap) + (cell - w) / 2, gap + Math.floor(i / cols) * (cell + gap) + (cell - h) / 2, w, h);
    });
    return [await png(c)];
  }
  const rects = operation === "image.grid.v1" ? gridRects(first.width, first.height, params.rows, params.columns) : [{ x: params.x, y: params.y, width: params.width, height: params.height }];
  const output: Blob[] = [];
  for (const rect of rects) {
    signal.throwIfAborted(); validateCrop(rect, first.width, first.height);
    const c = canvas(rect.width, rect.height);
    c.getContext("2d")!.drawImage(first, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    output.push(await png(c));
  }
  return output;
}

export type ImageDraft = {
  operation: string; modelId: string; profileId: string; prompt: string; negative: string;
  sizeMode: "ratio" | "custom"; refs: string[]; format: string; width: number; height: number; steps: string; seed: string;
  request?: { fingerprint: string; id: string; seed: number };
};
export function initialImageDraft(prompt: string, refs: string[]): ImageDraft {
  return { operation: refs.length > 1 ? "image.reference.v1" : refs.length ? "image.edit.v1" : "image.generate.v1",
    modelId: refs.length ? "qwen-image-2.1" : "qwen-image-2512", profileId: "", prompt, negative: "", refs,
    format: "png", sizeMode: "ratio", width: 1024, height: 1024, steps: "", seed: "" };
}
// Exact common ratios with dimensions aligned to the executor's 32-pixel grid.
export const ratios = [["1:1", 1, 1], ["16:9", 16, 9], ["9:16", 9, 16], ["4:3", 4, 3], ["3:4", 3, 4], ["3:2", 3, 2], ["2:3", 2, 3]] as const;
export function ratioSize(ratio: string, maxSize: number, targetSize = 1024) {
  const entry = ratios.find(r => r[0] === ratio);
  if (!entry) return null;
  const [, w, h] = entry, scale = Math.floor(Math.min(targetSize, maxSize) / (Math.max(w, h) * 32)) * 32;
  return scale * Math.min(w, h) >= 256 ? { width: w * scale, height: h * scale } : null;
}

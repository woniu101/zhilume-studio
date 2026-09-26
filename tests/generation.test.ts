import { test } from "node:test";
import assert from "node:assert/strict";
import { ratios, ratioSize } from "../src/generation/draft";
test("ratio presets stay exact, aligned and inside the executor limit", () => {
  for (const max of [512, 768, 1024, 1536, 2048]) for (const [key, w, h] of ratios) {
    const size = ratioSize(key, max);
    if (!size) continue;
    assert.equal(size.width * h, size.height * w);
    for (const value of Object.values(size)) { assert.equal(value % 32, 0); assert.ok(value >= 256 && value <= max); }
  }
  assert.equal(ratioSize("custom", 1024), null);
});

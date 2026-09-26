import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridRects, validateCrop } from '../src/media-tools/image-processing';

test('non-divisible grid covers every original pixel exactly once', () => {
  const cells = gridRects(101, 59, 3, 4), pixels = new Uint8Array(101 * 59);
  for (const r of cells) for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) pixels[y * 101 + x]++;
  assert.ok(pixels.every(n => n === 1));
  assert.throws(() => gridRects(2, 2, 3, 2));
  assert.throws(() => gridRects(100, 100, 0, 2));
  assert.throws(() => validateCrop({ x: 99, y: 0, width: 3, height: 1 }, 101, 59));
});

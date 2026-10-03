import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNode, type CanvasNode, type Document } from '../src/canvas';
import { fitContentLayout } from '../src/content-layout';

function node(id: string, x: number, y: number): CanvasNode {
  return { ...createNode('image', { x, y }, { assetId: id }), id };
}
function document(nodes: CanvasNode[]): Document {
  return { schemaVersion: 1, nodes, edges: [{ id: 'e', source: 'a', target: 'b' }], viewport: { x: 7, y: 9, zoom: .7 } };
}
test('portrait expansion moves a collision chain, preserving origin, columns, edges and viewport', () => {
  const doc = document([node('a', 0, 0), node('b', 0, 240), node('c', 0, 480), node('other', 400, 240)]);
  const result = fitContentLayout(doc, 'a', 'a', 280, 560);
  assert.deepEqual(result.nodes.map(n => n.position), [{ x: 0, y: 0 }, { x: 0, y: 624 }, { x: 0, y: 864 }, { x: 400, y: 240 }]);
  assert.equal(result.edges, doc.edges); assert.equal(result.viewport, doc.viewport);
  assert.equal(doc.nodes[1].position.y, 240, 'history remains immutable');
});
test('wide video expansion clears adjacent nodes and is stable when metadata repeats', () => {
  const a = node('a', 0, 0); a.data.kind = 'video';
  const doc = document([a, node('b', 350, 0)]);
  const result = fitContentLayout(doc, 'a', 'a', 1280, 320);
  assert.equal(result.nodes[0].width, 640);
  assert.equal(result.nodes[1].position.y, 224);
  assert.equal(fitContentLayout(result, 'a', 'a', 1280, 320), result);
});
test('group expansion keeps children relative and moves an external group as a unit', () => {
  const a = { ...node('a', 40, 65), parentId: 'g' }, b = { ...node('b', 40, 305), parentId: 'g' };
  const g = { ...node('g', 0, 0), type: 'group', style: { width: 360, height: 540 } };
  const other = { ...node('other', 0, 604), type: 'group', style: { width: 360, height: 300 } };
  const child = { ...node('child', 40, 65), parentId: 'other' };
  const result = fitContentLayout(document([g, a, b, other, child]), 'a', 'a', 280, 560);
  assert.equal(result.nodes[0].height, 905);
  assert.equal(result.nodes[2].position.y, 689);
  assert.equal(result.nodes[3].position.y, 969);
  assert.deepEqual(result.nodes[4].position, child.position);
});
test('shrinking, stale callbacks and reopened manual layouts never trigger rearrangement', () => {
  const doc = document([node('a', 0, 0), node('b', 0, 240)]);
  assert.equal(fitContentLayout(doc, 'a', 'old-asset', 1, 2), doc);
  assert.equal(fitContentLayout(doc, 'a', 'a', NaN, 2), doc);
  const fitted = fitContentLayout(doc, 'a', 'a', 560, 280);
  assert.equal(fitted.nodes[1], doc.nodes[1]);
  const manual = { ...fitted, nodes: fitted.nodes.map(n => n.id === 'a' ? { ...n, width: 400, height: 200, style: { width: 400, height: 200 } } : n) };
  assert.equal(fitContentLayout(manual, 'a', 'a', 560, 280), manual);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createNode,
  cleanDocument,
  validConnection,
  groupSelected,
  removeSelected,
  ungroupSelected,
} from "../src/canvas";
test("rejects indirect cycles and duplicate edges while permitting independent references", () => {
  const edges = [
    { id: "1", source: "a", target: "b" },
    { id: "2", source: "b", target: "c" },
  ];
  assert.equal(validConnection("c", "a", edges), false);
  assert.equal(validConnection("a", "b", edges), false);
  assert.equal(validConnection("a", "c", edges), true);
});
test("ungroup from child selection preserves sibling positions, edges and viewport", () => {
  const a = { ...createNode("audio", { x: 60, y: 130 }), selected: true },
    b = { ...createNode("video", { x: 460, y: 330 }), selected: true };
  const viewport = { x: -120, y: 80, zoom: 0.75 };
  const grouped = groupSelected({
    schemaVersion: 1,
    nodes: [a, b],
    edges: [{ id: "edge", source: a.id, target: b.id }],
    viewport,
  });
  grouped.nodes.find((n) => n.id === a.id)!.selected = true;
  const result = ungroupSelected(grouped);
  assert.deepEqual(
    result.nodes.map((n) => n.position),
    [a.position, b.position],
  );
  assert.equal(result.edges.length, 1);
  assert.deepEqual(
    cleanDocument(result.nodes, result.edges, result.viewport).viewport,
    viewport,
  );
});
test("group removal preserves child content and absolute canvas positions", () => {
  const a = { ...createNode("text", { x: 100, y: 200 }), selected: true },
    b = { ...createNode("image", { x: 500, y: 320 }), selected: true };
  const grouped = groupSelected({
    schemaVersion: 1,
    nodes: [a, b],
    edges: [{ id: "e", source: a.id, target: b.id }],
  });
  const group = grouped.nodes[0];
  group.selected = true;
  const removed = removeSelected(grouped);
  assert.equal(removed.nodes.length, 2);
  assert.equal(removed.edges.length, 1);
  assert.deepEqual(removed.nodes[0].position, a.position);
  assert.deepEqual(removed.nodes[1].position, b.position);
  assert.equal(removed.nodes[0].parentId, undefined);
});
test("saved documents omit transient selection and measurements without losing content", () => {
  const node = {
    ...createNode("text"),
    selected: true,
    measured: { width: 280, height: 200 },
    data: { kind: "text" as const, title: "提示词", text: "保留我" },
  };
  const doc = cleanDocument([node], []);
  assert.equal(doc.nodes[0].selected, undefined);
  assert.equal(doc.nodes[0].measured, undefined);
  assert.equal(doc.nodes[0].data.text, "保留我");
});

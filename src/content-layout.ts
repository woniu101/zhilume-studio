import { fitMediaNode, type CanvasNode, type Document } from './canvas';

// Leave room for node titles, completion badges and connection handles.
const horizontalGap = 32;
const verticalGap = 64;
const groupPadding = 40;
export function nodeSize(node: CanvasNode) {
  return {
    width: node.width || Number(node.style?.width) || node.measured?.width || 280,
    height: node.height || Number(node.style?.height) || node.measured?.height || 176,
  };
}
function overlaps(a: CanvasNode, b: CanvasNode) {
  const as = nodeSize(a), bs = nodeSize(b);
  return a.position.x < b.position.x + bs.width + horizontalGap &&
    a.position.x + as.width + horizontalGap > b.position.x &&
    a.position.y < b.position.y + bs.height + verticalGap &&
    a.position.y + as.height + verticalGap > b.position.y;
}

/** Only an automatic content expansion starts reflow. User drag/resize is untouched. */
export function fitContentLayout(doc: Document, id: string, assetId: string, width: number, height: number): Document {
  const original = doc.nodes.find(n => n.id === id);
  if (!original) return doc;
  const fitted = fitMediaNode(original, assetId, width, height);
  if (fitted === original) return doc;
  const nodes = new Map(doc.nodes.map(n => [n.id, n]));
  nodes.set(id, fitted);
  let before = original, expanded = fitted;
  const ancestors = new Set<string>();
  while (true) {
    const oldSize = nodeSize(before), size = nodeSize(expanded);
    if (size.width <= oldSize.width && size.height <= oldSize.height) break;

    // Pin the changed node. Move only intersecting siblings, then propagate down.
    // Previously placed nodes are obstacles; unrelated columns retain their position.
    const active = new Set([expanded.id]);
    const placed = [expanded];
    const siblings = [...nodes.values()].filter(n => n.parentId === expanded.parentId && n.id !== expanded.id)
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x || a.id.localeCompare(b.id));
    for (const sibling of siblings) {
      let next = sibling;
      if (placed.some(n => active.has(n.id) && overlaps(n, next))) {
        let collisions = placed.filter(n => overlaps(n, next));
        while (collisions.length) {
          next = { ...next, position: { ...next.position,
            y: Math.max(...collisions.map(n => n.position.y + nodeSize(n).height + verticalGap)) } };
          collisions = placed.filter(n => overlaps(n, next));
        }
        nodes.set(next.id, next);
        active.add(next.id);
      }
      placed.push(next);
    }
    const parent = expanded.parentId && nodes.get(expanded.parentId);
    if (!parent || ancestors.has(parent.id)) break;
    ancestors.add(parent.id);
    const parentSize = nodeSize(parent);
    const children = [...nodes.values()].filter(n => n.parentId === parent.id);
    const nextWidth = Math.max(parentSize.width, ...children.map(n => n.position.x + nodeSize(n).width + groupPadding));
    const nextHeight = Math.max(parentSize.height, ...children.map(n => n.position.y + nodeSize(n).height + groupPadding));
    before = parent;
    expanded = { ...parent, width: nextWidth, height: nextHeight,
      style: { ...parent.style, width: nextWidth, height: nextHeight } };
    nodes.set(parent.id, expanded);
  }
  return { ...doc, nodes: doc.nodes.map(n => nodes.get(n.id)!) };
}

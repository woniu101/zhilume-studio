import type { LanguageSelection } from './generation/model-selection';
import type { ContentVersion } from './node-content';
import type { VideoDraft } from "./generation/video-draft";
import type { Node, Edge } from "@xyflow/react";
import type { SpeechDraft } from "./generation/speech-draft";
import type { ImageDraft } from "./generation/draft";
export type Kind = "text" | "image" | "video" | "audio";
export type MediaData = {
  kind: Kind;
  title: string;
  titleSource?: "automatic" | "custom";
  contentSchemaVersion?: 1;
  text?: string;
  html?: string;
  textDraft?: string;
  textEditDraft?: string;
  languageSelection?: LanguageSelection;
  generationDraft?: ImageDraft;
  speechDraft?: SpeechDraft;
  videoDraft?: VideoDraft;
  assetId?: string;
  contentRevision?: number;
  versions?: ContentVersion[];
  lastJobId?: string;
  receivedResultIds?: string[];
  mediaSize?: { assetId: string; width: number; height: number };
};
export type CanvasNode = Node<MediaData>;
export type Viewport = { x: number; y: number; zoom: number };
export type Document = {
  schemaVersion: 1;
  nodes: CanvasNode[];
  edges: Edge[];
  viewport?: Viewport;
};
export const emptyDocument = (): Document => ({
  schemaVersion: 1,
  nodes: [],
  edges: [],
});
export const kindNames: Record<Kind, string> = {
  text: "文本",
  image: "图片",
  video: "视频",
  audio: "音频",
};
export function createNode(
  kind: Kind,
  position = { x: 120, y: 130 },
  data: Partial<MediaData> = {},
): CanvasNode {
  return {
    id: crypto.randomUUID(),
    type: "media",
    position,
    style: {
      width: 280,
      height: kind === "audio" && data.assetId ? 108 : 176,
    },
    data: { kind, contentSchemaVersion: 1, contentRevision: 0, titleSource: "automatic", title: `${kindNames[kind]}节点`, ...data },
  };
}
export function cleanDocument(
  nodes: CanvasNode[],
  edges: Edge[],
  viewport?: Viewport,
): Document {
  return {
    schemaVersion: 1,
    ...(viewport ? { viewport } : {}),
    nodes: nodes.map(({ selected, dragging, measured, resizing, ...node }) =>
      node.data.kind === "audio" && !!node.data.assetId && node.type === "media"
        ? { ...node, height: 108, style: { ...node.style, height: 108 } }
        : node,
    ),
    edges: edges.map(({ selected, ...edge }) => edge),
  };
}
/** Intrinsic media dimensions determine geometry, never the player's controls. */
export function fitMediaNode(node: CanvasNode, assetId: string, width: number, height: number): CanvasNode {
  if (node.data.assetId !== assetId || !["image", "video"].includes(node.data.kind) ||
    !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return node;
  // Fit each content version once. Reloading metadata must preserve manual sizing/layout.
  if (node.data.mediaSize?.assetId === assetId && node.data.mediaSize.width === width &&
    node.data.mediaSize.height === height) return node;
  const ratio = width / height;
  const currentWidth = node.width || Number(node.style?.width) || node.measured?.width || 280;
  // Even wide videos need enough room below the centered play button for controls.
  const nextWidth = Math.max(220, currentWidth, node.data.kind === "video" ? ratio * 160 : 0);
  const nextHeight = nextWidth / ratio;
  return { ...node, width: nextWidth, height: nextHeight,
    style: { ...node.style, width: nextWidth, height: nextHeight },
    data: { ...node.data, mediaSize: { assetId, width, height } } };
}
export function nextNodeTitle(kind: Kind, nodes: CanvasNode[]) {
  const used = new Set(nodes.map((node) => node.data.title));
  let index = 1;
  while (used.has(`${kindNames[kind]}${index}`)) index++;
  return `${kindNames[kind]}${index}`;
}
export function ungroupSelected(doc: Document): Document {
  const groups = new Set(
    doc.nodes
      .filter((n) => n.selected && (n.type === "group" || n.parentId))
      .map((n) => (n.type === "group" ? n.id : n.parentId!)),
  );
  return {
    ...doc,
    nodes: doc.nodes
      .filter((n) => !groups.has(n.id))
      .map((n) => {
        if (!n.parentId || !groups.has(n.parentId)) return n;
        const parent = doc.nodes.find((p) => p.id === n.parentId)!;
        return {
          ...n,
          parentId: undefined,
          extent: undefined,
          selected: true,
          position: {
            x: n.position.x + parent.position.x,
            y: n.position.y + parent.position.y,
          },
        };
      }),
    edges: doc.edges.filter(
      (e) => !groups.has(e.source) && !groups.has(e.target),
    ),
  };
}
export function validConnection(source: string, target: string, edges: Edge[]) {
  if (
    source === target ||
    edges.some((e) => e.source === source && e.target === target)
  )
    return false;
  const pending = [target],
    seen = new Set<string>();
  while (pending.length) {
    const n = pending.pop()!;
    if (n === source) return false;
    if (seen.has(n)) continue;
    seen.add(n);
    pending.push(...edges.filter((e) => e.source === n).map((e) => e.target));
  }
  return true;
}
export function removeSelected(doc: Document): Document {
  const deleted = new Set(doc.nodes.filter((n) => n.selected).map((n) => n.id));
  const nodes = doc.nodes
    .filter((n) => !deleted.has(n.id))
    .map((n) => {
      if (n.parentId && deleted.has(n.parentId)) {
        const p = doc.nodes.find((g) => g.id === n.parentId)!;
        return {
          ...n,
          parentId: undefined,
          extent: undefined,
          position: {
            x: n.position.x + p.position.x,
            y: n.position.y + p.position.y,
          },
        };
      }
      return n;
    });
  return {
    ...doc,
    nodes,
    edges: doc.edges.filter(
      (e) => !e.selected && !deleted.has(e.source) && !deleted.has(e.target),
    ),
  };
}
export function groupSelected(doc: Document): Document {
  const items = doc.nodes.filter(
    (n) => n.selected && n.type === "media" && !n.parentId,
  );
  if (items.length < 2) return doc;
  const x = Math.min(...items.map((n) => n.position.x)) - 35,
    y = Math.min(...items.map((n) => n.position.y)) - 65;
  const width =
    Math.max(...items.map((n) => n.position.x + (n.measured?.width || 280))) -
    x +
    35;
  const height =
    Math.max(...items.map((n) => n.position.y + (n.measured?.height || 190))) -
    y +
    35;
  const id = crypto.randomUUID();
  const selected = new Set(items.map((n) => n.id));
  const group: CanvasNode = {
    id,
    type: "group",
    position: { x, y },
    style: { width, height },
    data: { kind: "text", title: "创作分组" },
  };
  return {
    ...doc,
    nodes: [
      group,
      ...doc.nodes.map((n) =>
        selected.has(n.id)
          ? {
              ...n,
              parentId: id,
              position: { x: n.position.x - x, y: n.position.y - y },
              selected: false,
            }
          : n,
      ),
    ],
  };
}

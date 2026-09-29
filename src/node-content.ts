import type { CanvasNode, MediaData, Document, Kind } from './canvas';

export type ContentSnapshot = { kind: Kind; assetId?: string; text?: string; html?: string; revision: number };
export type ContentVersion = ContentSnapshot & { id: string; createdAt: string; operation: string; jobId?: string };
export type NodeResult = { version: 1; id: string; jobId?: string; nodeId: string; base: ContentSnapshot; createdAt: string; operation: string; output: { id: string; kind: Kind; text?: string } };
export const snapshot = (data: MediaData): ContentSnapshot => ({ kind: data.kind, assetId: data.assetId, text: data.text, html: data.html, revision: data.contentRevision || 0 });
export const hasContent = (data: MediaData) => !!(data.assetId || data.text?.trim() || data.html);
export const sameContent = (a: ContentSnapshot, b: ContentSnapshot) => a.kind === b.kind && a.assetId === b.assetId && a.text === b.text && a.html === b.html && a.revision === b.revision;
export function replaceContent(data: MediaData, patch: Partial<MediaData>, operation = 'content.replace'): MediaData {
  const versions = [...(data.versions || [])];
  if (hasContent(data) && !versions.some(v => sameContent(v, snapshot(data)))) versions.push({ ...snapshot(data), id: crypto.randomUUID(), createdAt: new Date().toISOString(), operation });
  return { ...data, ...(("text" in patch || "html" in patch) && !("assetId" in patch) ? {assetId:undefined} : {}), ...patch, contentRevision: (data.contentRevision || 0) + 1, versions, mediaSize: undefined };
}
/** Apply archived results once; a changed or removed destination is never overwritten. */
export function receiveResults(doc: Document, results: NodeResult[]): Document {
  let changed = false;
  const nodes = doc.nodes.map(node => {
    let data = node.data;
    for (const result of results) {
      if (result.nodeId !== node.id || data.receivedResultIds?.includes(result.id)) continue;
      if (result.version !== 1) throw new Error('不支持的节点结果版本，请升级 Studio');
      changed = true;
      const compatible = data.kind === result.output.kind;
      const adopt = compatible && sameContent(snapshot(data), result.base);
      const saved = replaceContent(data, {}, 'content.previous');
      const version: ContentVersion = { kind: result.output.kind, assetId: result.output.id, text: result.output.text,
        revision: saved.contentRevision!, id: result.id, jobId: result.jobId, operation: result.operation, createdAt: result.createdAt };
      data = { ...data, versions: [...saved.versions!, version], receivedResultIds: [...(data.receivedResultIds || []), result.id],
        ...(adopt ? { assetId: version.assetId, text: version.text, html: undefined, mediaSize: undefined, contentRevision: saved.contentRevision, lastJobId: result.jobId } : {}) };
    }
    return data === node.data ? node : { ...node, data };
  });
  return changed ? { ...doc, nodes } : doc;
}
export function canSwitchKind(node: CanvasNode, jobs: any[], edges: Document['edges']): boolean {
  return !hasContent(node.data) && !node.data.versions?.length && !jobs.some(j => j.nodeId === node.id && !['failed','cancelled','interrupted','blocked'].includes(j.status)) && !edges.some(e => e.source === node.id || e.target === node.id);
}

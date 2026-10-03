type CanvasContent = { schemaVersion: number; nodes: unknown[]; edges: unknown[]; viewport?: unknown };
type RemoteCanvas = CanvasContent & { revision: number };
const content = ({ schemaVersion, nodes, edges, viewport }: CanvasContent) =>
  JSON.stringify({ schemaVersion, nodes, edges, ...(viewport ? { viewport } : {}) });

/** A lost save response is ambiguous, not evidence that the server rejected the write. */
export class CanvasPersistence {
  private pending?: { document: CanvasContent; baseRevision: number };
  constructor(private transport: {
    read: () => Promise<RemoteCanvas>;
    write: (document: CanvasContent, baseRevision: number) => Promise<RemoteCanvas>;
    acknowledge: (document: CanvasContent, revision: number) => void;
  }) {}

  async save(document: CanvasContent, baseRevision: number): Promise<void> {
    if (this.pending) {
      const remote = await this.transport.read();
      if (content(remote) === content(this.pending.document)) {
        baseRevision = remote.revision;
        this.transport.acknowledge(this.pending.document, remote.revision);
        this.pending = undefined;
        if (content(remote) === content(document)) return;
      } else if (remote.revision !== this.pending.baseRevision) {
        throw Object.assign(new Error('画布已在其他窗口修改，本地草稿已保留'), { code: 'revision_conflict', status: 409 });
      }
    }
    this.pending = { document: structuredClone(document), baseRevision };
    const result = await this.transport.write(document, baseRevision);
    this.transport.acknowledge(document, result.revision);
    this.pending = undefined;
  }

  reset() { this.pending = undefined; }
}

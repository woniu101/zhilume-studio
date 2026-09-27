import { TaskGroupRunner } from './generation/TaskGroupRunner';
import { LanguageProject } from './generation/LanguageTools';
import { VideoGeneration } from "./generation/VideoGeneration";
import { initialVideoDraft, type VideoDraft, type VideoReference } from "./generation/video-draft";
import { SpeechGeneration } from "./generation/SpeechGeneration";
import { initialSpeechDraft, type SpeechDraft } from "./generation/speech-draft";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  SelectionMode,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import {
  ArrowLeft,
  ArrowUpRight,
  FolderOpen,
  FolderPlus,
  Plus,
  Search,
  LayoutGrid,
  History,
  Settings,
  Upload,
  Type,
  ImageIcon,
  Film,
  AudioLines,
  MousePointer2,
  Hand,
  Minus,
  Maximize,
  Undo2,
  Redo2,
  Group,
  Ungroup,
  Download,
  Check,
  LogOut,
  X,
  ChevronRight,
  Layers,
  MoreHorizontal,
} from "lucide-react";
import {
  api,
  connection,
  logout,
  mediaUrl,
  sizeLabel,
  statusLabel,
  restoreDesktopSession,
  mergeAssets,
  login,
  uploadAsset,
} from "./api";
import { Brand, ThemeButton, Login, Modal } from "./ui";
import {
  createNode,
  fitMediaNode,
  nextNodeTitle,
  cleanDocument,
  validConnection,
  removeSelected,
  groupSelected,
  ungroupSelected,
  kindNames,
  emptyDocument,
  type CanvasNode,
  type Document,
  type Kind,
} from "./canvas";
import { MediaNode, GroupNode, NodeContext, icons } from "./nodes";
import { MediaPlayer } from "./media-player";
import { ConnectionPreview, useCanvasConnection } from "./connection-interaction";
import { initialImageDraft, type ImageDraft } from "./generation/draft";
import { NodeComposer } from "./generation/NodeComposer";
import { EmptyNodeEditor } from "./generation/EmptyNodeEditor";
import { TextEditor } from "./editor";
import { useCanvasClipboard } from "./canvas-clipboard";
import { AssetThumbnail, AssetInformation } from "./asset-information";
import { ImageGeneration, type ImageGenerationSession } from "./generation/ImageGeneration";
import { MediaTools } from "./media-tools/MediaTools";
import "./styles.css";

const nodeTypes = { media: MediaNode, group: GroupNode };
const kinds: Kind[] = ["text", "image", "video", "audio"];
const accept = {
  text: ".txt",
  image: "image/png,image/jpeg,image/webp",
  video: "video/mp4,video/webm,video/quicktime",
  audio: "audio/mpeg,audio/wav,audio/mp4",
};
function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function NameModal({
  secret = false,
  title,
  value = "",
  done,
  close,
}: {
  title: string;
  secret?: boolean;
  value?: string;
  done: (v: string) => void;
  close: () => void;
}) {
  const [name, setName] = useState(value);
  return (
    <Modal title={title} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) done(name.trim());
        }}
      >
        <input
          autoFocus
          type={secret ? "password" : "text"}
          autoComplete={secret ? "current-password" : "off"}
          aria-label={title}
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <div
          className="row"
          style={{ justifyContent: "flex-end", marginTop: 20 }}
        >
          <button type="button" onClick={close}>
            取消
          </button>
          <button className="primary">确定</button>
        </div>
      </form>
    </Modal>
  );
}

function App() {
  const [connected, setConnected] = useState(!!connection.token),
    [project, setProject] = useState<any>(null),
    [projects, setProjects] = useState<any[]>([]),
    [create, setCreate] = useState(false),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState("");
  const notify = useCallback((s: string) => setToast(s), []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const refresh = useCallback(async () => {
    try {
      setProjects(await api("/projects"));
    } catch (e) {
      if ((e as any).status === 401) setConnected(false);
      else notify((e as Error).message);
    }
  }, [notify]);
  useEffect(() => {
    if (connected && !project) void refresh();
  }, [connected, project, refresh]);
  return (
    <>
      {!connected ? (
        <Login connected={() => setConnected(true)} />
      ) : project ? (
        <ReactFlowProvider>
          <Workspace
            key={project.id}
            project={project}
            notify={notify}
            leave={() => setProject(null)}
          />
        </ReactFlowProvider>
      ) : (
        <main className="projects">
          <header>
            <Brand />
            <div className="row">
              <span className="connection-pill">
                <span className="dot" />
                Server 已连接
              </span>
              <ThemeButton />
              <button
                className="icon-button"
                title="断开连接"
                onClick={() => {
                  logout();
                  setConnected(false);
                }}
              >
                <LogOut size={17} />
              </button>
            </div>
          </header>
          <div className="projects-heading">
            <div>
              <h1>我的创作空间</h1>
              <p className="muted">把文字、画面和声音，连接成新的可能。</p>
            </div>
            <button className="primary" onClick={() => setCreate(true)}>
              <Plus size={16} />
              新建项目
            </button>
          </div>
          <div className="row spread" style={{ marginBottom: 25 }}>
            <span className="muted">
              全部项目 · {projects.filter((p) => !p.archivedAt).length}
            </span>
            <div className="search" style={{ width: 220 }}>
              <Search size={15} />
              <input
                aria-label="搜索项目"
                placeholder="搜索项目"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="project-grid">
            {projects
              .filter((p) => !p.archivedAt && p.name.includes(query))
              .map((p) => (
                <button
                  className="project-card"
                  key={p.id}
                  onClick={() => setProject(p)}
                >
                  <div className="project-art">
                    <Layers size={38} strokeWidth={1} />
                  </div>
                  <footer>
                    <div>
                      <h3>{p.name}</h3>
                      <small>
                        {new Date(p.updatedAt).toLocaleDateString()} 更新
                      </small>
                    </div>
                    <ArrowUpRight size={17} />
                  </footer>
                </button>
              ))}
          </div>
          {!projects.some((p) => !p.archivedAt) && (
            <div className="empty">
              <FolderOpen size={44} strokeWidth={1} />
              <h2>你的第一张画布，留给第一个想法。</h2>
              <span>新建项目后，即可添加文本和导入图片、视频、音频。</span>
              <button onClick={() => setCreate(true)}>
                <Plus size={15} />
                开始创作
              </button>
            </div>
          )}
          {projects.some((p) => p.archivedAt) && (
            <details style={{ marginTop: 40 }}>
              <summary className="muted">已归档项目</summary>
              {projects
                .filter((p) => p.archivedAt)
                .map((p) => (
                  <div
                    className="row spread"
                    key={p.id}
                    style={{ padding: 12 }}
                  >
                    {p.name}
                    <button
                      onClick={() =>
                        void api(`/projects/${p.id}`, "PATCH", {
                          archived: false,
                        })
                          .then(refresh)
                          .catch((e) => notify(e.message))
                      }
                    >
                      恢复项目
                    </button>
                  </div>
                ))}
            </details>
          )}
        </main>
      )}
      {create && (
        <NameModal
          title="新建项目"
          done={async (name) => {
            try {
              const p = await api("/projects", "POST", { name });
              setCreate(false);
              setProject(p);
            } catch (e) {
              notify((e as Error).message);
            }
          }}
          close={() => setCreate(false)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

function Workspace({
  project,
  notify,
  leave,
}: {
  project: any;
  notify: (s: string) => void;
  leave: () => void;
}) {
  const flow = useReactFlow();
  const [nodes, setNodes] = useState<CanvasNode[]>([]),
    [edges, setEdges] = useState<Edge[]>([]),
    [loaded, setLoaded] = useState(false),
    [saveState, setSaveState] = useState("正在加载"),
    [saveError, setSaveError] = useState<{
      message: string;
      auth: boolean;
    } | null>(null),
    [uploadState, setUploadState] = useState<{
      name: string;
      progress: number;
    } | null>(null),
    [assets, setAssets] = useState<Record<string, any>>({}),
    [jobs, setJobs] = useState<any[]>([]),
    [workers, setWorkers] = useState<any[]>([]),
    [library, setLibrary] = useState<any>({ items: [], folders: [] }),
    [libraryOpen, setLibraryOpen] = useState(true),
    [tasksOpen, setTasksOpen] = useState(false),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [folder, setFolder] = useState<string | null>(null),
    [pan, setPan] = useState(false),
    [zoom, setZoom] = useState(100),
    [menu, setMenu] = useState<any>(null),
    [dialog, setDialog] = useState<any>(null),
    [conflict, setConflict] = useState(false),
    [title, setTitle] = useState(project.name),
    [connectionState, setConnectionState] = useState(true),
    [historyVersion, setHistoryVersion] = useState(0);
  const [composer, setComposer] = useState<{ id: string; mode: "image" | "speech" | "video" | "content" } | null>(null);
  const composerNode = nodes.find(node => node.id === composer?.id);
  const composerSessions = useRef(new Map<string, ImageGenerationSession>());

  function imageSession(id: string) {
    if (!composerSessions.current.has(id)) composerSessions.current.set(id, {});
    return composerSessions.current.get(id)!;
  }
  const uploadController = useRef<AbortController | null>(null);
  const canvasPointer = useRef<{ x: number; y: number } | null>(null);
  const live = useRef<Document>(emptyDocument()),
    revision = useRef(0),
    saved = useRef(""),
    saving = useRef<Promise<void> | null>(null),
    blocked = useRef(false),
    undo = useRef<Document[]>([]),
    redo = useRef<Document[]>([]),
    fileInput = useRef<HTMLInputElement>(null),
    uploadTarget = useRef<{
      nodeId?: string;
      library?: boolean;
      position?: { x: number; y: number };
    }>({}),
    applying = useRef(new Set<string>());
  const draftKey = `zhilume.draft.${connection.base}.${project.id}`;
  useCanvasClipboard({
    blocked: !!dialog || !!composer || conflict || !loaded,
    document: () => live.current,
    duplicate,
    files: (files) => { void upload(files, { position: canvasPointer.current ? flow.screenToFlowPosition(canvasPointer.current) : center() }); },
    text: (text) => {
      if (text.length > 12000) { notify("文本不能超过 12,000 字，请分段粘贴"); return; }
      const position = canvasPointer.current ? flow.screenToFlowPosition(canvasPointer.current) : center();
      mutate(d => ({ ...d, nodes: [
        ...d.nodes.map(n => ({ ...n, selected: false })),
        { ...createNode("text", position, { title: nextNodeTitle("text", d.nodes), text }), selected: true },
      ] }));
      notify("已粘贴文本");
    },
  });
  const connecting = useCanvasConnection(
    (c) => mutate((d) => ({ ...d, edges: [...d.edges, { ...c, id: crypto.randomUUID() }] })),
    (c) => validConnection(c.source, c.target, live.current.edges),
  );
  function assign(doc: Document) {
    live.current = doc;
    setNodes(doc.nodes);
    setEdges(doc.edges);
  }
  function checkpoint() {
    undo.current.push(structuredClone(live.current));
    if (undo.current.length > 100) undo.current.shift();
    redo.current = [];
    setHistoryVersion((v) => v + 1);
  }
  function mutate(change: (doc: Document) => Document) {
    checkpoint();
    assign(change(live.current));
  }
  function changeNode(id: string, data: Record<string, unknown>) {
    mutate((d) => ({
      ...d,
      nodes: d.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
      ),
    }));
  }
  function saveNodeDraft(id: string, data: Record<string, unknown>) {
    assign({ ...live.current, nodes: live.current.nodes.map(node => node.id === id ? { ...node, data: { ...node.data, ...data } } : node) });
  }
  function videoDraft(node: CanvasNode): VideoDraft {
    if (node.data.videoDraft) return node.data.videoDraft;
    const inputs = [node, ...live.current.edges.filter(e => e.target === node.id).map(e => live.current.nodes.find(n => n.id === e.source))];
    return initialVideoDraft(inputs.filter(n => n?.data.kind === "text").map(n => n?.data.text || "").join("\n"),
      inputs.filter(n => n && n.data.kind !== "text" && n.data.assetId).map(n => ({ role: n!.data.kind as VideoReference['role'], assetId:String(n!.data.assetId), start:0, frames:56 })));
  }
  function speechDraft(node: CanvasNode): SpeechDraft {
    if (node.data.speechDraft) return node.data.speechDraft;
    const inputs = [node, ...live.current.edges.filter(e => e.target === node.id).map(e => live.current.nodes.find(n => n.id === e.source))];
    return initialSpeechDraft(inputs.filter(n => n?.data.kind === "text").map(n => n?.data.text || "").join("\n"), String(inputs.find(n => n?.data.kind === "audio" && n.data.assetId)?.data.assetId || ""));
  }
  function generationDraft(node: CanvasNode): ImageDraft {
    if (node.data.generationDraft) return node.data.generationDraft;
    const inputs = [node, ...live.current.edges.filter(e => e.target === node.id).map(e => live.current.nodes.find(n => n.id === e.source))];
    return initialImageDraft(inputs.filter(n => n?.data.kind === "text").map(n => n?.data.text || "").join("\n"),
      [...new Set(inputs.filter(n => n?.data.kind === "image" && n.data.assetId).map(n => String(n!.data.assetId)))]);
  }
  function mediaSize(id: string, assetId: string, width: number, height: number) {
    const old = live.current.nodes.find(node => node.id === id);
    if (!old) return;
    const fitted = fitMediaNode(old, assetId, width, height);
    if (fitted !== old) assign({ ...live.current, nodes: live.current.nodes.map(node => node.id === id ? fitted : node) });
  }
  const flush = useCallback(async () => {
    if (blocked.current) throw new Error("请先处理画布保存冲突");
    if (saving.current) {
      await saving.current;
      return flush();
    }
    const document = cleanDocument(
        live.current.nodes,
        live.current.edges,
        live.current.viewport,
      ),
      fingerprint = JSON.stringify(document);
    if (fingerprint === saved.current) return;
    localStorage.setItem(
      draftKey,
      JSON.stringify({ document, baseRevision: revision.current }),
    );
    setSaveState("保存中…");
    saving.current = (async () => {
      try {
        const result = await api(`/projects/${project.id}/canvas`, "PUT", {
          ...document,
          baseRevision: revision.current,
        });
        revision.current = result.revision;
        saved.current = fingerprint;
        setSaveState("已保存");
        setSaveError(null);
        if (
          JSON.stringify(
            cleanDocument(
              live.current.nodes,
              live.current.edges,
              live.current.viewport,
            ),
          ) === fingerprint
        )
          localStorage.removeItem(draftKey);
      } catch (e) {
        setSaveState("本地草稿已保留");
        setSaveError({
          message:
            (e as any).status === 401
              ? "访问会话已过期，请重新连接后保存。"
              : (e as Error).message || "无法连接 Server",
          auth: (e as any).status === 401,
        });
        if ((e as any).code === "revision_conflict") {
          blocked.current = true;
          setConflict(true);
        }
        throw e;
      } finally {
        saving.current = null;
      }
    })();
    await saving.current;
  }, [project.id, draftKey]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const doc = await api(`/projects/${project.id}/canvas`);
        if (!alive) return;
        revision.current = doc.revision;
        const initial = cleanDocument(doc.nodes, doc.edges, doc.viewport);
        saved.current = JSON.stringify(initial);
        assign(initial);
        setLoaded(true);
        setSaveState("已保存");
        setSaveError(null);
        const draft = localStorage.getItem(draftKey);
        if (
          draft &&
          JSON.stringify(JSON.parse(draft).document) !== saved.current
        )
          setDialog({ type: "draft", draft: JSON.parse(draft) });
        setTimeout(
          () =>
            live.current.viewport
              ? flow.setViewport(live.current.viewport)
              : flow.fitView({ padding: 0.25, maxZoom: 1 }),
          100,
        );
      } catch (e) {
        notify((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [project.id]);
  useEffect(() => {
    if (!loaded) return;
    const fingerprint = JSON.stringify(
      cleanDocument(nodes, edges, live.current.viewport),
    );
    if (fingerprint === saved.current) return;
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          document: cleanDocument(nodes, edges, live.current.viewport),
          baseRevision: revision.current,
        }),
      );
    } catch {
      notify("浏览器草稿空间不足，请及时导出画布");
    }
    setSaveState("待保存");
    const timer = setTimeout(
      () => void flush().catch((e) => notify(e.message)),
      700,
    );
    return () => clearTimeout(timer);
  }, [nodes, edges, loaded, flush]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (!saved.current) return;
      const document = cleanDocument(
        live.current.nodes,
        live.current.edges,
        live.current.viewport,
      );
      const dirty = JSON.stringify(document) !== saved.current;
      if (!dirty && !uploadController.current) return;
      if (window.zhilumeDesktop && !uploadController.current) {
        try {
          localStorage.setItem(
            draftKey,
            JSON.stringify({ document, baseRevision: revision.current }),
          );
          return;
        } catch {
          /* Main process offers a choice when persistence is unavailable. */
        }
      }
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, []);
  const refresh = useCallback(async () => {
    const values = await Promise.all([
      api("/assets"),
      api(`/jobs?projectId=${project.id}`),
      api("/workers"),
      api(`/projects/${project.id}/library`),
    ]);
    setAssets((previous) => mergeAssets(previous, values[0]));
    setJobs(values[1]);
    setWorkers(values[2]);
    setLibrary((previous: any) => ({
      ...values[3],
      items: values[3].items.map((item: any) => {
        const old = previous.items.find((i: any) => i.id === item.id);
        return {
          ...item,
          asset: mergeAssets(old ? { [old.asset.id]: old.asset } : {}, [
            item.asset,
          ])[item.asset.id],
        };
      }),
    }));
    setConnectionState(true);
  }, [project.id]);
  useEffect(() => {
    let alive = true;
    let busy = false;
    const poll = async () => {
      if (busy || !alive) return;
      busy = true;
      try {
        await refresh();
      } catch {
        if (alive) setConnectionState(false);
      } finally {
        busy = false;
      }
    };
    void poll();
    const timer = setInterval(poll, 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (!loaded || blocked.current) return;
    for (const job of jobs) {
      if (
        job.status !== "succeeded" ||
        !job.output ||
        !job.nodeId ||
        live.current.nodes.some(
          (n) =>
            n.data.lastJobId === job.id ||
            n.data.receivedJobIds?.includes(job.id),
        ) ||
        applying.current.has(job.id)
      )
        continue;
      const source = live.current.nodes.find((n) => n.id === job.nodeId);
      if (!source) continue;
      applying.current.add(job.id);
      (async () => {
        try {
          const text =
            job.output.kind === "text"
              ? await fetch(mediaUrl(job.output.url)).then((r) => {
                  if (!r.ok) throw new Error("读取结果失败");
                  return r.text();
                })
              : undefined;
          const current = live.current.nodes.find((n) => n.id === job.nodeId);
          if (!current) return;
          const parent = current.parentId
            ? live.current.nodes.find((n) => n.id === current.parentId)
            : null;
          const output = createNode(
            job.output.kind,
            {
              x: current.position.x + (parent?.position.x || 0) + 380,
              y: current.position.y + (parent?.position.y || 0),
            },
            {
              title: `${kindNames[job.output.kind as Kind]} · ${job.simulation ? "模拟结果" : (job.operation.startsWith("image.") || job.operation === "audio.speech.v1" || job.operation === "video.generate.v1") ? "生成结果" : "处理结果"}`,
              assetId: job.output.id,
              text,
              lastJobId: job.id,
            },
          );
          mutate((d) => ({
            ...d,
            nodes: [
              ...d.nodes.map((n) =>
                n.id === current.id
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        receivedJobIds: [
                          ...(n.data.receivedJobIds || []),
                          job.id,
                        ],
                      },
                    }
                  : n,
              ),
              output,
            ],
            edges: [
              ...d.edges,
              {
                id: crypto.randomUUID(),
                source: current.id,
                target: output.id,
              },
            ],
          }));
        } catch (e) {
          notify((e as Error).message);
        } finally {
          applying.current.delete(job.id);
        }
      })();
    }
  }, [jobs, loaded]);
  function center() {
    const canvas = document
      .querySelector(".canvas-area")!
      .getBoundingClientRect();
    const start = flow.screenToFlowPosition({
      x: canvas.left + canvas.width / 2 - 140,
      y: canvas.top + canvas.height / 2 - 80,
    });
    for (let i = 0; i < 80; i++) {
      const p = {
        x: start.x + (i % 3) * 340,
        y: start.y + Math.floor(i / 3) * 280,
      };
      if (
        !live.current.nodes.some(
          (n) =>
            !n.parentId &&
            n.type === "media" &&
            p.x < n.position.x + (n.measured?.width || 280) + 25 &&
            p.x + 305 > n.position.x &&
            p.y < n.position.y + (n.measured?.height || 200) + 40 &&
            p.y + 240 > n.position.y,
        )
      )
        return p;
    }
    return start;
  }
  function add(kind: Kind, position = center()) {
    mutate((d) => ({
      ...d,
      nodes: [
        ...d.nodes.map((n) => ({ ...n, selected: false })),
        {
          ...createNode(kind, position, {
            title: nextNodeTitle(kind, d.nodes),
          }),
          selected: true,
        },
      ],
    }));
    setMenu(null);
  }
  function onNodesChange(changes: NodeChange<CanvasNode>[]) {
    const next = applyNodeChanges(changes, live.current.nodes).map(node => {
      const resized = changes.some(change => change.type === "dimensions" && change.id === node.id && change.setAttributes);
      return resized ? { ...node, style: { ...node.style, width: node.width, height: node.height } } : node;
    });
    live.current = { ...live.current, nodes: next };
    setNodes(next);
  }
  async function addAsset(asset: any, position = center(), nodeId?: string) {
    setAssets((a) => ({ ...a, [asset.id]: asset }));
    const text =
      asset.kind === "text"
        ? await fetch(mediaUrl(asset.url)).then((r) => r.text())
        : undefined;
    if (nodeId) {
      const node = live.current.nodes.find((n) => n.id === nodeId);
      if (node?.data.kind !== asset.kind)
        throw new Error("文件类型与目标节点不匹配");
      changeNode(nodeId, { assetId: asset.id, text });
    } else
      mutate((d) => ({
        ...d,
        nodes: [
          ...d.nodes,
          createNode(asset.kind, position, {
            title: asset.filename,
            assetId: asset.id,
            text,
          }),
        ],
      }));
  }
  async function upload(
    files: FileList | File[],
    target = uploadTarget.current,
  ) {
    if (uploadController.current) {
      notify("请等待当前上传结束，或先取消上传");
      return;
    }
    const controller = new AbortController();
    uploadController.current = controller;
    for (const [index, file] of Array.from(files).entries()) {
      if (controller.signal.aborted) break;
      try {
        notify(`正在上传：${file.name}`);
        const targetNode = live.current.nodes.find(
          (n) => n.id === target.nodeId,
        );
        if (
          targetNode &&
          targetNode.data.kind !== "text" &&
          !file.type.startsWith(targetNode.data.kind + "/")
        )
          throw new Error("请选择相同类型的素材");
        setUploadState({ name: file.name, progress: 0 });
        const asset = await uploadAsset(file, controller.signal, (progress) =>
          setUploadState({ name: file.name, progress }),
        );
        if (target.library)
          await api(`/projects/${project.id}/library`, "POST", {
            assetId: asset.id,
            folderId: folder,
          });
        else {
          const p = target.position || center();
          await addAsset(
            asset,
            { x: p.x + index * 45, y: p.y + index * 45 },
            target.nodeId,
          );
        }
        notify(`已导入：${file.name}`);
      } catch (e) {
        notify((e as Error).message);
      }
    }
    uploadController.current = null;
    setUploadState(null);
    await refresh();
  }
  function chooseFile(target: typeof uploadTarget.current = {}, kind?: Kind) {
    uploadTarget.current = target;
    if (fileInput.current) {
      fileInput.current.accept = kind
        ? accept[kind]
        : Object.values(accept).join(",");
      fileInput.current.multiple = !target.nodeId;
      fileInput.current.value = "";
      fileInput.current.click();
    }
  }
  function duplicate(doc = live.current) {
    let chosen = doc.nodes.filter((n) => n.selected && n.type === "media");
    if (!chosen.length) return;
    const map = new Map(chosen.map((n) => [n.id, crypto.randomUUID()]));
    const copies = chosen.map((n) => {
      const p = n.parentId
        ? doc.nodes.find((g) => g.id === n.parentId)?.position
        : null;
      return {
        ...structuredClone(n),
        id: map.get(n.id)!,
        parentId: undefined,
        extent: undefined,
        selected: true,
        position: {
          x: n.position.x + (p?.x || 0) + 40,
          y: n.position.y + (p?.y || 0) + 40,
        },
        data: { ...n.data, lastJobId: undefined, videoDraft: n.data.videoDraft ? { ...structuredClone(n.data.videoDraft), request: undefined } : undefined, speechDraft: n.data.speechDraft ? { ...structuredClone(n.data.speechDraft), request: undefined } : undefined, generationDraft: n.data.generationDraft ? { ...structuredClone(n.data.generationDraft), request: undefined } : undefined },
      };
    });
    mutate((d) => ({
      ...d,
      nodes: [...d.nodes.map((n) => ({ ...n, selected: false })), ...copies],
      edges: [
        ...d.edges,
        ...doc.edges
          .filter((e) => map.has(e.source) && map.has(e.target))
          .map((e) => ({
            ...e,
            id: crypto.randomUUID(),
            source: map.get(e.source)!,
            target: map.get(e.target)!,
          })),
      ],
    }));
  }
  async function action(id: string, kind: string) {
    setMenu(null);
    const node = live.current.nodes.find((n) => n.id === id);
    if (!node) return;
    try {
      if (kind === "image-generation" || kind === "speech-generation" || kind === "video-generation") {
        setComposer({ id, mode: kind === "video-generation" ? "video" : kind === "speech-generation" ? "speech" : "image" });
        return;
      }
      setComposer(null);
      if (kind === "edit" || kind === "rename" || kind === "preview" || kind === "media-tools") {
        setDialog({ type: kind, node });
        return;
      }
      if (kind === "upload" || kind === "replace") {
        setDialog({ type: "replace", node });
        return;
      }
      if (kind === "delete") {
        mutate((d) =>
          removeSelected({
            ...d,
            nodes: d.nodes.map((n) => ({ ...n, selected: n.id === id })),
            edges: d.edges.map((e) => ({ ...e, selected: false })),
          }),
        );
        return;
      }
      if (kind === "duplicate") {
        duplicate({
          ...live.current,
          nodes: live.current.nodes.map((n) => ({
            ...n,
            selected: n.id === id,
          })),
        });
        return;
      }
      if (kind === "library") {
        await api(`/projects/${project.id}/library`, "POST", {
          ...(node.data.kind === "text"
            ? { text: node.data.text }
            : { assetId: node.data.assetId }),
          name: node.data.title,
          folderId: folder,
        });
        await refresh();
        notify("已保存到项目素材库");
        return;
      }
      if (kind === "retry-job" || kind === "cancel-job") {
        const job = jobs.find(j => j.nodeId === id);
        if (job) { await api(`/jobs/${job.id}/${kind === "retry-job" ? "retry" : "cancel"}`, "POST"); await refresh(); }
        return;
      }
      if (kind === "run") {
        const input =
          node.data.kind === "text"
            ? { text: node.data.text }
            : { assetId: node.data.assetId };
        if (!Object.values(input)[0]) throw new Error("请先添加节点内容");
        await flush();
        await api("/jobs", "POST", {
          requestId: crypto.randomUUID(),
          projectId: project.id,
          nodeId: id,
          sourceRevision: revision.current,
          operation:
            node.data.kind === "text"
              ? "mock.text.echo.v1"
              : "mock.media.copy.v1",
          input,
        });
        setTasksOpen(true);
        await refresh();
        notify("已提交模拟任务，结果会作为新节点返回画布");
      }
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function history(direction: "undo" | "redo") {
    const source = direction === "undo" ? undo : redo,
      target = direction === "undo" ? redo : undo;
    const next = source.current.pop();
    if (next) {
      next.nodes = next.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          receivedJobIds: [
            ...new Set([
              ...(n.data.receivedJobIds || []),
              ...(live.current.nodes.find((current) => current.id === n.id)
                ?.data.receivedJobIds || []),
            ]),
          ],
        },
      }));
      target.current.push(structuredClone(live.current));
      assign(next);
      setHistoryVersion((v) => v + 1);
    }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        dialog ||
        conflict ||
        (e.target as HTMLElement).closest(
          "input,textarea,select,video,audio,.media-player,.node-composer,[contenteditable=true]",
        )
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush().catch((err) => notify(err.message));
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        history(e.shiftKey ? "redo" : "undo");
      } else if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        mutate(e.shiftKey ? ungroupSelected : groupSelected);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        mutate(removeSelected);
      } else if (e.key === "Escape") {
        setMenu(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dialog, conflict, historyVersion]);
  const online = workers.filter(
    (w) => w.connected && !w.disabled && !w.draining,
  ).length;
  const items = library.items.filter(
    (i: any) =>
      i.folderId === folder &&
      (filter === "all" || i.asset.kind === filter) &&
      i.name.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = nodes.filter((n) => n.selected);
  return (
    <div className="workspace" onClick={() => menu && setMenu(null)}>
      <header className="topbar">
        <div className="crumb">
          <Brand />
          <button
            className="icon-button"
            title="返回项目"
            onClick={() =>
              void flush()
                .then(leave)
                .catch((e) => notify(e.message))
            }
          >
            <ArrowLeft size={17} />
          </button>
          <span className="slash">/</span>
          <strong>{title}</strong>
          <button
            className="icon-button"
            title="项目设置"
            onClick={() => setDialog({ type: "project" })}
          >
            <MoreHorizontal size={16} />
          </button>
          <span className="save-label">
            {saveState === "已保存" && <Check size={10} />} {saveState}
          </span>
        </div>
        <div className="row">
          <span className="connection-pill">
            <span className="dot" />
            {connectionState ? `${online} 个执行端在线` : "Server 连接中断"}
          </span>
          <button
            className="icon-button"
            title="任务记录"
            onClick={() => setTasksOpen((v) => !v)}
          >
            <History size={18} />
          </button>
          <ThemeButton />
          <button
            className="primary"
            onClick={() => {
              if (selected.some(n => n.type === 'media')) setDialog({ type: 'task-group' });
              else notify('请先选中需要执行的节点');
            }}
          >
            <PlayIcon />
            批量 / 流程
          </button>
        </div>
      </header>
      <div className="workspace-body">
        <nav className="rail">
          <button
            className={`icon-button ${libraryOpen ? "active" : ""}`}
            title="项目素材"
            onClick={() => setLibraryOpen((v) => !v)}
          >
            <FolderOpen size={20} />
          </button>
          <button
            className="icon-button"
            title="添加节点"
            onClick={(e) => {
              e.stopPropagation();
              setMenu({ x: e.clientX + 15, y: e.clientY, position: center() });
            }}
          >
            <Plus size={21} />
          </button>
          <button
            className={`icon-button ${tasksOpen ? "active" : ""}`}
            title="任务记录"
            onClick={() => setTasksOpen((v) => !v)}
          >
            <History size={20} />
          </button>
          <div className="rail-bottom">
            <button
              className="icon-button"
              title="使用帮助"
              onClick={() => setDialog({ type: "help" })}
            >
              <Settings size={19} />
            </button>
          </div>
        </nav>
        {libraryOpen && (
          <aside className="sidebar">
            <div className="sidebar-header">
              <h2>项目素材</h2>
              <div className="row" style={{ gap: 0 }}>
                <button
                  className="icon-button"
                  title="新建素材文件夹"
                  onClick={() => setDialog({ type: "folder" })}
                >
                  <FolderPlus size={16} />
                </button>
                <button
                  className="icon-button"
                  title="上传到素材库"
                  onClick={() => chooseFile({ library: true })}
                >
                  <Upload size={16} />
                </button>
              </div>
            </div>
            <div className="search">
              <Search size={14} />
              <input
                aria-label="搜索素材"
                placeholder="搜索素材…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="filters">
              {["all", ...kinds].map((k) => (
                <button
                  key={k}
                  className={filter === k ? "active" : ""}
                  onClick={() => setFilter(k)}
                >
                  {k === "all" ? "全部" : kindNames[k as Kind]}
                </button>
              ))}
            </div>
            {folder && (
              <button
                className="folder"
                onClick={() =>
                  setFolder(
                    library.folders.find((f: any) => f.id === folder)
                      ?.parentId || null,
                  )
                }
              >
                <ArrowLeft size={13} />
                返回上级
              </button>
            )}
            {library.folders
              .filter((f: any) => f.parentId === folder)
              .map((f: any) => (
                <button
                  className="folder"
                  key={f.id}
                  onClick={() => setFolder(f.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setDialog({ type: "folder-edit", folder: f });
                  }}
                >
                  <FolderOpen size={15} />
                  {f.name}
                  <ChevronRight size={13} />
                </button>
              ))}
            <div className="asset-grid">
              {items.map((item: any) => {
                return (
                  <div
                    className="asset-card"
                    key={item.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/x-zhilume-asset",
                        item.asset.id,
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onDoubleClick={() =>
                      void addAsset(item.asset).catch((e) => notify(e.message))
                    }
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setDialog({ type: "asset", item });
                    }}
                  >
                    <AssetThumbnail asset={item.asset} />
                    <div className="asset-name" title={item.name}>
                      {item.name}
                    </div>
                    <AssetInformation asset={item.asset} compact />
                  </div>
                );
              })}
            </div>
            {!items.length && (
              <div className="empty" style={{ padding: "35px 8px" }}>
                <FolderOpen size={30} strokeWidth={1} />
                <span>
                  {query
                    ? "没有匹配的素材"
                    : "把素材收藏到这里，随时再次使用。"}
                </span>
              </div>
            )}
            <p className="sidebar-note">
              拖入画布或双击插入 · 右键管理
              <br />
              从素材库移除不会删除画布上的内容。
            </p>
            <button
              className="full"
              onClick={() => chooseFile({ library: true })}
            >
              <Upload size={13} />
              导入素材
            </button>
          </aside>
        )}
        <section
          className="canvas-area"
          onPointerMove={event => { canvasPointer.current = { x: event.clientX, y: event.clientY }; }}
          onPointerLeave={() => { canvasPointer.current = null; }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const position = flow.screenToFlowPosition({
              x: e.clientX,
              y: e.clientY,
            });
            const assetId = e.dataTransfer.getData(
              "application/x-zhilume-asset",
            );
            if (assetId && assets[assetId])
              void addAsset(assets[assetId], position);
            else if (e.dataTransfer.files.length)
              void upload(e.dataTransfer.files, { position });
          }}
        >
          <NodeContext.Provider
            value={{
              assets,
              jobs,
              action: (id, a) => void action(id, a),
              checkpoint,
              changed: () => setNodes([...live.current.nodes]),
              mediaSize,
            }}
          >
            <ConnectionPreview.Provider value={connecting.preview}>
            <ReactFlow
              {...connecting.props}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={(changes) => {
                const next = applyEdgeChanges(changes, live.current.edges);
                live.current = { ...live.current, edges: next };
                setEdges(next);
              }}
              nodeDragThreshold={6}
              onNodeDragStart={() => { checkpoint(); setComposer(null); }}
              onNodeClick={(event, node) => {
                if (node.type !== "media" || (event.target as HTMLElement).closest("button,input,select,textarea,.node-title,.react-flow__handle")) return;
                const empty = node.data.kind === "text" ? !String(node.data.text || "").trim() : !node.data.assetId;
                if (empty || node.data.kind === "image") setComposer({ id: node.id, mode: node.data.kind === "video" ? "video" : node.data.kind === "audio" ? "speech" : node.data.kind === "image" ? "image" : "content" });
              }}
              onPaneContextMenu={(e) => {
                e.preventDefault();
                setMenu({
                  x: Math.min(e.clientX, innerWidth - 190),
                  y: Math.min(e.clientY, innerHeight - 310),
                  position: flow.screenToFlowPosition({
                    x: e.clientX,
                    y: e.clientY,
                  }),
                });
              }}
              onNodeContextMenu={(e, n) => {
                e.preventDefault();
                setMenu({
                  x: Math.min(e.clientX, innerWidth - 190),
                  y: Math.min(e.clientY, innerHeight - 310),
                  nodeId: n.id,
                });
              }}
              onMove={(_, v) => setZoom(Math.round(v.zoom * 100))}
              onMoveEnd={(_, v) => {
                if (!loaded) return;
                live.current = { ...live.current, viewport: v };
                void flush().catch((e) => notify(e.message));
              }}
              minZoom={0.15}
              maxZoom={2.5}
              panOnDrag={pan ? true : [1, 2]}
              selectionOnDrag={!pan}
              selectionMode={SelectionMode.Partial}
              panOnScroll
              zoomOnScroll={false}
              zoomActivationKeyCode="Control"
              panActivationKeyCode="Space"
              deleteKeyCode={null}
              fitViewOptions={{ maxZoom: 1 }}
            >
              <Background gap={24} size={1} color="var(--border)" />
              <MiniMap
                pannable
                zoomable
                style={{ width: 140, height: 95, bottom: 10, left: 0 }}
              />
            </ReactFlow>
            </ConnectionPreview.Provider>
          </NodeContext.Provider>
          {composer && composerNode && !dialog && <LanguageProject.Provider value={project.id}><NodeComposer nodeId={composerNode.id} layout={composerNode}
            title={composer.mode === "video" ? "视频生成与参考编辑" : composer.mode === "speech" ? "语音合成" : composer.mode === "image" ? "图片生成与编辑" : `${kindNames[composerNode.data.kind as Kind]}内容`}
            close={() => setComposer(null)}>
            {composer.mode === "image" ? (      <ImageGeneration key={composerNode.id} session={imageSession(composerNode.id)}
        assets={Object.values(assets)}
        value={generationDraft(composerNode)}
        update={change => {
          const current = live.current.nodes.find(n => n.id === composerNode.id);
          if (current) saveNodeDraft(current.id, { generationDraft: change(generationDraft(current)) });
        }}
        imported={async asset => {
          setAssets(previous => ({ ...previous, [asset.id]: asset }));
          await api(`/projects/${project.id}/library`, "POST", { assetId: asset.id });
          await refresh();
        }}
        close={() => setComposer(current => current?.id === composerNode.id ? null : current)}
        submit={async (operation, input, requestId, targetWorkerId) => {
          await flush();
          await api("/jobs", "POST", { requestId, projectId: project.id, nodeId: composerNode.id, operation, input, targetWorkerId });
          setTasksOpen(true); await refresh(); notify("已提交图片任务，结果会作为新节点返回画布");
        }}
      />
) : composer.mode === "video" ? <VideoGeneration key={composerNode.id} session={imageSession(composerNode.id)} assets={Object.values(assets)} value={videoDraft(composerNode)}
              update={change => { const current = live.current.nodes.find(n => n.id === composerNode.id); if (current) saveNodeDraft(current.id, { videoDraft: change(videoDraft(current)) }); }}
              imported={async asset => { setAssets(previous => ({ ...previous, [asset.id]: asset })); await api(`/projects/${project.id}/library`, "POST", { assetId: asset.id }); await refresh(); }}
              close={() => setComposer(current => current?.id === composerNode.id ? null : current)}
              submit={async (operation, input, requestId, targetWorkerId) => { await flush(); await api("/jobs", "POST", { requestId, projectId: project.id, nodeId: composerNode.id, operation, input, targetWorkerId }); setTasksOpen(true); await refresh(); notify("已提交视频任务，结果会作为新节点返回画布"); }}
            /> : composer.mode === "speech" ? <SpeechGeneration key={composerNode.id} session={imageSession(composerNode.id)} assets={Object.values(assets)} value={speechDraft(composerNode)}
              update={change => { const current = live.current.nodes.find(n => n.id === composerNode.id); if (current) saveNodeDraft(current.id, { speechDraft: change(speechDraft(current)) }); }}
              imported={async asset => { setAssets(previous => ({ ...previous, [asset.id]: asset })); await api(`/projects/${project.id}/library`, "POST", { assetId: asset.id }); await refresh(); }}
              close={() => setComposer(current => current?.id === composerNode.id ? null : current)}
              submit={async (operation, input, requestId, targetWorkerId) => { await flush(); await api("/jobs", "POST", { requestId, projectId: project.id, nodeId: composerNode.id, operation, input, targetWorkerId }); setTasksOpen(true); await refresh(); notify("已提交语音任务，结果会作为新节点返回画布"); }}
            /> : <EmptyNodeEditor key={composerNode.id} kind={composerNode.data.kind as Kind}
              value={composerNode.data.textDraft ?? String(composerNode.data.text || "")}
              draft={value => saveNodeDraft(composerNode.id, { textDraft: value })}
              save={text => { changeNode(composerNode.id, { text, html: undefined, textDraft: undefined }); setComposer(null); }}
              upload={() => { const id = composerNode.id; setComposer(null); void action(id, "upload"); }} />}
          </NodeComposer></LanguageProject.Provider>}
          <div className="canvas-hint">
            自由画布 <span style={{ margin: "0 9px", opacity: 0.4 }}>/</span>{" "}
            {nodes.filter((n) => n.type === "media").length} 个节点
          </div>
          {loaded && !nodes.length && (
            <div className="canvas-empty">
              <Layers size={48} strokeWidth={1} />
              <h2>从一个想法开始</h2>
              <p>添加节点，或把素材拖到画布上。</p>
              <div className="row">
                {kinds.map((k) => {
                  const Icon = icons[k];
                  return (
                    <button key={k} onClick={() => add(k)}>
                      <Icon size={15} />
                      {kindNames[k]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="canvas-dock">
            <button
              className={`icon-button ${!pan ? "active" : ""}`}
              title="选择 / 框选"
              onClick={() => setPan(false)}
            >
              <MousePointer2 size={17} />
            </button>
            <button
              className={`icon-button ${pan ? "active" : ""}`}
              title="拖动画布（也可按住空格）"
              onClick={() => setPan(true)}
            >
              <Hand size={17} />
            </button>
            <div className="split" />
            <button
              className="icon-button"
              title="缩小"
              onClick={() => flow.zoomOut()}
            >
              <Minus size={16} />
            </button>
            <span className="zoom">{zoom}%</span>
            <button
              className="icon-button"
              title="放大"
              onClick={() => flow.zoomIn()}
            >
              <Plus size={16} />
            </button>
            <button
              className="icon-button"
              title="适应全部内容"
              onClick={() => flow.fitView({ padding: 0.25, maxZoom: 1 })}
            >
              <Maximize size={16} />
            </button>
            <div className="split" />
            <button
              className="icon-button"
              title="分组所选节点 Ctrl+G"
              disabled={selected.length < 2}
              onClick={() => mutate(groupSelected)}
            >
              <Group size={17} />
            </button>
            <button
              className="icon-button"
              title="取消分组 Ctrl+Shift+G"
              disabled={
                !nodes.some(
                  (n) => n.selected && (n.type === "group" || n.parentId),
                )
              }
              onClick={() => mutate(ungroupSelected)}
            >
              <Ungroup size={17} />
            </button>
            <button
              className="icon-button"
              title="撤销 Ctrl+Z"
              disabled={!undo.current.length}
              onClick={() => history("undo")}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="icon-button"
              title="重做 Ctrl+Shift+Z"
              disabled={!redo.current.length}
              onClick={() => history("redo")}
            >
              <Redo2 size={16} />
            </button>
          </div>
        </section>
        {tasksOpen && (
          <aside className="task-panel">
            <div className="row spread">
              <h2 style={{ margin: 0, fontSize: 14 }}>任务记录</h2>
              <button
                className="icon-button"
                title="关闭任务面板"
                onClick={() => setTasksOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <p className="sidebar-note">
              任务由连接的 Worker 执行，可在这里查看进度与结果。
            </p>
            {!jobs.length && (
              <div className="empty">
                <History size={30} />
                <span>选择有内容的节点，运行一次模拟任务。</span>
              </div>
            )}
            {jobs.map((j) => (
              <article className="job-card" key={j.id}>
                <div className="row spread">
                  <strong style={{ fontSize: 12 }}>
                    {statusLabel[j.status] || j.status}
                  </strong>
                  <span className="badge">{j.simulation ? "模拟" : j.operation === "video.generate.v1" ? "GPU 视频" : j.operation === "audio.speech.v1" ? "GPU 语音" : j.operation.startsWith("image.") ? "GPU 图片" : "Server 媒体处理"}</span>
                </div>
                <p>
                  {({ "video.generate.v1": "视频生成", "audio.speech.v1": "语音合成", "mock.text.echo.v1": "文本回显", "mock.media.copy.v1": "素材复制", "image.generate.v1": "文生图", "image.edit.v1": "图片指令编辑", "image.reference.v1": "多图参考", "media.video.trim.v1": "视频截取", "media.audio.extract.v1": "提取音轨" } as Record<string, string>)[j.operation] || j.operation}{" "}
                  · {j.stage}
                  <br />
                  {new Date(j.createdAt).toLocaleTimeString()}
                </p>
                {j.error && <p className="error">{j.error}</p>}
                {j.progress !== null && <progress value={j.progress} max={1} />}
                <div className="row" style={{ marginTop: 10 }}>
                  {![
                    "succeeded",
                    "failed",
                    "cancelled",
                    "interrupted",
                    "blocked",
                  ].includes(j.status) && (
                    <button
                      disabled={j.status === "cancel_requested"}
                      onClick={() =>
                        void api(`/jobs/${j.id}/cancel`, "POST")
                          .then(refresh)
                          .catch((e) => notify(e.message))
                      }
                    >
                      取消任务
                    </button>
                  )}
                  {["failed", "interrupted", "blocked", "cancelled"].includes(j.status) && (
                    <button
                      onClick={() =>
                        void api(`/jobs/${j.id}/retry`, "POST")
                          .then(refresh)
                          .catch((e) => notify(e.message))
                      }
                    >
                      重试
                    </button>
                  )}
                  {j.output && (
                    <a
                      href={mediaUrl(j.output.downloadUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      下载结果
                    </a>
                  )}
                </div>
              </article>
            ))}
          </aside>
        )}
      </div>
      <input
        className="hidden"
        type="file"
        ref={fileInput}
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
        }}
      />
      {menu && (
        <div
          className="menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.nodeId ? (
            <>
              {[
                ["编辑 / 预览", "preview"],
                ["运行模拟任务", "run"],
                ["保存到素材库", "library"],
                ["复制节点", "duplicate"],
                ["重命名", "rename"],
                ["删除节点", "delete"],
              ].map(([label, value]) => (
                <button
                  key={value}
                  onClick={() =>
                    void action(
                      menu.nodeId,
                      value === "preview" &&
                        live.current.nodes.find((n) => n.id === menu.nodeId)
                          ?.data.kind === "text"
                        ? "edit"
                        : value,
                    )
                  }
                >
                  {label}
                </button>
              ))}
            </>
          ) : (
            <>
              {kinds.map((k) => {
                const Icon = icons[k];
                return (
                  <button key={k} onClick={() => add(k, menu.position)}>
                    <Icon size={15} />
                    添加{kindNames[k]}节点
                  </button>
                );
              })}
              <div className="divider" style={{ margin: 5 }} />
              <button
                onClick={() => {
                  chooseFile({ position: menu.position });
                  setMenu(null);
                }}
              >
                <Upload size={15} />
                上传素材
              </button>
              <button
                onClick={() => {
                  flow.fitView({ padding: 0.25, maxZoom: 1 });
                  setMenu(null);
                }}
              >
                <Maximize size={15} />
                适应屏幕
              </button>
            </>
          )}
        </div>
      )}
      {uploadState && (
        <div className="upload-toast" role="status">
          <div>
            <strong>{uploadState.name}</strong>
            <span>
              {uploadState.progress < 1
                ? `上传中 ${Math.round(uploadState.progress * 100)}%`
                : "正在校验素材…"}
            </span>
          </div>
          <progress max={1} value={uploadState.progress} />
          <button onClick={() => uploadController.current?.abort()}>
            取消上传
          </button>
        </div>
      )}
      {saveError && (
        <div className="save-error-banner" role="alert">
          <span>{saveError.message} 当前修改已保留在本机草稿。</span>
          <button
            onClick={() =>
              saveError.auth
                ? setDialog({ type: "reauth" })
                : void flush().catch((e) => notify(e.message))
            }
          >
            {saveError.auth ? "重新连接" : "重试保存"}
          </button>
          <button onClick={() => downloadJson(live.current, title + ".json")}>
            导出草稿
          </button>
        </div>
      )}
      {dialog?.type === "reauth" && (
        <NameModal
          secret
          title="重新连接当前 Server · 输入访问凭证"
          close={() => setDialog(null)}
          done={async (token) => {
            try {
              await login(connection.base, token);
              setDialog(null);
              await flush();
              await refresh();
            } catch (e) {
              notify((e as Error).message);
            }
          }}
        />
      )}
      {dialog?.type === "media-tools" && assets[dialog.node.data.assetId] && <MediaTools
        asset={assets[dialog.node.data.assetId]} assets={Object.values(assets)} close={() => setDialog(null)}
        complete={(output, replace) => {
          setAssets(current => ({ ...current, ...Object.fromEntries(output.map(a => [a.id, a])) }));
          if (replace) changeNode(dialog.node.id, { assetId: output[0].id, mediaSize: undefined });
          else mutate(doc => {
            const source = doc.nodes.find(n => n.id === dialog.node.id);
            const parent = source?.parentId ? doc.nodes.find(n => n.id === source.parentId) : undefined;
            const position = source?.position || center();
            const origin = { x: position.x + (parent?.position.x || 0), y: position.y + (parent?.position.y || 0) };
            const sourceWidth = Number(source?.width || source?.style?.width || 280);
            const additions = output.map(a => {
              const node = createNode(a.kind as Kind, { x: 0, y: 0 }, { assetId: a.id, title: a.filename });
              return a.dimensions ? fitMediaNode(node, a.id, a.dimensions.width, a.dimensions.height) : node;
            });
            const stride = Math.max(220, ...additions.map(n => n.height || 220)) + 70;
            additions.forEach((node, i) => { node.position = { x: origin.x + sourceWidth + 100 + (i % 4) * 340, y: origin.y + Math.floor(i / 4) * stride }; });
            return { ...doc, nodes: [...doc.nodes, ...additions], edges: [...doc.edges, ...(source ? additions.map(n => ({ id: crypto.randomUUID(), source: source.id, target: n.id })) : [])] };
          });
          notify(`已保存 ${output.length} 份处理结果`);
        }}
        submit={async (operation, input) => {
          await flush();
          await api("/jobs", "POST", { requestId: crypto.randomUUID(), projectId: project.id, nodeId: dialog.node.id, sourceRevision: revision.current, operation, input });
          setTasksOpen(true); await refresh(); notify("已提交 Server 后台任务");
        }}
      />}
      {dialog?.type === "replace" && (
        <Modal
          title={`${dialog.node.data.assetId ? "替换" : "添加"}${kindNames[dialog.node.data.kind as Kind]}素材`}
          close={() => setDialog(null)}
        >
          <p className="muted">
            节点的位置、大小和连线保持不变。原素材仍可在历史引用中使用。
          </p>
          <button
            className="primary replace-upload"
            onClick={() => {
              chooseFile({ nodeId: dialog.node.id }, dialog.node.data.kind);
              setDialog(null);
            }}
          >
            <Upload size={16} />
            从电脑选择文件
          </button>
          <h3>从项目素材库选择</h3>
          <div className="replace-library">
            {library.items
              .filter((item: any) => item.asset?.kind === dialog.node.data.kind)
              .map((item: any) => (
                <button
                  key={item.id}
                  onClick={() => {
                    void addAsset(
                      item.asset,
                      dialog.node.position,
                      dialog.node.id,
                    )
                      .then(() => setDialog(null))
                      .catch((e) => notify(e.message));
                  }}
                >
                  <AssetThumbnail asset={item.asset} />
                  <span>{item.name}</span>
                </button>
              ))}
          </div>
          {!library.items.some(
            (item: any) => item.asset?.kind === dialog.node.data.kind,
          ) && <p className="empty">素材库中还没有同类型素材。</p>}
        </Modal>
      )}
      {dialog?.type === "edit" && (
        <TextEditor
          text={dialog.node.data.text}
          html={dialog.node.data.html}
          close={() => setDialog(null)}
          save={(text, html) => {
            if (text.length > 12000) {
              notify("文本不能超过 12,000 字");
              return;
            }
            changeNode(dialog.node.id, { text, html });
            setDialog(null);
          }}
        />
      )}
      {dialog?.type === "rename" && (
        <NameModal
          title="重命名节点"
          value={dialog.node.data.title}
          close={() => setDialog(null)}
          done={(title) => {
            changeNode(dialog.node.id, { title });
            setDialog(null);
          }}
        />
      )}
      {dialog?.type === "folder-edit" && (
        <FolderDialog
          folder={dialog.folder}
          folders={library.folders}
          close={() => setDialog(null)}
          done={async () => {
            setFolder(null);
            await refresh();
            setDialog(null);
          }}
          notify={notify}
        />
      )}
      {dialog?.type === "folder" && (
        <NameModal
          title="新建素材文件夹"
          close={() => setDialog(null)}
          done={async (name) => {
            try {
              await api(`/projects/${project.id}/folders`, "POST", {
                name,
                parentId: folder,
              });
              await refresh();
              setDialog(null);
            } catch (e) {
              notify((e as Error).message);
            }
          }}
        />
      )}
      {dialog?.type === "preview" && (
        <Modal title={dialog.node.data.title} close={() => setDialog(null)}>
          {assets[dialog.node.data.assetId] ? (
            <>
              <Preview asset={assets[dialog.node.data.assetId]} />
              <AssetInformation asset={assets[dialog.node.data.assetId]} />
              <div className="row spread" style={{ marginTop: 20 }}>
                <span className="muted">
                  {sizeLabel(assets[dialog.node.data.assetId].size)}
                </span>
                <a
                  href={mediaUrl(assets[dialog.node.data.assetId].downloadUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  下载原文件
                </a>
                <button
                  onClick={() => {
                    setDialog({ type: "replace", node: dialog.node });
                  }}
                >
                  替换素材
                </button>
              </div>
            </>
          ) : (
            <div className="empty">
              节点还没有内容
              <button
                onClick={() => {
                  chooseFile({ nodeId: dialog.node.id }, dialog.node.data.kind);
                  setDialog(null);
                }}
              >
                选择素材
              </button>
            </div>
          )}
        </Modal>
      )}
      {dialog?.type === "asset" && (
        <AssetDialog
          item={dialog.item}
          library={library}
          close={() => setDialog(null)}
          done={async () => {
            await refresh();
            setDialog(null);
          }}
          insert={() =>
            void addAsset(dialog.item.asset).then(() => setDialog(null))
          }
          notify={notify}
        />
      )}
      {dialog?.type === "project" && (
        <Modal title="项目设置" close={() => setDialog(null)}>
          <label>
            项目名称
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
          </label>
          <div className="row spread">
            <button
              onClick={() =>
                downloadJson(
                  cleanDocument(
                    live.current.nodes,
                    live.current.edges,
                    live.current.viewport,
                  ),
                  `${title}.canvas.json`,
                )
              }
            >
              <Download size={14} />
              导出画布文档
            </button>
            <button
              className="primary"
              onClick={() =>
                void api(`/projects/${project.id}`, "PATCH", { name: title })
                  .then(() => setDialog(null))
                  .catch((e) => notify(e.message))
              }
            >
              保存名称
            </button>
          </div>
          <div className="divider" />
          <p className="prose">归档后项目将从列表隐藏，随时可以恢复。</p>
          <button
            onClick={() =>
              void flush()
                .then(() =>
                  api(`/projects/${project.id}`, "PATCH", { archived: true }),
                )
                .then(leave)
                .catch((e) => notify(e.message))
            }
          >
            归档项目
          </button>
        </Modal>
      )}
      {dialog?.type === 'task-group' && <Modal title="提交节点任务" close={() => setDialog(null)}><TaskGroupRunner nodes={selected.filter(n => n.type === 'media')} edges={live.current.edges} projectId={project.id} prepare={n => n.data.kind === 'image' ? generationDraft(n) : n.data.kind === 'video' ? videoDraft(n) : n.data.kind === 'audio' ? speechDraft(n) : {}} flush={flush} done={() => { setDialog(null); setTasksOpen(true); void refresh(); }} /></Modal>}
      {dialog?.type === "help" && (
        <Modal title="画布使用指南" close={() => setDialog(null)}>
          <div className="prose">
            <p>
              拖动节点排列内容，拖动左右连接点建立引用。空白区域拖动框选，空格＋拖动平移画布，Ctrl＋滚轮缩放。
            </p>
            <p>
              双击文本编辑；双击图片打开预览；视频与音频可直接播放。素材库可拖入画布，文件也可从桌面拖入。
            </p>
            <p>
              Ctrl+C / Ctrl+V 复制粘贴节点，Ctrl+G 分组，Ctrl+Shift+G
              取消分组，Delete 删除，Ctrl+Z 撤销。
            </p>
            <p>
              普通连线引用已有素材。“批量提交”独立运行选中节点；“运行流程”需明确绑定上游新结果，成功归档后再执行下游。
            </p>
            <p>
              本地草稿用于断线恢复。画布 JSON 导出包含布局和素材
              ID，不包含媒体文件。
            </p>
          </div>
        </Modal>
      )}
      {dialog?.type === "draft" && (
        <Modal title="发现未保存的本地草稿" close={() => setDialog(null)}>
          <p className="prose">
            可以先导出备份，再选择是否将草稿恢复到当前画布。恢复会生成新的保存版本。
          </p>
          <div className="row">
            <button
              onClick={() =>
                downloadJson(dialog.draft.document, "zhilume-draft.json")
              }
            >
              导出草稿
            </button>
            <button
              onClick={() => {
                localStorage.removeItem(draftKey);
                setDialog(null);
              }}
            >
              使用 Server 版本
            </button>
            <button
              className="primary"
              onClick={() => {
                const restored = cleanDocument(
                  dialog.draft.document.nodes,
                  dialog.draft.document.edges,
                  dialog.draft.document.viewport,
                );
                mutate(() => restored);
                if (restored.viewport) void flow.setViewport(restored.viewport);
                setDialog(null);
              }}
            >
              恢复草稿
            </button>
          </div>
        </Modal>
      )}
      {conflict && (
        <Modal title="画布已在其他窗口更新" close={() => {}}>
          <p className="prose">
            为避免覆盖其他窗口的修改，已暂停自动保存。导出本地草稿后，可重新加载
            Server 版本。
          </p>
          <div className="row">
            <button
              onClick={() =>
                downloadJson(
                  cleanDocument(
                    live.current.nodes,
                    live.current.edges,
                    live.current.viewport,
                  ),
                  "zhilume-conflict-draft.json",
                )
              }
            >
              导出本地草稿
            </button>
            <button
              className="primary"
              onClick={() =>
                void api(`/projects/${project.id}/canvas`)
                  .then((doc) => {
                    revision.current = doc.revision;
                    saved.current = JSON.stringify(
                      cleanDocument(doc.nodes, doc.edges, doc.viewport),
                    );
                    assign(doc);
                    blocked.current = false;
                    setConflict(false);
                    setSaveState("已保存");
                    setSaveError(null);
                    localStorage.removeItem(draftKey);
                    undo.current = [];
                    redo.current = [];
                  })
                  .catch((e) => notify(e.message))
              }
            >
              加载 Server 版本
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 2l10 6-10 6z" />
    </svg>
  );
}
function Preview({ asset }: { asset: any }) {
  if (asset.kind === "image")
    return (
      <img
        className="preview-media"
        src={mediaUrl(asset.url)}
        alt={asset.filename}
      />
    );
  if (asset.kind === "video" || asset.kind === "audio")
    return (
      <MediaPlayer key={asset.id} asset={asset} kind={asset.kind} preview />
    );
  return <p className="prose">文本素材 · {asset.filename}</p>;
}
function AssetDialog({
  item,
  library,
  close,
  done,
  insert,
  notify,
}: {
  item: any;
  library: any;
  close: () => void;
  done: () => Promise<void>;
  insert: () => void;
  notify: (s: string) => void;
}) {
  const [name, setName] = useState(item.name),
    [description, setDescription] = useState(item.description),
    [folder, setFolder] = useState(item.folderId || "");
  return (
    <Modal title="素材详情" close={close}>
      <Preview asset={item.asset} />
      <AssetInformation asset={item.asset} />
      <label>
        素材名称
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        说明
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label>
        所在文件夹
        <select value={folder} onChange={(e) => setFolder(e.target.value)}>
          <option value="">素材库根目录</option>
          {library.folders.map((f: any) => (
            <option value={f.id} key={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <div className="row spread">
        <span className="muted">{sizeLabel(item.asset.size)}</span>
        <a
          href={mediaUrl(item.asset.downloadUrl)}
          target="_blank"
          rel="noreferrer"
        >
          下载原文件
        </a>
      </div>
      <div className="divider" />
      <div className="row spread">
        <button
          onClick={() =>
            void api(`/library/${item.id}`, "DELETE")
              .then(done)
              .catch((e) => notify(e.message))
          }
        >
          从素材库移除
        </button>
        <div className="row">
          <button onClick={insert}>插入画布</button>
          <button
            className="primary"
            onClick={() =>
              void api(`/library/${item.id}`, "PATCH", {
                name,
                description,
                folderId: folder || null,
              })
                .then(done)
                .catch((e) => notify(e.message))
            }
          >
            保存
          </button>
        </div>
      </div>
    </Modal>
  );
}
void restoreDesktopSession().finally(() =>
  createRoot(document.getElementById("root")!).render(<App />),
);

function FolderDialog({
  folder,
  folders,
  close,
  done,
  notify,
}: {
  folder: any;
  folders: any[];
  close: () => void;
  done: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [name, setName] = useState(folder.name),
    [parent, setParent] = useState(folder.parentId || ""),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  const descendants = new Set([folder.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of folders)
      if (descendants.has(f.parentId) && !descendants.has(f.id)) {
        descendants.add(f.id);
        changed = true;
      }
  }
  async function save(remove = false) {
    setBusy(true);
    try {
      await api(
        `/folders/${folder.id}`,
        remove ? "DELETE" : "PATCH",
        remove ? undefined : { name, parentId: parent || null },
      );
      await done();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="管理素材文件夹" close={close}>
      <label>
        文件夹名称
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
        />
      </label>
      <label>
        移动到
        <select value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">素材库根目录</option>
          {folders
            .filter((f) => !descendants.has(f.id))
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
      </label>
      {confirm && (
        <p className="error">
          确认移除“{folder.name}
          ”？其中的素材和子文件夹会移到上一级，原文件不受影响。
        </p>
      )}
      <div className="row spread" style={{ marginTop: 24 }}>
        <button
          disabled={busy}
          onClick={() => (confirm ? void save(true) : setConfirm(true))}
        >
          {confirm ? "确认移除文件夹" : "移除文件夹"}
        </button>
        <button
          className="primary"
          disabled={busy || !name.trim()}
          onClick={() => void save()}
        >
          保存
        </button>
      </div>
    </Modal>
  );
}

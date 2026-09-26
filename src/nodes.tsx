import { createContext, useContext, useEffect } from "react";
import { MediaPlayer } from "./media-player";
import {
  Handle,
  Position,
  NodeResizer,
  NodeToolbar,
  useConnection,
  type NodeProps,
} from "@xyflow/react";
import {
  Type,
  ImageIcon,
  Film,
  AudioLines,
  Upload,
  Expand,
  Play,
  Bookmark,
  Copy,
  Trash2,
  Pencil,
  Replace,
  Plus,
  Scissors,
  Sparkles,
} from "lucide-react";
import { mediaUrl, statusLabel } from "./api";
import { kindNames, type Kind } from "./canvas";
export const icons = {
  text: Type,
  image: ImageIcon,
  video: Film,
  audio: AudioLines,
};
export const NodeContext = createContext<{
  assets: Record<string, any>;
  jobs: any[];
  action: (id: string, action: string) => void;
  checkpoint: () => void;
  changed: () => void;
  mediaSize: (id: string, assetId: string, width: number, height: number) => void;
}>({
  assets: {},
  jobs: [],
  action: () => {},
  checkpoint: () => {},
  changed: () => {},
  mediaSize: () => {},
});
export function MediaNode({ id, data, selected }: NodeProps) {
  const connecting = useConnection((connection) => connection.inProgress);
  const { assets, jobs, action, checkpoint, changed, mediaSize } = useContext(NodeContext);
  const kind = data.kind as Kind;
  const Icon = icons[kind];
  const asset = assets[String(data.assetId)];
  const url = asset ? mediaUrl(asset.url) : "";
  const dimensions = data.mediaSize as { assetId: string; width: number; height: number } | undefined;
  const ratio = dimensions?.assetId === asset?.id && dimensions && Number.isFinite(dimensions.width) && Number.isFinite(dimensions.height) && dimensions.width > 0 && dimensions.height > 0
    ? dimensions.width / dimensions.height : undefined;
  const fittedMedia = !!asset && (kind === "image" || kind === "video");
  // Replacement/undo can reuse the mounted media element; apply known dimensions again.
  useEffect(() => {
    if (asset && ratio && dimensions) mediaSize(id, asset.id, dimensions.width, dimensions.height);
  }, [id, asset?.id, ratio]);
  const job = jobs.find((j) => j.nodeId === id);
  const active =
    job &&
    !["succeeded", "failed", "interrupted", "cancelled"].includes(job.status);
  return (
    <div
      className={`media-node kind-${kind} ${fittedMedia ? "has-media" : ""} ${selected ? "selected" : ""} ${connecting ? "is-connecting" : ""}`}
      onDoubleClick={(e) => {
        if (
          (e.target as HTMLElement).closest(
            ".media-player,video,audio,button,[role=button]",
          )
        )
          return;
        action(id, kind === "text" ? "edit" : "preview");
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={kind === "video" && ratio ? Math.max(220, 160 * ratio) : 220}
        minHeight={kind === "audio" ? 108 : fittedMedia ? kind === "video" ? 160 : 1 : 155}
        maxHeight={kind === "audio" ? 108 : undefined}
        keepAspectRatio={fittedMedia && !!ratio}
        onResizeStart={checkpoint}
        onResizeEnd={changed}
      />
      <div
        className="node-title"
        onDoubleClick={(e) => {
          e.stopPropagation();
          action(id, "rename");
        }}
      >
        <Icon size={13} />
        <span title={String(data.title)}>{String(data.title)}</span>
        <button
          className="node-name-edit nodrag nopan"
          aria-label="重命名节点"
          title="重命名节点（也可双击名称）"
          onClick={() => action(id, "rename")}
        >
          <Pencil size={12} />
        </button>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="node-port"
        aria-label="输入连接点"
        title="输入：从其他节点连接到这里"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.click();
          }
        }}
      >
        <Plus size={13} />
      </Handle>
      <Handle
        type="source"
        position={Position.Right}
        className="node-port"
        aria-label="输出连接点"
        title="输出：拖动到其他节点的输入连接点"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.click();
          }
        }}
      >
        <Plus size={13} />
      </Handle>
      <NodeToolbar isVisible={selected} position={Position.Top} offset={38}>
        <div className="node-tools">
          <button
            title={kind === "text" ? "编辑文本" : "预览"}
            onClick={() => action(id, kind === "text" ? "edit" : "preview")}
          >
            {kind === "text" ? <Pencil size={13} /> : <Expand size={13} />}
          </button>
          <button
            title="运行模拟任务"
            disabled={active}
            onClick={() => action(id, "run")}
          >
            <Play size={13} />
            模拟
          </button>
          {(kind === "audio" || kind === "text") && <button aria-label="语音合成" disabled={active} onClick={() => action(id, "speech-generation")}><Sparkles size={13} />语音</button>}
          {(kind === "text" || kind === "image") && <button aria-label="图片生成与编辑" title="图片生成与编辑" disabled={active} onClick={() => action(id, "image-generation")}><Sparkles size={13} />生成</button>}
          {asset && (kind === "image" || kind === "video") && <button aria-label={kind === "image" ? "图片工具" : "视频工具"} title={kind === "image" ? "图片工具" : "视频工具"} onClick={() => action(id, "media-tools")}><Scissors size={13} />工具</button>}
          <button title="保存到素材库" onClick={() => action(id, "library")}>
            <Bookmark size={13} />
          </button>
          <button title="复制节点" onClick={() => action(id, "duplicate")}>
            <Copy size={13} />
          </button>
          <button title="重命名" onClick={() => action(id, "rename")}>
            <Pencil size={13} />
          </button>
          <button title="删除节点" onClick={() => action(id, "delete")}>
            <Trash2 size={13} />
          </button>
        </div>
      </NodeToolbar>
      <div className={`node-content ${kind}`}>
        {kind === "text" ? (
          <p className="text-preview">
            {String(data.text || "点击输入文本，记录提示词和创作想法。")}
          </p>
        ) : asset ? (
          kind === "image" ? (
            <img src={url} alt={String(data.title)} draggable={false}
              onLoad={event => mediaSize(id, asset.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} />
          ) : (
            <MediaPlayer
              key={asset.id}
              asset={asset}
              kind={kind === "video" ? "video" : "audio"}
              onDimensions={(width, height) => mediaSize(id, asset.id, width, height)}
            />
          )
        ) : (
          <div className="node-placeholder">
            <Icon size={30} strokeWidth={1} />
            <span>{kind === "image" ? "点击生成，或上传图片" : `点击添加${kindNames[kind]}内容`}</span>
            <button className="nodrag" onClick={() => action(id, "upload")}>
              <Upload size={12} />
              选择文件
            </button>
          </div>
        )}
      </div>
      {asset && kind !== "text" && (
        <button
          className="node-replace nodrag nopan"
          aria-label="替换素材"
          title="替换素材"
          onClick={() => action(id, "replace")}
        >
          <Replace size={12} />
          替换
        </button>
      )}
      {job && (
        <div className="node-status">
          <span className="badge">{job.simulation ? "模拟" : job.operation === "audio.speech.v1" ? "GPU 语音" : job.operation?.startsWith("image.") ? "GPU 图片" : "CPU 处理"}</span>
          <span title={job.error || job.stage}>{statusLabel[job.status] || job.status}{active && job.stage ? ` · ${job.stage}` : ""}</span>
          {job.error && <span className="node-job-error" title={job.error}>{job.error}</span>}
          {["failed", "interrupted"].includes(job.status) && <button className="nodrag nopan" aria-label="重试节点任务" onClick={() => action(id, "retry-job")}>重试</button>}
          {active && <button className="nodrag nopan" aria-label="取消节点任务" disabled={job.status === "cancel_requested"} onClick={() => action(id, "cancel-job")}>取消</button>}
          {active && job.progress !== null
            ? ` · ${Math.round(job.progress * 100)}%`
            : ""}
        </div>
      )}
    </div>
  );
}
export function GroupNode({ data, selected }: NodeProps) {
  const { checkpoint, changed } = useContext(NodeContext);
  return (
    <div className={`group-node ${selected ? "selected" : ""}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={300}
        minHeight={220}
        onResizeStart={checkpoint}
        onResizeEnd={changed}
      />
      <span>{String(data.title)}</span>
    </div>
  );
}

import './node-empty.css';
import {FloatingPanel} from './overlays';
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { MediaPlayer } from "./media-player";
import {
  Handle,
  Position,
  NodeResizer,
  NodeToolbar,
  useConnection,
  useViewport,
  useReactFlow,
  type NodeProps,
} from "@xyflow/react";
import {
  Type,
  ImageIcon,
  Film,
  AudioLines,
  Upload,
  Expand,
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
  retryAsset: () => void;
  dropFiles: (id:string, files:File[]) => void;
}>({
  assets: {},
  jobs: [],
  action: () => {},
  checkpoint: () => {},
  changed: () => {},
  mediaSize: () => {}, retryAsset:()=>{}, dropFiles:()=>{},
});
export function MediaNode({ id, data, selected }: NodeProps) {
  const viewport = useViewport(), flow = useReactFlow();
  const screenTop = (flow.getInternalNode(id)?.internals.positionAbsolute.y || 0) * viewport.zoom + viewport.y;
  const connecting = useConnection((connection) => connection.inProgress);
  const { assets, jobs, action, checkpoint, changed, mediaSize, retryAsset, dropFiles } = useContext(NodeContext);
  const kind = data.kind as Kind;
  const Icon = icons[kind];
  const empty = kind==='text' ? !data.assetId && !String(data.text||'').trim() && !data.html : !data.assetId;
  const [dragOver,setDragOver]=useState(false),[imageError,setImageError]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>setImageError(false),[data.assetId,retry]);
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
    !["succeeded", "failed", "interrupted", "cancelled", "blocked"].includes(job.status);
  return (
    <div
      className={`media-node kind-${kind} ${empty ? "is-empty" : "has-content"} ${dragOver ? "is-file-over" : ""} ${fittedMedia ? "has-media" : ""} ${selected ? "selected" : ""} ${connecting ? "is-connecting" : ""}`}
      onDragOver={e=>{if(empty && e.dataTransfer.types.includes('Files')){e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy';setDragOver(true);}}}
      onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragOver(false);}}
      onDrop={e=>{if(empty && e.dataTransfer.files.length){e.preventDefault();e.stopPropagation();setDragOver(false);dropFiles(id,Array.from(e.dataTransfer.files));}}}
      onDoubleClick={(e) => {
        if (
          (e.target as HTMLElement).closest(
            ".media-player,video,audio,button,[role=button]",
          )
        )
          return;
        action(id, kind === "text" ? "edit" : empty ? kind === "audio" ? "speech-generation" : `${kind}-generation` : "preview");
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={kind === "video" && ratio ? Math.max(220, 160 * ratio) : 220}
        minHeight={kind === "audio" && !empty ? 108 : fittedMedia ? kind === "video" ? 160 : 1 : 176}
        maxHeight={kind === "audio" && !empty ? 108 : undefined}
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
      <NodeToolbar isVisible={selected} position={Position.Top} offset={Math.min(38, screenTop - 48)}>
        <div className="node-tools" data-node-id={id}>
          {!empty && <button title={kind==='text'?'编辑文本':'预览'} onClick={()=>action(id,kind==='text'?'edit':'preview')}>{kind==='text'?<Pencil size={13}/>:<Expand size={13}/>}</button>}

          {kind==='image' && <button aria-label="图片生成与编辑" disabled={active} onClick={()=>action(id,'image-generation')}><Sparkles size={13}/>生成图片</button>}
          {kind==='video' && <button aria-label="视频生成与参考编辑" disabled={active} onClick={()=>action(id,'video-generation')}><Sparkles size={13}/>生成视频</button>}
          {kind==='audio' && <button aria-label="语音合成" disabled={active} onClick={()=>action(id,'speech-generation')}><Sparkles size={13}/>合成语音</button>}
          {asset && (kind==='image'||kind==='video') && <button aria-label={kind==='image'?'图片工具':'视频工具'} onClick={()=>action(id,'media-tools')}><Scissors size={13}/>工具</button>}
          <NodeMore kind={kind} active={active} action={name=>action(id,name)}/>
        </div>
      </NodeToolbar>
      <div className={`node-content ${kind}`} style={{position:"relative"}}>
        {empty ? <div className="empty-node-content"><Icon size={28} strokeWidth={1.5}/><span>{({text:'编写或生成文本',image:'生成或上传图片',video:'生成或上传视频',audio:'合成语音或上传音频'})[kind]}</span><button className="nodrag nopan" onClick={e=>{e.stopPropagation();action(id,kind==='text'?'edit':'upload');}}>{kind==='text'?<Pencil size={13}/>:<Upload size={13}/>}{kind==='text'?'编写文本':`上传${kindNames[kind]}`}</button></div> : kind === "text" ? (
          <p className="text-preview">
            {String(data.text || '')}
          </p>
        ) : asset ? (
          kind === "image" ? (
            imageError ? <div className="node-load-error" role="status"><span>图片加载失败</span><button className="nodrag nopan" onClick={()=>{retryAsset();setRetry(v=>v+1);}}>重试加载</button></div> : <img key={retry} src={url} alt={String(data.title)} draggable={false} onError={()=>setImageError(true)}
              onLoad={event => mediaSize(id, asset.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} />
          ) : (
            <MediaPlayer
              key={asset.id}
              asset={asset}
              kind={kind === "video" ? "video" : "audio"}
              accessory={kind==='audio'?<button className="node-replace nodrag nopan" aria-label="替换素材" title="替换素材" onClick={()=>action(id,'replace')}><Replace size={12}/><span>替换</span></button>:undefined}
              onDimensions={(width, height) => mediaSize(id, asset.id, width, height)}
            />
          )
        ) : (
          <div className="node-load-error" role="status"><Icon size={28}/><span>素材暂时无法加载</span><button className="nodrag nopan" onClick={retryAsset}>重试加载</button></div>
        )}
        {active && <div className="node-task-overlay nodrag nopan" role="status"><strong>{statusLabel[job.status] || job.status}</strong><span>{job.stage}</span>{Number.isFinite(job.progress) && <><progress value={job.progress} max={1}/><span>{Math.round(job.progress*100)}%</span></>}<button disabled={job.status === 'cancel_requested'} onClick={() => action(id,'cancel-job')}>取消任务</button></div>}
      </div>
      {asset && kind !== "text" && kind !== "audio" && (
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
          <span className="badge">{job.simulation ? "模拟" : job.operation === "audio.speech.v1" ? "语音" : job.operation?.startsWith("image.") ? "图片" : job.operation?.startsWith("video.") ? "视频" : job.operation?.startsWith("media.") ? "媒体处理" : "文本"}</span>
          <span title={job.error || job.stage}>{statusLabel[job.status] || job.status}{active && job.stage ? ` · ${job.stage}` : ""}</span>
          {job.error && <span className="node-job-error" title={job.error}>{job.error}</span>}
          {["failed", "interrupted", "cancelled", "blocked"].includes(job.status) && <button className="nodrag nopan" aria-label="重试节点任务" onClick={() => action(id, "retry-job")}>重试</button>}
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

function NodeMore({kind,active,action}:{kind:Kind;active:boolean;action:(name:string)=>void}) {
  const anchor=useRef<HTMLButtonElement>(null),[open,setOpen]=useState(false);
  const run=(name:string)=>{setOpen(false);action(name);};
  return <><button ref={anchor} aria-label="更多节点操作" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>更多 ···</button>
    {open && <FloatingPanel anchor={anchor} title="节点操作" close={()=>setOpen(false)}><div className="node-action-menu">
      {kind!=='video' && kind!=='audio' && <button aria-label="视频生成与参考编辑" disabled={active} onClick={()=>run('video-generation')}>生成视频</button>}
      {kind==='text' && <><button aria-label="图片生成与编辑" disabled={active} onClick={()=>run('image-generation')}>生成图片</button><button aria-label="语音合成" disabled={active} onClick={()=>run('speech-generation')}>合成语音</button></>}
      <button onClick={()=>run('library')}>保存到素材库</button><button onClick={()=>run('duplicate')}>复制节点</button><button onClick={()=>run('rename')}>重命名</button><button onClick={()=>run('delete')}>删除节点</button>
    </div></FloatingPanel>}
  </>;
}

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { mediaUrl } from '../api';

export type ReferenceAsset = {id:string; kind:string; filename:string; url:string};
export function ReferenceCard({asset,title,detail,remove,children,empty=false}:{asset?:ReferenceAsset;title:string;detail?:string;remove:()=>void;children:ReactNode;empty?:boolean}) {
  return <article className="reference-card" data-kind={asset?.kind} aria-label={title}>
    <header><strong>{title}</strong>{!empty && <button aria-label={`移除${title}`} onClick={remove}><X size={12}/></button>}</header>
    {asset?.kind==='image' ? <img src={mediaUrl(asset.url)} alt={asset.filename}/> : asset?.kind==='video' ? <video src={mediaUrl(asset.url)} controls preload="metadata" aria-label={`预览${title}`}/> : asset?.kind==='audio' ? <audio src={mediaUrl(asset.url)} controls preload="metadata" aria-label={`试听${title}`}/> : null}
    {!empty && <span className="reference-filename" title={asset?.filename}>{asset?.filename || '素材已移除，请替换'}</span>}
    {detail && <small className="muted">{detail}</small>}
    <div className="reference-controls">{children}</div>
  </article>;
}

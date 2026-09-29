import { useState } from 'react';
import type { CanvasNode } from '../canvas';
import type { ContentVersion } from '../node-content';
import { mediaUrl } from '../api';
export function NodeVersions({ node, assets, restore, branch }: { node: CanvasNode; assets: Record<string, any>; restore: (v: ContentVersion) => void; branch: (v: ContentVersion) => void }) {
  const [open,setOpen] = useState(false), [limit,setLimit] = useState(20);
  const versions = node.data.versions || [];
  if (!versions.length) return null;
  return <details className="node-versions" onToggle={e => setOpen(e.currentTarget.open)}><summary>历史版本 · {versions.length}</summary>{open && <div>
    {[...versions].reverse().slice(0,limit).map((v,i) => { const asset = v.assetId ? assets[v.assetId] : null; const current = v.assetId ? v.assetId === node.data.assetId : v.text === node.data.text;
      return <article key={v.id}>
        {asset?.kind === 'image' && <img src={mediaUrl(asset.url)} loading="lazy" alt={`版本 ${versions.length-i}`}/>}
        {asset?.kind === 'video' && <video src={mediaUrl(asset.url)} controls preload="none"/>}
        {asset?.kind === 'audio' && <audio src={mediaUrl(asset.url)} controls preload="none"/>}
        {v.kind === 'text' && <p>{v.text}</p>}
        <small>版本 {versions.length-i} · {new Date(v.createdAt).toLocaleString()}{current ? ' · 当前' : ''}</small>
        <div><button disabled={current || v.kind !== node.data.kind} onClick={() => restore(v)}>采用此版本</button><button onClick={() => branch(v)}>另存为新节点</button>
          {asset && <a href={mediaUrl(asset.downloadUrl || asset.url)} download={asset.filename}>下载</a>}</div>
      </article>;
    })}
  {limit < versions.length && <button onClick={() => setLimit(n => n+20)}>加载更多版本</button>}
  </div>}</details>;
}

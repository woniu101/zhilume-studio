import { useState } from 'react';
import { AudioLines, Check, Film, ImageIcon, Search } from 'lucide-react';
import { mediaUrl } from '../api';
import type { ReferenceAsset } from './ReferenceCard';
import './reference-browser.css';

/** Shared reference selection; uploads and role-specific clip settings stay with the caller. */
export function ReferenceBrowser({ assets, label, selectedIds = [], disabled = false, choose }: {
  assets: ReferenceAsset[]; label: string; selectedIds?: string[]; disabled?: boolean;
  choose: (asset: ReferenceAsset) => void;
}) {
  const [query, setQuery] = useState(''), [limit, setLimit] = useState(24), [previewId, setPreviewId] = useState('');
  const matches = assets.filter(a => a.filename.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const preview = assets.find(a => a.id === previewId);
  return <section className="reference-browser" role="group" aria-label={label}>
    <div className="reference-browser-search"><Search size={15} aria-hidden="true"/><input type="search" aria-label="搜索素材" placeholder="搜索素材名称…" value={query} onChange={e => { setQuery(e.target.value); setLimit(24); setPreviewId(''); }}/></div>
    <small className="muted" role="status">{matches.length} 份素材{selectedIds.length ? ` · 已选 ${selectedIds.length}` : ''}</small>
    {!matches.length && <p className="reference-browser-empty">{query.trim() ? '没有匹配的素材，请尝试其他名称。' : '暂无可用素材，可上传文件或拖入参考区域。'}</p>}
    {preview && <section className="reference-browser-player" aria-label="素材预览">
      <header><span title={preview.filename}>{preview.filename}</span><button type="button" aria-label="关闭素材预览" onClick={() => setPreviewId('')}>收起</button></header>
      {preview.kind === 'image' ? <img src={mediaUrl(preview.url)} alt={preview.filename}/> : preview.kind === 'video' ? <video key={preview.id} src={mediaUrl(preview.url)} controls preload="metadata" aria-label="预览参考视频"/> : <audio key={preview.id} src={mediaUrl(preview.url)} controls preload="metadata" aria-label="试听参考音频"/>}
      <small className="muted">预览原素材；点击素材卡片后才会选为参考。</small>
    </section>}
    <div className="reference-browser-grid">
      {matches.slice(0, limit).map(asset => {
        const selected = selectedIds.includes(asset.id);
        return <article key={asset.id} data-selected={selected || undefined}>
          <button type="button" className="reference-browser-choice" data-asset-id={asset.id} aria-label={`选择 ${asset.filename}`} aria-pressed={selected} disabled={disabled || selected} onClick={() => { setPreviewId(''); choose(asset); }}>
            <ReferenceThumbnail asset={asset}/>
            <span title={asset.filename}>{asset.filename}</span>
            {selected && <Check className="reference-browser-check" size={15} aria-hidden="true"/>}
          </button>
          <button type="button" className="reference-browser-preview" aria-label={`预览 ${asset.filename}`} aria-expanded={previewId === asset.id} onClick={() => setPreviewId(previewId === asset.id ? '' : asset.id)}>{asset.kind === 'audio' ? '试听' : '预览'}</button>
        </article>;
      })}
    </div>
    {matches.length > limit && <button type="button" onClick={() => setLimit(n => n + 24)}>显示更多（剩余 {matches.length - limit}）</button>}

  </section>;
}

function ReferenceThumbnail({ asset }: { asset: ReferenceAsset }) {
  const [failed, setFailed] = useState(false);
  const Icon = asset.kind === 'audio' ? AudioLines : asset.kind === 'video' ? Film : ImageIcon;
  return <span className="reference-browser-thumbnail">
    {asset.kind === 'image' && !failed ? <img src={mediaUrl(asset.url)} alt="" loading="lazy" onError={() => setFailed(true)}/> : <Icon size={26} aria-hidden="true"/>}
  </span>;
}

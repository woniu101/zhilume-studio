import { useContext, useEffect, useRef, useState } from 'react';
import { AudioLines, Check, Film, ImageIcon, Search } from 'lucide-react';
import { api, mediaUrl } from '../api';
import { AssetCatalog, assetDetails } from '../asset-catalog';
import type { ReferenceAsset } from './ReferenceCard';
import './reference-browser.css';

/** Shared reference selection; uploads and role-specific clip settings stay with the caller. */
export function ReferenceBrowser({ kinds, label, selectedIds = [], disabled = false, choose }: {
  kinds: string[]; label: string; selectedIds?: string[]; disabled?: boolean;
  choose: (asset: ReferenceAsset) => void;
}) {
  const catalog = useContext(AssetCatalog);
  const [query, setQuery] = useState(''), [source, setSource] = useState('service'), [previewId, setPreviewId] = useState('');
  const [matches, setMatches] = useState<ReferenceAsset[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const version = useRef(0);
  const filter = JSON.stringify({ source, projectId: catalog.projectId, kinds, q: query, ...(source === 'canvas' ? { assetIds: catalog.canvasIds } : {}) });
  async function load(next: string | null, generation: number) {
    setLoading(true); setError('');
    try {
      const page = await api('/assets/query', 'POST', { ...JSON.parse(filter), cursor: next });
      if (generation !== version.current) return;
      setMatches(previous => next ? [...previous, ...page.items.filter((a: ReferenceAsset) => !previous.some(p => p.id === a.id))] : page.items);
      setCursor(page.nextCursor);
    } catch (e: any) { if (generation === version.current) setError(e.message); }
    finally { if (generation === version.current) setLoading(false); }
  }
  useEffect(() => {
    const generation = ++version.current;
    setPreviewId(''); setMatches([]); setCursor(null); setLoading(true); setError('');
    const timer = setTimeout(() => void load(null, generation), 200);
    return () => { clearTimeout(timer); version.current++; };
  }, [filter, attempt]);
  const preview = matches.find(a => a.id === previewId);
  return <section className="reference-browser" role="group" aria-label={label}>
    <div className="reference-browser-sources" role="group" aria-label="素材来源">{[['canvas','当前画布'],['library','项目收藏'],['service','服务素材']].map(([value,title]) => <button key={value} type="button" aria-pressed={source === value} onClick={() => setSource(value)}>{title}</button>)}</div>
    <div className="reference-browser-search"><Search size={15} aria-hidden="true"/><input type="search" aria-label="搜索素材" placeholder="搜索素材名称…" value={query} onChange={e => { setQuery(e.target.value); setPreviewId(''); }}/></div>
    <small className="muted" role="status">{loading ? '正在加载…' : `已显示 ${matches.length} 份素材`}{selectedIds.length ? ` · 已选 ${selectedIds.length}` : ''}</small>
    {error && <div role="alert">{error} <button onClick={() => cursor ? void load(cursor, version.current) : setAttempt(n => n + 1)}>重试</button></div>}
    {!loading && !error && !matches.length && <p className="reference-browser-empty">{query.trim() ? '没有匹配的素材，请尝试其他名称。' : '此来源暂无可用素材，可切换来源或上传文件。'}</p>}
    {preview && <section className="reference-browser-player" aria-label="素材预览">
      <header><span title={preview.filename}>{preview.filename}</span><button type="button" aria-label="关闭素材预览" onClick={() => setPreviewId('')}>收起</button></header>
      {preview.kind === 'image' ? <img src={mediaUrl(preview.url)} alt={preview.filename}/> : preview.kind === 'video' ? <video key={preview.id} src={mediaUrl(preview.url)} controls preload="metadata" aria-label="预览参考视频"/> : <audio key={preview.id} src={mediaUrl(preview.url)} controls preload="metadata" aria-label="试听参考音频"/>}
      <small className="muted">预览原素材；点击素材卡片后才会选为参考。</small>
    </section>}
    <div className="reference-browser-grid">
      {matches.map(asset => {
        const selected = selectedIds.includes(asset.id);
        return <article key={asset.id} data-selected={selected || undefined}>
          <button type="button" className="reference-browser-choice" data-asset-id={asset.id} aria-label={`选择 ${asset.filename}`} aria-pressed={selected} disabled={disabled || selected} onClick={() => { setPreviewId(''); catalog.remember(asset); choose(asset); }}>
            <ReferenceThumbnail asset={asset}/>
            <span title={asset.filename}>{asset.filename}</span>
            <small className="reference-browser-details" title={assetDetails(asset)}>{assetDetails(asset)}</small>
            {selected && <Check className="reference-browser-check" size={15} aria-hidden="true"/>}
          </button>
          <button type="button" className="reference-browser-preview" aria-label={`预览 ${asset.filename}`} aria-expanded={previewId === asset.id} onClick={() => setPreviewId(previewId === asset.id ? '' : asset.id)}>{asset.kind === 'audio' ? '试听' : '预览'}</button>
        </article>;
      })}
    </div>
    {cursor && <button type="button" disabled={loading} onClick={() => void load(cursor, version.current)}>显示更多</button>}

  </section>;
}

function ReferenceThumbnail({ asset }: { asset: ReferenceAsset }) {
  const [failed, setFailed] = useState(false);
  const Icon = asset.kind === 'audio' ? AudioLines : asset.kind === 'video' ? Film : ImageIcon;
  return <span className="reference-browser-thumbnail">
    {asset.kind === 'image' && !failed ? <img src={mediaUrl(asset.url)} alt="" loading="lazy" onError={() => setFailed(true)}/> : <Icon size={26} aria-hidden="true"/>}
  </span>;
}

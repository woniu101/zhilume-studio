import { createContext } from 'react';
import { api } from './api';
import type { ReferenceAsset } from './generation/ReferenceCard';

export const AssetCatalog = createContext<{ projectId: string; canvasIds: string[]; remember: (asset: ReferenceAsset) => void }>({ projectId: '', canvasIds: [], remember: () => {} });

export async function resolveAssets(ids: string[], request = api) {
  const result: ReferenceAsset[] = [];
  for (let offset = 0; offset < ids.length; offset += 512) result.push(...await request('/assets/resolve', 'POST', { ids: ids.slice(offset, offset + 512) }));
  return result;
}

export function assetDetails(asset: ReferenceAsset) {
  const m = asset.metadata;
  return [({ image: '图片', video: '视频', audio: '音频', text: '文本' })[asset.kind],
    m?.width && m.height ? `${m.width} × ${m.height}` : '',
    m?.duration !== undefined ? `${Math.floor(m.duration / 60)}:${String(Math.floor(m.duration % 60)).padStart(2, '0')}` : '',
    asset.size !== undefined ? asset.size >= 1048576 ? `${(asset.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(asset.size / 1024))} KB` : '',
  ].filter(Boolean).join(' · ');
}

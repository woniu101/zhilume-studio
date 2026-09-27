export type VideoReference = { role: 'image' | 'video' | 'audio'; assetId: string; start: number; frames: number };
export type VideoDraft = {
  modelId: string; profileId: string; mode: string; prompt: string; firstFrameId: string; lastFrameId: string;
  references: VideoReference[]; width: number; height: number; frames: number; steps: number; seed: number; includeAudio: boolean;
  request?: { id: string; fingerprint: string };
};
export const initialVideoDraft = (prompt = '', references: VideoReference[] = []): VideoDraft => {
  const reference = references.length > 2 || references.some(r => r.role !== 'image');
  return { modelId: reference ? 'minimax-h3-ref2va' : 'minimax-h3-fl2va', profileId: '', mode: reference ? 'reference' : references.length > 1 ? 'first-last' : references.length ? 'first' : 'text',
    prompt, firstFrameId: references.find(r => r.role === 'image')?.assetId || '', lastFrameId: references.filter(r => r.role === 'image')[1]?.assetId || '',
    references, width:512, height:288, frames:124, steps:20, seed:0, includeAudio:true };
};
export const videoReferences = (d: VideoDraft) => d.mode === 'reference' ? d.references.map(r => r.role === 'image' ? { role:r.role,assetId:r.assetId } : r)
  : [...(['first','first-last'].includes(d.mode) ? [{ role:'first',assetId:d.firstFrameId }] : []), ...(['last','first-last'].includes(d.mode) ? [{ role:'last',assetId:d.lastFrameId }] : [])];
export const frameLabel = (frames: number) => `${(frames / 24).toFixed(2)} 秒 · ${frames} 帧`;

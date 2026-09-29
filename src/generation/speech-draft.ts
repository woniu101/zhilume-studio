export type AudioClip = { assetId: string; start: number; end: number };
export type SpeechDraft = {
  targetWorkerId?: string;
  modelId: string; profileId: string; text: string; language: string; speed: number;
  speaker: AudioClip; emotionReference: AudioClip; emotionMode: string; emotionAlpha: number; emotionText: string; emotionVector: number[];
  request?: { id: string; fingerprint: string };
};
export const initialSpeechDraft = (text = '', assetId = ''): SpeechDraft => ({
  modelId: 'indextts-2.5', profileId: '', text, language: 'ZH', speed: 1,
  speaker: { assetId, start: 0, end: 10 }, emotionReference: { assetId: '', start: 0, end: 10 },
  emotionMode: 'follow', emotionAlpha: .6, emotionText: '', emotionVector: Array(8).fill(0),
});

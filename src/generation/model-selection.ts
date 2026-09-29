/** Used only for an unconfigured draft; saved specs never fall back to another model. */
export function initialProfile<T extends { readyCount?: number }>(profiles: T[]): T | undefined {
  return profiles.find(p => (p.readyCount || 0) > 0) || profiles[0];
}
export type LanguageSelection = { profileId: string; targetWorkerId: string; request?: {id: string; fingerprint: string} };

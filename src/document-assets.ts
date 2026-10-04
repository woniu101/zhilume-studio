/** Resolve content, saved reference drafts and version history without listing the service. */
export function documentAssetIds(nodes: { data: unknown }[]): string[] {
  const ids = new Set<string>();
  const visit = (value: any, key = '') => {
    if (typeof value === 'string' && ['assetId', 'firstFrameId', 'lastFrameId', 'refs', 'referenceAssetIds'].includes(key) && value) ids.add(value);
    else if (Array.isArray(value)) value.forEach(v => visit(v, key));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k,v]) => visit(v,k));
  };
  nodes.forEach(n => visit(n.data));
  return [...ids];
}

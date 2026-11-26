// Canonical JSON: sorted keys, maps and sets as sorted entry lists. For fingerprints only.
export function stableJson(v: unknown): string {
  const norm = (x: unknown): unknown => {
    if (x instanceof Map) return { $map: [...x.entries()].map(([k, y]) => [norm(k), norm(y)]).sort((a, b) => (JSON.stringify(a[0]) < JSON.stringify(b[0]) ? -1 : 1)) };
    if (x instanceof Set) return { $set: [...x].map(norm).sort() };
    if (Array.isArray(x)) return x.map(norm);
    if (x !== null && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map((k) => [k, norm((x as Record<string, unknown>)[k])]));
    return x;
  };
  return JSON.stringify(norm(v));
}

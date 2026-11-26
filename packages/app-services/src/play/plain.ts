// Maps and sets as plain JSON for the save (P5): a packed world (loop.packWorld) holds both. Each becomes a
// tagged object; decoding restores them, so a world round-trips through JSON.stringify with its world hash.
const MAP = '__map', SET = '__set';

export function encodePlain(v: unknown): unknown {
  if (v instanceof Map) return { [MAP]: [...v].map(([k, x]) => [encodePlain(k), encodePlain(x)]) };
  if (v instanceof Set) return { [SET]: [...v].map(encodePlain) };
  if (Array.isArray(v)) return v.map(encodePlain);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = encodePlain(x);
    return out;
  }
  return v;
}

export function decodePlain(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decodePlain);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (MAP in o && Object.keys(o).length === 1) return new Map((o[MAP] as [unknown, unknown][]).map(([k, x]) => [decodePlain(k), decodePlain(x)]));
    if (SET in o && Object.keys(o).length === 1) return new Set((o[SET] as unknown[]).map(decodePlain));
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) out[k] = decodePlain(x);
    return out;
  }
  return v;
}

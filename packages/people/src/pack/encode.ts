// Write a pack back to files (U7.1.2): pack.json and one CSV per table, columns in schema order, rows sorted
// the same way the checksum sorts them, so two exports of the same people are byte for byte equal.
// Putting the files into a zip (deflate) is the container layer's job, outside this core package.
import { canonicalColumns } from './checksum.ts';
import { writeCsv } from './csv.ts';
import { TABLE_BY_NAME, TABLE_ORDER } from './spec.ts';
import type { PackData, PackFile } from './types.ts';

const ENC = new TextEncoder();

function sortedJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortedJson);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, sortedJson(x)]));
  }
  return v;
}

export function encodePack(pack: PackData): PackFile[] {
  const files: PackFile[] = [{ path: 'pack.json', bytes: ENC.encode(`${JSON.stringify(sortedJson(pack.manifest), null, 2)}\n`) }];
  for (const name of TABLE_ORDER) {
    const t = pack.tables[name];
    if (!t || t.rows.length === 0) continue;
    const cols = canonicalColumns(t);
    const keyCol = TABLE_BY_NAME.get(name)?.columns[0]?.name ?? cols[0]!;
    const seasonLike = cols.includes('season');
    const rows = [...t.rows].sort((a, b) => {
      const ka = a[keyCol] ?? '', kb = b[keyCol] ?? '';
      if (ka !== kb) return ka < kb ? -1 : 1;
      if (seasonLike) { const d = Number(a['season']) - Number(b['season']); if (d !== 0) return d; }
      const ra = cols.map((c) => a[c] ?? '').join('\u0001'), rb = cols.map((c) => b[c] ?? '').join('\u0001');
      return ra < rb ? -1 : ra > rb ? 1 : 0;
    });
    files.push({ path: `${name}.csv`, bytes: ENC.encode(writeCsv(cols, rows.map((r) => cols.map((c) => r[c] ?? '')))) });
  }
  return files;
}

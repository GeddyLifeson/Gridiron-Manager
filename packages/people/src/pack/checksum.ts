// The pack checksum (U7.3.1): the SHA-256 of a canonical text of the resolved people set. Tables sorted by
// name, rows sorted by source key then season, columns in schema order, blanks empty, numbers in fixed
// format. It does not depend on file order, column order, zip settings or line endings, and it leaves out
// the manifest (name, version, author) because the record compares the people, not their labels.
import { PARAMS, TABLE_BY_NAME, TABLE_ORDER, type TableSpec } from './spec.ts';
import { sha256Hex } from './sha256.ts';
import type { PackData, PackRow, PackTable } from './types.ts';

const ENC = new TextEncoder();

/** Fixed number format: the shortest decimal that reads back to the same number, no exponent, -0 as 0. */
export function canonicalNumber(text: string): string {
  const t = text.trim();
  if (t === '') return '';
  const n = Number(t);
  if (!Number.isFinite(n)) return t;
  if (Number.isInteger(n)) return String(n === 0 ? 0 : n);
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
}

function keyColumns(spec: TableSpec | undefined): string[] {
  if (!spec) return [];
  const first = spec.columns[0]?.name;
  return first ? [first] : [];
}

/** Columns of a table in canonical order: schema columns, then extra statistic columns by name. */
export function canonicalColumns(table: PackTable): string[] {
  const spec = TABLE_BY_NAME.get(table.name);
  const known = spec ? spec.columns.map((c) => c.name) : [];
  const extra = table.columns.filter((c) => !known.includes(c)).sort();
  return [...known.filter((c) => table.columns.includes(c)), ...extra];
}

function rowSortKey(spec: TableSpec | undefined, cols: string[], row: PackRow): [string, number, string] {
  const keys = keyColumns(spec).map((c) => row[c] ?? '');
  const second = spec?.columns.find((c) => c.name === 'season') ? Number(row['season'] ?? '0') : 0;
  const rest = cols.map((c) => row[c] ?? '').join('\u0001');
  return [keys.join('\u0001'), Number.isFinite(second) ? second : 0, rest];
}

function cmp(a: [string, number, string], b: [string, number, string]): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0;
}

/** The canonical text that is hashed. Exposed for tests and for the importer's debug output. */
export function canonicalText(pack: PackData): string {
  const lines: string[] = [];
  for (const name of TABLE_ORDER) {
    const table = pack.tables[name];
    if (!table || table.rows.length === 0) continue;
    const spec = TABLE_BY_NAME.get(name);
    const cols = canonicalColumns(table);
    lines.push(JSON.stringify(['#table', name, cols]));
    const kinds = new Map((spec?.columns ?? []).map((c) => [c.name, c.kind] as const));
    const sorted = table.rows
      .map((r) => ({ r, k: rowSortKey(spec, cols, r) }))
      .sort((a, b) => cmp(a.k, b.k));
    for (const { r } of sorted) {
      lines.push(
        JSON.stringify(
          cols.map((c) => {
            const v = r[c] ?? '';
            const kind = kinds.get(c);
            return kind === 'int' || kind === 'num' || (kind === undefined && name === 'player_seasons') ? canonicalNumber(v) : v;
          }),
        ),
      );
    }
  }
  return lines.join('\n');
}

export function packChecksum(pack: PackData): string {
  return sha256Hex(ENC.encode(canonicalText(pack)));
}

export function shortChecksum(full: string): string {
  return full.slice(0, PARAMS.checksumShortChars.value);
}

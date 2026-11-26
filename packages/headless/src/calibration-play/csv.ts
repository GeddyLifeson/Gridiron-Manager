// A small reader for comma-separated public data files (RFC 4180 quoting: a field in double quotes may
// hold commas, line breaks and doubled quotes). It reads bytes, so a season file never becomes one
// large string, and it decodes only the columns asked for.
export type CsvRecord = Record<string, string>;

const QUOTE = 34, COMMA = 44, LF = 10, CR = 13;

/** Calls `onRecord` once per data row with the wanted columns. A column the file lacks is reported in the result. */
export function readCsv(bytes: Uint8Array, wanted: readonly string[], onRecord: (r: CsvRecord) => void): { rows: number; missing: string[] } {
  const dec = new TextDecoder('utf-8');
  let header: string[] | null = null;
  let pick: (string | null)[] = [];
  let missing: string[] = [];
  let rows = 0;
  let col = 0, start = 0, inQuotes = false, quoted = false;
  let rec: CsvRecord = {};
  const want = new Set(wanted);
  const names: string[] = [];
  const field = (end: number): string => {
    let s = dec.decode(bytes.subarray(quoted ? start + 1 : start, quoted ? end - 1 : end));
    if (quoted && s.includes('""')) s = s.replaceAll('""', '"');
    return s;
  };
  const endField = (end: number): void => {
    if (header === null) names.push(field(end));
    else { const name = pick[col]; if (name) rec[name] = field(end); }
    col++; quoted = false;
  };
  const endRecord = (): void => {
    if (header === null) {
      header = names;
      pick = header.map((n) => (want.has(n) ? n : null));
      missing = wanted.filter((w) => !header!.includes(w));
    } else if (col > 1 || Object.keys(rec).length > 0) { onRecord(rec); rows++; }
    rec = {}; col = 0;
  };
  const n = bytes.length;
  for (let i = 0; i < n; i++) {
    const c = bytes[i]!;
    if (inQuotes) {
      if (c === QUOTE) { if (bytes[i + 1] === QUOTE) i++; else inQuotes = false; }
      continue;
    }
    if (c === QUOTE && i === start) { inQuotes = true; quoted = true; continue; }
    if (c === COMMA) { endField(i); start = i + 1; continue; }
    if (c === LF) {
      const end = i > start && bytes[i - 1] === CR ? i - 1 : i;
      if (!(col === 0 && end === start)) { endField(end); endRecord(); }
      start = i + 1;
    }
  }
  if (start < n) { endField(n); endRecord(); }
  return { rows, missing };
}

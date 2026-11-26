// Table exports (P5.7.2: statistics, tendencies, grades as CSV). RFC 4180: comma separator, CRLF
// line ends, fields with a comma, quote or line break wrapped in quotes and inner quotes doubled.
// Numbers are written with String(), never a locale format, so a file reads the same everywhere.

export interface CsvColumn<Row> {
  readonly label: string;
  readonly value: (row: Row) => string | number | boolean | null | undefined;
}

export interface CsvOptions {
  /**
   * Prefix text cells that start with = + - @ or a tab with an apostrophe, so a spreadsheet shows
   * them as text instead of running them as formulas. Numbers are never prefixed. Default true.
   */
  readonly guardFormulas?: boolean;
}

function cell(v: string | number | boolean | null | undefined, guard: boolean): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    s = String(v);
  } else if (typeof v === 'boolean') s = v ? 'true' : 'false';
  else {
    s = v;
    if (guard && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  }
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<Row>(columns: readonly CsvColumn<Row>[], rows: readonly Row[], o: CsvOptions = {}): string {
  const guard = o.guardFormulas ?? true;
  const lines = [columns.map((c) => cell(c.label, guard)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(c.value(r), guard)).join(','));
  return lines.join('\r\n') + '\r\n';
}

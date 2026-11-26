// RFC 4180 style CSV (U7.1.2): comma separated, double-quote escaping, header row, UTF-8 without byte-order
// mark. No cell is ever evaluated: a cell that starts with = + - @ is read as text, and the writer puts
// an apostrophe in front of such a cell so a spreadsheet does not run it.

const FORMULA_START = /^'*[=+\-@]/;
const ESCAPED_FORMULA = /^'+[=+\-@]/;

/** Reads a cell as plain text: removes the one apostrophe the writer added in front of a formula-looking cell. */
export function readCell(raw: string): string {
  return ESCAPED_FORMULA.test(raw) ? raw.slice(1) : raw;
}

/** Writes a cell so a spreadsheet will not evaluate it. Round trips with `readCell`. */
export function writeCell(text: string): string {
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface CsvParse { rows: string[][]; error?: string }

/** Splits CSV text into rows of raw cells (quotes resolved, formula apostrophes still present). */
export function parseCsv(text: string): CsvParse {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  let cellStarted = false;
  while (i < n) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === '' && !cellStarted) { inQuotes = true; cellStarted = true; i++; continue; }
    if (ch === ',') { row.push(cell); cell = ''; cellStarted = false; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = ''; cellStarted = false; i++;
      rows.push(row); row = [];
      continue;
    }
    cell += ch; cellStarted = true; i++;
  }
  if (inQuotes) return { rows, error: 'unterminated quoted cell' };
  if (cell !== '' || cellStarted || row.length > 0) { row.push(cell); rows.push(row); }
  // A blank line is a row with one empty cell: drop those.
  return { rows: rows.filter((r) => !(r.length === 1 && r[0] === '')) };
}

export function writeCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [header.map(writeCell).join(',')];
  for (const r of rows) lines.push(r.map(writeCell).join(','));
  return `${lines.join('\n')}\n`;
}

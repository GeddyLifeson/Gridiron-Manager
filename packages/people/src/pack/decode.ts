// Decode and validate a people pack (U7.1.2, U7.3.2, P7.2.1, P7.3.1, A6.3.1).
// Input: the files of one pack (the zip or folder reader lives outside this core package).
// Output: an import report, and the pack when it did not fail. A pack that fails is never partly returned.
//
// Result classes (U7.3.2): fail (whole pack refused), reject (row skipped), drop (column removed),
// warn (reported, continues).
import {
  FORBIDDEN_WORDS, MANIFEST_SPEC, PACK_SCHEMA_ID, PACK_SCHEMA_VERSION, PARAMS, POSITIONS, POSITION_ALIASES,
  TABLE_BY_NAME, type ColumnSpec, type TableSpec,
} from './spec.ts';
import { parseCsv, readCell } from './csv.ts';
import { canonicalColumns, canonicalNumber, packChecksum, shortChecksum } from './checksum.ts';
import { isEventName, protectedTypeOf, words } from './protected.ts';
import type {
  ImportReport, PackData, PackFile, PackManifest, PackProblem, PackRow, PackTable, TableCount, ValidateOptions,
} from './types.ts';

const DECODER = new TextDecoder('utf-8', { fatal: true });
const WEB_ADDRESS = /(https?:\/\/|\bwww\.|\bftp:\/\/)/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const INT = /^-?\d+$/;
const NUM = /^-?(\d+\.?\d*|\.\d+)$/;

export interface DecodeResult { report: ImportReport; pack?: PackData }

// ---------- file level ----------

function normalisePath(p: string): string | undefined {
  const s = p.replace(/\\/g, '/');
  if (s.startsWith('/') || /^[A-Za-z]:/.test(s)) return undefined;
  const parts = s.split('/').filter((x) => x !== '' && x !== '.');
  if (parts.some((x) => x === '..')) return undefined;
  return parts.join('/');
}

/** Limits on entry names and sizes. A zip reader calls this with the zip directory before it extracts anything. */
export function checkEntryLimits(entries: readonly { path: string; size: number; compressedBytes?: number }[]): PackProblem[] {
  const problems: PackProblem[] = [];
  let total = 0;
  for (const e of entries) {
    const norm = normalisePath(e.path);
    if (norm === undefined) { problems.push({ severity: 'fail', code: 'path_escape', file: e.path, message: `Path leaves the pack folder: ${e.path}` }); continue; }
    if (norm.split('/').length - 1 > PARAMS.maxFolderDepth.value) problems.push({ severity: 'fail', code: 'limit_depth', file: e.path, message: `Folder depth over ${PARAMS.maxFolderDepth.value}: ${e.path}` });
    if (e.size > PARAMS.maxFileBytes.value) problems.push({ severity: 'fail', code: 'limit_file_size', file: e.path, message: `File over ${PARAMS.maxFileBytes.value} bytes: ${e.path}` });
    if (e.compressedBytes !== undefined && e.compressedBytes > 0 && e.size / e.compressedBytes > PARAMS.maxExpansionRatio.value) {
      problems.push({ severity: 'fail', code: 'limit_expansion', file: e.path, message: `Expansion ratio over ${PARAMS.maxExpansionRatio.value} to 1: ${e.path}` });
    }
    total += e.size;
  }
  if (total > PARAMS.maxPackBytes.value) problems.push({ severity: 'fail', code: 'limit_pack_size', message: `Pack over ${PARAMS.maxPackBytes.value} bytes unzipped` });
  return problems;
}

// ---------- value checks ----------

function validIsoDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]!;
  return d <= dim;
}

/** Why a cell is not acceptable for its column, or undefined. Blank cells are handled by the caller. */
function cellError(col: ColumnSpec, v: string): string | undefined {
  switch (col.kind) {
    case 'int': return INT.test(v) ? undefined : `${col.name} is not a whole number: "${v}"`;
    case 'num': return NUM.test(v) && Number.isFinite(Number(v)) ? undefined : `${col.name} is not a number: "${v}"`;
    case 'iso_date': return validIsoDate(v) ? undefined : `${col.name} is not an ISO date (YYYY-MM-DD): "${v}"`;
    case 'enum': return col.values!.includes(v) ? undefined : `${col.name} must be one of ${col.values!.join(', ')}: "${v}"`;
    case 'key_list':
    case 'text':
      if (v.length > PARAMS.maxStringChars.value) return `${col.name} is longer than ${PARAMS.maxStringChars.value} characters`;
      if (WEB_ADDRESS.test(v)) return `${col.name} holds a web address; nothing in a pack may name one (P7.2.1)`;
      return undefined;
  }
}

function forbiddenGroup(column: string): string | undefined {
  for (const w of words(column)) {
    const g = FORBIDDEN_WORDS.get(w);
    if (g) return g;
  }
  return undefined;
}

function positionLookup(extra: Record<string, string> | undefined): (raw: string) => string | undefined {
  const aliases: Record<string, string> = { ...POSITION_ALIASES, ...(extra ?? {}) };
  return (raw) => {
    const k = raw.toUpperCase().replace(/[.\s]+/g, '');
    if (POSITIONS.has(k)) return k;
    const a = aliases[k] ?? aliases[raw.toUpperCase().trim()];
    return a !== undefined && POSITIONS.has(a) ? a : undefined;
  };
}

// ---------- manifest ----------

function readManifest(text: string, problems: PackProblem[]): PackManifest | undefined {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { problems.push({ severity: 'fail', code: 'manifest_json', file: 'pack.json', message: 'pack.json is not valid JSON' }); return undefined; }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) { problems.push({ severity: 'fail', code: 'manifest_json', file: 'pack.json', message: 'pack.json must hold one object' }); return undefined; }
  const m = raw as Record<string, unknown>;
  if (m['schema_id'] !== PACK_SCHEMA_ID || m['schema_version'] !== PACK_SCHEMA_VERSION) {
    problems.push({ severity: 'fail', code: 'unknown_schema_version', file: 'pack.json', message: `Unknown pack format ${String(m['schema_id'])} version ${String(m['schema_version'])}; this build reads ${PACK_SCHEMA_ID} version ${PACK_SCHEMA_VERSION}` });
    return undefined;
  }
  let ok = true;
  for (const k of MANIFEST_SPEC.required) {
    if (k === 'schema_version') continue;
    if (typeof m[k] !== 'string' || (m[k] as string).trim() === '') { problems.push({ severity: 'fail', code: 'manifest_field', file: 'pack.json', message: `pack.json is missing "${k}"` }); ok = false; }
  }
  const enums: [string, string[]][] = [['contains', MANIFEST_SPEC.contains_values], ['team_names', MANIFEST_SPEC.team_names_values], ['redistribution', MANIFEST_SPEC.redistribution_values]];
  for (const [k, allowed] of enums) {
    if (m[k] !== undefined && !allowed.includes(m[k] as string)) { problems.push({ severity: 'fail', code: 'manifest_field', file: 'pack.json', message: `pack.json "${k}" must be one of ${allowed.join(', ')}` }); ok = false; }
  }
  for (const k of ['name', 'author', 'source_statement', 'pack_id', 'version']) {
    if (typeof m[k] === 'string' && (m[k] as string).length > PARAMS.maxStringChars.value * 10) { problems.push({ severity: 'fail', code: 'manifest_field', file: 'pack.json', message: `pack.json "${k}" is too long` }); ok = false; }
  }
  const base = m['base'];
  if (base !== undefined) {
    const b = base as Record<string, unknown>;
    if (b === null || typeof b !== 'object' || typeof b['id'] !== 'string' || typeof b['hash'] !== 'string') { problems.push({ severity: 'fail', code: 'manifest_field', file: 'pack.json', message: 'pack.json "base" needs "id" and "hash"' }); ok = false; }
  }
  if (m['counts'] !== undefined) {
    const c = m['counts'] as Record<string, unknown>;
    if (c === null || typeof c !== 'object' || Object.values(c).some((x) => typeof x !== 'number')) { problems.push({ severity: 'fail', code: 'manifest_field', file: 'pack.json', message: 'pack.json "counts" must map names to numbers' }); ok = false; }
  }
  if (!ok) return undefined;
  const out: PackManifest = {
    schema_id: PACK_SCHEMA_ID, schema_version: PACK_SCHEMA_VERSION, pack_id: m['pack_id'] as string, name: m['name'] as string,
    version: m['version'] as string, author: m['author'] as string, contains: m['contains'] as PackManifest['contains'],
    source_statement: m['source_statement'] as string,
  };
  for (const k of ['snapshot_date', 'seasons_covered', 'seasons_skipped'] as const) if (typeof m[k] === 'string') out[k] = m[k] as string;
  if (m['team_names'] !== undefined) out.team_names = m['team_names'] as 'plain' | 'omitted';
  if (m['redistribution'] !== undefined) out.redistribution = m['redistribution'] as 'yes' | 'no';
  if (base !== undefined) out.base = { id: (base as { id: string }).id, hash: (base as { hash: string }).hash };
  if (m['counts'] !== undefined) out.counts = { ...(m['counts'] as Record<string, number>) };
  return out;
}

// ---------- table ----------

interface TableContext {
  spec: TableSpec;
  file: string;
  problems: PackProblem[];
  dropped: { table: string; column: string; reason: string }[];
  opts: ValidateOptions;
  position: (raw: string) => string | undefined;
}

function decodeTable(text: string, ctx: TableContext): { table: PackTable; count: TableCount } | 'fail' {
  const { spec, file, problems } = ctx;
  const parsed = parseCsv(text.startsWith('﻿') ? text.slice(1) : text);
  if (text.startsWith('﻿')) problems.push({ severity: 'warn', code: 'bom', file, table: spec.name, message: `${file} starts with a byte-order mark; it was ignored` });
  if (parsed.error) { problems.push({ severity: 'fail', code: 'csv_syntax', file, table: spec.name, message: `${file}: ${parsed.error}` }); return 'fail'; }
  const headerRaw = parsed.rows[0];
  const emptyCount: TableCount = { read: 0, kept: 0, rejected: 0 };
  if (!headerRaw) return { table: { name: spec.name, columns: [], rows: [] }, count: emptyCount };

  const header = headerRaw.map((h) => readCell(h).trim().toLowerCase());
  const known = new Map(spec.columns.map((c) => [c.name, c]));
  const keep: { index: number; name: string; spec: ColumnSpec | undefined }[] = [];
  const seen = new Set<string>();
  let eventColumn = -1;
  header.forEach((name, index) => {
    if (name === '' || seen.has(name)) {
      if (name !== '') problems.push({ severity: 'warn', code: 'duplicate_column', file, table: spec.name, column: name, message: `${file}: column "${name}" appears twice; the first is used` });
      return;
    }
    seen.add(name);
    const col = known.get(name);
    if (col) { keep.push({ index, name, spec: col }); return; }
    const group = forbiddenGroup(name);
    if (isEventName(name)) { eventColumn = index; }
    if (group) {
      ctx.dropped.push({ table: spec.name, column: name, reason: `forbidden column (${group}), P7.3.1 and U6.1.1` });
      problems.push({ severity: 'drop', code: 'forbidden_column', file, table: spec.name, column: name, message: `${file}: column "${name}" is not allowed in a pack (${group}) and was dropped` });
      return;
    }
    if (spec.keepsExtraStats && !isEventName(name)) { keep.push({ index, name, spec: undefined }); return; }
    if (isEventName(name)) return;
    ctx.dropped.push({ table: spec.name, column: name, reason: 'not in the people_pack v1 columns (U2.1.1 rule 2)' });
    problems.push({ severity: 'drop', code: 'unknown_column', file, table: spec.name, column: name, message: `${file}: column "${name}" is not part of ${spec.name} and was dropped` });
  });

  // An event column holding a protected kind is a protected-event row: the whole pack fails.
  if (eventColumn >= 0) {
    for (let r = 1; r < parsed.rows.length; r++) {
      const v = readCell(parsed.rows[r]![eventColumn] ?? '');
      const t = v === '' ? undefined : protectedTypeOf(v);
      if (t) { problems.push({ severity: 'fail', code: 'protected_event', file, table: spec.name, row: r, message: `${file} row ${r}: carries a protected event (${t}); a pack holds football facts only (A6.3.1)` }); return 'fail'; }
    }
    problems.push({ severity: 'drop', code: 'event_column', file, table: spec.name, message: `${file}: an event column holds no protected kind; it was dropped` });
  }

  const missing = spec.columns.filter((c) => c.required && !seen.has(c.name)).map((c) => c.name);
  const rows: PackRow[] = [];
  const count: TableCount = { read: 0, kept: 0, rejected: 0 };
  if (missing.length > 0) {
    count.read = parsed.rows.length - 1;
    count.rejected = count.read;
    problems.push({ severity: 'reject', code: 'missing_required_column', file, table: spec.name, message: `${file}: required column ${missing.join(', ')} is missing; every row was rejected` });
    return { table: { name: spec.name, columns: [], rows: [] }, count };
  }

  for (let r = 1; r < parsed.rows.length; r++) {
    count.read++;
    const cells = parsed.rows[r]!;
    const row: PackRow = {};
    let bad: string | undefined;
    for (const k of keep) {
      const v = readCell(cells[k.index] ?? '').trim();
      row[k.name] = v;
      if (v === '') { if (k.spec?.required) { bad = `${k.name} is empty`; break; } continue; }
      if (k.spec) { const e = cellError(k.spec, v); if (e) { bad = e; break; } }
      else if (v.length > PARAMS.maxStringChars.value || WEB_ADDRESS.test(v)) { bad = `${k.name} is too long or holds a web address`; break; }
      else if (!NUM.test(v)) { bad = `statistic column ${k.name} is not a number: "${v}"`; break; }
    }
    if (!bad) bad = rowRule(spec.name, row, ctx);
    if (bad) { count.rejected++; problems.push({ severity: 'reject', code: 'bad_row', file, table: spec.name, row: r, message: `${file} row ${r}: ${bad}` }); continue; }
    if (spec.name === 'links' && row['kind'] === 'family') {
      // X14.1.1 rule 7: a family link holds two keys and nothing else.
      for (const c of ['seasons', 'source']) if ((row[c] ?? '') !== '') { row[c] = ''; }
    }
    count.kept++;
    rows.push(row);
  }
  const table: PackTable = { name: spec.name, columns: [], rows };
  table.columns = canonicalColumns({ name: spec.name, columns: keep.map((k) => k.name), rows });
  for (const row of rows) for (const c of table.columns) row[c] ??= '';
  // Numbers in fixed format so the checksum and the export agree (U7.3.1 rule 1).
  const numeric = new Set(spec.columns.filter((c) => c.kind === 'int' || c.kind === 'num').map((c) => c.name));
  for (const k of keep) if (!k.spec) numeric.add(k.name);
  for (const row of rows) for (const c of numeric) if (row[c]) row[c] = canonicalNumber(row[c]!);
  return { table, count };
}

/** Cross-column rules for one row. Returns a reason to reject the row, or undefined. */
function rowRule(table: string, row: PackRow, ctx: TableContext): string | undefined {
  if (table === 'people') {
    const bd = row['birth_date'];
    if (bd && ctx.opts.worldStartYear !== undefined) {
      const age = ctx.opts.worldStartYear - Number(bd.slice(0, 4));
      if (age < PARAMS.ageMinYears.value || age > PARAMS.ageMaxYears.value) return `birth date ${bd} makes the person ${age} at world start (allowed ${PARAMS.ageMinYears.value} to ${PARAMS.ageMaxYears.value})`;
    }
    for (const [c, lo, hi] of [['hometown_lat', -90, 90], ['hometown_lon', -180, 180]] as const) {
      const v = row[c];
      if (v && (Number(v) < lo || Number(v) > hi)) return `${c} is outside ${lo} to ${hi}`;
    }
  }
  if (table === 'playing') {
    const pos = ctx.position(row['position'] ?? '');
    if (!pos) return `unknown position "${row['position']}"`;
    row['position'] = pos;
    const h = row['height_in'];
    if (h && (Number(h) < PARAMS.heightMinIn.value || Number(h) > PARAMS.heightMaxIn.value)) return `height ${h} inches is outside ${PARAMS.heightMinIn.value} to ${PARAMS.heightMaxIn.value}`;
    const w = row['weight_lb'];
    if (w && (Number(w) < PARAMS.weightMinLb.value || Number(w) > PARAMS.weightMaxLb.value)) return `weight ${w} pounds is outside ${PARAMS.weightMinLb.value} to ${PARAMS.weightMaxLb.value}`;
    const round = row['draft_round'], pick = row['draft_pick'];
    if ((round && Number(round) < 1) || (pick && Number(pick) < 1)) return 'draft round and pick start at 1';
  }
  if (table === 'player_seasons' || table === 'coaching_seasons' || table === 'official_seasons') {
    const g = row['games'];
    if (g && Number(g) < 0) return 'games is negative';
  }
  if (table === 'links' && row['source_key_a'] === row['source_key_b']) return 'a link joins two different people';
  return undefined;
}

// ---------- pack ----------

const GROUP_TABLE: Record<string, string> = { people: 'people', players: 'playing', coaches: 'coaching_seasons', officials: 'official_seasons' };

/** Validates and decodes one pack. See the header of this file for the result classes. */
export function decodePack(files: readonly PackFile[], opts: ValidateOptions = {}): DecodeResult {
  const problems: PackProblem[] = [];
  const ignoredFiles: { path: string; reason: string }[] = [];
  const droppedColumns: { table: string; column: string; reason: string }[] = [];
  const counts: Record<string, TableCount> = {};
  const finish = (pack?: PackData): DecodeResult => {
    const failed = problems.some((p) => p.severity === 'fail');
    const warned = problems.some((p) => p.severity !== 'info');
    const report: ImportReport = { status: failed ? 'fail' : warned ? 'warn' : 'pass', problems, counts, ignoredFiles, droppedColumns, edited: false };
    if (failed || !pack) return { report };
    report.edited = (pack.tables['overrides']?.rows.length ?? 0) > 0;
    report.checksum = packChecksum(pack);
    report.checksumShort = shortChecksum(report.checksum);
    return { report, pack };
  };

  // 1. Entry limits, before any content is read.
  const limitProblems = checkEntryLimits(files.map((f) => ({ path: f.path, size: f.bytes.length, ...(f.compressedBytes !== undefined ? { compressedBytes: f.compressedBytes } : {}) })));
  problems.push(...limitProblems);
  if (limitProblems.length > 0) return finish();

  // 2. Find pack.json at the root, or inside one top-level folder (U7.1.2 edge case).
  const entries = files.map((f) => ({ f, path: normalisePath(f.path)! }));
  let prefix = '';
  if (!entries.some((e) => e.path === 'pack.json')) {
    const inFolder = entries.filter((e) => /^[^/]+\/pack\.json$/.test(e.path));
    if (inFolder.length === 1) prefix = inFolder[0]!.path.slice(0, inFolder[0]!.path.indexOf('/') + 1);
  }
  const byPath = new Map<string, PackFile>();
  for (const e of entries) {
    if (prefix !== '' && !e.path.startsWith(prefix)) { ignoredFiles.push({ path: e.path, reason: 'outside the pack folder' }); continue; }
    byPath.set(e.path.slice(prefix.length), e.f);
  }
  const packJson = byPath.get('pack.json');
  if (!packJson) { problems.push({ severity: 'fail', code: 'missing_manifest', message: 'The pack has no pack.json' }); return finish(); }

  const decode = (f: PackFile, path: string): string | undefined => {
    try { return DECODER.decode(f.bytes); } catch { problems.push({ severity: 'fail', code: 'bad_encoding', file: path, message: `${path} is not valid UTF-8` }); return undefined; }
  };
  const manifestText = decode(packJson, 'pack.json');
  if (manifestText === undefined) return finish();
  const manifest = readManifest(manifestText, problems);
  if (!manifest) return finish();

  // 3. Tables.
  const position = positionLookup(opts.positionAliases);
  const tables: Record<string, PackTable> = {};
  for (const [path, f] of [...byPath].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (path === 'pack.json') continue;
    if (!/\.(json|csv)$/i.test(path)) { ignoredFiles.push({ path, reason: 'only .json and .csv files are read (P7.2.1)' }); continue; }
    if (!/\.csv$/i.test(path) || path.includes('/')) { ignoredFiles.push({ path, reason: 'not a table file' }); continue; }
    const name = path.slice(0, -4).toLowerCase();
    const spec = TABLE_BY_NAME.get(name);
    if (!spec) {
      if (isEventName(name) || protectedTypeOf(name)) { problems.push({ severity: 'fail', code: 'protected_event', file: path, table: name, message: `${path} is an event table; a pack holds football facts only and may not carry events (A6.3.1)` }); }
      else ignoredFiles.push({ path, reason: 'unknown table' });
      continue;
    }
    if (spec.deltaOnly && !manifest.base) { ignoredFiles.push({ path, reason: 'the removed table is read only in a delta pack' }); continue; }
    const text = decode(f, path);
    if (text === undefined) continue;
    const res = decodeTable(text, { spec, file: path, problems, dropped: droppedColumns, opts, position });
    if (res === 'fail') continue;
    tables[name] = res.table;
    counts[name] = res.count;
  }
  if (problems.some((p) => p.severity === 'fail')) return finish();

  // 4. Keys: people unique, every other table points at a person (a delta may point at its base's people).
  const people = tables['people'];
  if (!manifest.base) {
    if (!people || people.rows.length === 0) { problems.push({ severity: 'fail', code: 'no_valid_people', message: 'The pack has no valid person rows; nothing can be imported' }); return finish(); }
  }
  if (people) {
    if (people.rows.length > PARAMS.maxPeople.value) { problems.push({ severity: 'fail', code: 'limit_people', message: `More than ${PARAMS.maxPeople.value} people` }); return finish(); }
    const seen = new Set<string>();
    const kept: PackRow[] = [];
    people.rows.forEach((row, i) => {
      const k = row['source_key']!;
      if (seen.has(k)) { counts['people']!.kept--; counts['people']!.rejected++; problems.push({ severity: 'reject', code: 'duplicate_key', table: 'people', row: i + 1, message: `people: source key "${k}" appears twice; the first row is kept` }); return; }
      seen.add(k); kept.push(row);
    });
    people.rows = kept;
    // Duplicate candidates by name and birth date (U2.1.2 rule 2) are reported, never merged.
    const byName = new Map<string, string[]>();
    for (const row of kept) {
      if (!row['birth_date']) continue;
      const key = `${row['name_first']}|${row['name_last']}|${row['birth_date']}`.toLowerCase();
      const list = byName.get(key) ?? [];
      list.push(row['source_key']!); byName.set(key, list);
    }
    for (const [, ks] of [...byName].sort(([a], [b]) => (a < b ? -1 : 1))) if (ks.length > 1) problems.push({ severity: 'warn', code: 'duplicate_candidate', table: 'people', message: `people: ${ks.join(', ')} share a name and birth date; both are kept (U2.1.2)` });
    if (!manifest.base) {
      for (const [name, t] of Object.entries(tables)) {
        if (name === 'people') continue;
        const cols = name === 'links' ? ['source_key_a', 'source_key_b'] : ['source_key'];
        const keptRows: PackRow[] = [];
        t.rows.forEach((row, i) => {
          const missing = cols.find((c) => !seen.has(row[c]!));
          if (missing) { counts[name]!.kept--; counts[name]!.rejected++; problems.push({ severity: 'reject', code: 'orphan_row', table: name, row: i + 1, message: `${name} row ${i + 1}: ${missing} "${row[missing]}" is not in the people table` }); }
          else keptRows.push(row);
        });
        t.rows = keptRows;
      }
    }
  }

  // 5. Warnings about claims.
  if (manifest.seasons_skipped) problems.push({ severity: 'warn', code: 'seasons_skipped', message: `The pack says it skipped seasons: ${manifest.seasons_skipped}` });
  for (const [group, claimed] of Object.entries(manifest.counts ?? {})) {
    const t = GROUP_TABLE[group];
    if (claimed > 0 && t && (tables[t]?.rows.length ?? 0) === 0) problems.push({ severity: 'warn', code: 'group_without_rows', message: `The pack claims ${claimed} ${group} but has no rows in ${t}` });
  }
  if (manifest.team_names === 'omitted') {
    const withOrg = ['player_seasons', 'coaching_seasons'].some((n) => tables[n]?.rows.some((r) => (r['organisation'] ?? '') !== ''));
    if (withOrg) problems.push({ severity: 'warn', code: 'team_names_omitted_but_present', message: 'The pack says team names are omitted but organisation values are present' });
  }
  if (manifest.redistribution === 'no') problems.push({ severity: 'info', code: 'no_redistribution', message: 'Redistribution is marked no: this pack is never exported (U6.1.1 edge case)' });
  if ((tables['overrides']?.rows.length ?? 0) > 0) problems.push({ severity: 'info', code: 'edited', message: 'The pack has attribute overrides and is marked edited (U7.1.1)' });

  return finish({ manifest, tables });
}

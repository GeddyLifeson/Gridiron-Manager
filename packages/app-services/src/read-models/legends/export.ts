// X3.6.1 export as data. Public events, people (public fields only), teams, seasons, games and records
// in the P4 open format: a folder with `manifest.json` and one JSON Lines file per kind. Rows are sorted by
// id and keys are written in sorted order, so two exports of the same world are byte-identical. Before any
// file is returned, every key is checked against the forbidden-key patterns and the truth-data fields of
// that kind's world schema; any hit stops the export. The user's own decision log goes in only when he
// ticks the box (N3). Exporting changes no state. Writing to disk is the shell's job (P2.3).
import { scanForbiddenJson } from '@gm/schema';
import { canonical, pathsOfClass } from '../../observer/schema-walk.ts';
import { tableSchema } from '../../observer/observed-world.ts';
import { publicOnly } from './visibility.ts';
import type { EventRow } from './types.ts';

export const EXPORT_SCHEMA_VERSION = 1;
export const EXPORT_KINDS = ['events', 'people', 'teams', 'seasons', 'games', 'records'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

/** World table whose truth fields each file is checked against (records have no world table). */
const TABLE_OF: Partial<Record<ExportKind, string>> = { events: 'events', people: 'people', teams: 'teams', seasons: 'seasons', games: 'games' };

export interface ExportInput {
  /** World code from X10.1.2. */
  readonly worldCode: string;
  readonly firstSeason: number;
  readonly lastSeason: number;
  /** Export date in game time. */
  readonly exportDate: { readonly seasonYear: number; readonly dayIndex: number };
  readonly events: readonly EventRow[];
  /** Public person rows (PersonView as the public observer sees it). */
  readonly people: readonly Record<string, unknown>[];
  readonly teams: readonly Record<string, unknown>[];
  readonly seasons: readonly Record<string, unknown>[];
  readonly games: readonly Record<string, unknown>[];
  readonly records: readonly Record<string, unknown>[];
  /** The user's own decision log rows (N3), included only with `includeDecisionLog`. */
  readonly decisionLog?: readonly Record<string, unknown>[];
  readonly includeDecisionLog?: boolean;
  readonly csv?: boolean;
}

export interface ExportProblem { readonly file: string; readonly path: string; readonly key: string; readonly rule: string }
export type ExportResult =
  | { readonly ok: true; readonly files: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly problems: readonly ExportProblem[] };

/** The public projection of an event: identity, date, where, people, payload, witnesses. Tier and source are truth. */
export function publicEvent(e: EventRow): Record<string, unknown> {
  return { id: e.id, type: e.type, when: e.when, competitionId: e.competitionId, where: e.where, actors: e.actors, subjects: e.subjects, payload: e.payload, witnesses: e.witnesses, causeId: e.causeId, notability: e.notability };
}

let truthCache: Map<string, Set<string>> | null = null;
/** Leaf key names of truth-class fields per world table. */
export function truthKeys(table: string): Set<string> {
  truthCache ??= new Map();
  let s = truthCache.get(table);
  if (!s) {
    s = new Set(pathsOfClass(tableSchema(table), 'truth').map((p) => p.split('.').pop()!.replace(/\[\]|\{\}|\|\d+/g, '')).filter(Boolean));
    truthCache.set(table, s);
  }
  return s;
}

function scan(file: string, kind: ExportKind | 'decisions', rows: readonly unknown[]): ExportProblem[] {
  const out: ExportProblem[] = scanForbiddenJson(file, rows).map((h) => ({ file, path: h.path, key: h.key, rule: h.rule }));
  const table = kind === 'decisions' ? undefined : TABLE_OF[kind];
  if (!table) return out;
  const truth = truthKeys(table);
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      if (truth.has(k)) out.push({ file, path: `${path}.${k}`, key: k, rule: `truth field of ${table}` });
      walk(x, `${path}.${k}`);
    }
  };
  walk(rows, '$');
  return out;
}

const idOf = (r: Record<string, unknown>): number | string => (typeof r['id'] === 'number' || typeof r['id'] === 'string' ? r['id'] : canonical(r));
function sortRows<T extends Record<string, unknown>>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const x = idOf(a), y = idOf(b);
    return typeof x === 'number' && typeof y === 'number' ? x - y : String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0;
  });
}

const jsonl = (rows: readonly unknown[]) => rows.map((r) => canonical(r)).join('\n') + (rows.length ? '\n' : '');

function csvOf(rows: readonly Record<string, unknown>[]): string {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].sort();
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? canonical(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

export function buildExport(input: ExportInput): ExportResult {
  const sets: Record<ExportKind, Record<string, unknown>[]> = {
    events: sortRows(publicOnly(input.events).map(publicEvent)),
    people: sortRows(input.people), teams: sortRows(input.teams), seasons: sortRows(input.seasons), games: sortRows(input.games), records: sortRows(input.records),
  };
  const problems: ExportProblem[] = [];
  for (const k of EXPORT_KINDS) problems.push(...scan(`${k}.jsonl`, k, sets[k]));
  const decisions = input.includeDecisionLog ? sortRows(input.decisionLog ?? []) : null;
  if (decisions) problems.push(...scan('decisions.jsonl', 'decisions', decisions));
  if (problems.length) return { ok: false, problems };

  const files: Record<string, string> = {};
  const manifest = {
    schemaVersion: EXPORT_SCHEMA_VERSION, worldCode: input.worldCode, firstSeason: input.firstSeason, lastSeason: input.lastSeason, exportDate: input.exportDate,
    files: [...EXPORT_KINDS.map((k) => `${k}.jsonl`), ...(decisions ? ['decisions.jsonl'] : [])],
    counts: Object.fromEntries(EXPORT_KINDS.map((k) => [k, sets[k].length])),
  };
  files['manifest.json'] = canonical(manifest) + '\n';
  for (const k of EXPORT_KINDS) {
    files[`${k}.jsonl`] = jsonl(sets[k]);
    if (input.csv) files[`${k}.csv`] = csvOf(sets[k]);
  }
  if (decisions) files['decisions.jsonl'] = jsonl(decisions);
  return { ok: true, files };
}

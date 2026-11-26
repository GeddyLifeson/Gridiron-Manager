// An index of the violation log by actor and violation class, so the K2.8.2 cooldown check reads only that
// person's rows of that class instead of the whole log. The log only grows at its end (`commitAct`), and the
// other writers (`detect.ts`) copy rows to set `caseId` or `actSourcesDrawn`, keeping each row's id, actor,
// class and date. Row ids are unique and rise. So two logs whose rows at the same place carry the same ids
// hold the same actors, classes and dates up to there, and one index serves a whole line of growth: each
// entry keeps its place in the log, and a read of a log with n rows takes only places below n.
import type { LeagueRecordEntry, ViolationLogRow } from './types.ts';
import type { WorldDate } from '@gm/schema';

interface Entry { readonly at: number; readonly date: WorldDate }

interface LogIndex {
  /** Row id at each place indexed so far. */
  readonly ids: number[];
  /** Actor person id to class id to his rows of that class, in log order. */
  readonly byActor: Map<number, Map<string, Entry[]>>;
}

const INDEX = new WeakMap<readonly ViolationLogRow[], LogIndex>();
let latest: LogIndex | null = null;

/** True when the index and the log agree on the ids of their common places (checked at both ends). */
function serves(ix: LogIndex, log: readonly ViolationLogRow[]): boolean {
  const common = Math.min(ix.ids.length, log.length);
  if (common === 0) return true;
  return ix.ids[0] === log[0]!.id && ix.ids[common - 1] === log[common - 1]!.id;
}

function extend(ix: LogIndex, log: readonly ViolationLogRow[]): void {
  for (let i = ix.ids.length; i < log.length; i++) {
    const r = log[i]!;
    ix.ids.push(r.id);
    let byClass = ix.byActor.get(r.actor.personId);
    if (!byClass) { byClass = new Map(); ix.byActor.set(r.actor.personId, byClass); }
    let rows = byClass.get(r.classId);
    if (!rows) { rows = []; byClass.set(r.classId, rows); }
    rows.push({ at: i, date: r.date });
  }
}

function indexOf(log: readonly ViolationLogRow[]): LogIndex {
  let ix = INDEX.get(log);
  if (!ix) {
    ix = latest && serves(latest, log) ? latest : { ids: [], byActor: new Map() };
    INDEX.set(log, ix);
  }
  if (ix.ids.length < log.length) extend(ix, log);
  latest = ix;
  return ix;
}

/**
 * True when some row of the log has this actor and class and a date `d` with `test(d)` true. The same answer
 * as `log.some(r => r.actor.personId === personId && r.classId === classId && test(r.date))`.
 */
export function someActorClassRow(log: readonly ViolationLogRow[], personId: number, classId: string, test: (d: WorldDate) => boolean): boolean {
  const rows = indexOf(log).byActor.get(personId)?.get(classId);
  if (!rows) return false;
  const n = log.length;
  for (const e of rows) {
    if (e.at >= n) break;
    if (test(e.date)) return true;
  }
  return false;
}

// The league record (L8.2.3) indexed the same way, by party and class, for the repeat check (C11.2.4). The
// record only grows at its end and its entries are never copied into new objects, so two records whose
// entries at the same place are the same objects agree up to there, and one index serves a line of growth.
interface RecordIndex {
  readonly entries: LeagueRecordEntry[];
  readonly byKey: Map<string, Entry[]>;
}

const RECORD_INDEX = new WeakMap<readonly LeagueRecordEntry[], RecordIndex>();
let latestRecord: RecordIndex | null = null;

function recordKey(kind: string, id: number, classId: string): string { return `${kind}:${id}:${classId}`; }

function recordServes(ix: RecordIndex, rec: readonly LeagueRecordEntry[]): boolean {
  const common = Math.min(ix.entries.length, rec.length);
  if (common === 0) return true;
  return ix.entries[0] === rec[0] && ix.entries[common - 1] === rec[common - 1];
}

function recordIndexOf(rec: readonly LeagueRecordEntry[]): RecordIndex {
  let ix = RECORD_INDEX.get(rec);
  if (!ix) {
    ix = latestRecord && recordServes(latestRecord, rec) ? latestRecord : { entries: [], byKey: new Map() };
    RECORD_INDEX.set(rec, ix);
  }
  for (let i = ix.entries.length; i < rec.length; i++) {
    const e = rec[i]!;
    ix.entries.push(e);
    const k = recordKey(e.party.kind, e.party.id, e.classId);
    let list = ix.byKey.get(k);
    if (!list) { list = []; ix.byKey.set(k, list); }
    list.push({ at: i, date: e.date });
  }
  latestRecord = ix;
  return ix;
}

/**
 * True when some record entry has this party and class and a date `d` with `test(d)` true. The same answer as
 * `record.some(e => e.party.kind === kind && e.party.id === id && e.classId === classId && test(e.date))`.
 */
export function someRecordEntry(rec: readonly LeagueRecordEntry[], kind: string, id: number, classId: string, test: (d: WorldDate) => boolean): boolean {
  const list = recordIndexOf(rec).byKey.get(recordKey(kind, id, classId));
  if (!list) return false;
  const n = rec.length;
  for (const e of list) {
    if (e.at >= n) break;
    if (test(e.date)) return true;
  }
  return false;
}

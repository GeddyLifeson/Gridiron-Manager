// "Your record" tab (E9.1.2, S8.1.1, O4.6.1) and the evidence views by kind (E9.4.1 to E9.4.5). Every
// number here is computed when shown, over a window, from the record's event ids and the log, and is never
// written back (E9.1.2 rule 1, S8.1.1 rule 6). Two users with identical logs see identical tabs
// (E9.1.2 acceptance 3) because nothing but the log is read.
import type { WorldEvent } from '@gm/schema';
import { FAMILIES, familyNumber, type FamilyId } from './families.ts';
import { DEFAULT_EVIDENCE_MAP, indexMap, isSimulated, outcomeOf, type EvidenceMap } from './events.ts';
import type { DemonstratedRecord } from './record.ts';

export interface Window { readonly fromSeason: number; readonly toSeason: number }

/** One sub-line: "Fourth downs: 61 decisions, 44 matched the model's choice". */
export interface KindLine { readonly key: string; readonly events: number; readonly checked: number; readonly matched: number; readonly eventIds: readonly number[] }

export interface FamilyLine {
  readonly family: FamilyId;
  readonly number: number;
  /** "no record" when the window holds no event of the family (E9.1.1 edge case). */
  readonly status: 'no_record' | 'record';
  readonly events: number;
  readonly checked: number;
  readonly matched: number;
  /** Simulated events in the window (shown with the flag, S8.1.1 edge case). */
  readonly simulated: number;
  readonly kinds: readonly KindLine[];
  /** Every line opens the underlying events (E9.1.2). */
  readonly eventIds: readonly number[];
}

/** The payload field that splits a family into sub-lines. Recommendations are their own line (E9.4.3 rule 2). */
function kindKey(e: WorldEvent): string {
  const p = e.payload;
  if (typeof p['decisionKind'] === 'string') return p['recommendation'] === true ? `recommendation:${p['decisionKind']}` : (p['decisionKind'] as string);
  for (const f of ['product', 'measure', 'kind', 'unit']) if (typeof p[f] === 'string' && p[f] !== '') return p[f] as string;
  return e.type;
}

function eventIndex(events: readonly WorldEvent[]): Map<number, WorldEvent> { return new Map(events.map((e) => [e.id, e])); }

export function inWindow(e: WorldEvent, w: Window): boolean { return e.when.date.seasonYear >= w.fromSeason && e.when.date.seasonYear <= w.toSeason; }

/** The tab: one line per family, in E9.1.1 order. */
export function recordTab(record: DemonstratedRecord, events: readonly WorldEvent[], w: Window, map: EvidenceMap = DEFAULT_EVIDENCE_MAP): FamilyLine[] {
  const byId = eventIndex(events);
  const idx = indexMap(map);
  return FAMILIES.map((family) => {
    const kinds = new Map<string, { events: number; checked: number; matched: number; ids: number[] }>();
    let n = 0, c = 0, m = 0, s = 0;
    const ids: number[] = [];
    for (const id of record.eventIds[family]) {
      const e = byId.get(id);
      if (!e || !inWindow(e, w)) continue;
      const row = (idx.get(e.type) ?? []).find((r) => r.family === family);
      if (!row) continue;
      const o = outcomeOf(e, row.outcome);
      n++; c += o.checked; m += o.matched; ids.push(id);
      if (isSimulated(e)) s++;
      const k = kindKey(e);
      const kl = kinds.get(k) ?? { events: 0, checked: 0, matched: 0, ids: [] };
      kl.events++; kl.checked += o.checked; kl.matched += o.matched; kl.ids.push(id);
      kinds.set(k, kl);
    }
    return {
      family, number: familyNumber(family), status: n === 0 ? 'no_record' : 'record', events: n, checked: c, matched: m, simulated: s,
      kinds: [...kinds].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, v]) => ({ key, events: v.events, checked: v.checked, matched: v.matched, eventIds: v.ids })),
      eventIds: ids,
    };
  });
}

// ---- E9.4.1 teaching evidence ----

export interface PlayerSeason { readonly eventId: number; readonly playerId: number; readonly seasonYear: number; readonly positionGroup: string; readonly delta: number }

export interface TeachingView {
  /** Development against each player's own projection (E9.4.1 rule 1), one row per qualifying player season. */
  readonly development: readonly PlayerSeason[];
  /** Mean delta and count by position group, computed now. */
  readonly byPosition: readonly { positionGroup: string; players: number; meanDelta: number }[];
  readonly assignmentErrors: readonly PlayerSeason[];
  readonly backupReadiness: readonly PlayerSeason[];
}

export function teachingView(record: DemonstratedRecord, events: readonly WorldEvent[], w: Window): TeachingView {
  const byId = eventIndex(events);
  const dev: PlayerSeason[] = [], err: PlayerSeason[] = [], rdy: PlayerSeason[] = [];
  for (const id of record.eventIds.teaching) {
    const e = byId.get(id);
    if (!e || !inWindow(e, w)) continue;
    const p = e.payload;
    if (typeof p['playerId'] !== 'number' || typeof p['delta'] !== 'number') continue;
    const row: PlayerSeason = { eventId: id, playerId: p['playerId'] as number, seasonYear: typeof p['seasonYear'] === 'number' ? (p['seasonYear'] as number) : e.when.date.seasonYear, positionGroup: String(p['positionGroup'] ?? ''), delta: p['delta'] as number };
    (p['measure'] === 'assignment_errors' ? err : p['measure'] === 'backup_readiness' ? rdy : dev).push(row);
  }
  const groups = new Map<string, number[]>();
  for (const r of dev) { const g = groups.get(r.positionGroup) ?? []; g.push(r.delta); groups.set(r.positionGroup, g); }
  const byPosition = [...groups].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([positionGroup, ds]) => ({ positionGroup, players: ds.length, meanDelta: ds.reduce((x, y) => x + y, 0) / ds.length }));
  return { development: dev, byPosition, assignmentErrors: err, backupReadiness: rdy };
}

// ---- E9.4.3 game management evidence ----

export interface DecisionLine { readonly decisionKind: string; readonly decisions: number; readonly matchedModel: number; readonly rulesErrors: number }

export interface GameManagementView {
  /** His own decisions by kind. */
  readonly decisions: readonly DecisionLine[];
  /** Recommendations he made that someone else decided (E9.4.3 rule 2). */
  readonly recommendations: readonly DecisionLine[];
}

export function gameManagementView(record: DemonstratedRecord, events: readonly WorldEvent[], w: Window): GameManagementView {
  const byId = eventIndex(events);
  const own = new Map<string, { n: number; m: number; r: number }>();
  const rec = new Map<string, { n: number; m: number; r: number }>();
  for (const id of record.eventIds.decisions) {
    const e = byId.get(id);
    if (!e || !inWindow(e, w)) continue;
    const k = String(e.payload['decisionKind'] ?? e.type);
    const into = e.payload['recommendation'] === true ? rec : own;
    const v = into.get(k) ?? { n: 0, m: 0, r: 0 };
    v.n++;
    if (e.payload['matchedModel'] === true) v.m++;
    if (e.payload['rulesError'] === true) v.r++;
    into.set(k, v);
  }
  const lines = (m: Map<string, { n: number; m: number; r: number }>) => [...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([decisionKind, v]) => ({ decisionKind, decisions: v.n, matchedModel: v.m, rulesErrors: v.r }));
  return { decisions: lines(own), recommendations: lines(rec) };
}

// ---- E9.4.4 communication evidence and E9.4.5 evaluation evidence ----

export interface KeptLine { readonly kind: string; readonly kept: number; readonly broken: number; readonly eventIds: readonly number[] }

/** Promises kept and broken, own rules followed (E9.4.4). Every line opens to its events. */
export function communicationView(record: DemonstratedRecord, events: readonly WorldEvent[], w: Window, map: EvidenceMap = DEFAULT_EVIDENCE_MAP): KeptLine[] {
  return keptLines(record.eventIds.conduct, events, w, map, 'conduct');
}

/** Scored recommendations and grades by kind (E9.4.5): kept = matched what the player later did. */
export function evaluationView(record: DemonstratedRecord, events: readonly WorldEvent[], w: Window, map: EvidenceMap = DEFAULT_EVIDENCE_MAP): KeptLine[] {
  return keptLines(record.eventIds.evaluations, events, w, map, 'evaluations');
}

function keptLines(ids: readonly number[], events: readonly WorldEvent[], w: Window, map: EvidenceMap, family: FamilyId): KeptLine[] {
  const byId = eventIndex(events);
  const idx = indexMap(map);
  const m = new Map<string, { k: number; b: number; ids: number[] }>();
  for (const id of ids) {
    const e = byId.get(id);
    if (!e || !inWindow(e, w)) continue;
    const row = (idx.get(e.type) ?? []).find((r) => r.family === family);
    if (!row) continue;
    const o = outcomeOf(e, row.outcome);
    if (o.checked === 0) continue;
    const key = typeof e.payload['kind'] === 'string' ? (e.payload['kind'] as string) : e.type.startsWith('promise_') ? 'promise' : e.type;
    const v = m.get(key) ?? { k: 0, b: 0, ids: [] };
    v.k += o.matched; v.b += o.checked - o.matched; v.ids.push(id);
    m.set(key, v);
  }
  return [...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([kind, v]) => ({ kind, kept: v.k, broken: v.b, eventIds: v.ids }));
}

// ---- E9.2.1 descriptors: how far a sample is from the minimum ----

/** A label reading as the label engine gives it (structural; `career` may not import `models`, P1.2.1). */
export interface LabelReading {
  readonly labelId: string;
  readonly held: boolean;
  /** Countable sample in the window (simulated rows excluded). */
  readonly sample: number;
  readonly minSample: number;
  readonly strength: 'mild' | 'clear' | 'strong' | null;
}

export interface SampleLine { readonly labelId: string; readonly held: boolean; readonly sample: number; readonly minSample: number; readonly stillNeeded: number; readonly strength: LabelReading['strength'] }

/** "Fourth-down decisions this window: 13 of 20 needed before anyone can call you anything" (E9.2.1). */
export function sampleLines(readings: readonly LabelReading[]): SampleLine[] {
  return [...readings]
    .sort((a, b) => (a.labelId < b.labelId ? -1 : a.labelId > b.labelId ? 1 : 0))
    .map((r) => ({ labelId: r.labelId, held: r.held && r.sample >= r.minSample, sample: r.sample, minSample: r.minSample, stillNeeded: Math.max(0, r.minSample - r.sample), strength: r.sample >= r.minSample ? r.strength : null }));
}

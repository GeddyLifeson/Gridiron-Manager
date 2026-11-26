// The label evaluation function (N2.8.1 rule 2, X2.2.2). Labels are computed from the log when asked and
// never stored (W-22). State moves only when evidence arrives (X2.2.2 rule 1): the engine replays the
// subject's evidence in log order with hysteresis, so the state after loading a save equals the state
// recomputed from the log (X2.2.2 acceptance). Every result carries the ids of the rows that earned it.
import type { PersonOrigin, WorldDate, WorldEvent } from '@gm/schema';
import {
  halfLifeOf, matchCount, minSampleOf, thresholdOffOf, thresholdOnOf,
  type LabelDef,
} from './define.ts';
import { decayWeight } from './math.ts';
import { LABEL_PARAMS as P } from './params.ts';

/** Season position of a date as a real number (year plus day fraction). */
export function seasonTime(d: WorldDate): number { return d.seasonYear + d.dayIndex / P.daysPerSeasonYear; }

/** Whole days from the calendar origin; ages are taken in whole days so weights are exact and cacheable. */
export function absDay(d: WorldDate): number { return d.seasonYear * P.daysPerSeasonYear + d.dayIndex; }

const weightMemo = new Map<string, number>();
/** N2.8.1 rule 2 weight of evidence `ageDays` old. */
export function weightForAge(ageDays: number, halfLifeSeasons: number): number {
  const k = `${ageDays}|${halfLifeSeasons}`;
  let w = weightMemo.get(k);
  if (w === undefined) { w = decayWeight(ageDays / P.daysPerSeasonYear, halfLifeSeasons); weightMemo.set(k, w); }
  return w;
}

const ALL_LEVELS = '*';

/** Population rates by level and season for one label (X2.2.1 rules 1 and 3). */
export interface Baseline {
  readonly labelId: string;
  /** Expected positive share of a row at this level and season, over the label's window; thin flag. */
  rate(level: string, year: number): { p0: number; thin: boolean };
}

interface Cell { pos: number; tot: number; subjects: Set<number> }

/** Subjects a row is evidence about for a label (actor ids in the role, or the team). */
export function subjectsOf(def: LabelDef, e: WorldEvent): number[] {
  if (def.subjectBy === 'team') return e.where.teamId === null ? [] : [e.where.teamId];
  const roles = new Set([def.positive.actorRole, def.negative.actorRole].filter((r): r is string => !!r));
  const out = new Set<number>();
  for (const a of e.actors) if (!roles.size || roles.has(a.role)) out.add(a.personId);
  return [...out];
}

export interface EvalContext {
  /** Evaluate as of this date: rows after it are not yet known. */
  readonly asOf: WorldDate;
  /** Level of a competition id; rows with no competition use the all-level baseline. */
  readonly levelOf?: (competitionId: number) => string | undefined;
  readonly baseline: Baseline;
  /** Original id to the row that reversed it (X2.1.3); applied from the reversal onward. */
  readonly reversedBy?: ReadonlyMap<number, ReversalRef>;
  readonly origin?: PersonOrigin;
  /** Subject is out of football: held labels freeze and their weight keeps falling (X2.2.2 rule 5). */
  readonly outOfFootball?: boolean;
  /** Observer filter: rows this reader may know (P1.1.4, X2.3.1). Default: all. */
  readonly visible?: (e: WorldEvent) => boolean;
  /** Scale on the minimum sample (first-hand impressions, X2.2.2 edge case). */
  readonly minSampleScale?: number;
}

export function levelKey(e: WorldEvent, levelOf: EvalContext['levelOf']): string {
  return (e.competitionId !== null && levelOf?.(e.competitionId)) || ALL_LEVELS;
}

/** Build the population baseline of a label from rows (X2.2.1 rule 3: the same method for the user). */
export function buildBaseline(def: LabelDef, rows: readonly WorldEvent[], levelOf?: EvalContext['levelOf'], reversed?: ReadonlySet<number>): Baseline {
  const cells = new Map<string, Cell>();
  const cell = (k: string) => { let c = cells.get(k); if (!c) { c = { pos: 0, tot: 0, subjects: new Set() }; cells.set(k, c); } return c; };
  for (const e of rows) {
    if (reversed?.has(e.id)) continue;
    const subs = subjectsOf(def, e);
    if (!subs.length) continue;
    const lvl = levelKey(e, levelOf);
    const y = e.when.date.seasonYear;
    for (const s of subs) {
      const pos = matchCount(def.positive, def.subjectBy, s, e) ?? 0;
      const neg = matchCount(def.negative, def.subjectBy, s, e) ?? 0;
      const tot = pos + neg;
      if (tot === 0) continue;
      for (const k of lvl === ALL_LEVELS ? [`${ALL_LEVELS}|${y}`] : [`${lvl}|${y}`, `${ALL_LEVELS}|${y}`]) {
        const c = cell(k);
        c.pos += pos; c.tot += tot; c.subjects.add(s);
      }
    }
  }
  const memo = new Map<string, { p0: number; thin: boolean }>();
  const span = (lvl: string, year: number) => {
    let pos = 0; let tot = 0; const subs = new Set<number>();
    for (let y = year - def.windowSeasons + 1; y <= year; y++) {
      const c = cells.get(`${lvl}|${y}`);
      if (!c) continue;
      pos += c.pos; tot += c.tot; for (const s of c.subjects) subs.add(s);
    }
    return { pos, tot, n: subs.size };
  };
  return {
    labelId: def.id,
    rate(level, year) {
      const k = `${level}|${year}`;
      const hit = memo.get(k);
      if (hit) return hit;
      let s = span(level, year);
      let thin = false;
      if (level !== ALL_LEVELS && s.n < P.thinBaselineSubjects) { s = span(ALL_LEVELS, year); thin = true; }
      if (level === ALL_LEVELS && s.n < P.thinBaselineSubjects) thin = true;
      const r = { p0: s.tot > 0 ? s.pos / s.tot : 0, thin };
      memo.set(k, r);
      return r;
    },
  };
}

/** The reversing row of an original (`reversalMap`). */
export interface ReversalRef { readonly id: number; readonly date: WorldDate }

/**
 * Rows grouped by the subjects they are evidence about for a label, in log order. Pass a subject's list to
 * `evaluateLabel` instead of the whole log: the result is the same and the cost is the subject's rows.
 */
export function rowsBySubject(def: LabelDef, rows: readonly WorldEvent[]): Map<number, WorldEvent[]> {
  const out = new Map<number, WorldEvent[]>();
  for (const e of rows) for (const s of subjectsOf(def, e)) {
    if ((matchCount(def.positive, def.subjectBy, s, e) ?? 1) + (matchCount(def.negative, def.subjectBy, s, e) ?? 1) === 0) continue;
    const a = out.get(s); if (a) a.push(e); else out.set(s, [e]);
  }
  return out;
}

/** One row's contribution to a label for one subject. */
export interface EvidenceItem {
  readonly eventId: number;
  /** Absolute day of the row (`absDay`). */
  readonly day: number;
  readonly pos: number;
  readonly tot: number;
  readonly p0: number;
  readonly thin: boolean;
  readonly compacted: boolean;
}

export type Strength = 'mild' | 'clear' | 'strong';

export interface LabelTransition { readonly eventId: number; readonly date: WorldDate; readonly state: 'held' | 'absent' }

export interface LabelResult {
  readonly labelId: string;
  readonly subjectId: number;
  readonly state: 'held' | 'absent';
  readonly strength: Strength | null;
  /** Rate or weighted count at the last evaluation, and its baseline. */
  readonly measure: number;
  readonly baseline: number;
  /** Signed for the label's direction: positive means the behaviour shows. */
  readonly z: number;
  /** Weighted sample (N2.8.1 rule 2) and raw rows behind it. */
  readonly sample: number;
  readonly rawSample: number;
  readonly since: WorldDate | null;
  readonly firstEvidence: WorldDate | null;
  readonly lastEvidence: WorldDate | null;
  /** Absolute day the measure was taken at (the last evidence step). */
  readonly evaluatedDay: number;
  /** Rows inside the window at the last evaluation: the evidence the label rests on. */
  readonly evidenceIds: readonly number[];
  readonly transitions: readonly LabelTransition[];
  readonly thinBaseline: boolean;
  readonly usesCompacted: boolean;
  /** A compaction summary in the span lacked this label's counter (X2.4.1 rule 5). */
  readonly missingCompactedCounts: boolean;
  /** X2.2.3 outputs. */
  readonly stale: boolean;
  readonly weight: number;
  readonly protectedSubject: boolean;
}

/** Measure of a set of items taken at time `t` (N2.8.1 rule 2). Exposed so a trace can recompute it. */
export function measureOf(def: LabelDef, items: readonly EvidenceItem[], atDay: number): { measure: number; baseline: number; z: number; sample: number; raw: number } {
  const hl = halfLifeOf(def);
  let sw = 0; let sp = 0; let sb = 0; let raw = 0;
  for (const it of items) {
    const w = weightForAge(atDay - it.day, hl);
    sw += w * it.tot; sp += w * it.pos; sb += w * it.tot * it.p0; raw += def.measure === 'rate' ? it.tot : it.pos;
  }
  let measure: number; let baseline: number; let z: number; let sample: number;
  if (def.measure === 'rate') {
    measure = sw > 0 ? sp / sw : 0;
    baseline = sw > 0 ? sb / sw : 0;
    const v = baseline * (1 - baseline);
    z = sw > 0 ? zOf(measure - baseline, v > 0 ? Math.sqrt(v / sw) : 0) : 0;
    sample = sw;
  } else {
    measure = sp; baseline = sb;
    z = zOf(measure - baseline, baseline > 0 ? Math.sqrt(baseline) : 0);
    sample = sp;
  }
  return { measure, baseline, z: def.direction === 'above' ? z : -z, sample, raw };
}

const Z_CAP = 1e6;
function zOf(diff: number, se: number): number {
  if (se > 0) return diff / se;
  return diff > 0 ? Z_CAP : diff < 0 ? -Z_CAP : 0;
}

export function strengthOf(z: number, on: number): Strength | null {
  if (z < on) return null;
  return z >= P.zStrong ? 'strong' : z >= P.zClear ? 'clear' : 'mild';
}

/** X2.2.3 rule 3 weight, from the age of the last evidence in seasons. */
export function labelWeight(ageSeasons: number, windowSeasons: number, frozen: boolean): number {
  const w = windowSeasons > 0 ? windowSeasons : P.staleSeasonsDefault;
  if (ageSeasons <= w) return P.weightFresh;
  if (ageSeasons < w * 2) return P.weightFresh - (P.weightFresh - P.weightHeldFloor) * ((ageSeasons - w) / w);
  if (!frozen) return P.weightHeldFloor;
  const end = w * P.frozenFloorAtWindows;
  if (ageSeasons >= end) return P.weightFrozenFloor;
  return P.weightHeldFloor - (P.weightHeldFloor - P.weightFrozenFloor) * ((ageSeasons - w * 2) / (end - w * 2));
}

/** Evidence items of a subject for a label, in log order, as known at `ctx.asOf`. */
export function evidenceItems(def: LabelDef, subjectId: number, rows: readonly WorldEvent[], ctx: EvalContext): { items: (EvidenceItem & { reversedAt: ReversalRef | null })[]; missing: boolean } {
  const asOf = absDay(ctx.asOf);
  const items: (EvidenceItem & { reversedAt: ReversalRef | null })[] = [];
  let missing = false;
  for (const e of rows) {
    const day = absDay(e.when.date);
    if (day > asOf) break;
    if (ctx.visible && !ctx.visible(e)) continue;
    const pos = matchCount(def.positive, def.subjectBy, subjectId, e);
    const neg = matchCount(def.negative, def.subjectBy, subjectId, e);
    if (pos === null || neg === null) { missing = true; }
    const p = pos ?? 0; const n = neg ?? 0;
    const tot = p + n;
    if (tot === 0) continue;
    const { p0, thin } = ctx.baseline.rate(levelKey(e, ctx.levelOf), e.when.date.seasonYear);
    items.push({ eventId: e.id, day, pos: p, tot, p0, thin, compacted: e.type === 'history_summary', reversedAt: ctx.reversedBy?.get(e.id) ?? null });
  }
  return { items, missing };
}

/**
 * Evaluate one label for one subject (X2.2.2 rules 1 to 5, X2.2.3). Evidence is replayed in log order;
 * state is taken at the end of each day with evidence, with hysteresis between `thresholdOn` and
 * `thresholdOff`. A label forms only with the minimum weighted sample (N2.8.1 rule 2).
 */
export function evaluateLabel(def: LabelDef, subjectId: number, rows: readonly WorldEvent[], ctx: EvalContext): LabelResult {
  const on = thresholdOnOf(def);
  const off = thresholdOffOf(def);
  const minSample = minSampleOf(def) * (ctx.minSampleScale ?? 1);
  const protectedSubject = !!def.personal && ctx.origin === 'imported';
  const { items, missing } = evidenceItems(def, subjectId, rows, ctx);
  const dateOf = new Map<number, WorldDate>();
  for (const e of rows) if (absDay(e.when.date) <= absDay(ctx.asOf)) dateOf.set(e.id, e.when.date);

  // Evaluation steps: each evidence row, and each reversal of an evidence row (X2.2.2 edge case).
  const asOf = absDay(ctx.asOf);
  const steps: { id: number; day: number }[] = items.map((i) => ({ id: i.eventId, day: i.day }));
  for (const i of items) if (i.reversedAt !== null && absDay(i.reversedAt.date) <= asOf) {
    steps.push({ id: i.reversedAt.id, day: absDay(i.reversedAt.date) });
    dateOf.set(i.reversedAt.id, i.reversedAt.date);
  }
  steps.sort((a, b) => a.id - b.id);

  const windowDays = def.windowSeasons * P.daysPerSeasonYear;
  let state: 'held' | 'absent' = 'absent';
  let since: WorldDate | null = null;
  const transitions: LabelTransition[] = [];
  let last = { measure: 0, baseline: 0, z: 0, sample: 0, raw: 0 };
  let lastWindow: EvidenceItem[] = [];
  let lastDay = 0;
  let lo = 0; let hi = 0;
  for (let si = 0; si < steps.length; si++) {
    const st = steps[si]!;
    // State is taken once per simulation day, after the day's last evidence row, so a day's rows count
    // together whether they are stored one by one or as a game-level summary (X2.4.1 rule 1).
    const next = steps[si + 1];
    if (next && next.day === st.day) continue;
    while (hi < items.length && items[hi]!.eventId <= st.id) hi++;
    while (lo < hi && st.day - items[lo]!.day >= windowDays) lo++;
    const win: EvidenceItem[] = [];
    for (let k = lo; k < hi; k++) { const i = items[k]!; if (i.reversedAt === null || i.reversedAt.id > st.id) win.push(i); }
    const m = measureOf(def, win, st.day);
    last = m; lastWindow = win; lastDay = st.day;
    if (protectedSubject) continue;
    if (state === 'absent' && m.sample >= minSample && m.z >= on) {
      state = 'held'; since = dateOf.get(st.id) ?? null;
      transitions.push({ eventId: st.id, date: dateOf.get(st.id)!, state });
    } else if (state === 'held' && m.z < off) {
      state = 'absent'; since = null;
      transitions.push({ eventId: st.id, date: dateOf.get(st.id)!, state });
    }
  }
  const live = items.filter((i) => i.reversedAt === null || absDay(i.reversedAt.date) > asOf);
  const firstEvidence = live.length ? dateOf.get(live[0]!.eventId)! : null;
  const lastEvidence = live.length ? dateOf.get(live[live.length - 1]!.eventId)! : null;
  const age = lastEvidence ? (asOf - absDay(lastEvidence)) / P.daysPerSeasonYear : 0;
  const stale = lastEvidence !== null && age > def.windowSeasons;
  return {
    labelId: def.id,
    subjectId,
    state,
    strength: state === 'held' ? strengthOf(last.z, Math.min(on, P.zMild)) ?? 'mild' : null,
    measure: last.measure,
    baseline: last.baseline,
    z: last.z,
    sample: last.sample,
    rawSample: last.raw,
    since,
    firstEvidence,
    lastEvidence,
    evaluatedDay: lastDay,
    evidenceIds: lastWindow.map((i) => i.eventId),
    transitions,
    thinBaseline: lastWindow.some((i) => i.thin),
    usesCompacted: lastWindow.some((i) => i.compacted),
    missingCompactedCounts: missing,
    stale,
    weight: labelWeight(age, def.windowSeasons, !!ctx.outOfFootball),
    protectedSubject,
  };
}

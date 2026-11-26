// The predictability index (G8.2.1): how much better than the league baseline an opponent could guess
// a caller's next call from what it knows before the snap and the caller's own history so far.
//
// Reference model: for each call, in order, the chance of each category is the caller's own recent
// share in the same situation, shrunk toward the league baseline for that situation; with extra pre-snap
// features (personnel, formation, motion) a second level shrinks the caller's share for that look
// toward the situation-only estimate (see `lookKey`). The model uses only calls before the current one inside a rolling
// window: it never sees the future. The index is the mean log-likelihood gain of that model over the
// baseline, in nats per call. Lower is better; a caller who mixes at league rates scores near zero.
import type { DeterministicMath } from '@gm/schema';
import { param } from './params.ts';

/** What an opponent knows before the snap (G8.2.1 inputs). */
export interface PreSnapInfo {
  readonly down: number;
  readonly distanceYd: number;
  readonly yardsToGoalYd: number;
  readonly scoreDiff: number;
  readonly halfSecondsLeft: number;
  /** Seconds left in the game (for the forced-call rule). */
  readonly gameSecondsLeft: number;
  readonly shotgun?: boolean;
  readonly noHuddle?: boolean;
  readonly personnel?: string | null;
  readonly formation?: string | null;
  readonly motion?: boolean;
}

export interface CallRecord {
  readonly info: PreSnapInfo;
  /** The call's category (OFFENSE_CATEGORIES or DEFENSE_CATEGORIES, or the caller's own list). */
  readonly category: string;
  /** Marked by the caller when the call was forced (kneel-down, spike). */
  readonly forced?: boolean;
}

/** Offense categories of G8.2.1: run, quick pass, dropback, play action, screen, by direction. */
export const OFFENSE_KINDS = ['run', 'quick_pass', 'dropback', 'play_action', 'screen'] as const;
export const DIRECTIONS = ['left', 'middle', 'right'] as const;
export function offenseCategory(kind: (typeof OFFENSE_KINDS)[number], direction: (typeof DIRECTIONS)[number]): string {
  return `${kind}.${direction}`;
}
export const OFFENSE_CATEGORIES: readonly string[] = OFFENSE_KINDS.flatMap((k) => DIRECTIONS.map((d) => offenseCategory(k, d)));

/** Defense categories of G8.2.1: pressure or not, one-high or two-high, man or zone. */
export function defenseCategory(pressure: boolean, shell: 'one_high' | 'two_high', coverage: 'man' | 'zone'): string {
  return `${pressure ? 'pressure' : 'no_pressure'}.${shell}.${coverage}`;
}
export const DEFENSE_CATEGORIES: readonly string[] = [true, false].flatMap((p) =>
  (['one_high', 'two_high'] as const).flatMap((s) => (['man', 'zone'] as const).map((c) => defenseCategory(p, s, c))));

/** Situation key from the situation alone: down, distance, field zone, score, late half, shotgun, no-huddle. */
export function situationKey(i: PreSnapInfo): string {
  const d = i.distanceYd <= param('bucket.shortYd') ? 's' : i.distanceYd <= param('bucket.mediumYd') ? 'm' : i.distanceYd <= param('bucket.longYd') ? 'l' : 'x';
  const y = i.yardsToGoalYd <= param('bucket.goalLineYd') ? 'gl' : i.yardsToGoalYd <= param('bucket.redZoneYd') ? 'rz' : i.yardsToGoalYd > param('bucket.ownDeepYd') ? 'deep' : 'mid';
  const c = param('bucket.closeScore');
  const sc = i.scoreDiff < -c ? 'tb' : i.scoreDiff < 0 ? 't' : i.scoreDiff === 0 ? 'e' : i.scoreDiff <= c ? 'l' : 'lb';
  const late = i.halfSecondsLeft <= param('bucket.lateHalfS') ? 'late' : 'n';
  return `${i.down}|${d}|${y}|${sc}|${late}|${i.shotgun ? 'sg' : 'uc'}|${i.noHuddle ? 'nh' : 'h'}`;
}

/**
 * Look key: down plus personnel, formation and motion, when the opponent has them. It is kept coarse on
 * purpose (down only, not the whole situation) so a tell that shows up across situations is learned
 * from a season's worth of calls; the situation estimate is its prior.
 */
export function lookKey(i: PreSnapInfo): string {
  return `${i.down}|${i.personnel ?? '-'}|${i.formation ?? '-'}|${i.motion ? 'mo' : '-'}`;
}

/** G8.2.1 edge cases: kneel-downs and spikes (marked forced) and late long-yardage desperation. */
export function isForced(c: CallRecord): boolean {
  if (c.forced) return true;
  const i = c.info;
  return i.gameSecondsLeft <= param('forced.desperationSeconds') && i.scoreDiff <= -param('forced.desperationTrailBy');
}

/** League shares of each category by situation key: the baseline that knows only the league average. */
export interface LeagueBaseline {
  readonly categories: readonly string[];
  /** Situation key to counts per category (same order as `categories`). */
  readonly bySituation: ReadonlyMap<string, readonly number[]>;
  readonly overall: readonly number[];
}

export function buildBaseline(calls: readonly CallRecord[], categories: readonly string[]): LeagueBaseline {
  const idx = new Map(categories.map((c, i) => [c, i] as const));
  const by = new Map<string, number[]>();
  const overall = new Array<number>(categories.length).fill(0);
  for (const c of calls) {
    if (isForced(c)) continue;
    const k = idx.get(c.category);
    if (k === undefined) throw new Error(`unknown category ${c.category}`);
    const key = situationKey(c.info);
    let row = by.get(key);
    if (!row) { row = new Array<number>(categories.length).fill(0); by.set(key, row); }
    row[k]! += 1;
    overall[k]! += 1;
  }
  return { categories: [...categories], bySituation: by, overall };
}

/** Baseline chances for a situation: its league counts, smoothed toward the overall league mix. */
export function baselineProbabilities(b: LeagueBaseline, key: string): number[] {
  const row = b.bySituation.get(key);
  const totalAll = b.overall.reduce((a, x) => a + x, 0);
  const K = b.categories.length;
  const prior = b.overall.map((x) => (totalAll > 0 ? x / totalAll : 1 / K));
  const s = param('baselineSmoothing');
  // A category the league never called still gets a small chance so a log-likelihood stays finite.
  const floorPrior = prior.map((p) => (p + 1 / (K * (totalAll + 1))) / (1 + 1 / (totalAll + 1)));
  if (!row) return floorPrior;
  const n = row.reduce((a, x) => a + x, 0);
  return row.map((x, k) => (x + s * K * floorPrior[k]!) / (n + s * K));
}

export interface PredictabilityOptions {
  /** Use personnel, formation and motion as well as the situation (G8.2.1 "adding formation and alignment features"). */
  readonly withFormation: boolean;
  /** Maps a category to run (true) or pass (false) for the plain-words accuracy figure; omit to skip it. */
  readonly isRun?: (category: string) => boolean;
}

export interface CutContribution {
  readonly situation: string;
  readonly calls: number;
  /** Summed gain in this situation: its share of the index times the call count. */
  readonly totalGain: number;
}

export interface PredictabilityResult {
  /** Mean log-likelihood gain over the baseline, nats per call. Lower is better. */
  readonly index: number;
  readonly calls: number;
  readonly excluded: number;
  /** Share of calls the reference model's top pick got right. */
  readonly accuracy: number;
  /** Run-or-pass accuracy of the reference model and of the baseline (when `isRun` is given). */
  readonly runPassAccuracy: number | null;
  readonly baselineRunPassAccuracy: number | null;
  /** Situations that add most to the index, largest first. */
  readonly cuts: readonly CutContribution[];
  /** Gain of each counted call in order (null for an excluded call), so a game or any window can be summed. */
  readonly perCall: readonly (number | null)[];
}

function argmax(p: readonly number[]): number {
  let b = 0;
  for (let k = 1; k < p.length; k++) if (p[k]! > p[b]!) b = k;
  return b;
}

function runShare(p: readonly number[], cats: readonly string[], isRun: (c: string) => boolean): number {
  let r = 0;
  for (let k = 0; k < p.length; k++) if (isRun(cats[k]!)) r += p[k]!;
  return r;
}

/** Compute the index over one caller's calls, in the order they were made (G8.2.1 rules). */
export function predictability(calls: readonly CallRecord[], baseline: LeagueBaseline, opt: PredictabilityOptions, math: DeterministicMath): PredictabilityResult {
  const cats = baseline.categories;
  const K = cats.length;
  const idx = new Map(cats.map((c, i) => [c, i] as const));
  const prior = param('priorStrength');
  const windowCalls = param('windowCalls');
  const sitCounts = new Map<string, number[]>();
  const fullCounts = new Map<string, number[]>();
  const history: { sit: string; full: string; k: number }[] = [];
  const perCall: (number | null)[] = [];
  const cutMap = new Map<string, { calls: number; gain: number }>();
  let gainSum = 0, n = 0, excluded = 0, hits = 0, rpHits = 0, rpBase = 0;
  const add = (m: Map<string, number[]>, key: string, k: number, d: number) => {
    let row = m.get(key);
    if (!row) { row = new Array<number>(K).fill(0); m.set(key, row); }
    row[k]! += d;
  };
  for (const c of calls) {
    if (isForced(c)) { excluded++; perCall.push(null); continue; }
    const k = idx.get(c.category);
    if (k === undefined) throw new Error(`unknown category ${c.category}`);
    const sit = situationKey(c.info);
    const full = lookKey(c.info);
    const pb = baselineProbabilities(baseline, sit);
    const sc = sitCounts.get(sit);
    const ns = sc ? sc.reduce((a, x) => a + x, 0) : 0;
    let pm = pb.map((p, j) => ((sc ? sc[j]! : 0) + prior * p) / (ns + prior));
    if (opt.withFormation) {
      const fc = fullCounts.get(full);
      const nf = fc ? fc.reduce((a, x) => a + x, 0) : 0;
      pm = pm.map((p, j) => ((fc ? fc[j]! : 0) + prior * p) / (nf + prior));
    }
    const g = math.log(pm[k]!) - math.log(pb[k]!);
    gainSum += g; n++; perCall.push(g);
    const cut = cutMap.get(sit) ?? { calls: 0, gain: 0 };
    cut.calls++; cut.gain += g; cutMap.set(sit, cut);
    if (argmax(pm) === k) hits++;
    if (opt.isRun) {
      const actualRun = opt.isRun(c.category);
      if ((runShare(pm, cats, opt.isRun) >= 0.5) === actualRun) rpHits++;
      if ((runShare(pb, cats, opt.isRun) >= 0.5) === actualRun) rpBase++;
    }
    // Learn from this call only after predicting it, and forget calls that leave the window.
    add(sitCounts, sit, k, 1); add(fullCounts, full, k, 1);
    history.push({ sit, full, k });
    if (history.length > windowCalls) {
      const old = history.shift()!;
      add(sitCounts, old.sit, old.k, -1); add(fullCounts, old.full, old.k, -1);
    }
  }
  const cuts = [...cutMap.entries()].map(([situation, v]) => ({ situation, calls: v.calls, totalGain: v.gain }))
    .sort((a, b) => b.totalGain - a.totalGain || (a.situation < b.situation ? -1 : 1));
  return {
    index: n ? gainSum / n : 0,
    calls: n,
    excluded,
    accuracy: n ? hits / n : 0,
    runPassAccuracy: opt.isRun && n ? rpHits / n : null,
    baselineRunPassAccuracy: opt.isRun && n ? rpBase / n : null,
    cuts,
    perCall,
  };
}

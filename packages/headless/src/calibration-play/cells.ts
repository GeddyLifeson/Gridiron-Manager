// Play-layer cells (WP-26; Q1.7.2 play level: "outcome distributions by play type, depth, down and
// distance, and field zone"; J15.1.2: conditional targets are checked cell by cell). A cell is one
// measure inside one split. The same code measures a real sample (rows from `rowFromPublic`) and a
// simulated one, so both sides count the same plays the same way. Play classes are the WP-13 ones.
//
// The bins are bins, not facts: depth bins are the J15.4.1 ones; distance bins are those of
// research/nflverse_baselines.py; zones cut the field at the 20s, midfield and the 10. The charted splits
// (rushers, pressure, play action, coverage, box, personnel, motion) cut by what the participation and FTN
// files chart (J15.4.2); a play with no chart is outside those splits and their share base.
import type { PlayByPlayRow } from '@gm/schema';
import { isPassOrRun, isPassPlay, isDropback, isAttempt, isCompletion, isCarry, yardsToGoInt, mean, sampleSd, quantile } from '../calibration/measures.ts';

export type CellKind = 'rate' | 'mean' | 'quantiles';
/** Tolerance class of J15.1.2: core rates, rare events, distribution shapes. */
export type CellClass = 'core' | 'rare' | 'shape';

export type Dim = 'all' | 'down' | 'downDistance' | 'zone' | 'depth' | 'rushers' | 'pressure' | 'action' | 'coverage' | 'box' | 'personnel' | 'motion';
/** Which plays a split cuts: every pass or run play; passes with a depth; charted dropbacks; charted carries; or pass or run plays cut by a charted fact. */
export type Family = 'play' | 'depth' | 'dropback' | 'carry' | 'scrimmage';

export interface Split {
  readonly dim: Dim;
  readonly key: string;
  readonly family: Family;
  /** Position inside an ordered group, for the monotone-shape check; `group` names the group, empty for none. */
  readonly group: string;
  readonly order: number;
  readonly keep: (r: PlayByPlayRow) => boolean;
  /** Plays the split's share is taken over. */
  readonly base: (r: PlayByPlayRow) => boolean;
}

export interface Metric {
  readonly id: string;
  readonly kind: CellKind;
  readonly cls: CellClass;
  /** The split families the metric runs in. */
  readonly families: readonly Family[];
  /** Dims the metric skips because it would be fixed by the split itself. */
  readonly skip?: readonly Dim[];
  readonly words: string;
  /** Plays the metric counts. */
  readonly unit: (r: PlayByPlayRow) => boolean;
  readonly value: (r: PlayByPlayRow) => number;
}

/** Quantile points of shape cells, in percent (J15.1.2 names the 10th to 75th and the 90th and above). */
export const SHAPE_POINTS: readonly number[] = [10, 25, 50, 75, 90, 95];

const bit = (b: boolean): number => (b ? 1 : 0);
/** Whole yards to the goal, the public convention; at least 1. */
function goalInt(r: PlayByPlayRow): number { return Math.max(1, Math.round(r.yardsToGoalYd)); }
function airInt(r: PlayByPlayRow): number | null { return r.airYd === null ? null : Math.round(r.airYd); }
/** Yards the play is charged with: a sack's loss, a completion's gain, zero for other attempts, a carry's gain. */
export function playYards(r: PlayByPlayRow): number { return isAttempt(r) && !isCompletion(r) ? 0 : r.yardsGained; }
const offenseScore = (r: PlayByPlayRow): boolean => r.touchdown && !r.interception && !r.fumbleLost;

const DISTANCE_BINS: readonly (readonly [string, number, number])[] = [['1-2', 1, 2], ['3-5', 3, 5], ['6-9', 6, 9], ['10+', 10, 99]];
const ZONES: readonly (readonly [string, number, number])[] = [
  ['own1-20', 80, 99], ['own21-50', 50, 79], ['opp49-21', 21, 49], ['opp20-11', 11, 20], ['opp10-1', 1, 10],
];
export const DEPTH_BINS: readonly (readonly [string, number, number])[] = [
  ['behind', -100, -1], ['0', 0, 0], ['1-5', 1, 5], ['6-10', 6, 10], ['11-15', 11, 15], ['16-20', 16, 20], ['21-30', 21, 30], ['31+', 31, 100],
];

const charted = (r: PlayByPlayRow): boolean => isDropback(r) && r.rushers !== null;
const chartedCarry = (r: PlayByPlayRow): boolean => isCarry(r) && r.boxCount !== null && r.boxCount >= 1;
const RUSHER_BINS: readonly (readonly [string, number, number])[] = [['1-3', 1, 3], ['4', 4, 4], ['5', 5, 5], ['6+', 6, 11]];
const BOX_BINS: readonly (readonly [string, number, number])[] = [['1-5', 1, 5], ['6', 6, 6], ['7', 7, 7], ['8', 8, 8], ['9+', 9, 11]];
/** Personnel codes (backs, tight ends) named as splits; any other charted code is `other`. */
export const PERSONNEL_CODES: readonly string[] = ['11', '12', '21', '10', '13', '22', '20'];
export const COVERAGE_KEYS: readonly NonNullable<PlayByPlayRow['coverageFamily']>[] = ['cover0', 'cover1', 'cover2', 'cover3', 'cover4', 'cover6', 'two_man', 'other'];

function buildSplits(): Split[] {
  const out: Split[] = [{ dim: 'all', key: 'all', family: 'play', group: 'all', order: 0, base: isPassOrRun, keep: () => true }];
  for (let d = 1; d <= 4; d++) out.push({ dim: 'down', key: String(d), family: 'play', group: 'down', order: d, base: isPassOrRun, keep: (r) => r.down === d });
  for (let d = 1; d <= 4; d++) DISTANCE_BINS.forEach(([name, lo, hi], i) => out.push({
    dim: 'downDistance', key: `${d}&${name}`, family: 'play', group: `downDistance:${d}`, order: i, base: isPassOrRun,
    keep: (r) => { const y = yardsToGoInt(r); return r.down === d && y !== null && y >= lo && y <= hi; },
  }));
  ZONES.forEach(([name, lo, hi], i) => out.push({ dim: 'zone', key: name, family: 'play', group: 'zone', order: i, base: isPassOrRun, keep: (r) => { const y = goalInt(r); return y >= lo && y <= hi; } }));
  const attemptWithDepth = (r: PlayByPlayRow): boolean => isAttempt(r) && r.airYd !== null;
  DEPTH_BINS.forEach(([name, lo, hi], i) => out.push({ dim: 'depth', key: name, family: 'depth', group: 'depth', order: i, base: attemptWithDepth, keep: (r) => { const a = airInt(r); return isAttempt(r) && a !== null && a >= lo && a <= hi; } }));
  // Charted splits (participation and FTN files).
  RUSHER_BINS.forEach(([name, lo, hi], i) => out.push({ dim: 'rushers', key: name, family: 'dropback', group: 'rushers', order: i, base: charted, keep: (r) => charted(r) && r.rushers! >= lo && r.rushers! <= hi }));
  out.push({ dim: 'pressure', key: 'clean', family: 'dropback', group: '', order: 0, base: charted, keep: (r) => charted(r) && !r.pressure });
  out.push({ dim: 'pressure', key: 'pressured', family: 'dropback', group: '', order: 1, base: charted, keep: (r) => charted(r) && r.pressure });
  out.push({ dim: 'action', key: 'noPlayAction', family: 'dropback', group: '', order: 0, base: isDropback, keep: (r) => isDropback(r) && !r.playAction });
  out.push({ dim: 'action', key: 'playAction', family: 'dropback', group: '', order: 1, base: isDropback, keep: (r) => isDropback(r) && r.playAction });
  COVERAGE_KEYS.forEach((k, i) => out.push({ dim: 'coverage', key: k, family: 'dropback', group: '', order: i, base: (r) => charted(r) && r.coverageFamily !== null, keep: (r) => charted(r) && r.coverageFamily === k }));
  BOX_BINS.forEach(([name, lo, hi], i) => out.push({ dim: 'box', key: name, family: 'carry', group: 'box', order: i, base: chartedCarry, keep: (r) => chartedCarry(r) && r.boxCount! >= lo && r.boxCount! <= hi }));
  const knownPersonnel = (r: PlayByPlayRow): boolean => isPassOrRun(r) && r.personnelCode !== null;
  for (const code of [...PERSONNEL_CODES, 'other']) out.push({
    dim: 'personnel', key: code, family: 'scrimmage', group: '', order: 0, base: knownPersonnel,
    keep: (r) => knownPersonnel(r) && (code === 'other' ? !PERSONNEL_CODES.includes(r.personnelCode!) : r.personnelCode === code),
  });
  out.push({ dim: 'motion', key: 'noMotion', family: 'scrimmage', group: '', order: 0, base: isPassOrRun, keep: (r) => isPassOrRun(r) && !r.motion });
  out.push({ dim: 'motion', key: 'motion', family: 'scrimmage', group: '', order: 1, base: isPassOrRun, keep: (r) => isPassOrRun(r) && r.motion });
  return out;
}

export const SPLITS: readonly Split[] = buildSplits();

export const METRICS: readonly Metric[] = [
  { id: 'play.passPlayShare', kind: 'rate', cls: 'core', families: ['play', 'scrimmage'], words: 'pass plays (attempts and sacks) over pass and run plays', unit: isPassOrRun, value: (r) => bit(isPassPlay(r)) },
  { id: 'play.yards', kind: 'mean', cls: 'core', families: ['play', 'scrimmage'], words: 'yards per pass or run play, sacks as losses', unit: isPassOrRun, value: playYards },
  { id: 'play.firstDownRate', kind: 'rate', cls: 'core', families: ['play', 'scrimmage'], words: 'plays that gain a first down or an offensive touchdown', unit: isPassOrRun, value: (r) => bit(r.firstDown || offenseScore(r)) },
  { id: 'play.touchdownRate', kind: 'rate', cls: 'rare', families: ['play', 'scrimmage'], words: 'offensive touchdowns per pass or run play', unit: isPassOrRun, value: (r) => bit(offenseScore(r)) },
  { id: 'play.turnoverRate', kind: 'rate', cls: 'rare', families: ['play', 'scrimmage'], words: 'interceptions and lost fumbles per pass or run play', unit: isPassOrRun, value: (r) => bit(r.interception || r.fumbleLost) },
  { id: 'pass.completionPct', kind: 'rate', cls: 'core', families: ['play', 'depth', 'dropback', 'scrimmage'], words: 'completions over attempts', unit: isAttempt, value: (r) => bit(isCompletion(r)) },
  { id: 'pass.yardsPerAttempt', kind: 'mean', cls: 'core', families: ['play', 'depth', 'dropback', 'scrimmage'], words: 'passing yards over attempts', unit: isAttempt, value: (r) => (isCompletion(r) ? r.yardsGained : 0) },
  { id: 'pass.interceptionRate', kind: 'rate', cls: 'rare', families: ['play', 'depth', 'dropback', 'scrimmage'], words: 'interceptions over attempts', unit: isAttempt, value: (r) => bit(r.interception) },
  { id: 'pass.yacPerCompletion', kind: 'mean', cls: 'core', families: ['depth'], words: 'yards after catch per completion', unit: (r) => isCompletion(r) && r.yardsAfterCatch !== null, value: (r) => r.yardsAfterCatch ?? 0 },
  { id: 'pass.sackRate', kind: 'rate', cls: 'rare', families: ['play', 'dropback', 'scrimmage'], words: 'sacks over pass plays', unit: isPassPlay, value: (r) => bit(r.sack) },
  { id: 'pass.scrambleShare', kind: 'rate', cls: 'rare', families: ['play', 'dropback'], words: 'scrambles over dropbacks', unit: isDropback, value: (r) => bit(r.scramble) },
  { id: 'pass.pressureRate', kind: 'rate', cls: 'core', families: ['play', 'dropback'], skip: ['pressure'], words: 'dropbacks the quarterback was pressured on, by the feed flag (was_pressure)', unit: charted, value: (r) => bit(r.pressure) },
  { id: 'pass.rushers1to3', kind: 'rate', cls: 'core', families: ['play', 'dropback'], skip: ['rushers'], words: 'dropbacks with one to three pass rushers', unit: charted, value: (r) => bit(r.rushers! <= 3) },
  { id: 'pass.rushers4', kind: 'rate', cls: 'core', families: ['play', 'dropback'], skip: ['rushers'], words: 'dropbacks with four pass rushers', unit: charted, value: (r) => bit(r.rushers === 4) },
  { id: 'pass.rushers5', kind: 'rate', cls: 'core', families: ['play', 'dropback'], skip: ['rushers'], words: 'dropbacks with five pass rushers', unit: charted, value: (r) => bit(r.rushers === 5) },
  { id: 'pass.rushers6plus', kind: 'rate', cls: 'core', families: ['play', 'dropback'], skip: ['rushers'], words: 'dropbacks with six or more pass rushers', unit: charted, value: (r) => bit(r.rushers! >= 6) },
  { id: 'pass.playActionShare', kind: 'rate', cls: 'core', families: ['play', 'dropback'], skip: ['action'], words: 'dropbacks that are play-action passes (FTN is_play_action)', unit: isDropback, value: (r) => bit(r.playAction) },
  { id: 'play.motionShare', kind: 'rate', cls: 'core', families: ['play', 'scrimmage'], skip: ['motion'], words: 'pass and run plays with pre-snap motion (FTN is_motion)', unit: isPassOrRun, value: (r) => bit(r.motion) },
  { id: 'pass.completedGain', kind: 'quantiles', cls: 'shape', families: ['play'], words: 'gain on completions', unit: isCompletion, value: (r) => r.yardsGained },
  { id: 'rush.yardsPerCarry', kind: 'mean', cls: 'core', families: ['play', 'carry', 'scrimmage'], words: 'yards per carry, scrambles in, kneel-downs out', unit: isCarry, value: (r) => r.yardsGained },
  { id: 'rush.stuffedShare', kind: 'rate', cls: 'core', families: ['play', 'carry', 'scrimmage'], words: 'carries for no gain or a loss', unit: isCarry, value: (r) => bit(r.yardsGained <= 0) },
  { id: 'rush.gain10Share', kind: 'rate', cls: 'core', families: ['play', 'carry', 'scrimmage'], words: 'carries of 10 yards or more', unit: isCarry, value: (r) => bit(r.yardsGained >= 10) },
  { id: 'rush.gain', kind: 'quantiles', cls: 'shape', families: ['play', 'carry'], words: 'gain on carries', unit: isCarry, value: (r) => r.yardsGained },
];

/** One measured cell. `value` is a number, or one number per SHAPE_POINTS entry for a quantile cell. */
export interface CellValue {
  readonly id: string;
  readonly dim: Split['dim'];
  readonly key: string;
  readonly metric: string;
  readonly kind: CellKind;
  readonly cls: CellClass;
  readonly n: number;
  readonly value: number | readonly number[] | null;
  /** Sample standard deviation of the observations, for the standard error of a mean. Null for other kinds. */
  readonly sd: number | null;
}

export function cellId(split: Pick<Split, 'dim' | 'key'>, metric: Pick<Metric, 'id'>): string { return `${split.dim}[${split.key}].${metric.id}`; }
function applies(m: Metric, s: Split): boolean { return m.families.includes(s.family) && !(m.skip ?? []).includes(s.dim); }

/** Every (split, metric) pair of the suite, in a fixed order. */
export const CELL_PLAN: readonly { readonly split: Split; readonly metric: Metric }[] =
  SPLITS.flatMap((split) => METRICS.filter((m) => applies(m, split)).map((metric) => ({ split, metric })));

const r6 = (v: number): number => Number(v.toPrecision(6));

/** Measures every cell on a list of rows. One pass per split; observations are kept only while a cell is reduced. */
export function measureCells(rows: readonly PlayByPlayRow[]): CellValue[] {
  const out: CellValue[] = [];
  for (const split of SPLITS) {
    const inSplit = rows.filter(split.keep);
    if (split.dim !== 'all') {
      const base = rows.reduce((a, r) => a + bit(split.base(r)), 0);
      const n = inSplit.reduce((a, r) => a + bit(split.base(r)), 0);
      out.push({ id: `${split.dim}[${split.key}].share`, dim: split.dim, key: split.key, metric: 'share', kind: 'rate', cls: 'core', n: base, value: base > 0 ? r6(n / base) : null, sd: null });
    }
    for (const metric of METRICS) {
      if (!applies(metric, split)) continue;
      const obs: number[] = [];
      for (const r of inSplit) if (metric.unit(r)) obs.push(metric.value(r));
      let value: CellValue['value'] = null, sd: number | null = null;
      if (obs.length > 0) {
        if (metric.kind === 'quantiles') { const sorted = obs.sort((a, b) => a - b); value = SHAPE_POINTS.map((p) => r6(quantile(sorted, p)!)); }
        else { value = r6(mean(obs)!); if (metric.kind === 'mean') { const s = sampleSd(obs); sd = s === null ? null : r6(s); } }
      }
      out.push({ id: cellId(split, metric), dim: split.dim, key: split.key, metric: metric.id, kind: metric.kind, cls: metric.cls, n: obs.length, value, sd });
    }
  }
  return out;
}

/** Ordered groups for the monotone-shape check: group name to the split keys in order. */
export function orderedGroups(): Map<string, string[]> {
  const g = new Map<string, Split[]>();
  for (const s of SPLITS) if (s.dim !== 'all' && s.group !== '') { const a = g.get(s.group) ?? []; a.push(s); g.set(s.group, a); }
  return new Map([...g].map(([name, a]) => [name, a.sort((x, y) => x.order - y.order).map((s) => `${s.dim}[${s.key}]`)]));
}

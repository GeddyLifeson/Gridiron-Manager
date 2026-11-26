// Success rate, explosive plays and the per-play measures (N2.2.3).
import { param } from './params.ts';

/** N2.2.3 rule 1: two selectable success definitions, kept in data. */
export type SuccessDefinition =
  | { readonly kind: 'coaching'; readonly firstDownShare: number; readonly secondDownShare: number; readonly lateDownShare: number }
  | { readonly kind: 'model' };

/** N2.2.3 rule 2: user-editable explosive thresholds. */
export interface ExplosiveThresholds { readonly runYd: number; readonly passYd: number }

export interface MeasureDefinitions {
  readonly success: SuccessDefinition;
  readonly explosive: ExplosiveThresholds;
  /** N2.2.3 rule 3: rates on fewer plays than this are greyed. */
  readonly minSample: number;
  /** N2.2.3 rule 5: drop plays with win probability below this or above one minus it, when on. */
  readonly garbageTimeWp: number | null;
}

/** The starting definitions of N2.2.3 (coaching success, 10-yard runs, 20-yard passes, 30 plays). */
export function defaultDefinitions(): MeasureDefinitions {
  return {
    success: { kind: 'coaching', firstDownShare: param('success.firstDownShare'), secondDownShare: param('success.secondDownShare'), lateDownShare: param('success.lateDownShare') },
    explosive: { runYd: param('explosive.runYd'), passYd: param('explosive.passYd') },
    minSample: param('report.minSample'),
    garbageTimeWp: null,
  };
}

/** One play as the measures read it: the play record plus model values. */
export interface MeasuredPlay {
  readonly down: number;
  readonly distanceYd: number;
  readonly yardsGained: number;
  /** A called pass or a scramble counts as a pass for the explosive threshold. */
  readonly pass: boolean;
  readonly epa: number;
  /** Win probability of the offense at the snap, when known. */
  readonly wp?: number;
  /** N2.2.3 edge case: kneel-downs and spikes are excluded from every rate. */
  readonly kneelOrSpike: boolean;
  readonly turnover: boolean;
  /** Yards lost on the play (sack, tackle for loss), for the negative-play rate. */
  readonly negative: boolean;
}

export function isSuccess(p: MeasuredPlay, def: SuccessDefinition): boolean {
  if (def.kind === 'model') return p.epa > 0;
  const share = p.down === 1 ? def.firstDownShare : p.down === 2 ? def.secondDownShare : def.lateDownShare;
  return p.yardsGained >= share * p.distanceYd;
}

export function isExplosive(p: MeasuredPlay, t: ExplosiveThresholds): boolean {
  return p.yardsGained >= (p.pass ? t.passYd : t.runYd);
}

export interface Rate { readonly value: number; readonly n: number; readonly greyed: boolean }

export interface PlayMeasures {
  readonly plays: number;
  readonly successRate: Rate;
  readonly explosiveRate: Rate;
  readonly negativeRate: Rate;
  readonly epaPerPlay: Rate;
  readonly yardsPerPlay: Rate;
  readonly turnovers: number;
}

function rate(sum: number, n: number, min: number): Rate {
  return { value: n > 0 ? sum / n : 0, n, greyed: n < min };
}

/** Plays a rate counts (N2.2.3 edge case and rule 5). */
export function countedPlays(plays: readonly MeasuredPlay[], def: MeasureDefinitions): MeasuredPlay[] {
  const g = def.garbageTimeWp;
  return plays.filter((p) => !p.kneelOrSpike && (g === null || p.wp === undefined || (p.wp >= g && p.wp <= 1 - g)));
}

/** The per-play measures of one report (N2.2.3 "What the user sees"), every rate with its sample size. */
export function measurePlays(plays: readonly MeasuredPlay[], def: MeasureDefinitions): PlayMeasures {
  const ps = countedPlays(plays, def);
  let succ = 0, expl = 0, neg = 0, epaSum = 0, yds = 0, to = 0;
  for (const p of ps) {
    if (isSuccess(p, def.success)) succ++;
    if (isExplosive(p, def.explosive)) expl++;
    if (p.negative) neg++;
    if (p.turnover) to++;
    epaSum += p.epa;
    yds += p.yardsGained;
  }
  const n = ps.length, m = def.minSample;
  return {
    plays: n,
    successRate: rate(succ, n, m),
    explosiveRate: rate(expl, n, m),
    negativeRate: rate(neg, n, m),
    epaPerPlay: rate(epaSum, n, m),
    yardsPerPlay: rate(yds, n, m),
    turnovers: to,
  };
}

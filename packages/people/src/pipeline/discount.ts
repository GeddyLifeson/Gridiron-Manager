// How college evidence feeds pro grades (T11.3.1, D6.4.5 rules 3 and 4). Play-level evidence already carries
// the opponent: people.scouting's observe and evidenceVariance cut what a win against weaker opposition says.
// This file is the summary path for whole stat lines (summary seasons, imported history, J14 fast paths and AI
// boards): a level factor, an opponent weight, production normalised per opportunity and by system, and the
// supporting-cast adjustment with its own uncertainty. It never reads a true value: opponent strength is the
// evaluator's estimate of the opposition (rule 2), which is where mistakes enter.
import type { WorldDate } from '@gm/schema';
import { evidenceVariance, excessOverOpponent, p as scoutP, type Contributor, type EvidenceItem } from '../scouting/index.ts';
import { p } from './params.ts';

/** Competition tiers of T11.3.1 rule 4. A tier is data on a stat line, never a branch in a rule. */
export const COMPETITION_TIERS = ['pro', 'college_power', 'college_top_other', 'college_second', 'college_lower', 'high_school'] as const;
export type CompetitionTier = (typeof COMPETITION_TIERS)[number];

const TIER_PARAM: Readonly<Record<CompetitionTier, string>> = {
  pro: 'level.pro',
  college_power: 'level.collegePower',
  college_top_other: 'level.collegeTopOther',
  college_second: 'level.collegeSecond',
  college_lower: 'level.collegeLower',
  high_school: 'level.highSchool',
};

/** Weight of a whole stat line at a tier when play-level data is absent (T11.3.1 rule 4). */
export function levelFactor(tier: CompetitionTier): number {
  return p(TIER_PARAM[tier]);
}

/**
 * f(opponent strength - player grade) of T11.3.1 rule 3: 1.0 (times the base) against equal or stronger
 * opposition and within the D6.4.5 offset, falling as 1 / (the D6.4.5 variance multiplier) beyond it, and never
 * below the minimum (about 0.2). `playerGrade` is the organisation's estimate, `opponentGrade` its estimate of
 * the opposition.
 */
export function opponentWeight(playerGrade: number, opponentGrade: number): number {
  const r = excessOverOpponent(playerGrade, opponentGrade) / scoutP('opponent.scale');
  const f = 1 / (1 + r * r);
  const min = p('opponent.minWeight');
  return p('opponent.baseWeight') * (f > min ? f : min);
}

/** Kinds of production for normalisation (T11.3.1 rule 6). */
export type ProductionKind = 'pass_volume' | 'rush_volume' | 'efficiency';

/**
 * Production per opportunity, corrected for system (T11.3.1 rule 6). Tempo inflates totals, so the rate is per
 * opportunity (snap, route, attempt). A pass-first system inflates passing and receiving volume and deflates
 * rushing volume: volume rates are scaled toward a reference pass rate by `scheme.passRateElasticity`. Efficiency
 * rates (per attempt) are already per opportunity and take no system factor.
 */
export function normaliseProduction(input: {
  readonly total: number;
  readonly opportunities: number;
  readonly kind: ProductionKind;
  /** The player's team's pass share of plays. */
  readonly systemPassRate: number;
  /** The reference pass share (the level's mean). */
  readonly referencePassRate: number;
}): number {
  if (!(input.opportunities > 0)) throw new Error('production needs at least one opportunity');
  const perOpp = input.total / input.opportunities;
  const e = p('scheme.passRateElasticity');
  if (input.kind === 'pass_volume') {
    if (!(input.systemPassRate > 0)) throw new Error('pass volume needs a pass rate above zero');
    return perOpp * (1 + e * (input.referencePassRate / input.systemPassRate - 1));
  }
  if (input.kind === 'rush_volume') {
    const sysRun = 1 - input.systemPassRate;
    if (!(sysRun > 0)) throw new Error('rush volume needs a run rate above zero');
    return perOpp * (1 + e * ((1 - input.referencePassRate) / sysRun - 1));
  }
  return perOpp;
}

/**
 * Variance added by the supporting-cast adjustment (D6.4.5 rule 4): a quarterback behind a line and receivers
 * far from average has production that says less about him. `castGap` is the evaluator's estimate of the cast's
 * mean minus 50 (the average pro starter), in ISS.
 */
export function castVariance(castGap: number): number {
  const sd = p('scheme.castSdPerIss') * (castGap < 0 ? -castGap : castGap);
  return sd * sd;
}

/** A whole stat line already turned into an implied ISS reading by the caller's role regression. */
export interface StatLineLook {
  readonly attribute: string;
  /** Implied ISS from the normalised production (role-level evidence, D6.4.5 rule 4). */
  readonly impliedIss: number;
  /** Season share the line covers (1 = a full season). */
  readonly seasonShare: number;
  readonly tier: CompetitionTier;
  /** Evaluator's estimate of the opposition faced, or null when unknown (imported history). */
  readonly opponentGrade: number | null;
  /** The organisation's current estimate mean of the attribute. */
  readonly playerGrade: number;
  readonly castGap: number;
  readonly skill: number;
  readonly evaluator: Contributor;
  readonly date: WorldDate;
}

/**
 * Variance of a stat-line evidence item (T11.3.1 rules 3 and 4): the D6.4.2 season-statistics noise at the
 * evaluator's skill, divided by evidence weight = level factor x opponent weight, plus the cast adjustment's
 * own variance. Evaluators apply the cut in proportion to skill (D6.4.5 rule 3: staff who ignore it overrate
 * players from weak schedules), the same way people.scouting does.
 */
export function statLineVariance(look: Omit<StatLineLook, 'attribute' | 'impliedIss' | 'evaluator' | 'date'>): number {
  const base = evidenceVariance({ source: 'season_stats', units: look.seasonShare, skill: look.skill, estimateMean: look.playerGrade, opponent: null });
  const share = look.skill / scoutP('skill.divisor');
  const s = share > 1 ? 1 : share < 0 ? 0 : share;
  const levelW = levelFactor(look.tier);
  const oppW = look.opponentGrade === null ? 1 : opponentWeight(look.playerGrade, look.opponentGrade);
  // Full-skill evaluators divide by the whole weight; a skill-0 evaluator ignores the discount.
  const weight = 1 - s + s * levelW * oppW;
  return base / weight + castVariance(look.castGap);
}

/** The stat line as a people.scouting evidence item, ready for `update`. */
export function statLineEvidence(look: StatLineLook): EvidenceItem {
  return {
    attribute: look.attribute, value: look.impliedIss, variance: statLineVariance(look), units: look.seasonShare,
    date: look.date, evaluator: look.evaluator,
  };
}

/** Plays tagged with the opposition's estimated strength, for the "against top opposition" film filter. */
export function againstTopOpposition<T extends { readonly opponentGrade: number }>(plays: readonly T[], minGrade: number): T[] {
  return plays.filter((x) => x.opponentGrade >= minGrade);
}

/** One production line split by tier for display ("vs top-division: 7.9 per attempt on 212"; D6.4.5). */
export interface TierLine {
  readonly tier: CompetitionTier;
  readonly total: number;
  readonly opportunities: number;
}

/** Sums lines by tier, in COMPETITION_TIERS order, dropping empty tiers. */
export function splitByTier(lines: readonly TierLine[]): TierLine[] {
  const out: TierLine[] = [];
  for (const tier of COMPETITION_TIERS) {
    let total = 0;
    let opp = 0;
    for (const l of lines) if (l.tier === tier) { total += l.total; opp += l.opportunities; }
    if (opp > 0) out.push({ tier, total, opportunities: opp });
  }
  return out;
}

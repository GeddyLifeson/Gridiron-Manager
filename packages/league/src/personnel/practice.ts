// Camp practice (M6.2): rep allocation and evaluation reps, position battles, live periods and injury
// exposure, joint practices; and camp life (M6.5): report-day tests, weigh-ins and the mock game.
import { P } from './params.ts';
import defaults from './defaults.json' with { type: 'json' };

// ---------- M6.2.1 rep allocation ----------

export type OpponentUnit = 'first' | 'second' | 'third';
const UNITS: readonly OpponentUnit[] = ['first', 'second', 'third'];

/** Opponent-quality weights by unit, best first (M6.2.1 rule 3, M6.3.3 rule 2: starting 1.0, 0.6, 0.3). */
export function unitWeights(): readonly number[] { return [P.repWeightFirst, P.repWeightSecond, P.repWeightThird]; }

export function opponentWeight(unit: OpponentUnit): number { return unitWeights()[UNITS.indexOf(unit)]!; }

/**
 * Opponent level of a snap against a mixed lineup: the mean of the 11 opponents' depth ranks (M6.3.3 rule
 * 1, rank 1 = first unit), turned into a weight by interpolating between the unit weights.
 */
export function mixedOpponentWeight(ranks: readonly number[]): number {
  if (ranks.length === 0) return 0;
  const w = unitWeights();
  const mean = Math.min(w.length, Math.max(1, ranks.reduce((s, r) => s + r, 0) / ranks.length));
  const lo = Math.floor(mean), hi = Math.ceil(mean);
  const wl = w[lo - 1]!, wh = w[hi - 1]!;
  return wl + (wh - wl) * (mean - lo);
}

export interface RepLog { readonly personId: number; readonly opponentUnit: OpponentUnit; readonly reps: number; readonly crossed?: boolean }

/** Reps per player with their opponent-quality shares (summing to 1), and weighted evaluation reps (M6.2.1 outputs). */
export function repSummary(logs: readonly RepLog[]): { personId: number; total: number; shares: number[]; weighted: number }[] {
  const by = new Map<number, number[]>();
  for (const l of logs) {
    const row = by.get(l.personId) ?? UNITS.map(() => 0);
    const i = UNITS.indexOf(l.opponentUnit);
    row[i] = (row[i] ?? 0) + l.reps;
    by.set(l.personId, row);
  }
  const w = unitWeights();
  return [...by.entries()].sort(([a], [b]) => a - b).map(([personId, r]) => {
    const total = r.reduce((s, x) => s + x, 0);
    return { personId, total, shares: r.map((x) => (total > 0 ? x / total : 0)), weighted: r.reduce((s, x, i) => s + x * (w[i] ?? 0), 0) };
  });
}

/**
 * Splits a period's reps between units by the coach's split (rule 1): units alternate in proportion, the
 * remainder going to the first unit. A held-out player gets mental reps only (edge case), filed apart.
 */
export function splitReps(reps: number, split: readonly number[]): number[] {
  const t = split.reduce((a, b) => a + b, 0);
  if (!(t > 0)) return split.map(() => 0);
  const rest = split.slice(1).map((x) => Math.floor((reps * x) / t));
  return [reps - rest.reduce((a, b) => a + b, 0), ...rest];
}

// ---------- M6.2.2 position battles ----------

export type EvidenceWindow = 'acclimation' | 'padded_team' | 'preseason_game';
export type TraitKind = 'assignment' | 'timing' | 'tackling' | 'run_fit' | 'other';

/**
 * Whether a rep counts toward a trait (rule 2): acclimation reps count for assignment and timing only (no
 * contact), so acclimation adds nothing to a tackling or run-fit grade (acceptance).
 */
export function repCounts(phase: EvidenceWindow, trait: TraitKind): boolean {
  return phase !== 'acclimation' || trait === 'assignment' || trait === 'timing';
}

export type BattleKind = 'quarterback' | 'starter' | 'specialist';

export interface BattleCard {
  readonly job: string;
  readonly kind: BattleKind;
  readonly competitors: readonly { readonly personId: number; readonly weightedReps: number; readonly thinEvidence: boolean }[];
  /** Index of the preseason game the decision follows, or null for the cutdown week (rule 3). */
  readonly decideAfterGame: number | null;
}

/** A battle card with camp defaults (M6.2.2): decision dates by kind, and "thin evidence" below 150 weighted team reps. */
export function battleCard(job: string, kind: BattleKind, weightedReps: Readonly<Record<string, number>>): BattleCard {
  const d = (defaults.battleDecisionDay as Record<BattleKind, number>)[kind];
  return {
    job, kind, decideAfterGame: d < 0 ? null : d,
    competitors: Object.entries(weightedReps).map(([id, w]) => ({ personId: Number(id), weightedReps: w, thinEvidence: w < P.battleTargetWeightedReps })).sort((a, b) => a.personId - b.personId),
  };
}

/** Rep splits offered for a battle (rule 1): alternate days 50/50, alternate series, or a 60/40 lean to the incumbent. */
export function battleSplit(mode: 'alternate_days' | 'alternate_series' | 'lean'): [number, number] {
  return mode === 'lean' ? [P.battleLeanIncumbent, 1 - P.battleLeanIncumbent] : [P.battleEvenShare, 1 - P.battleEvenShare];
}

/**
 * The quarterback-battle cost on the card (M6.2.2): unit timing grows with shared reps, so each day the
 * battle runs past the default costs the eventual starter that day's share of first-team reps.
 */
export function battleTimingShare(daysWithFirstTeam: number, campPracticeDays: number): number {
  return campPracticeDays > 0 ? Math.min(1, Math.max(0, daysWithFirstTeam / campPracticeDays)) : 0;
}

// ---------- M6.2.3 live periods ----------

export type ContactLevel = 'walkthrough' | 'jog' | 'thud' | 'live';

/** Injury exposure per rep as a share of a game snap (starting 0.05, 0.2, 0.6, 1.0). */
export function exposurePerRep(level: ContactLevel, noContactJersey: boolean): number {
  if (noContactJersey) return (defaults.contactExposure as Record<ContactLevel, number>).walkthrough;
  return (defaults.contactExposure as Record<ContactLevel, number>)[level];
}

/** Tackling and finishing gain per rep: thud partly, live fully, nothing below (M6.2.3 rule). */
export function techniqueGain(level: ContactLevel): number {
  return (defaults.contactTechniqueGain as Record<ContactLevel, number>)[level];
}

/** Drills the CBA prohibits at full speed (Article 23 Section 7(f)); each is allowed at walking or jogging pace. */
export const PROHIBITED_DRILLS = ['bull_in_the_ring', 'oklahoma', 'in_line_board', 'half_line', 'pods', 'three_spot'] as const;
export type Drill = (typeof PROHIBITED_DRILLS)[number] | string;

/** A prohibited drill run above jogging pace is a breakable act (warned, allowed, logged through L8.2.5). */
export function drillViolation(drill: Drill, level: ContactLevel): { classId: 'work_rules_practice'; drill: string; leaf: 'C11.2.2' } | null {
  return (PROHIBITED_DRILLS as readonly string[]).includes(drill) && (level === 'thud' || level === 'live') ? { classId: 'work_rules_practice', drill, leaf: 'C11.2.2' } : null;
}

/** The medical staff's read of the day's exposure, in words with its basis (never the engine's probability). */
export function exposureRead(exposureSnaps: number, recentSoftTissue: boolean): { read: 'low' | 'moderate' | 'high'; basis: string[] } {
  const basis = [`about ${Math.round(exposureSnaps)} game-snap equivalents of contact`];
  if (recentSoftTissue) basis.push('recent soft-tissue history in the group');
  const x = exposureSnaps * (recentSoftTissue ? P.softTissueExposureFactor : 1);
  return { read: x >= P.exposureHighSnaps ? 'high' : x >= P.exposureModerateSnaps ? 'moderate' : 'low', basis };
}

// ---------- M6.2.4 joint practices ----------

/** Chance of a fight on a joint day (rule 3): rises with contact level and rivalry (0 to 1). */
export function jointFightChance(level: ContactLevel, rivalry: number): number {
  const base = level === 'live' ? P.jointFightLive : level === 'thud' ? P.jointFightThud : P.jointFightLight;
  return Math.min(1, base * (1 + P.jointFightRivalryWeight * Math.min(1, Math.max(0, rivalry))));
}

// ---------- M6.5.1 report day ----------

export interface ReportResult { readonly personId: number; readonly conditioning: 'pass' | 'fail'; readonly overweightLb: number; readonly flaggedWeight: boolean }

/**
 * Conditioning test and weigh-in (M6.5.1 rules 2 and 3). The result is the player's conditioning state plus
 * day noise against the staff's pass line; a player more than a starting 5 lb over his assigned weight is
 * flagged. The world draws `dayNoise`; holding out, fining (C11.4.1) or letting through is the coach's call.
 */
export function reportDay(personId: number, conditioningState: number, dayNoise: number, passLine: number, weightLb: number, assignedLb: number): ReportResult {
  const over = Math.max(0, weightLb - assignedLb);
  return { personId, conditioning: conditioningState + dayNoise >= passLine ? 'pass' : 'fail', overweightLb: over, flaggedWeight: over > P.weighInFlagLb };
}

/** A player who fails is held out of padded work until he passes, unless the coach lets him through (with more exposure). */
export function mayPracticeInPads(r: ReportResult, letThrough: boolean): { allowed: boolean; extraExposure: number } {
  if (r.conditioning === 'pass') return { allowed: true, extraExposure: 1 };
  return letThrough ? { allowed: true, extraExposure: P.unfitExposureFactor } : { allowed: false, extraExposure: 1 };
}

// ---------- M6.5.2 mock game ----------

/** Operation readiness gained from a mock game: lowers substitution errors, delay and 12-men fouls early on (J5). */
export function mockGameReadiness(current: number, situationsScripted: number): number {
  const gain = P.mockGameReadinessGain * Math.min(1, situationsScripted / P.mockGameFullScript);
  return Math.min(1, current + gain * (1 - current));
}

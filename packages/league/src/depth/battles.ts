// M2.5.1 position battles: the battle card with evidence weighted by rep quality, deadlines, and writing
// the decision to the chart.
import { P } from './params.ts';
import type { DepthChart } from './types.ts';

export type OpponentTier = 'first' | 'second' | 'third';

export interface Battle {
  readonly unitId: string;
  readonly job: string;
  readonly competitors: readonly number[];
  /** First-team rep split, same order as competitors, summing to 1 (H3 reads it). */
  readonly split: readonly number[];
  /** Days are world day numbers (the calendar's day index). */
  readonly decideBy: number;
  readonly openedOn: number;
}

/** One graded evidence row: a practice period (N1.4) or game snaps, with who the reps were against. */
export interface BattleEvidence {
  readonly personId: number;
  readonly grade: number;
  readonly reps: number;
  readonly against: OpponentTier;
}

export interface BattleCardRow {
  readonly personId: number;
  readonly reps: number;
  /** Rep-weighted mean grade, every rep counting one. */
  readonly raw: number | null;
  /** Mean grade with reps weighted by opponent quality (rule 1). */
  readonly weighted: number | null;
}

const WEIGHT: Readonly<Record<OpponentTier, string>> = { first: 'battle.weightFirstTeam', second: 'battle.weightSecondTeam', third: 'battle.weightThirdTeam' };

/** The battle card (rule 1): both numbers are shown. */
export function battleCard(b: Battle, evidence: readonly BattleEvidence[]): BattleCardRow[] {
  return b.competitors.map((personId) => {
    const rows = evidence.filter((e) => e.personId === personId);
    const reps = rows.reduce((s, e) => s + e.reps, 0);
    const wsum = rows.reduce((s, e) => s + e.reps * P(WEIGHT[e.against]), 0);
    return {
      personId,
      reps,
      raw: reps > 0 ? rows.reduce((s, e) => s + e.grade * e.reps, 0) / reps : null,
      weighted: wsum > 0 ? rows.reduce((s, e) => s + e.grade * e.reps * P(WEIGHT[e.against]), 0) / wsum : null,
    };
  });
}

export interface BattleClock {
  /** Past the stated date with no decision: trust cost with both players (rule 3, L1). */
  readonly late: boolean;
  /** Within the readiness deadline before the opener with no decision: unit readiness penalty (rule 3). */
  readonly readinessPenalty: boolean;
}

export function battleClock(b: Battle, today: number, openerDay: number): BattleClock {
  return { late: today > b.decideBy, readinessPenalty: openerDay - today <= P('battle.readinessDeadlineDays') };
}

/** An injury to one competitor ends the battle by default (edge case): the healthy one wins when only one is left. */
export function battleAfterInjury(b: Battle, injured: number): Battle | { readonly winner: number } {
  const left = b.competitors.filter((id) => id !== injured);
  if (left.length === 1) return { winner: left[0]! };
  const split = b.competitors.map((id, i) => (id === injured ? 0 : b.split[i] ?? 0));
  const total = split.reduce((s, x) => s + x, 0);
  return { ...b, competitors: left, split: left.map((id) => (total > 0 ? split[b.competitors.indexOf(id)]! / total : 1 / left.length)) };
}

/** Writes the decision: the winner first at the job, the others behind him in their old order. */
export function decideBattle(chart: DepthChart, b: Battle, winner: number): DepthChart {
  if (!b.competitors.includes(winner)) throw new Error(`league.depth: ${winner} is not in the battle for ${b.unitId} ${b.job}`);
  const lists = chart.units[b.unitId] ?? {};
  const old = lists[b.job] ?? [];
  const next = [winner, ...old.filter((id) => id !== winner)];
  return { ...chart, units: { ...chart.units, [b.unitId]: { ...lists, [b.job]: next } } };
}

// Preseason games (M6.3): the snap plan, what to show and what to hide, and evaluating preseason film.
import { mixedOpponentWeight, type OpponentUnit, opponentWeight } from './practice.ts';
import { P } from './params.ts';
import defaults from './defaults.json' with { type: 'json' };
import type { Graded } from './types.ts';

// ---------- M6.3.1 snap plan ----------

export type CampStyle = 'rest' | 'light' | 'traditional';

export interface SnapPlanPlayer {
  readonly personId: number;
  readonly starter: boolean;
  readonly bubble: boolean;
  /** Wide D6 band (M6.2.1): flagged for more snaps. */
  readonly thinEvidence: boolean;
  /** Recent soft-tissue flag (D10, D11): the staff draft sets him to zero. */
  readonly softTissueFlag: boolean;
  /** The coach's override: a minimum for a must-see player, zero for a protected veteran. */
  readonly override?: { readonly minSnaps?: number; readonly zero?: boolean };
}

export interface SnapPlan {
  /** Series the starters play in each preseason game. */
  readonly starterSeries: readonly number[];
  readonly minimums: Readonly<Record<string, number>>;
  readonly zero: readonly number[];
  readonly flaggedForMore: readonly number[];
  /** Scrimmage snaps per side left after the minimums, over the preseason (rule 3). */
  readonly snapsLeft: number;
}

/**
 * The staff draft (M6.3.1 rules 1 to 4): starters' series by camp style; every bubble player gets a starting
 * 20 scrimmage snaps over the preseason; thin-evidence players are flagged for more; starters with a recent
 * soft-tissue flag, and protected veterans, are set to zero. Snaps available: a starting 63 a side per game.
 */
export function snapPlan(style: CampStyle, games: number, players: readonly SnapPlanPlayer[]): SnapPlan {
  const table = (defaults.preseasonStyle as Record<CampStyle, number[]>)[style];
  const starterSeries = Array.from({ length: games }, (_, i) => table[i] ?? 0);
  const minimums: Record<string, number> = {};
  const zero: number[] = [];
  const flagged: number[] = [];
  for (const p of [...players].sort((a, b) => a.personId - b.personId)) {
    if (p.override?.zero || (p.starter && p.softTissueFlag)) { zero.push(p.personId); continue; }
    const min = Math.max(p.bubble ? P.bubbleMinSnaps : 0, p.override?.minSnaps ?? 0);
    if (min > 0) minimums[String(p.personId)] = min;
    if (p.thinEvidence) flagged.push(p.personId);
  }
  const used = Object.values(minimums).reduce((s, n) => s + n, 0);
  return { starterSeries, minimums, zero, flaggedForMore: flagged, snapsLeft: games * P.preseasonSnapsPerSide - used };
}

/** Snaps a player logged under a plan never exceed zero when the plan says zero (M6.3.1 acceptance), checked by I6 on the play log. */
export function planBreaches(plan: SnapPlan, logged: Readonly<Record<string, number>>, injured: readonly number[]): { personId: number; issue: 'played_while_zero' | 'below_minimum' }[] {
  const out: { personId: number; issue: 'played_while_zero' | 'below_minimum' }[] = [];
  for (const id of plan.zero) if ((logged[String(id)] ?? 0) > 0) out.push({ personId: id, issue: 'played_while_zero' });
  for (const [id, min] of Object.entries(plan.minimums)) if (!injured.includes(Number(id)) && (logged[id] ?? 0) < min) out.push({ personId: Number(id), issue: 'below_minimum' });
  return out.sort((a, b) => a.personId - b.personId);
}

// ---------- M6.3.2 show and hide ----------

export interface PlayRef { readonly playId: string; readonly family: string; readonly base: boolean }

/** The preseason sheet (rule 1): base plays plus released families; everything else is held. */
export function preseasonSheet(plays: readonly PlayRef[], released: readonly string[], holds: readonly string[]): { sheet: string[]; held: string[] } {
  const sheet: string[] = [], held: string[] = [];
  for (const p of [...plays].sort((a, b) => a.playId.localeCompare(b.playId))) {
    if (!holds.includes(p.playId) && (p.base || released.includes(p.family))) sheet.push(p.playId); else held.push(p.playId);
  }
  return { sheet, held };
}

/**
 * Weight opponent AI gives a tendency seen in preseason (rule): a starting 30 percent of regular-season
 * weight, full weight for a preseason opponent who is also a regular-season opponent that year (edge case).
 */
export function preseasonTendencyWeight(alsoRegularSeasonOpponent: boolean): number {
  return alsoRegularSeasonOpponent ? 1 : P.preseasonTendencyWeight;
}

/** Timing multiplier of a held play on its first regular-season calls (rule 2: starting 0.95 for two calls). */
export function heldPlayTiming(callsSoFar: number, wasHeld: boolean): number {
  return wasHeld && callsSoFar < P.heldPlayCalls ? P.heldPlayTimingMultiplier : 1;
}

/** Who can study a play (rule 3): a preseason game shows it to every club; a joint practice only to that club. */
export function filmAudience(shownIn: 'preseason_game' | 'joint_practice', jointPartner: number | null, allClubs: readonly number[], ownClub: number): number[] {
  if (shownIn === 'joint_practice') return jointPartner === null ? [] : [jointPartner];
  return allClubs.filter((c) => c !== ownClub);
}

// ---------- M6.3.3 evaluating preseason film ----------

export interface SnapGrade {
  readonly personId: number;
  /** The snap's grade on the ISS scale (N1.4). */
  readonly grade: number;
  /** Either one opponent unit, or the 11 opponents' depth ranks for a mixed lineup. */
  readonly opponent: OpponentUnit | readonly number[];
  readonly specialTeams: boolean;
  readonly mentalError: string | null;
  readonly playId: string;
}

export interface EdgeReport {
  readonly personId: number;
  readonly scrimmage: { readonly snaps: number; readonly weightedSnaps: number; readonly grade: number | null; readonly shares: readonly number[] };
  readonly specialTeams: { readonly snaps: number; readonly weightedSnaps: number; readonly grade: number | null };
  readonly mentalErrors: readonly { readonly playId: string; readonly error: string }[];
}

const weightOf = (o: SnapGrade['opponent']) => (typeof o === 'string' ? opponentWeight(o) : mixedOpponentWeight(o));

/**
 * The roster-edge report (rules 1 to 4): weighted grade = sum(grade x weight) / sum(weight) with weights
 * 1.0, 0.6, 0.3; opposition shares sum to 100 percent; special teams graded apart; mental errors listed.
 */
export function edgeReport(snaps: readonly SnapGrade[]): EdgeReport[] {
  const ids = [...new Set(snaps.map((s) => s.personId))].sort((a, b) => a - b);
  return ids.map((personId) => {
    const mine = snaps.filter((s) => s.personId === personId);
    const part = (list: readonly SnapGrade[]) => {
      const ws = list.map((s) => weightOf(s.opponent));
      const wsum = ws.reduce((a, b) => a + b, 0);
      return { snaps: list.length, weightedSnaps: wsum, grade: wsum > 0 ? list.reduce((a, s, i) => a + s.grade * ws[i]!, 0) / wsum : null };
    };
    const scr = mine.filter((s) => !s.specialTeams);
    const units = ['first', 'second', 'third'] as const;
    const shares = units.map((u) => {
      if (scr.length === 0) return 0;
      return scr.reduce((a, s) => {
        if (typeof s.opponent === 'string') return a + (s.opponent === u ? 1 : 0);
        const ranks = s.opponent;
        return a + (ranks.length ? ranks.filter((r) => units[Math.min(units.length, Math.max(1, Math.round(r))) - 1] === u).length / ranks.length : 0);
      }, 0) / scr.length;
    });
    return {
      personId,
      scrimmage: { ...part(scr), shares },
      specialTeams: part(mine.filter((s) => s.specialTeams)),
      mentalErrors: mine.filter((s) => s.mentalError).map((s) => ({ playId: s.playId, error: s.mentalError! })),
    };
  });
}

/**
 * The band narrows with weighted snaps, not raw snaps (rule 2): the evidence variance for a block of
 * snaps is the per-snap noise variance divided by the weighted count.
 */
export function bandAfter(prior: Graded, perSnapNoiseSd: number, weightedSnaps: number): Graded {
  if (!(weightedSnaps > 0)) return prior;
  const n = (perSnapNoiseSd * perSnapNoiseSd) / weightedSnaps;
  return { mean: prior.mean, variance: (prior.variance * n) / (prior.variance + n) };
}

/** Production disagreeing with the grade gets a note (M6.3.3: a sack against a third-string tackle, a clean grade with no production). */
export function productionNote(weightedGrade: number | null, productionPlays: number, thirdUnitShare: number): 'production_vs_weak_opponents' | 'clean_grade_no_production' | null {
  if (productionPlays > 0 && thirdUnitShare >= P.weakOpponentShareNote) return 'production_vs_weak_opponents';
  if (productionPlays === 0 && weightedGrade !== null && weightedGrade >= P.targetBackupFit) return 'clean_grade_no_production';
  return null;
}

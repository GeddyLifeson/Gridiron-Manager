// After practice: the report and film (H3.5.2), competition grades (H3.3.3), the user's coach term
// (H3.5.1 rule 3, H3.6.2 rule 1), environment and mock-game flags (H3.4.1, H3.4.2).
import { PROB_FLOOR, type RandomStream } from '@gm/schema';
import { P } from './params.ts';
import type { PracticeInjury, PracticeResult, RepOutcome } from './resolve.ts';
import type { ParticipationLabel, Practice } from './types.ts';

// ---------------------------------------------------------------------------------------------
// H3.5.2 report and film
// ---------------------------------------------------------------------------------------------

export interface ErrorNote { readonly period: number; readonly rep: number; readonly personId: string }

export interface PracticeReport {
  readonly practiceId: string;
  readonly repsCompleted: number;
  /** As the period leaders saw it: may miss errors or name the wrong player (D6). */
  readonly errors: readonly ErrorNote[];
  readonly standouts: readonly string[];
  readonly poor: readonly string[];
  readonly competition: readonly Grade[];
  readonly injuries: readonly PracticeInjury[];
  readonly participation: Readonly<Record<string, ParticipationLabel>>;
}

/** The true record: every rep outcome is film and every mental error is on it (H3.5.2 acceptance 1). */
export function filmErrors(r: Pick<PracticeResult, 'outcomes'>): ErrorNote[] {
  return r.outcomes.filter((o) => o.assignment === 'wrong').map((o) => ({ period: o.period, rep: o.rep, personId: o.personId }));
}

/** Chance a leader misses or misblames one error, from his evaluation skill 0 to 1 (never 0, MA-52). */
export function missChance(evaluationSkill: number): number {
  const s = evaluationSkill < 0 ? 0 : evaluationSkill > 1 ? 1 : evaluationSkill;
  const p = P('report_miss_scale') * (1 - s);
  return p < PROB_FLOOR ? PROB_FLOOR : p > 1 - PROB_FLOOR ? 1 - PROB_FLOOR : p;
}

/**
 * The report written by the period leaders (H3.5.2): each true error is missed or blamed on another
 * player in the rep at the leader's miss chance; half of misses become misblames when someone else
 * was in the rep. `skillOf` gives the leader's evaluation skill for a period (hidden K6 value).
 */
export function writeReport(practice: Practice, r: PracticeResult, labels: ReadonlyMap<string, ParticipationLabel>, skillOf: (period: number) => number, rng: RandomStream): PracticeReport {
  const errors: ErrorNote[] = [];
  const byRep = new Map<string, RepOutcome[]>();
  for (const o of r.outcomes) {
    const k = `${o.period}:${o.rep}`;
    const list = byRep.get(k) ?? [];
    list.push(o);
    byRep.set(k, list);
  }
  for (const e of filmErrors(r)) {
    if (!rng.chance(missChance(skillOf(e.period)))) { errors.push(e); continue; }
    const others = (byRep.get(`${e.period}:${e.rep}`) ?? []).filter((o) => o.personId !== e.personId);
    if (others.length > 0 && rng.chance(P('misblame_share'))) errors.push({ ...e, personId: others[rng.pick(others.map(() => 1))]!.personId });
  }
  const tally = new Map<string, { n: number; wrong: number }>();
  for (const o of r.outcomes) {
    const t = tally.get(o.personId) ?? { n: 0, wrong: 0 };
    t.n += 1;
    tally.set(o.personId, t);
  }
  for (const e of errors) { const t = tally.get(e.personId); if (t) t.wrong += 1; }
  const rates = [...tally.entries()].filter(([, t]) => t.n > 0).map(([id, t]) => [id, t.wrong / t.n] as const).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  const standouts = rates.filter(([, x]) => x === 0).map(([id]) => id);
  const worst = rates.length > 0 ? rates[rates.length - 1]![1] : 0;
  const poor = worst > 0 ? rates.filter(([, x]) => x === worst).map(([id]) => id) : [];
  const participation: Record<string, ParticipationLabel> = {};
  for (const [id, l] of [...labels.entries()].sort()) participation[id] = l;
  return { practiceId: practice.id, repsCompleted: new Set(r.outcomes.map((o) => `${o.period}:${o.rep}`)).size, errors, standouts, poor, competition: grades(r.outcomes), injuries: r.injuries, participation };
}

// ---------------------------------------------------------------------------------------------
// H3.3.3 competition grades
// ---------------------------------------------------------------------------------------------

export interface Grade { readonly personId: string; readonly position: string; readonly wins: number; readonly reps: number }

/** Side-by-side grades with the sample count (H3.3.3 acceptance: equal to the recorded outcomes). */
export function grades(outcomes: readonly RepOutcome[]): Grade[] {
  const m = new Map<string, { position: string; wins: number; reps: number }>();
  for (const o of outcomes) {
    if (o.won === null) continue;
    const g = m.get(o.personId) ?? { position: o.position, wins: 0, reps: 0 };
    g.reps += 1;
    if (o.won) g.wins += 1;
    m.set(o.personId, g);
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([personId, g]) => ({ personId, ...g }));
}

/** Cost of a competition shown before confirming (H3.3.3 edge case): the starter's share of the position's reps lost. */
export function competitionCost(starterShareNow: number, candidates: number): number {
  if (candidates <= 1) return 0;
  const after = 1 / candidates;
  return starterShareNow > after ? starterShareNow - after : 0;
}

// ---------------------------------------------------------------------------------------------
// The user's coach term (H3.5.1 rule 3, H3.6.2 rule 1)
// ---------------------------------------------------------------------------------------------

export interface UserChoices {
  /** Share of players whose drill aimed at a technique the film shows he is weak in. */
  readonly drillAimed: number;
  /** Share of coaching points that are correct for the technique and the week's look. */
  readonly pointsCorrect: number;
  /** Share of reps given to the players the depth chart says will play. */
  readonly repsToPlayers: number;
}

/** Built for one period from the user's choices only; nothing about his past changes it. Null = default plan. */
export function userTeachingTerm(c: UserChoices | null): number {
  if (!c) return P('user_term_constant');
  const cl = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const score = P('user_term_weight_drill') * cl(c.drillAimed) + P('user_term_weight_points') * cl(c.pointsCorrect) + P('user_term_weight_reps') * cl(c.repsToPlayers);
  return P('teaching_term_min') + (P('teaching_term_max') - P('teaching_term_min')) * score;
}

/** Clamp an AI coach's hidden teaching parameter into the H3.5.1 range. */
export function teachingTermOf(hidden: number): number {
  return hidden < P('teaching_term_min') ? P('teaching_term_min') : hidden > P('teaching_term_max') ? P('teaching_term_max') : hidden;
}

// ---------------------------------------------------------------------------------------------
// H3.4.1 environment and H3.4.2 mock game: flags for the coming game
// ---------------------------------------------------------------------------------------------

export interface GamePrepFlags {
  /** Share of the road-noise cadence penalty removed (J12). */
  readonly noiseReduction: number;
  /** Share of the wet-weather ball-security and snap penalty removed (J12). */
  readonly wetReduction: number;
  readonly weatherFamiliar: boolean;
  /** Share of substitution errors removed (I6, J5). */
  readonly substitutionReduction: number;
  /** Scripted openers get one extra walkthrough exposure (H1.2.2). */
  readonly openerExposure: boolean;
}

/** Flags from the week's practices. Each option counts once per week, whatever the number of practices. */
export function gamePrep(practices: readonly Practice[]): GamePrepFlags {
  const any = (f: (p: Practice) => boolean) => practices.some(f);
  const mock = any((p) => p.mockGame === true);
  return {
    noiseReduction: any((p) => p.environment.noise || p.environment.silentCount) ? P('noise_reduction_max') : 0,
    wetReduction: any((p) => p.environment.wetBall) ? P('wet_reduction_max') : 0,
    weatherFamiliar: any((p) => p.environment.badWeather && !p.environment.indoors),
    substitutionReduction: mock ? P('mock_sub_error_reduction') : 0,
    openerExposure: mock,
  };
}

/** The indoor option exists only with an indoor facility (H3.4.1 edge case). */
export function environmentOptions(hasIndoorFacility: boolean): readonly string[] {
  const all = ['noise', 'wetBall', 'silentCount', 'badWeather'];
  return hasIndoorFacility ? ['indoors', ...all] : all;
}

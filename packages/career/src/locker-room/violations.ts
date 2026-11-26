// Violations and the decision (L3.2.1). A player breaking a team rule is driven by his X1 `discipline`
// facet (time and team rules), his stress and the team's culture; it is NOT a league violation and never
// enters the L8.2.5 pipeline by itself. What enters L8.2.5 is the coach's handling going past a labour
// agreement or school limit (see acts.ts).
import type { PersonOrigin } from '@gm/schema';
import type { TeamRuleList } from './rules.ts';
import { OFFENCES, offence } from './rules.ts';
import { clamp, lp, type Draw } from './params.ts';

export interface ViolatorInput {
  readonly playerId: number;
  readonly origin: PersonOrigin;
  /** X1 discipline facet, 0 to 100. */
  readonly discipline: number;
  /** L1.1.5 stress, 0 to 100. */
  readonly stress: number;
}

/**
 * Weekly hazard per player per rule (L3.2.1):
 * base(rule) * (1.6 - discipline/100) * (1 + stress/200) * (1.3 - culture/200). Never negative.
 */
export function weeklyHazard(base: number, discipline: number, stress: number, culture: number): number {
  const max = lp('scale.max');
  const d = lp('violation.disciplineIntercept') - clamp(discipline, 0, max) / max;
  const s = 1 + clamp(stress, 0, max) / lp('violation.stressDivisor');
  const c = lp('violation.cultureIntercept') - clamp(culture, 0, max) / lp('violation.cultureDivisor');
  return Math.max(0, base * d * s * c);
}

export type WitnessScope = 'room' | 'team' | 'staff_only';

export interface Violation {
  readonly id: number;
  readonly teamId: number;
  readonly playerId: number;
  readonly offenceId: string;
  /** League-year day the violation happened or, for a late discovery, was discovered (L3.2.1 edge case). */
  readonly day: number;
  readonly witnesses: WitnessScope;
  /** False when the rule is off: the behaviour happened but no violation is raised (L3.2.1). */
  readonly raised: boolean;
  /** Player policing handled it and the coach was not told (L2.2.2, L3.2.1). */
  readonly handledByPlayers: boolean;
}

export interface ViolationWeekInput {
  readonly teamId: number;
  readonly day: number;
  readonly culture: number;
  /** Council player policing switched on (L2.2.2). */
  readonly playerPolicing: boolean;
  readonly list: TeamRuleList;
  readonly players: readonly ViolatorInput[];
  /** Prior raised violations this league year by player and offence (for "coach is told only of repeats"). */
  readonly priorCount: (playerId: number, offenceId: string) => number;
  readonly firstId: number;
}

function pickWitnesses(draw: Draw): WitnessScope {
  const u = draw();
  const room = lp('violation.witness.room');
  return u < room ? 'room' : u < room + lp('violation.witness.team') ? 'team' : 'staff_only';
}

/**
 * Draw one week of violations for a team (L3.2.1). Deterministic for a seeded `draw`: players by id, then
 * offences in catalogue order, one draw per pair, plus one witness draw per hit.
 *
 * - Rows that are off still produce the behaviour (`raised` false), which feeds `team_discipline` only
 *   through the lower strictness of the list.
 * - Player policing with culture above 60 removes 25 percent of minor violations and keeps first minor
 *   offences away from the coach (`handledByPlayers`).
 * - A real-imported person commits only neutral workplace kinds (L3.2.1, L9.1.2 guard).
 */
export function drawViolationWeek(w: ViolationWeekInput, draw: Draw): Violation[] {
  const policingWorks = w.playerPolicing && w.culture > lp('council.policing.cultureAbove');
  const cut = policingWorks ? 1 - lp('council.policing.minorCut') : 1;
  const out: Violation[] = [];
  let id = w.firstId;
  const rowOf = new Map(w.list.rows.map((r) => [r.offenceId, r]));
  const offences = OFFENCES.filter((o) => o.models.includes(w.list.model) && o.weeklyBase > 0);
  for (const p of [...w.players].sort((a, b) => a.playerId - b.playerId)) {
    for (const o of offences) {
      if (p.origin === 'imported' && !o.neutralWorkplace) continue;
      const h = weeklyHazard(o.weeklyBase, p.discipline, p.stress, w.culture) * (o.minor ? cut : 1);
      if (draw() >= h) continue;
      const row = rowOf.get(o.id);
      const raised = row?.on === true;
      const handledByPlayers = raised && policingWorks && o.minor && w.priorCount(p.playerId, o.id) === 0;
      out.push({ id: id++, teamId: w.teamId, playerId: p.playerId, offenceId: o.id, day: w.day, witnesses: pickWitnesses(draw), raised, handledByPlayers });
    }
  }
  return out;
}

/** Expected raised-or-not violations per week for a roster at given values (calibration helper for the L3.2.1 target). */
export function expectedWeeklyViolations(players: readonly ViolatorInput[], culture: number, model: TeamRuleList['model'], minorOnly = true): number {
  let s = 0;
  for (const p of players) for (const o of OFFENCES) {
    if (!o.models.includes(model) || (minorOnly && !o.minor)) continue;
    if (p.origin === 'imported' && !o.neutralWorkplace) continue;
    s += weeklyHazard(o.weeklyBase, p.discipline, p.stress, culture);
  }
  return s;
}

/** Decisions a head coach can take on a raised violation (L3.2.1). */
export const DECISIONS = ['apply_listed', 'apply_less', 'warn', 'playing_time', 'delegate', 'ignore', 'conduct_detrimental'] as const;
export type DecisionKind = (typeof DECISIONS)[number];

/** Five-step penalty scale used by consistency (L3.3.1): nothing, warning, listed fine, playing time, suspension. */
export type PenaltyLevel = 0 | 1 | 2 | 3 | 4;

export interface DecisionRecord {
  readonly violationId: number;
  readonly playerId: number;
  readonly offenceId: string;
  readonly day: number;
  readonly decision: DecisionKind;
  readonly level: PenaltyLevel;
  /** True when the "follow the list automatically for minor first offences" setting decided it. */
  readonly auto: boolean;
}

/** The setting that removes routine cases: a minor first offence takes the listed penalty without asking (L3.2.1). */
export function autoDecision(v: Violation, priorThisYear: number, autoFollow: boolean): DecisionRecord | null {
  if (!autoFollow || !v.raised || v.handledByPlayers) return null;
  const o = offence(v.offenceId);
  if (!o.minor || priorThisYear > 0) return null;
  return { violationId: v.id, playerId: v.playerId, offenceId: v.offenceId, day: v.day, decision: 'apply_listed', level: o.group === null ? 1 : 2, auto: true };
}

/** Penalty level of a decision (L3.3.1 scale). `suspended` marks a conduct decision that suspended rather than fined. */
export function levelOf(decision: DecisionKind, offenceHasFine: boolean, suspended = false): PenaltyLevel {
  switch (decision) {
    case 'ignore': case 'delegate': return 0;
    case 'warn': return 1;
    case 'apply_less': return offenceHasFine ? 2 : 1;
    case 'apply_listed': return offenceHasFine ? 2 : 1;
    case 'playing_time': return 3;
    case 'conduct_detrimental': return suspended ? 4 : 3;
  }
}

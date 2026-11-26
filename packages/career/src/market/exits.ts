// Losing a job and coming back (E2.7, S7), a market that keeps moving (E2.3.4) and search firms (E2.3.5).
// Who stays when a head coach goes is career/positions `firingCascade` (S7.1.1); pay owed and offset are
// career/contract (`owedOnEnd`, `applyOffset`, `leaveEarly`). This file adds the career choices and
// the market's own movement. Imported real people get no health, money or scandal input (E2.3.4 rule 7).
import type { RandomStream } from '@gm/schema';
import { clamp, param } from './params.ts';

// ---------- being fired (E2.7.1) ----------

export interface FiringContext {
  readonly firstHeadJob: boolean;
  readonly seasonsInJob: number;
  /** Roster quality as the public saw it at hiring, 0 poor to 1 talented. */
  readonly rosterQuality: number;
  readonly forCause: boolean;
}

/**
 * E2.7.1: the regard cost of a firing depends on context. A first-time head coach fired after one or two
 * seasons with a poor roster loses less; one fired with a talented roster loses more. Returns audience
 * changes for career/reputation (peers, administrators_and_owners). Pay: cause ends it (contract module).
 */
export function firingRegard(c: FiringContext): { peers: number; owners: number; payContinues: boolean } {
  let k = 1;
  if (c.firstHeadJob && c.seasonsInJob <= 2 && c.rosterQuality < 0.4) k = param('fired.shortPoorShare');
  else if (c.rosterQuality > 0.6) k = param('fired.talentedShare');
  return { peers: param('fired.peerBase') * k, owners: param('fired.ownerBase') * k, payContinues: !c.forCause };
}

// ---------- the year out (E2.7.2, S7.3.1) ----------

export const YEAR_OUT_ACTIVITIES = ['lower_job', 'media', 'consult', 'study', 'visit_staffs', 'clinics', 'high_school', 'rest'] as const;
export type YearOutActivity = (typeof YEAR_OUT_ACTIVITIES)[number];

/** Each option is a weekly-hours profile and a set of gains (E2.7.2 rules). Facts written are history keys (E9.3). */
export interface ActivityProfile {
  readonly weeklyHours: number;
  /** Counts as public work or a visit for the monthly peer-standing rule (S7.3.1). */
  readonly keepsStanding: boolean;
  /** Hiring parties read a year off the field as a year off the field. */
  readonly onField: boolean;
  readonly mediaRegard: number;
  readonly health: number;
  readonly historyFact: string | null;
}

export const ACTIVITY: Readonly<Record<YearOutActivity, ActivityProfile>> = {
  lower_job: { weeklyHours: 70, keepsStanding: true, onField: true, mediaRegard: 0, health: 0, historyFact: null },
  media: { weeklyHours: 25, keepsStanding: true, onField: false, mediaRegard: 3, health: 1, historyFact: null },
  consult: { weeklyHours: 15, keepsStanding: true, onField: false, mediaRegard: 0, health: 1, historyFact: null },
  study: { weeklyHours: 20, keepsStanding: false, onField: false, mediaRegard: 0, health: 1, historyFact: 'studied_film_of' },
  visit_staffs: { weeklyHours: 15, keepsStanding: true, onField: false, mediaRegard: 0, health: 1, historyFact: 'visited_staff' },
  clinics: { weeklyHours: 8, keepsStanding: true, onField: false, mediaRegard: 1, health: 1, historyFact: null },
  high_school: { weeklyHours: 40, keepsStanding: false, onField: true, mediaRegard: 0, health: 0, historyFact: null },
  rest: { weeklyHours: 0, keepsStanding: false, onField: false, mediaRegard: 0, health: 3, historyFact: null },
};

/**
 * E2.7.2 edge case: with offset language the money value of a job is only what exceeds the old employer's
 * remaining payment. Cents a year he actually gains by working.
 */
export function workIncomeGain(newSalaryCents: number, owedPerYearCents: number, hasOffset: boolean): number {
  return hasOffset ? Math.max(0, newSalaryCents - owedPerYearCents) : newSalaryCents;
}

// ---------- resigning (E2.7.3) ----------

export type ResignReason = 'another_job' | 'health' | 'family' | 'dispute';

/** E2.7.3: resigning mid-season costs large regard with owners and players unless the reason is health. */
export function resignRegard(reason: ResignReason, midSeason: boolean): { owners: number; players: number; buyoutApplies: boolean } {
  const hit = midSeason && reason !== 'health';
  return { owners: hit ? param('resign.midSeasonOwner') : 0, players: hit ? param('resign.midSeasonPlayers') : 0, buyoutApplies: reason === 'another_job' };
}

// ---------- the scramble (S7.2.1) ----------

export type ScrambleOption = 'hold_out' | 'lateral' | 'step_down_rung' | 'step_down_level' | 'off_field';

export interface SeatOffer { readonly rung: number; readonly levelPrestige: number; readonly offField: boolean }

/** Classify a seat a released coach is offered against his last one (S7.2.1 options). */
export function scrambleKind(last: SeatOffer, offer: SeatOffer): ScrambleOption {
  if (offer.offField) return 'off_field';
  if (offer.rung === last.rung && offer.levelPrestige >= last.levelPrestige) return 'lateral';
  if (offer.rung < last.rung && offer.levelPrestige >= last.levelPrestige) return 'step_down_rung';
  if (offer.levelPrestige < last.levelPrestige) return 'step_down_level';
  return 'lateral';
}

/** S7.2.1: regard holds for a step down taken quickly; it decays for each year fully out (value.ts). */
export function quickStep(weeksSinceRelease: number): boolean {
  return weeksSinceRelease <= param('scramble.quickStepWeeks');
}

// ---------- a market that keeps moving (E2.3.4) ----------

/**
 * E2.3.4 rule 1: an AI coach moves laterally when the situation gain (E2.5.2 terms the caller sums) passes
 * his personal threshold. `thresholdShift` is his K2 restlessness, -1..1.
 */
export function movesLaterally(situationGain: number, thresholdShift: number): boolean {
  return situationGain > param('move.lateralThreshold') * (1 - 0.5 * clamp(thresholdShift, -1, 1));
}

export interface RetireInput {
  readonly age: number;
  readonly yearsWithoutJob: number;
  /** Health burden 0..1 (E8); ignored for imported real people. */
  readonly healthBurden: number;
  /** Financial independence 0..1 (E6.9.2); ignored for imported real people. */
  readonly wealthIndependence: number;
  readonly importedReal: boolean;
}

/** E2.3.4 rule 4 (and rule 7 for imported people: age and years out only). Yearly chance. */
export function retireHazard(x: RetireInput): number {
  const over = Math.max(0, x.age - param('move.retireAgeStart'));
  let h = over * param('move.retirePerYearOver') + x.yearsWithoutJob * param('move.retirePerYearOut');
  if (!x.importedReal) h += clamp(x.healthBurden, 0, 1) * param('move.retireHealthWeight') + clamp(x.wealthIndependence, 0, 1) * param('move.retireWealthWeight');
  return clamp(h, 0, 1);
}

/** E2.3.4 rule 5: entrants at rungs 0 to 2 replace exits plus a small surplus. */
export function entrantCount(exits: number): number {
  return Math.ceil(Math.max(0, exits) * (1 + param('move.entrantSurplus')));
}

// ---------- search firms (E2.3.5) ----------

/** E2.3.5 rule 1: does this search hire a firm? `share` is the rule key; null means firms are not used. */
export function usesFirm(share: number | null, stream: RandomStream): boolean {
  return share !== null && stream.chance(clamp(share, 0, 1));
}

/** E2.3.5 rule 4: chance a candidate enters the firm's list; a tie to the consultant (or via his agent) raises it. */
export function firmListChance(tieToConsultant: boolean, agentKnown: boolean): number {
  return clamp(param('firm.baseListChance') + (tieToConsultant || agentKnown ? param('firm.tieListBonus') : 0), 0, 1);
}

/** E2.3.5 rule 2: the background check surfaces each unknown conduct event at a set chance. */
export function backgroundFinds(unknownConductEventIds: readonly number[], stream: RandomStream): readonly number[] {
  return unknownConductEventIds.filter(() => stream.chance(param('firm.backgroundFind')));
}

/** E2.3.5 rule 3: a firm lowers leak risk on the school side only. */
export function schoolLeakRisk(base: number, firm: boolean): number {
  return firm ? base * param('firm.leakShare') : base;
}

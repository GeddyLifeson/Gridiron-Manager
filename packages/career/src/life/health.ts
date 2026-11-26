// E8.2.1 the yearly check-up, E8.2.2 the physician's warning, E8.2.3 health events. Health is the result
// of hours, sleep and age only: no stat, no family history, nothing set at creation. Nothing serious
// happens without an earlier, delivered, personal warning and time to act on it.
import { param } from './params.ts';
import { drawInt, assertGenerated, type LifeRandom, type LifeRealism, type LifeSubject } from './realism.ts';
import type { WeekSummary } from './load.ts';

export type HealthState = 'well' | 'watch' | 'atRisk' | 'serious';
const ORDER: readonly HealthState[] = ['well', 'watch', 'atRisk', 'serious'];

export type WarningRoute = 'checkup' | 'teamPhysician' | 'partner' | 'ownDoctor';

export interface Warning {
  readonly created: number;
  readonly delivered: number;
  readonly route: WarningRoute;
  readonly reviewWeek: number;
  readonly sleepTargetHours: number;
  readonly workTargetHours: number;
  readonly outcome: 'open' | 'met' | 'unmet';
}

export interface HealthEvent {
  readonly week: number;
  readonly weeksAway: number;
  /** Which event of the career this is (1, 2, 3...). */
  readonly ordinal: number;
  readonly stateAfter: HealthState;
  /** Second event: doctors advise retirement; the user may refuse (rule 4). */
  readonly retirementAdvised: boolean;
  /** Third event: a full season away (rule 4). */
  readonly fullSeason: boolean;
}

export interface Checkup { readonly week: number; readonly state: HealthState; readonly line: string }

export interface HealthRecord {
  readonly personId: number;
  readonly state: HealthState;
  readonly warnings: readonly Warning[];
  readonly events: readonly HealthEvent[];
  readonly checkups: readonly Checkup[];
  /** Week he may return from a health event, or null when present. */
  readonly awayUntil: number | null;
}

/** Every coach starts well (E8.2.1 rule 1). Never for an imported person. */
export function newHealthRecord(s: LifeSubject): HealthRecord {
  assertGenerated(s, 'health record');
  return { personId: s.personId, state: 'well', warnings: [], events: [], checkups: [], awayUntil: null };
}

export interface YearInput {
  readonly week: number;
  readonly age: number;
  readonly heavyWeeks52: number;
  /** The user (or AI) scheduled the yearly physical. */
  readonly checkupTaken: boolean;
  readonly hasPartner: boolean;
  /** In a job with a team physician (H5); between jobs his own doctor sends it. */
  readonly employed: boolean;
}

/** Chance of a one-step worsening this year (E8.2.1 rule 2). */
export function worsenChance(heavyWeeks52: number, age: number): number {
  let p = 0;
  if (heavyWeeks52 > param('worsenHeavyWeeksHigh')) p = param('worsenChanceHigh');
  else if (heavyWeeks52 > param('worsenHeavyWeeks')) p = param('worsenChance');
  if (age >= param('ageStep2')) p += param('ageStep2Add');
  else if (age >= param('ageStep1')) p += param('ageStep1Add');
  return Math.min(1, p);
}

function hasDeliveredWarning(r: HealthRecord, week: number): boolean {
  return r.warnings.some((w) => w.delivered <= week);
}

function newWarning(week: number, deliverNow: boolean, route: WarningRoute): Warning {
  const delivered = deliverNow ? week : week + param('warningDeliveryWeeks');
  return {
    created: week, delivered, route, reviewWeek: delivered + param('warningReviewWeeks'),
    sleepTargetHours: param('warningSleepTarget'), workTargetHours: param('warningWorkTarget'), outcome: 'open',
  };
}

function routeFor(i: YearInput): WarningRoute {
  if (i.checkupTaken) return 'checkup';
  if (i.employed) return 'teamPhysician';
  if (i.hasPartner) return 'partner';
  return 'ownDoctor';
}

function checkupLine(prev: HealthState, now: HealthState, heavyWeeks52: number): string {
  if (now === 'well') return 'Nothing of concern.';
  if (ORDER.indexOf(now) < ORDER.indexOf(prev)) return 'Your numbers are better than last year. Keep doing what you are doing.';
  if (heavyWeeks52 > param('worsenHeavyWeeks')) return 'Your blood pressure has risen. Your hours are part of it.';
  return 'Some numbers are worth watching. We will look again next year.';
}

/** The yearly step (E8.2.1). Always consumes exactly one uniform, so the stream stays aligned. */
export function yearlyStep(r: HealthRecord, i: YearInput, rng: LifeRandom): HealthRecord {
  const u = rng.uniform();
  let state = r.state;
  const canImprove = i.heavyWeeks52 < param('improveHeavyWeeks') && (state === 'watch' || state === 'atRisk');
  const pImprove = canImprove ? param('improveChance') : 0;
  const pWorsen = worsenChance(i.heavyWeeks52, i.age);
  if (u < pImprove) state = ORDER[ORDER.indexOf(state) - 1]!;
  else if (u >= 1 - pWorsen && state !== 'serious') {
    const next = ORDER[ORDER.indexOf(state) + 1]!;
    // Rule 4, hard: serious only from at risk, and only after a delivered warning.
    if (next !== 'serious' || hasDeliveredWarning(r, i.week)) state = next;
  }
  const warnings = [...r.warnings];
  // E8.2.2 rule 1: a warning each time the state reaches at risk; always delivered.
  if (state === 'atRisk' && r.state !== 'atRisk') warnings.push(newWarning(i.week, i.checkupTaken, routeFor(i)));
  const checkups = i.checkupTaken ? [...r.checkups, { week: i.week, state, line: checkupLine(r.state, state, i.heavyWeeks52) }] : r.checkups;
  return { ...r, state, warnings, checkups };
}

export interface WeekInput {
  readonly week: number;
  readonly workHours: number;
  /** Weekly summaries covering at least the 12 weeks before any review falling this week. */
  readonly history: readonly WeekSummary[];
}

export interface WeekStepResult {
  readonly record: HealthRecord;
  readonly event: HealthEvent | null;
}

/** Did the coach meet the advice over the review window (E8.2.2 rule 2: 12-week means)? */
export function targetsMet(w: Warning, history: readonly WeekSummary[]): boolean {
  const win = history.filter((h) => h.week > w.reviewWeek - param('warningReviewWeeks') && h.week <= w.reviewWeek);
  if (win.length === 0) return false;
  const sleep = win.reduce((s, h) => s + h.meanSleepHours, 0) / win.length;
  const work = win.reduce((s, h) => s + h.workHours, 0) / win.length;
  return sleep >= w.sleepTargetHours && work <= w.workTargetHours;
}

/** Weekly step: warning reviews (E8.2.2 rule 3) and the event hazard (E8.2.3). Draws one uniform only in
 *  weeks the preconditions hold, plus one more when an event fires. */
export function weeklyStep(r: HealthRecord, i: WeekInput, rng: LifeRandom, realism: LifeRealism): WeekStepResult {
  let state = r.state;
  const warnings = r.warnings.map((w) => {
    if (w.outcome !== 'open' || w.reviewWeek !== i.week) return w;
    const met = targetsMet(w, i.history);
    // Met: at risk moves to watch; serious moves back one step (decisions list D-6).
    if (met && (state === 'atRisk' || state === 'serious')) state = state === 'atRisk' ? 'watch' : 'atRisk';
    return { ...w, outcome: met ? 'met' as const : 'unmet' as const };
  });
  let rec: HealthRecord = { ...r, state, warnings };
  if (rec.awayUntil !== null && i.week < rec.awayUntil) return { record: rec, event: null };
  if (rec.awayUntil !== null) rec = { ...rec, awayUntil: null };
  if (!eventPreconditions(rec, i.week) || !realism.healthEvents) return { record: rec, event: null };
  let p = param('eventHazardPerWeek');
  if (i.workHours > param('eventHazardHeavyHours')) p *= param('eventHazardHeavyMultiplier');
  if (rng.uniform() >= p) return { record: rec, event: null };
  const ordinal = rec.events.length + 1;
  const fullSeason = ordinal >= 3;
  const weeksAway = fullSeason ? param('seasonAwayWeeks') : drawInt(rng, param('eventWeeksMin'), param('eventWeeksMax'));
  const stateAfter: HealthState = ordinal >= 2 ? 'serious' : rec.state;
  const event: HealthEvent = { week: i.week, weeksAway, ordinal, stateAfter, retirementAdvised: ordinal >= 2, fullSeason };
  const back = i.week + weeksAway;
  // On return he gets medical advice as in E8.2.2: a new warning delivered the week he is back.
  const advice: Warning = { ...newWarning(back, true, 'ownDoctor'), created: i.week };
  return { record: { ...rec, state: stateAfter, events: [...rec.events, event], warnings: [...rec.warnings, advice], awayUntil: back }, event };
}

/** E8.2.3 rule 1, all required: at risk (or worse), latest warning delivered at least 12 weeks ago and
 *  its targets not met. Without them the hazard is exactly zero (rule 3). */
export function eventPreconditions(r: HealthRecord, week: number): boolean {
  if (r.state !== 'atRisk' && r.state !== 'serious') return false;
  const last = r.warnings[r.warnings.length - 1];
  if (!last || last.outcome !== 'unmet') return false;
  return week - last.delivered >= param('warningReviewWeeks');
}

/** E8.2.3 rule 6: time away for health does not lower owner confidence (E4 reads this constant). */
export const HEALTH_ABSENCE_LOWERS_CONFIDENCE = false;

/** E8.2.2 "AI use": a generated AI coach follows advice with a chance from his K2 work pattern. */
export function aiFollowsAdvice(followChance: number, rng: LifeRandom): boolean {
  return rng.uniform() < followChance;
}

/** The only public line about an absence (L6): what a team would announce. */
export function absenceAnnouncement(e: HealthEvent): string {
  return e.fullSeason ? 'The head coach will miss the season for health reasons.' : `The head coach is taking a leave of absence for health reasons, expected to last about ${e.weeksAway} weeks.`;
}

/** Warning text in plain words (E8.2.2 "what the user sees"). */
export function warningText(w: Warning): string {
  return `Sleep ${w.sleepTargetHours} hours or more a night and hold your working weeks under ${w.workTargetHours} hours for the next ${param('warningReviewWeeks')} weeks. If you carry on as you are, you may be forced to step away from the job for a while.`;
}

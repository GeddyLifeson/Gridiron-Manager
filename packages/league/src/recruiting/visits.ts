// T4.5.1 visits. An official visit is a 48-hour plan of blocks; each block moves interest by the fit
// between what it shows and what the prospect and his circle care about. Every visit the rules forbid is
// still an available act: it warns, has its normal effect if confirmed, and writes one log row.
import unitsJson from './data/units.json' with { type: 'json' };
import { clamp, type RecruitingContext } from './context.ts';
import { KEY, bool, num } from './keys.ts';
import { P } from './params.ts';
import { addEvidence, preferenceScore } from './interest.ts';
import { breach, breachesOf, recruitingYear, tieOf, tiesOfProspect } from './limits.ts';
import { logBreaches, type ComplianceHook } from './actions.ts';
import type { Breach, PreferenceKey, RecruitingState } from './types.ts';

export const VISIT_BLOCKS = ['arrival_dinner', 'position_meeting', 'film_role', 'academic_meeting', 'facilities_medical', 'players_and_host', 'head_coach_home_meal', 'home_game', 'closing_meeting'] as const;
export type VisitBlock = (typeof VISIT_BLOCKS)[number];

/** What each block shows, as the preference it speaks to (T4.5.1 procedure). The closing meeting is its own share. */
const BLOCK_SHOWS: Readonly<Record<Exclude<VisitBlock, 'closing_meeting'>, PreferenceKey>> = {
  arrival_dinner: 'relationship', position_meeting: 'relationship', film_role: 'playingTime', academic_meeting: 'academics',
  facilities_medical: 'prestige', players_and_host: 'relationship', head_coach_home_meal: 'relationship', home_game: 'prestige',
};

export interface VisitPlan {
  readonly blocks: readonly VisitBlock[];
  readonly hours: number;
  readonly paidCompanions: number;
  readonly hostId: number;
  /** The host is unhappy with his own role (D12): he hurts the visit. */
  readonly hostUnhappy: boolean;
  /** Gifts or cash on the visit (T4.5.1 violations, T7.4.1 benefits). */
  readonly inducement: boolean;
}

export interface VisitResult {
  readonly breaches: readonly Breach[];
  readonly logId: number | null;
  /** Change in impression (truth, for tests). */
  readonly effect: number;
}

/** Rules an official visit breaks (T4.5.1 violations), on top of the calendar rules of T4.2.1. */
export function officialVisitBreaches(state: RecruitingState, ctx: RecruitingContext, teamId: number, prospectId: number, day: number, plan: VisitPlan, staffId: number): Breach[] {
  const rules = ctx.rulesOn(day);
  const out: Breach[] = breachesOf(state, ctx, { kind: 'official_visit', teamId, staffId, prospectId, day });
  const t = tieOf(state, prospectId, teamId);
  const perSchool = num(rules, KEY.officialPerSchool);
  const hcNow = ctx.programs.headCoachOn(teamId, day);
  const hcChanged = t.officialVisitHeadCoach !== null && t.officialVisitHeadCoach !== hcNow && bool(rules, KEY.secondAfterHcChange, false);
  if (perSchool !== undefined && t.officialVisits.length + 1 > perSchool && !hcChanged) out.push(breach('second_official_visit'));
  const maxH = num(rules, KEY.visitMaxHours);
  if (maxH !== undefined && plan.hours > maxH) out.push(breach('visit_too_long'));
  const comp = num(rules, KEY.paidCompanions);
  if (comp !== undefined && plan.paidCompanions > comp) out.push(breach('paid_companions'));
  const cap = num(rules, KEY.schoolCap);
  const hosted = state.visitsHosted[`${teamId}:${recruitingYear(day)}`] ?? 0;
  if (cap !== undefined && hosted + 1 > cap) out.push(breach('school_visit_cap'));
  if (plan.inducement) out.push(breach('visit_inducement'));
  return out;
}

/** The visit's effect on impression (T4.5.1 starting values): 3 times an average in-person contact at full fit. */
export function visitEffect(state: RecruitingState, ctx: RecruitingContext, teamId: number, prospectId: number, day: number, plan: VisitPlan): number {
  const p = state.prospects[prospectId];
  if (!p) return 0;
  const shown = plan.blocks.filter((b): b is Exclude<VisitBlock, 'closing_meeting'> => b !== 'closing_meeting');
  let fit = 0;
  for (const b of shown) {
    const key = BLOCK_SHOWS[b];
    for (const m of p.circle) fit += m.influence * preferenceScore(state, ctx, p, teamId, m, key);
  }
  const avg = shown.length > 0 ? fit / shown.length : 0;
  const coverage = shown.length / (VISIT_BLOCKS.length - 1);
  const closing = plan.blocks.includes('closing_meeting') ? P('visit.closingShare') : 0;
  let effect = P('visit.multiplier') * P('impression.inPerson') * ((1 - P('visit.closingShare')) * coverage * avg / P('visit.averageFit') + closing);
  if (!plan.blocks.includes('home_game')) effect *= P('visit.noGameShare');
  if (plan.hostUnhappy) effect *= 1 - P('visit.unhappyHostCut');
  if (plan.inducement) effect += P('visit.inducementEffect');
  return effect;
}

/** Host an official visit (paid by the school). Normal effect always; one log row if it breaks a rule. */
export function hostOfficialVisit(state: RecruitingState, ctx: RecruitingContext, hook: ComplianceHook, teamId: number, staffId: number, prospectId: number, day: number, plan: VisitPlan): VisitResult {
  const breaches = officialVisitBreaches(state, ctx, teamId, prospectId, day, plan, staffId);
  const t = tieOf(state, prospectId, teamId);
  const effect = visitEffect(state, ctx, teamId, prospectId, day, plan);
  t.impression = clamp(t.impression + effect, P('impression.floor'), P('impression.cap'));
  t.hcInvolvement = clamp(t.hcInvolvement + (plan.blocks.includes('closing_meeting') ? P('contact.hcInvolvementStep') : 0), 0, 1);
  t.officialVisits.push(day);
  t.officialVisitHeadCoach = ctx.programs.headCoachOn(teamId, day);
  t.lastContactDay = day;
  const yk = `${teamId}:${recruitingYear(day)}`;
  state.visitsHosted[yk] = (state.visitsHosted[yk] ?? 0) + 1;
  addEvidence(state, teamId, prospectId, { kind: 'visit_taken', day, byStaffId: staffId, signal: null, rivalTeamId: null, reason: null });
  const p = state.prospects[prospectId];
  const knew = p ? [plan.hostId, ...p.circle.map((m) => m.memberId)] : [plan.hostId];
  const logId = logBreaches(state, ctx, hook, breaches, { staffId, teamId, prospectId, day, knew, gain: plan.inducement ? P('visit.inducementGain') : 0 });
  return { breaches, logId, effect };
}

/** An unofficial visit (the family pays), allowed whenever the calendar allows on-campus contact (T4.5.1). */
export function hostUnofficialVisit(state: RecruitingState, ctx: RecruitingContext, hook: ComplianceHook, teamId: number, staffId: number, prospectId: number, day: number): VisitResult {
  const breaches = breachesOf(state, ctx, { kind: 'unofficial_visit', teamId, staffId, prospectId, day });
  const t = tieOf(state, prospectId, teamId);
  const effect = P('impression.unofficialVisit');
  t.impression = clamp(t.impression + effect, P('impression.floor'), P('impression.cap'));
  t.unofficialVisits.push(day);
  t.lastContactDay = day;
  addEvidence(state, teamId, prospectId, { kind: 'visit_taken', day, byStaffId: staffId, signal: null, rivalTeamId: null, reason: null });
  const logId = logBreaches(state, ctx, hook, breaches, { staffId, teamId, prospectId, day, knew: [], gain: 0 });
  return { breaches, logId, effect };
}

/** Did the prospect take an official visit to another school in the week ending on `day` (T4.5.2 multiplier)? */
export function rivalVisitThisWeek(state: RecruitingState, prospectId: number, teamId: number, day: number): boolean {
  const from = day - P('daysPerWeek') + 1;
  for (const t of tiesOfProspect(state, prospectId)) {
    if (t.teamId !== teamId && t.officialVisits.some((d) => d >= from && d <= day)) return true;
  }
  return false;
}

export const VISIT_HOURS_PER_DAY = unitsJson.hoursPerDay;

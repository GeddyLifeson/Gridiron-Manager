// T4.2.1 periods and what each allows; T4.2.2 the 2027 model switch; T4.6.1 off-campus seats.
// The calendar never removes an action: it marks it. `breachesOf` lists every rule an act would break so
// the screen can show the L8.2.5 warning and the act can be logged if confirmed. Usage counters are
// updated by `recordUsage` whether or not the act broke a rule (the days are spent either way).
import type { RuleSet } from '@gm/schema';
import { civil, dayNumber } from '../calendar/date.ts';
import unitsJson from './data/units.json' with { type: 'json' };
import { key2, weekStartOf, type RecruitingContext } from './context.ts';
import { findTie, noteTie, tiesOf } from './indexes.ts';
import { KEY, bool, num, opt } from './keys.ts';
import {
  IN_PERSON_OFF_CAMPUS, IN_PERSON_ON_CAMPUS,
  type ActionKind, type Breach, type BreachRule, type RecruitingState, type SchoolTie,
} from './types.ts';

export type Period = 'contact' | 'evaluation' | 'quiet' | 'dead';
const STRICTNESS: readonly Period[] = ['contact', 'evaluation', 'quiet', 'dead'];

/** Compliance class (G-28) each rule is logged under. */
export const BREACH_CLASS: Readonly<Record<BreachRule, string>> = {
  contact_out_of_period: 'recruiting_contact', on_campus_in_dead_period: 'recruiting_contact', evaluation_out_of_period: 'recruiting_contact',
  contact_before_start_date: 'recruiting_contact', message_before_start_date: 'recruiting_contact', call_before_start_date: 'recruiting_contact',
  call_weekly_limit: 'recruiting_contact', weekly_contact_limit: 'recruiting_contact', total_contact_limit: 'recruiting_contact',
  pool_exceeded: 'recruiting_contact', no_offcampus_seat: 'recruiting_contact', offcampus_seats_exceeded: 'recruiting_contact',
  head_coach_spring_offcampus: 'recruiting_contact', opportunities_exceeded: 'recruiting_contact', weekly_opportunity_limit: 'recruiting_contact',
  second_official_visit: 'recruiting_contact', official_visit_dead_period: 'recruiting_contact', visit_too_long: 'recruiting_contact',
  paid_companions: 'recruiting_contact', school_visit_cap: 'recruiting_contact',
  visit_inducement: 'pay_rules', circle_benefit: 'pay_rules', iawp_hire: 'recruiting_contact',
  contact_signed_prospect: 'recruiting_contact', signing_day_contact: 'recruiting_contact',
  academic_fraud: 'eligibility_academic', roster_over_limit: 'roster_limit',
};

export function breach(rule: BreachRule): Breach { return { rule, classId: BREACH_CLASS[rule] }; }

/**
 * The recruiting period on a day: the strictest recruiting window the college calendar places on it
 * (a quiet day inside a contact stretch is quiet). Null where the calendar file has no period for the
 * day (T4.2.1: the 2027 labels after January are not loaded); nothing is marked then.
 */
export function periodOn(ctx: RecruitingContext, day: number): Period | null {
  let days = PERIODS.get(ctx.calendar);
  if (!days) { days = new Map(); PERIODS.set(ctx.calendar, days); }
  let hit = days.get(day);
  if (hit === undefined) { hit = periodFromCalendar(ctx, day); days.set(day, hit); }
  return hit;
}

/** A calendar's files are fixed when it is built, so the period of a day is worked out once per calendar. */
const PERIODS = new WeakMap<object, Map<number, Period | null>>();

function periodFromCalendar(ctx: RecruitingContext, day: number): Period | null {
  let out: Period | null = null;
  for (const w of ctx.calendar.windowsOn('college', day, 'window')) {
    const p = w.def.period;
    if (p && (out === null || STRICTNESS.indexOf(p) > STRICTNESS.indexOf(out))) out = p;
  }
  return out;
}

export type Model = 'days_2025' | 'opps_2027';
export function modelOn(ctx: RecruitingContext, day: number): Model | null {
  const m = opt(ctx.rulesOn(day), KEY.model);
  return m === 'days_2025' || m === 'opps_2027' ? m : null;
}

const isSpring = (day: number) => civil(day).m <= unitsJson.springLastMonth;
const isFall = (day: number) => civil(day).m >= unitsJson.fallFirstMonth;

/** Which day pool an off-campus act draws on, or null when none applies (T4.2.1 budgets, T4.2.2). */
export function poolFor(ctx: RecruitingContext, kind: ActionKind, day: number): { pool: 'eval_fall' | 'person_spring'; size: number | undefined; season: number } | null {
  const offCampus = kind === 'evaluation' || IN_PERSON_OFF_CAMPUS.includes(kind);
  if (!offCampus) return null;
  const rules = ctx.rulesOn(day);
  const model = modelOn(ctx, day);
  const period = periodOn(ctx, day);
  const y = civil(day).y;
  if (isFall(day) && period === 'evaluation') return { pool: 'eval_fall', size: num(rules, KEY.evalDaysFall), season: y };
  if (model === 'opps_2027' && isSpring(day) && period === 'contact') return { pool: 'person_spring', size: num(rules, KEY.personDaysSpring), season: y };
  if (model === 'days_2025' && isSpring(day) && period === 'evaluation') return { pool: 'person_spring', size: num(rules, KEY.personDaysSpring), season: y };
  return null;
}

function poolKey(teamId: number, pool: string, season: number): string { return `${teamId}:${pool}:${season}`; }

/** Days used and the pool size, for the budget panel (T4.2.2 "What the user sees"). */
export function poolUse(state: RecruitingState, ctx: RecruitingContext, teamId: number, pool: 'eval_fall' | 'person_spring', day: number): { used: number; size: number | undefined } {
  const y = civil(day).y;
  const rules = ctx.rulesOn(day);
  return { used: (state.daysUsed[poolKey(teamId, pool, y)] ?? []).length, size: num(rules, pool === 'eval_fall' ? KEY.evalDaysFall : KEY.personDaysSpring) };
}

function startDay(rules: RuleSet, classYear: number, m: string, d: string, yb: string): number | undefined {
  const month = num(rules, m); const dom = num(rules, d); const back = num(rules, yb);
  if (month === undefined || dom === undefined || back === undefined) return undefined;
  return dayNumber({ y: classYear - back, m: month, d: dom });
}

export function tieOf(state: RecruitingState, prospectId: number, teamId: number): SchoolTie {
  let t = findTie(state, prospectId, teamId);
  if (!t) {
    t = {
      prospectId, teamId, impression: 0, recruiterId: null, hcInvolvement: 0, officialVisits: [], unofficialVisits: [],
      officialVisitHeadCoach: null, offCampusContacts: 0, oppsSpring: 0, oppsFall: 0, lastContactDay: null,
      weekStart: 0, contactsThisWeek: 0, inPersonThisWeek: 0, callsThisWeek: 0, oppsThisWeek: 0, recruiterLeftDay: null, decommitDay: null,
    };
    // The table is brought up to date before the state changes, so a first build never lists the new tie twice.
    noteTie(state, t);
    state.ties[key2(prospectId, teamId)] = t;
    (state.tieTeams[prospectId] ??= []).push(teamId);
  }
  return t;
}

/** Every school tie of one prospect, in the order the schools first touched him. */
export function tiesOfProspect(state: RecruitingState, prospectId: number): readonly SchoolTie[] {
  return tiesOf(state, prospectId);
}

function rollWeek(t: SchoolTie, day: number): void {
  const w = weekStartOf(day);
  if (t.weekStart !== w) { t.weekStart = w; t.contactsThisWeek = 0; t.inPersonThisWeek = 0; t.callsThisWeek = 0; t.oppsThisWeek = 0; }
}

export interface ActRef {
  readonly kind: ActionKind;
  readonly teamId: number;
  readonly staffId: number;
  readonly prospectId: number;
  readonly day: number;
}

/** Off-campus seats named by the head coach (T4.2.2), checked against `recruiting.offcampus_max`. */
export function nameRecruiters(state: RecruitingState, ctx: RecruitingContext, teamId: number, staffIds: readonly number[], day: number): Breach[] {
  state.named[teamId] = [...staffIds];
  const max = num(ctx.rulesOn(day), KEY.offcampusMax);
  return max !== undefined && staffIds.length > max ? [breach('offcampus_seats_exceeded')] : [];
}

/** Every rule the act would break (T4.2.1, T4.2.2, T4.5.2 signing). Empty when it breaks none. */
export function breachesOf(state: RecruitingState, ctx: RecruitingContext, act: ActRef): Breach[] {
  const out: BreachRule[] = [];
  const rules = ctx.rulesOn(act.day);
  const period = periodOn(ctx, act.day);
  const p = state.prospects[act.prospectId];
  const st = state.status[act.prospectId];
  const offCampus = IN_PERSON_OFF_CAMPUS.includes(act.kind);
  const onCampus = IN_PERSON_ON_CAMPUS.includes(act.kind);
  const inPerson = offCampus || onCampus;
  const program = ctx.programs.program(act.teamId);
  const isHc = ctx.programs.headCoachOn(act.teamId, act.day) === act.staffId || program.headCoachId === act.staffId;

  // Periods (T4.2.1).
  if (period !== null) {
    if (offCampus && period !== 'contact') out.push('contact_out_of_period');
    if (onCampus && period === 'dead') out.push(act.kind === 'official_visit' ? 'official_visit_dead_period' : 'on_campus_in_dead_period');
    if (act.kind === 'evaluation' && (period === 'quiet' || period === 'dead')) out.push('evaluation_out_of_period');
  }
  // Start dates by class year (T4.2.1).
  if (p) {
    const cs = startDay(rules, p.classYear, KEY.contactStartMonth, KEY.contactStartDay, KEY.contactStartYearsBefore);
    if (offCampus && cs !== undefined && act.day < cs) out.push('contact_before_start_date');
    const ms = startDay(rules, p.classYear, KEY.messageStartMonth, KEY.messageStartDay, KEY.messageStartYearsBefore);
    if (act.kind === 'message' && ms !== undefined && act.day < ms) out.push('message_before_start_date');
    const ks = startDay(rules, p.classYear, KEY.callStartMonth, KEY.callStartDay, KEY.callStartYearsBefore);
    if (act.kind === 'call' && ks !== undefined && act.day < ks) out.push('call_before_start_date');
  }
  const t = tieOf(state, act.prospectId, act.teamId);
  rollWeek(t, act.day);
  // Contact limits (T4.2.1).
  if (offCampus) {
    const perWeek = num(rules, KEY.contactsPerWeek);
    if (perWeek !== undefined && t.inPersonThisWeek + 1 > perWeek) out.push('weekly_contact_limit');
    const total = num(rules, KEY.contactsTotal);
    if (total !== undefined && t.offCampusContacts + 1 > total) out.push('total_contact_limit');
  }
  if (act.kind === 'call' && period !== 'contact') {
    const calls = num(rules, KEY.callsPerWeek);
    if (calls !== undefined && t.callsThisWeek + 1 > calls) out.push('call_weekly_limit');
  }
  // Seats, the head coach in spring, day pools (T4.2.2, T4.6.1).
  const travels = offCampus || act.kind === 'evaluation';
  if (travels) {
    const named = state.named[act.teamId];
    if (named !== undefined && !named.includes(act.staffId)) out.push('no_offcampus_seat');
    const model = modelOn(ctx, act.day);
    if (isHc && isSpring(act.day) && !bool(rules, KEY.hcSpringOffcampusAllowed, true) && (model === 'opps_2027' || period === 'evaluation' || period === 'contact')) out.push('head_coach_spring_offcampus');
    const pool = poolFor(ctx, act.kind, act.day);
    const counts = !isHc || bool(rules, KEY.hcCountsAgainstDays, true);
    if (pool && pool.size !== undefined && counts) {
      const used = state.daysUsed[poolKey(act.teamId, pool.pool, pool.season)] ?? [];
      const tag = `${act.staffId}@${act.day}`;
      if (!used.includes(tag) && used.length + 1 > pool.size) out.push('pool_exceeded');
    }
    if (model === 'opps_2027') {
      const perWeek = num(rules, KEY.oppsPerWeek);
      if (perWeek !== undefined && t.oppsThisWeek + 1 > perWeek) out.push('weekly_opportunity_limit');
      const cap = isFall(act.day) ? num(rules, KEY.oppsFall) : isSpring(act.day) ? num(rules, KEY.oppsSpring) : undefined;
      const used = isFall(act.day) ? t.oppsFall : t.oppsSpring;
      if (cap !== undefined && used + 1 > cap) out.push('opportunities_exceeded');
    }
  }
  // Signing ends other schools' recruiting; no in-person contact on signing day (T4.5.2, T4.4.4).
  if (st && st.status === 'signed') {
    if (st.teamId !== act.teamId) out.push('contact_signed_prospect');
    else if (inPerson && st.signedDay === act.day) out.push('signing_day_contact');
  }
  return [...new Set(out)].map(breach);
}

/** Spend the days, contacts and opportunities an act uses (whether or not it broke a rule). */
export function recordUsage(state: RecruitingState, ctx: RecruitingContext, act: ActRef): void {
  const t = tieOf(state, act.prospectId, act.teamId);
  rollWeek(t, act.day);
  const offCampus = IN_PERSON_OFF_CAMPUS.includes(act.kind);
  const travels = offCampus || act.kind === 'evaluation';
  t.contactsThisWeek += 1;
  if (offCampus) { t.inPersonThisWeek += 1; t.offCampusContacts += 1; }
  if (act.kind === 'call') t.callsThisWeek += 1;
  t.lastContactDay = act.day;
  if (!travels) return;
  const rules = ctx.rulesOn(act.day);
  const isHc = ctx.programs.headCoachOn(act.teamId, act.day) === act.staffId;
  const pool = poolFor(ctx, act.kind, act.day);
  if (pool && (!isHc || bool(rules, KEY.hcCountsAgainstDays, true))) {
    const k = poolKey(act.teamId, pool.pool, pool.season);
    const used = state.daysUsed[k] ?? [];
    const tag = `${act.staffId}@${act.day}`;
    if (!used.includes(tag)) used.push(tag);
    state.daysUsed[k] = used;
  }
  if (modelOn(ctx, act.day) === 'opps_2027') {
    t.oppsThisWeek += 1;
    if (isFall(act.day)) t.oppsFall += 1; else if (isSpring(act.day)) t.oppsSpring += 1;
  }
}

/** Recruiting year for the school visit cap: April 1 to March 31 (T4.5.1). Named by the year it starts. */
export function recruitingYear(day: number): number {
  const c = civil(day);
  return c.m >= unitsJson.recruitingYearFirstMonth ? c.y : c.y - 1;
}

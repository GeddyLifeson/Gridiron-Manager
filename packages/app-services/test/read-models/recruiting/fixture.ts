// Recruiting board fixtures: a small college world run with league recruiting (G-36). Copied in shape from
// packages/league/test/recruiting/fixtures.ts (cross-package test imports are banned). Rule values are
// FIXTURES taken from the bible leaves (T4.2.1, T4.2.2, T4.5.1); none is triple-verified.
import { seedFromNumber, stream } from '@gm/engine-core';
import { calendar, compliance, recruiting } from '@gm/league';
import type { RuleSet } from '@gm/schema';

export const D = calendar.parseIso;
export const USER_TEAM = 1;
export const USER_STAFF = 101;
export const HEAD_COACH = 100;

const G10: Readonly<Record<string, number>> = {
  'tag.window_opens_days_before': 22, 'tag.window_closes_days_before': 8, 'tag.multiyear_deadline_july_day': 15,
  'work.offseason_weeks': 9, 'work.workouts_per_week': 4, 'work.phase1_weeks': 2, 'work.phase2_weeks': 3, 'work.phase3_weeks': 4,
  'work.ota_days': 10, 'work.ota_max_week_3_or_4': 4, 'work.start_monday_of_april': 3, 'work.minicamp_days': 3,
  'work.rookie_minicamp_days': 3, 'work.camp_field_hours': 4, 'work.padded_practice_hours': 2.5, 'work.bye_days_off': 4,
  'trade.deadline_after_week': 9, 'calendar.league_year_start_march_day': 11, 'calendar.negotiating_window_start_march_day': 9,
  'calendar.tag_window_opens_feb_day': 17,
};
const cal = new calendar.CalendarEngine({ files: calendar.CALENDAR_FILES, rules: calendar.calendarLookup((k) => G10[k]) });

const c = (id: string, f: string) => compliance.K.classField(id, f);
const VALUES: Record<string, number | boolean | string> = {
  [compliance.K.detectWindowYears]: 4, [compliance.K.cooperationReducesTier]: true, [compliance.K.headCoachResponsible]: true,
  [c('recruiting_contact', 'suspension_games_first')]: 4, [c('recruiting_contact', 'probation_years')]: 3, [c('recruiting_contact', 'show_cause_years')]: 6,
  'recruiting.contacts_per_week': 1, 'recruiting.contacts_total': 6, 'recruiting.calls_per_week': 1,
  'recruiting.contact_start_month': 7, 'recruiting.contact_start_day': 1, 'recruiting.contact_start_years_before_class': 1,
  'recruiting.message_start_month': 6, 'recruiting.message_start_day': 15, 'recruiting.message_start_years_before_class': 2,
  'recruiting.call_start_month': 9, 'recruiting.call_start_day': 1, 'recruiting.call_start_years_before_class': 1,
  'recruiting.hc_spring_offcampus_allowed': false,
  'visits.official_per_school': 1, 'visits.second_after_hc_change': true, 'visits.max_hours': 48, 'visits.paid_companions': 2,
  'league.roster_limit': 105,
  'recruiting.model': 'days_2025', 'recruiting.eval_days_fall': 33, 'recruiting.person_days_spring': 140,
  'recruiting.offcampus_max': 11, 'recruiting.hc_counts_against_days': true,
};

export function rules(): RuleSet {
  const get = (k: string) => { if (!(k in VALUES)) throw new Error(`no rule ${k}`); return VALUES[k]!; };
  return {
    id: 'college_fixture', level: 'college', seasonYear: 2026,
    num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string, keys: () => Object.keys(VALUES),
  };
}

export function programs(n: number): recruiting.ProgramInfo[] {
  const regions = ['TX', 'FL', 'CA', 'GA', 'OH'];
  return Array.from({ length: n }, (_, i) => {
    const teamId = i + 1;
    const tier: recruiting.ProgramInfo['tier'] = i < n / 3 ? 'top' : i < (2 * n) / 3 ? 'middle' : 'lower';
    const prestige = tier === 'top' ? 85 - i : tier === 'middle' ? 60 - i : 40 - i;
    return { teamId, tier, prestige, region: regions[i % regions.length]!, academics: 50, money: prestige, headCoachId: teamId * 100, staffIds: Array.from({ length: 12 }, (_, k) => teamId * 100 + k) };
  });
}

class Facts implements recruiting.ProgramFacts {
  constructor(readonly list: readonly recruiting.ProgramInfo[]) {}
  program(teamId: number) { return this.list[teamId - 1]!; }
  opportunity(teamId: number, position: recruiting.PositionGroup) { return 0.3 + ((teamId * 7 + recruiting.POSITION_GROUPS.indexOf(position) * 3) % 10) / 20; }
  schemeFit(teamId: number, prospectId: number) { return ((teamId * 31 + prospectId) % 100) / 100; }
  returning(_teamId: number, _position: recruiting.PositionGroup) { return 5; }
  headCoachOn(teamId: number) { return this.program(teamId).headCoachId; }
  lossStreak() { return 0; }
}

class Sink implements compliance.EventSink {
  readonly events: compliance.EventDraft[] = [];
  append(d: compliance.EventDraft): number { this.events.push(d); return this.events.length; }
}

export function hook(): recruiting.ComplianceHook {
  return {
    state: compliance.emptyCompliance(), sink: new Sink(), tier: 1, source: 'user',
    party: (staffId, teamId): compliance.PartyRef => ({ personId: staffId, role: staffId % 100 === 0 ? 'head_coach' : 'position_coach', teamId, origin: 'generated' }),
  };
}

export interface World {
  state: recruiting.RecruitingState;
  ctx: recruiting.RecruitingContext;
  hook: recruiting.ComplianceHook;
  programs: recruiting.ProgramInfo[];
}

/** A 10-program world with the 2027 class, AI programs (all but the user's) run weekly to `until`. */
export function world(until = D('2026-05-06')): World {
  const list = programs(10);
  const ctx: recruiting.RecruitingContext = { rulesOn: () => rules(), calendar: cal, programs: new Facts(list), rng: (scope) => stream(seedFromNumber(7), 'recruiting', scope) };
  const state = recruiting.emptyRecruiting();
  let next = 100000; let member = 900000;
  const factory: recruiting.ProspectFactory = {
    create(req) {
      const s = stream(seedFromNumber(3), 'person.gen', [req.classYear, req.source, req.slot]);
      return { personId: next++, origin: 'generated', heightIn: 70 + s.int(0, 8), weightLb: 180 + s.int(0, 120), trueQuality: Math.max(0, Math.min(100, 12 + 38 * req.percentile + 4 * s.normal())), fortyS: 4.4 + 0.5 * s.uniform() };
    },
  };
  const coaches = new Map<string, number>();
  const ids: recruiting.CircleIds = {
    member: () => member++,
    highSchoolCoach: (region, i) => { const k = `${region}:${i}`; if (!coaches.has(k)) coaches.set(k, 800000 + coaches.size); return coaches.get(k)!; },
  };
  const req = { classYear: 2027, programs: list.length, topPrograms: list.length, favourites: list.map((p) => ({ teamId: p.teamId, weight: p.prestige })), advisersAllowed: true };
  recruiting.generateClass(state, req, factory, ids, ctx.rng);
  const h = hook();
  const people: recruiting.AiPeople = {
    disposition: () => null, evaluationSkill: (id) => 0.3 + (id % 7) / 10, judgementError: () => 0.15, reach: () => 1,
    conduct: (scope) => stream(seedFromNumber(11), 'conduct', scope),
  };
  const ai = list.filter((p) => p.teamId !== USER_TEAM);
  for (let day = D('2026-01-07'); day <= until; day += 7) recruiting.recruitingWeek(state, ctx, h, { classYear: 2027, day, aiPrograms: ai, people });
  return { state, ctx, hook: h, programs: list };
}

export const NAMES = { person: (id: number) => `Person ${id}`, team: (id: number) => `Team ${id}` };

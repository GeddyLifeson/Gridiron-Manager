// Test fixtures for recruiting (G-36). Rule values here are FIXTURES copied from the bible leaves (T4.2.1,
// T4.2.2, T4.5.1, T4.5.3, T4.1.2, T5.1.1); the real values arrive from G-10 with fact rows. The 2027 values
// are the committee's recommendation (T4.2.2, release flag until adoption). Nothing here is triple-verified.
import { seedFromNumber, stream } from '@gm/engine-core';
import type { RuleSet } from '@gm/schema';
import { CALENDAR_FILES, CalendarEngine, parseIso, iso } from '../../src/calendar/index.ts';
import { emptyCompliance, type PartyRef } from '../../src/compliance/index.ts';
import { COLLEGE_VALUES, MemorySink, ruleSet } from '../compliance/fixtures.ts';
import { fixtureRules } from '../calendar/fixtures.ts';
import {
  emptyRecruiting, POSITION_GROUPS,
  type AiPeople, type CircleIds, type ComplianceHook, type PositionGroup, type ProgramFacts, type ProgramInfo, type ProspectFactory,
  type RecruitingContext, type RecruitingState,
} from '../../src/recruiting/index.ts';

export const D = parseIso;
export { iso };

const BASE: Record<string, number | boolean | string> = {
  ...COLLEGE_VALUES,
  'recruiting.contacts_per_week': 1, 'recruiting.contacts_total': 6, 'recruiting.calls_per_week': 1,
  'recruiting.contact_start_month': 7, 'recruiting.contact_start_day': 1, 'recruiting.contact_start_years_before_class': 1,
  'recruiting.message_start_month': 6, 'recruiting.message_start_day': 15, 'recruiting.message_start_years_before_class': 2,
  'recruiting.call_start_month': 9, 'recruiting.call_start_day': 1, 'recruiting.call_start_years_before_class': 1,
  'recruiting.hc_spring_offcampus_allowed': false,
  'visits.official_per_school': 1, 'visits.second_after_hc_change': true, 'visits.max_hours': 48, 'visits.paid_companions': 2,
  'iawp.window_years': 2,
  'college.initial_eligibility.core_courses': 16, 'college.initial_eligibility.core_gpa': 2.3,
  'college.initial_eligibility.core_before_final_year': 10, 'college.initial_eligibility.core_before_final_year_ems': 7,
  'juco.nonqualifier_full_time_terms': 3, 'juco.nonqualifier_hours': 48, 'juco.nonqualifier_must_graduate': true,
  'juco.qualifier_full_time_terms': 1, 'juco.qualifier_hours_per_term': 12, 'juco.transfer_gpa': 2.0,
  'eligibility.juco_seasons_count': true, 'eligibility.window_years': 5, 'league.roster_limit': 105,
};

/** 2026 rule year: day pools, 11 seats (17 under the fall 2026 waiver, T4.2.2). */
export const RULES_2026: Record<string, number | boolean | string> = {
  ...BASE, 'recruiting.model': 'days_2025', 'recruiting.eval_days_fall': 33, 'recruiting.person_days_spring': 140,
  'recruiting.offcampus_max': 11, 'recruiting.hc_counts_against_days': true,
};
/** 2027 recommended model (T4.2.2). */
export const RULES_2027: Record<string, number | boolean | string> = {
  ...BASE, 'recruiting.model': 'opps_2027', 'recruiting.eval_days_fall': 50, 'recruiting.person_days_spring': 300,
  'recruiting.offcampus_max': 17, 'recruiting.hc_counts_against_days': false,
  'recruiting.opps_per_prospect_spring': 4, 'recruiting.opps_per_prospect_fall': 1, 'recruiting.opps_per_week': 1,
};

export function rs(values: Record<string, number | boolean | string>, id = 'college_fixture'): RuleSet {
  const r = ruleSet(values, id);
  return { ...r, level: 'college' };
}

export const calendar = new CalendarEngine({ files: CALENDAR_FILES, rules: fixtureRules });

export function rulesOnSwitch(day: number): RuleSet { return day >= D('2027-01-01') ? rs(RULES_2027, 'college_2027') : rs(RULES_2026, 'college_2026'); }

/** Programs 1..n with staff ids teamId*100 + 0..k (head coach first). */
export function makePrograms(n: number, opts: { tierOf?: (i: number) => ProgramInfo['tier']; regions?: readonly string[] } = {}): ProgramInfo[] {
  const regions = opts.regions ?? ['TX', 'FL', 'CA', 'GA', 'OH', 'NC', 'IL', 'AL', 'PA', 'LA'];
  return Array.from({ length: n }, (_, i) => {
    const teamId = i + 1;
    const tier = opts.tierOf?.(i) ?? (i < n / 3 ? 'top' : i < (2 * n) / 3 ? 'middle' : 'lower');
    const prestige = tier === 'top' ? 85 - (i % 10) : tier === 'middle' ? 60 - (i % 10) : 40 - (i % 10);
    return {
      teamId, tier, prestige, region: regions[i % regions.length]!, academics: 40 + ((i * 17) % 50), money: prestige,
      headCoachId: teamId * 100, staffIds: Array.from({ length: 12 }, (_, k) => teamId * 100 + k),
    };
  });
}

export class Facts implements ProgramFacts {
  readonly hc = new Map<number, { from: number; id: number }[]>();
  readonly streak = new Map<number, number>();
  constructor(readonly programs: readonly ProgramInfo[], readonly returningPerRoom = 0.75) {}
  program(teamId: number): ProgramInfo { return this.programs[teamId - 1]!; }
  opportunity(teamId: number, position: PositionGroup): number { return 0.3 + ((teamId * 7 + POSITION_GROUPS.indexOf(position) * 3) % 10) / 20; }
  schemeFit(teamId: number, prospectId: number): number { return ((teamId * 31 + prospectId) % 100) / 100; }
  returning(_teamId: number, position: PositionGroup): number {
    const shape: Record<PositionGroup, number> = { QB: 5, RB: 7, WR: 14, TE: 7, OL: 18, DL: 16, LB: 12, DB: 20, ST: 6 };
    return Math.round(shape[position] * this.returningPerRoom);
  }
  headCoachOn(teamId: number, day: number): number {
    const list = this.hc.get(teamId) ?? [];
    let id = this.program(teamId).headCoachId;
    for (const c of list) if (day >= c.from) id = c.id;
    return id;
  }
  fire(teamId: number, day: number, newId: number): void { this.hc.set(teamId, [...(this.hc.get(teamId) ?? []), { from: day, id: newId }]); }
  lossStreak(teamId: number): number { return this.streak.get(teamId) ?? 0; }
}

export function context(programs: readonly ProgramInfo[], seed = 7, rulesOn: (day: number) => RuleSet = rulesOnSwitch): { ctx: RecruitingContext; facts: Facts } {
  const facts = new Facts(programs);
  return { facts, ctx: { rulesOn, calendar, programs: facts, rng: (scope) => stream(seedFromNumber(seed), 'recruiting', scope) } };
}

/** A person generator stand-in: true quality rises with percentile, with noise, on the internal skill scale. */
export function factory(seed = 3): ProspectFactory {
  let next = 100000;
  return {
    create(req) {
      const s = stream(seedFromNumber(seed), 'person.gen', [req.classYear, req.source, req.slot]);
      const personId = next++;
      return {
        personId, origin: 'generated', heightIn: 70 + s.int(0, 8), weightLb: 180 + s.int(0, 120),
        trueQuality: Math.max(0, Math.min(100, 12 + 38 * req.percentile + 4 * s.normal())), fortyS: 4.4 + 0.5 * s.uniform(),
      };
    },
  };
}

export function circleIds(): CircleIds {
  let next = 900000;
  const coaches = new Map<string, number>();
  return {
    member: () => next++,
    highSchoolCoach: (region, i) => { const k = `${region}:${i}`; if (!coaches.has(k)) coaches.set(k, 800000 + coaches.size); return coaches.get(k)!; },
  };
}

export function hook(): ComplianceHook {
  return {
    state: emptyCompliance(), sink: new MemorySink(), tier: 1, source: 'sim',
    party: (staffId, teamId): PartyRef => ({ personId: staffId, role: staffId % 100 === 0 ? 'head_coach' : 'position_coach', teamId, origin: 'generated' }),
  };
}

export function people(seed = 11, ruleBreakers = false): AiPeople {
  return {
    disposition: (staffId) => ruleBreakers ? { personId: staffId, origin: 'generated', ruleRespectZ: -2, riskTolerance: 90, candor: 50, pressure: 0.5 } : null,
    evaluationSkill: (staffId) => 0.3 + (staffId % 7) / 10,
    judgementError: () => 0.15,
    reach: () => 1,
    conduct: (scope) => stream(seedFromNumber(seed), 'conduct', scope),
  };
}

export function freshState(): RecruitingState { return emptyRecruiting(); }

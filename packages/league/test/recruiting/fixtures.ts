// Test fixtures for recruiting (G-36). The 2026 rule values are READ from the G-10 league file
// (packages/rules-data/data/league/collegeleague_2026.json, fact rows F-recruiting-*, F-college-*), not copied.
// Keys the file does not hold yet (REQUESTED below, asked of the schema integrator) and the 2027 opportunity
// model (the committee's recommendation, T4.2.2, effective 2027-01-01 and not yet adopted) are fixtures here.
// Nothing in REQUESTED or RULES_2027 is triple-verified.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

const G10 = (JSON.parse(readFileSync(fileURLToPath(new URL('../../../rules-data/data/league/collegeleague_2026.json', import.meta.url)), 'utf8')) as { values: { key: string; value: number | boolean | string }[] }).values;
const fromFile = (keys: readonly string[]): Record<string, number | boolean | string> => Object.fromEntries(keys.map((k) => {
  const row = G10.find((v) => v.key === k);
  if (!row) throw new Error(`rule key ${k} is not in collegeleague_2026.json`);
  return [k, row.value];
}));

/** Rule keys the G-10 college file holds; the 2026 recruiting rule set reads them from it. */
export const FILE_KEYS: readonly string[] = [
  'recruiting.contacts_per_week', 'recruiting.contacts_total', 'recruiting.calls_per_week',
  'recruiting.contact_start_month', 'recruiting.contact_start_day', 'recruiting.contact_start_years_before_class',
  'recruiting.message_start_month', 'recruiting.message_start_day', 'recruiting.message_start_years_before_class',
  'recruiting.call_start_month', 'recruiting.call_start_day', 'recruiting.call_start_years_before_class',
  'recruiting.hc_spring_offcampus_allowed',
  'visits.official_per_school', 'visits.second_after_hc_change', 'visits.max_hours', 'visits.paid_companions',
  'iawp.window_years',
  'college.initial_eligibility.core_courses', 'college.initial_eligibility.core_gpa',
  'college.initial_eligibility.core_before_final_year', 'college.initial_eligibility.core_before_final_year_ems',
  'juco.transfer_gpa', 'eligibility.juco_seasons_count', 'eligibility.window_years', 'league.roster_limit',
  'recruiting.model', 'recruiting.eval_days_fall', 'recruiting.person_days_spring', 'recruiting.offcampus_max', 'recruiting.hc_counts_against_days',
];

/** Keys the module reads that the G-10 file lacks. FIXTURES until the schema integrator adds the rows. */
export const REQUESTED: Record<string, number | boolean | string> = {
  'juco.nonqualifier_full_time_terms': 3, 'juco.nonqualifier_hours': 48, 'juco.nonqualifier_must_graduate': true,
  'juco.qualifier_full_time_terms': 1, 'juco.qualifier_hours_per_term': 12,
};

const BASE: Record<string, number | boolean | string> = { ...COLLEGE_VALUES, ...REQUESTED };

/** 2026 rule year: day pools, 11 seats (17 under the fall 2026 waiver, T4.2.2). Values from the G-10 file. */
export const RULES_2026: Record<string, number | boolean | string> = { ...BASE, ...fromFile(FILE_KEYS) };
/** 2027 recommended model (T4.2.2). */
export const RULES_2027: Record<string, number | boolean | string> = {
  ...BASE, ...fromFile(FILE_KEYS), 'recruiting.model': 'opps_2027', 'recruiting.eval_days_fall': 50, 'recruiting.person_days_spring': 300,
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

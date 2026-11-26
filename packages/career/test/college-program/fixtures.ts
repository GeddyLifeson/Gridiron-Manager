// Fixtures for the college program tests. Seat limits here are FIXTURE copies of the bible S1.2.2
// values (graduate assistants 4, off-campus recruiters 11, strength 5, student assistants 11,
// headsets 23); the real values arrive as rule data with fact rows. Nothing here is triple-verified.
import { stream, seedFromNumber } from '@gm/engine-core';
import { WorldEvent, type RandomStream, type RuleSet, type WorldDate } from '@gm/schema';
import { compliance } from '@gm/league';
import {
  DEFAULT_POWER, SEAT_KEY, newAthleticDirector, openingBudget,
  type ProgramState, type StaffSeat, type ProgramTier,
} from '../../src/college-program/index.ts';

const draftSchema = WorldEvent.omit({ id: true, notability: true });

export class MemorySink implements compliance.EventSink {
  readonly events: (compliance.EventDraft & { id: number })[] = [];
  append(d: compliance.EventDraft): number {
    draftSchema.parse(d);
    const id = this.events.length + 1;
    this.events.push({ ...d, id });
    return id;
  }
}

export function ruleSet(values: Record<string, number | boolean | string>, id = 'fixture'): RuleSet {
  const get = (k: string) => {
    if (!(k in values)) throw new Error(`no rule ${k}`);
    return values[k]!;
  };
  return { id, level: 'college', seasonYear: 2026, num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string, keys: () => Object.keys(values) };
}

export const SEAT_VALUES = {
  [SEAT_KEY.graduate_assistant]: 4,
  [SEAT_KEY.off_campus_recruiter]: 11,
  [SEAT_KEY.strength]: 5,
  [SEAT_KEY.student_assistant]: 11,
  [SEAT_KEY.headset]: 23,
};

export const COLLEGE = ruleSet({
  ...SEAT_VALUES,
  [compliance.K.detectWindowYears]: 4,
  [compliance.K.cooperationReducesTier]: true,
  [compliance.K.headCoachResponsible]: true,
});

export const D = (seasonYear: number, dayIndex: number): WorldDate => ({ seasonYear, dayIndex });

export const rng = (seed: number, name = 'test'): RandomStream => stream(seedFromNumber(seed), `college-program.${name}`, []);

export const DOLLAR = 100;
export const MILLION = 1_000_000 * DOLLAR;

export function program(tier: ProgramTier = 'power', seed = 1): ProgramState {
  const r = rng(seed, 'program');
  return {
    teamId: 1, tier,
    ad: newAthleticDirector(500, 2026, r, { hiredCurrentCoach: true }),
    president: { personId: 501, academicStrictness: 0.5, footballPriority: 0.5 },
    power: DEFAULT_POWER,
    budget: openingBudget(tier, 2026, 20 * MILLION, r),
    facilities: [], projects: [], boosters: [], staff: [], exchanges: [], warnedSeats: [],
  };
}

let nextJob = 1000;
export function seat(over: Partial<StaffSeat> = {}): StaffSeat {
  nextJob += 1;
  return { jobId: nextJob, personId: nextJob + 50_000, payRole: 'position_coach', counts: [], pool: 'staff_pool', salaryCents: 100_000 * DOLLAR, ...over };
}

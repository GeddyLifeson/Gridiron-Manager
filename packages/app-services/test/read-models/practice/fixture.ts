// A seat team's practice desk for the practice desk read model: the pro and college league-rules files on the
// G-65 practice keys, the staff's standard week, a user plan with a live period, and two kept reports. The
// report contents (reps, errors, standouts, grades) are made-up test values, not football facts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calendar, practice as pr } from '@gm/league';
import { PracticeDesk, practiceRules, STAFF_WEEK, type PracticeDeskSave, type PracticePlan, type PracticeRecord } from '../../../src/play/index.ts';
import type { PracticeDeskContext } from '../../../src/read-models/practice/index.ts';

const leagueFile = (name: string): { values: { key: string; value: unknown }[] } =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../rules-data/data/league/${name}`, import.meta.url)), 'utf8'));

export const PRO_RULES = practiceRules(calendar.calendarLookup(calendar.lookupFromValues(leagueFile('proleague_2026.json').values)), 'pro');
export const COLLEGE_RULES = practiceRules(calendar.lookupFromValues(leagueFile('collegeleague_2026.json').values), 'college');

export const NOW = { day: 250, seasonYear: 2027, week: 3 };

const ME: pr.PeriodLeader = { staffId: 'me', role: 'head_coach', user: true };

/** The user's practice: the staff week plus a live one-on-one period, in full pads. */
export function userPlan(id = 'mine', day = NOW.day): PracticePlan {
  const periods = [...STAFF_WEEK.periods, pr.newPeriod(7, 'one_on_one_wr_db', ME, { minutes: 10, tempo: 'live', groups: ['WR', 'CB'] })];
  return { practice: { id, blockId: 'b', blockMinutes: 150, day, pads: 'full', periods, environment: pr.NO_ENVIRONMENT, headCoachPresent: true }, scripts: {} };
}

/** A plan that cannot run: the periods do not fit a 30-minute block. */
export function brokenPlan(): PracticePlan {
  const p = userPlan('broken');
  return { ...p, practice: { ...p.practice, blockMinutes: 30 } };
}

const record = (seasonYear: number, week: number, practiceId: string, by: 'user' | 'staff', padded: boolean): PracticeRecord => ({
  seasonYear, week, by, paddedUsed: padded,
  report: {
    practiceId, repsCompleted: 64,
    errors: [{ period: 3, rep: 2, personId: '101' }],
    standouts: ['102'], poor: ['103'],
    competition: [{ personId: '104', position: 'WR', wins: 3, reps: 5 }, { personId: '105', position: 'CB', wins: 2, reps: 5 }],
    injuries: [{ personId: '106', period: 7, rep: 4 }],
    participation: { '106': 'limited', '101': 'full' },
  },
  reps: { '101': 20, '102': 34, '103': 12 },
  fullSpeed: { '102': 10, '104': 5 },
});

export const RECORDS: readonly PracticeRecord[] = [
  record(2026, 17, 'staff-2026-17', 'staff', false),
  record(2027, 1, 'staff-2027-1', 'staff', false),
  record(2027, 2, 'mine-a', 'user', true),
  record(2027, 2, 'mine-b', 'user', false),
];

export const NAMES: Readonly<Record<string, string>> = { '101': 'A. Able', '102': 'B. Baker', '103': 'C. Cole' };

export function desk(plans: readonly PracticePlan[] = [], level: 'pro' | 'college' = 'pro'): PracticeDesk {
  const rules = level === 'pro' ? PRO_RULES : COLLEGE_RULES;
  const save: PracticeDeskSave = { version: 1, plans, records: RECORDS, paddedUsed: 1 };
  return PracticeDesk.restore(() => level, () => rules, save);
}

export function contextOf(d: PracticeDesk, level: 'pro' | 'college' = 'pro'): PracticeDeskContext {
  return { desk: d, rules: level === 'pro' ? PRO_RULES : COLLEGE_RULES, now: NOW, nameOf: (id) => NAMES[id] ?? null };
}

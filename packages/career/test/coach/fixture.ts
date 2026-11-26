// A small generated world for coach creation tests: 8 college and 8 pro teams, head coach stints
// rotating every few seasons from 1990, and three assistants per staff per season.
import { stream, seedFromNumber } from '@gm/engine-core';
import type { CreationChoices, CreationWorld, HeadStint, StaffSeason, CoachRules } from '../../src/coach/index.ts';

export const YEAR = 2026;
/** S3.3.4 values as the bible states them (NCAA 2023-01-11 release, compliance summary). */
export const RULES: CoachRules = { gaMaxSeasons: 3, gaDegreeWindowYears: 7 };

const OFF = ['core:west_coast', 'core:air_raid', 'core:spread_option', 'core:erhardt_perkins'];
const DEF = ['core:fourthree_over', 'core:threefour_two_gap', 'core:quarters', 'core:tampa_two'];

export function makeWorld(): CreationWorld {
  const teams = [
    ...Array.from({ length: 8 }, (_, i) => ({ id: i + 1, level: 'college' as const })),
    ...Array.from({ length: 8 }, (_, i) => ({ id: i + 11, level: 'pro' as const })),
  ];
  const headStints: HeadStint[] = [];
  const staffSeasons: StaffSeason[] = [];
  let person = 100;
  for (const t of teams) {
    let y = 1990;
    let k = t.id;
    while (y <= YEAR) {
      const len = 3 + (k % 5); // 3 to 7 seasons
      const last = y + len - 1;
      headStints.push({ personId: person++, teamId: t.id, firstSeason: y, lastSeason: last >= YEAR ? null : last, offensiveFamily: OFF[k % 4]!, defensiveFamily: DEF[(k + 1) % 4]! });
      y = last + 1;
      k += 3;
    }
    for (let s = 1990; s < YEAR; s++) for (let a = 0; a < 3; a++) staffSeasons.push({ personId: 5000 + t.id * 10 + ((s + a) % 7), teamId: t.id, seasonYear: s });
  }
  // A coach who moves between levels: coordinator at college team 2 (staff 2000 to 2003), then head at pro team 12.
  staffSeasons.push(...[2000, 2001, 2002, 2003].map((s) => ({ personId: 9001, teamId: 2, seasonYear: s })));
  const vacantTeamIds = [3, 13];
  return { year: YEAR, teams, headStints, staffSeasons, vacantTeamIds };
}

export const rng = (seed: number) => stream(seedFromNumber(seed), 'career.coach.creation', []);

export const BASE: CreationChoices = {
  level: 'college', start: 'nobody', experienced: false, origin: null,
  playing: { level: 'major_college', positionGroup: 'LB', proSeasons: 0 },
  education: { degree: 'bachelor', field: 'education', military: false, otherWorkYears: 0 },
  mentors: [], coachingSeasons: null,
  identity: { side: 'defense', positionGroup: 'LB', intendsToCall: true, offensiveFamily: null, defensiveFamily: null },
  name: { first: 'Test', last: 'Coach' }, age: 22, appearanceKey: 3,
  household: { kind: 'single', childAges: [], partnerHasCareer: false, homeRegion: null },
  firstTeamId: null, openJobsOnly: true, seed: 7,
};

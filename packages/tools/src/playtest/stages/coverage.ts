// Areas the playtest cannot drive yet, checked every run so the findings close by themselves once the owners
// bind them: an entry point missing from its package barrel cannot be imported by a host (cross-package relative
// imports fail the lint), and one with only test fixtures for its inputs has no production caller. When a probe
// here finds its entry exported, it says so as a note, which is the signal to add a driven stage for it.
import * as appServices from '@gm/app-services';
import * as career from '@gm/career';
import * as headless from '@gm/headless';
import * as league from '@gm/league';
import * as people from '@gm/people';
import * as world from '@gm/world';
import { OWNERS } from '../owners.ts';
import type { Recorder } from '../recorder.ts';
import type { Area } from '../types.ts';

interface Probe {
  readonly area: Area;
  readonly code: string;
  readonly owner: string;
  /** True when the entry point a host needs is importable from the package barrel. */
  readonly exported: () => boolean;
  readonly missing: string;
  /** What still blocks a driven stage even when exported. */
  readonly blocker: string;
}

const has = (mod: object, key: string): boolean => key in mod;

export const PROBES: readonly Probe[] = [
  {
    area: 'practice', code: 'practice.not_in_barrel', owner: `${OWNERS.practice}; barrel via ${OWNERS.exportsIntegrator}`,
    exported: () => has(league, 'practice'),
    missing: 'Practice planning (league/src/practice: validatePractice, resolvePractice, writeReport, practiceView) is not in the @gm/league barrel, and app-services has no practice read model; the planner screen imports no service.',
    blocker: 'no app-services practice read model or command, and no host stores the week\'s practice plan',
  },
  {
    area: 'recruiting', code: 'recruiting.no_context', owner: `${OWNERS.recruiting}; barrel via ${OWNERS.exportsIntegrator}`,
    exported: () => has(world, 'recruiting'),
    missing: 'Recruiting: the off-screen T4 week (world/src/recruiting) is not in the @gm/world barrel, and the user-side acts (league recruiting takeAct, recruitingWeek) need a RecruitingContext whose rule values exist only in test fixtures (not in rules-data), so no host can run a recruiting week for the user.',
    blocker: 'RecruitingContext rule values are test fixtures, not rule rows',
  },
  {
    area: 'evaluations', code: 'evaluations.not_in_barrel', owner: `${OWNERS.evaluations}; barrel via ${OWNERS.exportsIntegrator}`,
    exported: () => has(appServices, 'people') || has(appServices, 'peopleView'),
    missing: 'Player evaluations: the people read models (buildPlayerCard, buildRosterTable) and commands (RequestEvaluation, WriteNote) are not in the @gm/app-services barrel, and RequestEvaluation has no WorldService handler; D6 scouting (people.scouting) runs only from tests.',
    blocker: 'ObservedWorld is built only from test tables; no world state holds people yet',
  },
  {
    area: 'home', code: 'home.not_in_barrel', owner: `${OWNERS.home}; barrel via ${OWNERS.exportsIntegrator}`,
    exported: () => has(appServices, 'home') || has(appServices, 'homeView'),
    missing: 'The office (buildHomeView, answerItem, advance) is not in the @gm/app-services barrel, and its AdvanceTime command has no WorldService handler, so time can only move by AdvanceDay, which skips the inbox must-deadlines (O1.2.2).',
    blocker: 'AdvanceTime and MarkInboxRead need COMMANDS rows and handlers',
  },
  {
    area: 'job_market', code: 'market.stand_in', owner: `${OWNERS.careerRun} + ${OWNERS.market}`,
    exported: () => has(career, 'market') && has(headless, 'careerRun'),
    missing: 'The coach job market is not in the barrels.',
    blocker: 'the career run still answers offers through standInMarket (a copy of the G-80 formulas) although career.market is now exported; the user cannot apply for or accept a job through any command',
  },
  {
    area: 'offseason', code: 'offseason.no_real_world', owner: `${OWNERS.worldLoop}; composition via ${OWNERS.exportsIntegrator}`,
    exported: () => has(world, 'loop') && has(league, 'draft'),
    missing: 'The world loop or the draft is not in the barrels.',
    blocker: 'no production GamePort or SchedulePort binds the world loop to the real engine (only test doubles), the generation content (names lib) loads by file path (CR-G81-1), and WorldService holds a schema WorldState, not a LiveWorld, so a career save has no offseason: no draft, free agency, development or aging runs',
  },
  {
    area: 'evaluations', code: 'scouting.exported', owner: OWNERS.evaluations,
    exported: () => has(people, 'scouting'),
    missing: 'D6 scouting (observe, update, band) is not in the @gm/people barrel.',
    blocker: 'nothing turns a game or practice into observations for the user\'s staff',
  },
];

export function coverage(rec: Recorder): string {
  let blocked = 0;
  for (const p of PROBES) {
    if (!p.exported()) { rec.add('missing', p.area, p.code, p.missing, p.owner); blocked++; continue; }
    rec.add('missing', p.area, `${p.code}:unbound`, `Exported but not driven: ${p.blocker}.`, p.owner);
  }
  return `${PROBES.length - blocked} of ${PROBES.length} entry points exported`;
}

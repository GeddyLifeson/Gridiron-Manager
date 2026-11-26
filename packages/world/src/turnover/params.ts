// Roster turnover constants (D6, D7, D8.4.1, K7, X12.1.2). Rule values (eligibility, draft rounds, roster
// limits) are read by key from the league rules, never stored here. Rows below are tuning, each a named
// Assumption until its owner's research lands.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export const MODULE = 'world.turnover';
const ROWS: readonly Row[] = [
  // D6.4.2: an off-screen AI evaluator with no staff record yet. The middle of the skill scale, the same
  // value the scouting module gives a person with no measured skill (`skill.userTerm`).
  ['grade.aiSkill', 50, 0, 100, 'skill points', 'assumption', 'D6.4.2', 'Off-screen evaluator skill until K2/L4 staff skill is read here. No source read'],
  // D6.4.2: one season of watching a rostered player stands for this many season units of evidence.
  ['grade.rosteredUnits', 1, 0.1, 10, 'season share', 'assumption', 'D6.4.2', 'One season of stats per look. No source read'],
  // D6.1.2: one workout (combine or pro day) for a prospect or free agent.
  ['grade.workoutUnits', 1, 0.1, 10, 'session', 'assumption', 'D6.1.2', 'One workout per look. No source read'],
  // K7.2.1: a position below its share of the real roster mix is worth this much more on the board.
  ['need.weight', 4, 0, 20, 'iss', 'assumption', 'K7.2.1', 'Need bonus on the board until front-office gm.needs is bound. No source read'],
  // M2: players at a position up to its mix count are starters for the development reps (D7.7.1 role).
  ['role.starterShareOfMix', 0.5, 0, 1, 'ratio', 'assumption', 'D7.7.1', 'Top half of each position by grade counts as starters. No source read'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: '1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Reads a turnover constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown world turnover parameter ${name}`);
  return v;
}

/** Rule keys this module reads (rules-data). A key a league does not hold switches that part off for it. */
export const RULE_KEY = {
  seasonsOfCompetition: 'eligibility.seasons_of_competition',
  clockYears: 'eligibility.seasons_clock_years',
  draftRounds: 'league_rules.draft.rounds',
  offseasonLimit: 'roster.offseason_limit',
} as const;

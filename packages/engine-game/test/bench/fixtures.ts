// FIXTURE DATA for the bench tests. Players, depth charts, energy costs and times are made up to drive
// the formulas; none of them is a football fact. Rule values come from the repo's real rule sets.
import { Contract, DMATH, seedFromNumber, streamSource } from '@gm/engine-core';
import { resolveRuleSet } from '@gm/rules-data';
import { benchParamTable, type BenchDeps } from '../../src/bench/index.ts';

export const PARAMS_TABLE = benchParamTable();
export const PRO = resolveRuleSet('pro_2026');
export const COLLEGE = resolveRuleSet('college_2026');
export const DEPS: BenchDeps = { rules: PRO, params: PARAMS_TABLE, math: DMATH };
export const STREAMS = streamSource(seedFromNumber(18));

export function day(o: Partial<Contract.GameDayState> = {}): Contract.GameDayState {
  return {
    freshness: 1, freshnessLongTerm: 1, conditioning: 100, playingHurt: [], knowledge: {}, snapsThisGame: 0,
    requiredAbsenceDowns: 0, ejected: false, unavailable: false, ...o,
  };
}

export function player(playerId: number, position: string, o: Partial<Contract.GameDayState> = {}): Contract.SimPlayer {
  return {
    playerId, position, jersey: playerId % 100, heightIn: 74, weightLb: 250, ageYears: 26, attributes: {},
    tests: { fortyS: 4.8, tenSplitS: 1.7, threeConeS: null, shuttleS: null, verticalIn: null, broadIn: null, changeOfDirectionZ: 0 },
    gameDay: day(o),
  };
}

/** A defense of 14 dressed players: 4 linemen spots with 6 linemen, 7 back seven spots with 8 players. */
export function fixtureTeam(side: Contract.Side = 0): Contract.SimTeam {
  const players = [
    player(1, 'DT'), player(2, 'DT'), player(3, 'DT'), player(4, 'DE'), player(5, 'DE'), player(6, 'DE'),
    player(7, 'LB'), player(8, 'LB'), player(9, 'LB'), player(10, 'CB'), player(11, 'CB'), player(12, 'CB'),
    player(13, 'FS'), player(14, 'SS'),
  ];
  return {
    teamId: 1 + side, side, players,
    depth: {
      DT1: [1, 3], DT2: [2, 3], DE1: [4, 6], DE2: [5, 6], LB1: [7], LB2: [8, 9], LB3: [9], CB1: [10, 12], CB2: [11, 12], FS: [13], SS: [14],
    },
    teamDiscipline: { defCoverage: 1, postPlay: 1 },
  };
}

export const DEFENSE_ROLES = ['DT1', 'DT2', 'DE1', 'DE2', 'LB1', 'LB2', 'LB3', 'CB1', 'CB2', 'FS', 'SS'] as const;

export function benchOf(team: Contract.SimTeam): Record<string, Contract.GameDayState> {
  return Object.fromEntries(team.players.map((p) => [String(p.playerId), p.gameDay]));
}

/** Staff read equal to the truth: for tests of the plan logic alone. */
export function exactRead(bench: Record<string, Contract.GameDayState>): Record<string, number> {
  return Object.fromEntries(Object.entries(bench).map(([id, d]) => [id, d.freshness]));
}

// FIXTURES for the bench tests, copied in shape from the reference resolver's test helpers (a test may
// not import another package's test files, P1.2.2). Not rule facts and not real people.
import {
  ATTRIBUTE_IDS, NEUTRAL_ENVIRONMENT,
  type DefenseCall, type FieldGeometry, type FieldedPlayer, type GameSituation, type OffenseCall, type PlayInput, type RuleSet, type Side, type SimPlayer, type SimTeam,
} from '@gm/schema';
import { DMATH } from '@gm/engine-core';
import { resolver as ref } from '@gm/resolver-reference';

export const FIELD: FieldGeometry = {
  lengthYd: 120, widthYd: 160 / 3, goalLineWestX: 10, goalLineEastX: 110,
  hashSouthY: 70.75 / 3, hashNorthY: 160 / 3 - 70.75 / 3, centreY: 80 / 3,
  uprightSouthY: 80 / 3 - 18.5 / 6, uprightNorthY: 80 / 3 + 18.5 / 6, crossbarHeightYd: 10 / 3,
};

const RULES: RuleSet = {
  id: 'fixture_2026', level: 'pro', seasonYear: 2026,
  num(key: string): number { throw new Error(`fixture rule set has no number ${key}`); },
  bool(key: string): boolean { throw new Error(`fixture rule set has no boolean ${key}`); },
  opt(key: string): string { throw new Error(`fixture rule set has no option ${key}`); },
  keys: () => [],
};

function player(id: number): SimPlayer {
  const attributes: Record<string, number> = {};
  for (const a of ATTRIBUTE_IDS) attributes[a] = 50;
  return {
    playerId: id, position: 'XX', jersey: id % 100, heightIn: 74, weightLb: 220, ageYears: 25, attributes,
    tests: { fortyS: 4.6, tenSplitS: 1.6, threeConeS: null, shuttleS: null, verticalIn: null, broadIn: null, changeOfDirectionZ: 0 },
    gameDay: { freshness: 1, freshnessLongTerm: 1, conditioning: 50, playingHurt: [], knowledge: {}, snapsThisGame: 0, requiredAbsenceDowns: 0, ejected: false, unavailable: false },
  };
}
function team(side: Side): SimTeam {
  const base = side === 0 ? 100 : 200;
  const players: SimPlayer[] = [];
  for (let i = 1; i <= 44; i++) players.push(player(base + i));
  return { teamId: side + 1, side, players, depth: {}, teamDiscipline: { defCoverage: 1, postPlay: 1 } };
}
const unit = (side: Side, roles: readonly string[], offset: number): FieldedPlayer[] =>
  roles.map((role, i) => ({ playerId: (side === 0 ? 100 : 200) + offset + i + 1, role }));

export const OFFENSE_ROLES = ['Q', 'LT', 'LG', 'C', 'RG', 'RT', 'R', 'Y', 'X', 'Z', 'H'];
const DEFENSE_ROLES = ['LE', 'DT', 'NT', 'RE', 'SAM', 'MIKE', 'WILL', 'LCB', 'RCB', 'FS', 'SS'];

export function offenseCall(over: Partial<OffenseCall> = {}): OffenseCall {
  return {
    unit: 'offense', playContentId: 'draft:bench-play', contentHash: '0123456789abcdef', kind: 'quick_pass', personnelCode: '11', formationId: null, strength: null,
    motionId: null, protectionId: null, tags: [], runDirection: null, shotgun: false, tempo: 'huddle', players: unit(0, OFFENSE_ROLES, 0), ...over,
  };
}
export function defenseCall(over: Partial<DefenseCall> = {}): DefenseCall {
  return {
    unit: 'defense', callContentId: null, contentHash: null, packageId: null, frontId: null, coverageId: null, pressureId: null,
    coverageFamily: 'cover3', rushers: 4, boxCount: 7, players: unit(1, DEFENSE_ROLES, 11), ...over,
  };
}
export function situation(over: Partial<GameSituation> = {}): GameSituation {
  return {
    gameId: 1, playNumber: 1, driveNumber: 1, playKind: 'scrimmage', period: 1, overtime: false, clockTenths: 9000,
    clockStatus: 'running', playClockAtSnapTenths: 50, offense: 0, attackDir: 1, down: 1, distanceYd: 10, goalToGo: false,
    ballX: 35, ballY: FIELD.centreY, lineToGainX: 45, score: [0, 0], timeoutsLeft: [3, 3], insideTwoMinute: false, untimedDown: false, ...over,
  };
}
export const BASE: Omit<PlayInput, 'situation' | 'calls' | 'streams' | 'options'> = {
  teams: [team(0), team(1)], environment: NEUTRAL_ENVIRONMENT, geometry: FIELD, math: DMATH, rules: RULES, params: ref.referenceParamTable(),
};

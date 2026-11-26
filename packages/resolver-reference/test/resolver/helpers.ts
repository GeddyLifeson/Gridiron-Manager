// Test fixtures for the reference resolver. Everything here is a FIXTURE built for the tests: the rule
// set, the field and the teams are not rule facts and not real people. The real rule values arrive
// through WP-01 and the field through WP-09 after integration (build plan section 2).
import {
  ATTRIBUTE_IDS, NEUTRAL_ENVIRONMENT, PlayTruth, playTruthProblems,
  type DefenseCall, type FieldGeometry, type FieldedPlayer, type GameSituation, type KickCall, type KickKind,
  type OffenseCall, type OffensePlayKind, type PlayCalls, type PlayInput, type PlayResult, type ReturnCall,
  type RuleSet, type Side, type SimPlayer, type SimTeam, type StreamName, type StreamSource, type ScopeValue,
} from '@gm/schema';
import { DMATH, streamSource, seedFromNumber, stream } from '@gm/engine-core';
import { FOUL_ROWS, referenceParamTable } from '../../src/resolver/index.ts';

/** FIXTURE field: 100 yards between goal lines with 10-yard end zones, 160 feet wide, posts 18.5 feet apart. */
export const FIELD: FieldGeometry = {
  lengthYd: 120, widthYd: 160 / 3, goalLineWestX: 10, goalLineEastX: 110,
  hashSouthY: 70.75 / 3, hashNorthY: 160 / 3 - 70.75 / 3, centreY: 80 / 3,
  uprightSouthY: 80 / 3 - 18.5 / 6, uprightNorthY: 80 / 3 + 18.5 / 6, crossbarHeightYd: 10 / 3,
};

/** FIXTURE rule set. `fouls` true adds an `exists` key for every foul row; `missing` leaves some out. */
export function fixtureRules(opts: { fouls?: boolean; off?: readonly string[] } = {}): RuleSet {
  const bools = new Map<string, boolean>();
  if (opts.fouls) for (const f of FOUL_ROWS) bools.set(`foul.${f.id}.exists`, !(opts.off ?? []).includes(f.id));
  return {
    id: 'fixture_2026', level: 'pro', seasonYear: 2026,
    num(key: string): number { throw new Error(`fixture rule set has no number ${key}`); },
    bool(key: string): boolean {
      const v = bools.get(key);
      if (v === undefined) throw new Error(`fixture rule set has no boolean ${key}`);
      return v;
    },
    opt(key: string): string { throw new Error(`fixture rule set has no option ${key}`); },
    keys: () => [...bools.keys()],
  };
}

export function player(id: number, position: string, iss: number): SimPlayer {
  const attributes: Record<string, number> = {};
  for (const a of ATTRIBUTE_IDS) attributes[a] = iss;
  return {
    playerId: id, position, jersey: id % 100, heightIn: 74, weightLb: 220, ageYears: 25, attributes,
    tests: { fortyS: 4.6, tenSplitS: 1.6, threeConeS: null, shuttleS: null, verticalIn: null, broadIn: null, changeOfDirectionZ: 0 },
    gameDay: { freshness: 1, freshnessLongTerm: 1, conditioning: 50, playingHurt: [], knowledge: {}, snapsThisGame: 0, requiredAbsenceDowns: 0, ejected: false, unavailable: false },
  };
}

const OFFENSE_ROLES = ['QB', 'RB', 'X', 'Z', 'Y', 'H', 'LT', 'LG', 'C', 'RG', 'RT'];
const DEFENSE_ROLES = ['LE', 'DT', 'NT', 'RE', 'SAM', 'MIKE', 'WILL', 'LCB', 'RCB', 'FS', 'SS'];
const KICK_ROLES = ['K', 'P', 'LS', 'H', 'L1', 'L2', 'L3', 'L4', 'L5', 'R1', 'R2'];
const RETURN_ROLES = ['KR', 'PR', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'];

/** FIXTURE team: 44 players, ids base+1 to base+44, every attribute at `iss`. */
export function team(side: Side, iss = 50): SimTeam {
  const base = side === 0 ? 100 : 200;
  const players: SimPlayer[] = [];
  for (let i = 1; i <= 44; i++) players.push(player(base + i, 'XX', iss));
  return { teamId: side + 1, side, players, depth: {}, teamDiscipline: { defCoverage: 1, postPlay: 1 } };
}

function unit(side: Side, roles: readonly string[], offset: number): FieldedPlayer[] {
  const base = (side === 0 ? 100 : 200) + offset;
  return roles.map((role, i) => ({ playerId: base + i + 1, role }));
}

export function offenseCall(side: Side, kind: OffensePlayKind, over: Partial<OffenseCall> = {}): OffenseCall {
  return {
    unit: 'offense', playContentId: null, contentHash: null, kind, personnelCode: '11', formationId: null, strength: null,
    motionId: null, protectionId: null, tags: [], runDirection: null, shotgun: false, tempo: 'huddle',
    players: unit(side, OFFENSE_ROLES, 0), ...over,
  };
}

export function defenseCall(side: Side, over: Partial<DefenseCall> = {}): DefenseCall {
  return {
    unit: 'defense', callContentId: null, contentHash: null, packageId: null, frontId: null, coverageId: null, pressureId: null,
    coverageFamily: 'cover3', rushers: 4, boxCount: 7, players: unit(side, DEFENSE_ROLES, 11), ...over,
  };
}

export function kickCall(side: Side, kickKind: KickKind, over: Partial<KickCall> = {}): KickCall {
  return { unit: 'kick', kickKind, callContentId: null, contentHash: null, direction: null, players: unit(side, KICK_ROLES, 22), ...over };
}

export function returnCall(side: Side, over: Partial<ReturnCall> = {}): ReturnCall {
  return { unit: 'return', returnKind: 'kick_return', callContentId: null, contentHash: null, players: unit(side, RETURN_ROLES, 33), ...over };
}

export function situation(over: Partial<GameSituation> = {}): GameSituation {
  const offense: Side = over.offense ?? 0;
  const attackDir = over.attackDir ?? 1;
  const ballX = over.ballX ?? 35;
  return {
    gameId: 1, playNumber: 1, driveNumber: 1, playKind: 'scrimmage', period: 1, overtime: false, clockTenths: 9000,
    clockStatus: 'running', playClockAtSnapTenths: 50, offense, attackDir, down: 1, distanceYd: 10, goalToGo: false,
    ballX, ballY: FIELD.centreY, lineToGainX: ballX + 10 * attackDir, score: [0, 0], timeoutsLeft: [3, 3],
    insideTwoMinute: false, untimedDown: false, ...over,
  };
}

export interface Recorded { name: StreamName; scope: readonly ScopeValue[] }

export interface InputOptions {
  seed?: number;
  rules?: RuleSet;
  teams?: readonly [SimTeam, SimTeam];
  params?: PlayInput['params'];
  record?: Recorded[];
}

const DEFAULT_TEAMS: readonly [SimTeam, SimTeam] = [team(0), team(1)];
export const DEFAULT_PARAMS = referenceParamTable();
const NO_FOULS = fixtureRules();

export function input(sit: GameSituation, calls: PlayCalls, o: InputOptions = {}): PlayInput {
  const source = streamSource(seedFromNumber(o.seed ?? 1));
  const streams: StreamSource = o.record
    ? (name, scope) => { o.record!.push({ name, scope }); return source(name, scope); }
    : source;
  return {
    situation: sit, calls, teams: o.teams ?? DEFAULT_TEAMS, environment: NEUTRAL_ENVIRONMENT, geometry: FIELD,
    streams, math: DMATH, rules: o.rules ?? NO_FOULS, params: o.params ?? DEFAULT_PARAMS, options: { detail: 'summary' },
  };
}

/** Every problem with a result: the contract's structural check, the schema, and spots on the field. */
export function problems(r: PlayResult): string[] {
  const out = [...playTruthProblems(r.truth)];
  const parsed = PlayTruth.safeParse(r.truth);
  if (!parsed.success) out.push(`schema: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  for (const e of r.truth.events) {
    for (const v of Object.values(e)) {
      if (v && typeof v === 'object' && 'x' in v && 'y' in v) {
        const s = v as { x: number; y: number };
        if (s.x < 0 || s.x > FIELD.lengthYd || s.y < 0 || s.y > FIELD.widthYd) out.push(`${e.type} spot off the field: ${s.x}, ${s.y}`);
      }
    }
  }
  if (r.liveDurationTenths !== r.truth.liveDurationTenths) out.push('live duration differs between result and truth');
  if (!Number.isInteger(r.liveDurationTenths) || r.liveDurationTenths < 0) out.push('live duration is not a non-negative integer');
  if (r.trajectory !== null || r.explain !== null) out.push('reference resolver returned a trajectory or an explain record');
  return out;
}

export const OFFENSE_KINDS: readonly OffensePlayKind[] = ['run', 'dropback_pass', 'quick_pass', 'play_action', 'movement_pass', 'screen', 'rpo', 'draw', 'qb_run', 'trick', 'kneel', 'spike'];
export const KICK_KINDS: readonly KickKind[] = ['punt', 'field_goal', 'try_kick', 'kickoff', 'onside_kick', 'safety_kick', 'fair_catch_kick'];

/** A generated situation and pair of calls: any spot on the field, either direction, any play or kick kind. */
export function generated(i: number, seed: number): { sit: GameSituation; calls: PlayCalls } {
  const g = stream(seedFromNumber(seed), 'between', [i]);
  const offense = g.int(0, 1) as Side;
  const defense = (1 - offense) as Side;
  const attackDir = g.chance(0.5) ? 1 : -1;
  const toGoal = 0.5 + g.uniform() * 99;
  const ballX = attackDir === 1 ? FIELD.goalLineEastX - toGoal : FIELD.goalLineWestX + toGoal;
  const ballY = FIELD.hashSouthY + g.uniform() * (FIELD.hashNorthY - FIELD.hashSouthY);
  const base = { gameId: 1 + (i % 7), playNumber: 1 + i, offense, attackDir, ballX, ballY } as const;
  const pickKick = g.chance(0.2);
  if (pickKick) {
    const kickKind = KICK_KINDS[g.int(0, KICK_KINDS.length - 1)]!;
    const playKind = kickKind === 'kickoff' || kickKind === 'onside_kick' ? 'kickoff' : kickKind === 'safety_kick' ? 'safety_kick'
      : kickKind === 'fair_catch_kick' ? 'fair_catch_kick' : kickKind === 'try_kick' ? 'try' : 'scrimmage';
    const scrimmage = playKind === 'scrimmage';
    const sit = situation({ ...base, playKind, down: scrimmage ? 4 : null, distanceYd: scrimmage ? 5 : null, lineToGainX: scrimmage ? ballX + 5 * attackDir : null });
    return { sit, calls: { snapping: kickCall(offense, kickKind), opposing: returnCall(defense) } };
  }
  const kind = OFFENSE_KINDS[g.int(0, OFFENSE_KINDS.length - 1)]!;
  const distance = Math.min(1 + g.uniform() * 14, toGoal);
  const isTry = g.chance(0.03);
  const sit = situation({
    ...base, playKind: isTry ? 'try' : 'scrimmage', down: isTry ? null : g.int(1, 4), distanceYd: isTry ? null : distance,
    lineToGainX: isTry ? null : ballX + distance * attackDir, goalToGo: !isTry && distance >= toGoal,
  });
  const dir = ([null, 'left', 'middle', 'right'] as const)[g.int(0, 3)]!;
  return { sit, calls: { snapping: offenseCall(offense, kind, { runDirection: dir }), opposing: defenseCall(defense, { rushers: g.int(2, 8), boxCount: g.int(5, 9) }) } };
}

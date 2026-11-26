// Test support for the tick resolver. Everything here is a FIXTURE: the calls, the two units and the
// content port are test inputs built from the pre-snap fixtures, not shipped content (WP-15 owns that),
// and the rule values are the pre-snap fixture's, not rule data (WP-01).
import {
  NEUTRAL_ENVIRONMENT, SLOT_COUNT, SLOTS_PER_TEAM,
  type Assignment, type GameSituation, type KickKind, type ParamTable, type PlayCalls, type PlayInput, type RuleSet, type SimTeam,
} from '@gm/schema';
import { lang } from '@gm/football-lang';
import { DMATH, seedFromNumber, streamSource } from '../../src/index.ts';
import { PARAMS as BALL_PARAMS } from '../../src/ball/index.ts';
import { PARAMS as CARRIER_PARAMS } from '../../src/carrier/index.ts';
import { PARAMS as FI_PARAMS, LIVE_FOULS } from '../../src/fouls-injuries/index.ts';
import { PARAMS as CONTEST_PARAMS } from '../../src/contest/index.ts';
import { PARAMS as FIELD_PARAMS, fieldGeometry } from '../../src/field/index.ts';
import { PARAMS as KIN_PARAMS } from '../../src/kinematics/index.ts';
import { PARAMS as PERCEPTION_PARAMS } from '../../src/perception/index.ts';
import { PARAMS as AI_PARAMS } from '../../src/player-ai/index.ts';
import { PARAMS as PRESNAP_PARAMS } from '../../src/presnap/index.ts';
import { PARAMS as QB_PARAMS, basePlay, type QbPlay } from '../../src/qb/index.ts';
import { paramTableFromFiles } from '../../src/tick/index.ts';
import { PARAMS, qbTargetOf, type PlayContentPort, type PlaySetup } from '../../src/tick-resolver/index.ts';
import { asg as presnapAsg, defense as presnapDefense, defenseInput, FIXTURE_VALUES, input as presnapInput, offense as presnapOffense, offenseInput, ruleSet, JERSEYS } from '../presnap/support.ts';
import { fixturePlayer } from '../tick/support.ts';

export const TABLE: ParamTable = paramTableFromFiles([
  FIELD_PARAMS, KIN_PARAMS, PERCEPTION_PARAMS, PRESNAP_PARAMS, AI_PARAMS, BALL_PARAMS, CONTEST_PARAMS, QB_PARAMS, PARAMS, ...lang.PARAM_FILES,
]);
/** FIXTURE rule values: the pre-snap fixture plus the keys the quarterback and the catch point read. Not rule data. */
export const RULES: RuleSet = ruleSet({
  ...FIXTURE_VALUES, 'score.touchdown': 6, 'try.two_point_points': 2, 'pass.spike_requires_under_center': true,
  'foul.intentional_grounding.exists': true, 'catch.feet_required': 2,
});

/** The table a resolver on all three real modules needs: the fixture table plus the carrier's and the fouls-and-injuries rows. */
export const ALL_TABLE: ParamTable = paramTableFromFiles([
  FIELD_PARAMS, KIN_PARAMS, PERCEPTION_PARAMS, PRESNAP_PARAMS, AI_PARAMS, BALL_PARAMS, CONTEST_PARAMS, QB_PARAMS, PARAMS, CARRIER_PARAMS, FI_PARAMS, ...lang.PARAM_FILES,
]);
/** FIXTURE: the fixture rules plus every foul the fouls-and-injuries module commits and the keys it and the player AI read. Not rule data. */
const FOUL_KEYS: Record<string, number | boolean | string> = {
  'foul.ineligible_downfield.yards': 1, 'foul.low_block.rule': 'tight_end_box_only',
  'foul.offensive_holding.yards': 10, 'foul.dpi.spot_foul': true, 'foul.dpi.yards': 0, 'foul.dpi.max_yards': 0, 'foul.dpi.afd': true,
};
for (const id of LIVE_FOULS) if (!(`foul.${id}.exists` in FOUL_KEYS)) FOUL_KEYS[`foul.${id}.exists`] = id !== 'targeting';
export const ALL_RULES: RuleSet = {
  ...RULES, id: 'fixture_all_plugs',
  num: (k) => (k in FOUL_KEYS ? (FOUL_KEYS[k] as number) : RULES.num(k)),
  bool: (k) => (k in FOUL_KEYS ? (FOUL_KEYS[k] as boolean) : RULES.bool(k)),
  opt: (k) => (k in FOUL_KEYS ? (FOUL_KEYS[k] as string) : RULES.opt(k)),
  keys: () => [...RULES.keys(), ...Object.keys(FOUL_KEYS)],
};

/** A table with some rows replaced, for forcing an event in a test. */
export function tableWith(over: Record<string, number>): ParamTable {
  return { version: 'test', has: (n) => TABLE.has(n), num: (n) => (over[n] ?? TABLE.num(n)) };
}

/** The pre-snap fixtures with a gaze word the language knows, so the assignments compile. */
const GAZE = 'key';
const fix = (a: Assignment): Assignment => ({ ...a, gaze: GAZE });
const asg = (...args: Parameters<typeof presnapAsg>): Assignment => fix(presnapAsg(...args));
/** Routes for the fixture's receivers (the pre-snap fixture draws none): a dig, a stick, a post and a hitch. */
const ROUTES: Record<string, { px: number; py: number; kind: 'through' | 'cut' | 'settle' }[]> = {
  X: [{ px: 10, py: 12, kind: 'cut' }, { px: 10, py: 2, kind: 'through' }],
  Y: [{ px: 6, py: -4.2, kind: 'cut' }, { px: 6, py: -8, kind: 'settle' }],
  Z: [{ px: 12, py: 6, kind: 'cut' }, { px: 22, py: -2, kind: 'through' }],
  H: [{ px: 5, py: 7, kind: 'cut' }, { px: 5, py: 4, kind: 'settle' }],
};
const routed = (a: Assignment): Assignment => {
  const r = ROUTES[a.role];
  return r && a.behavior.type === 'route' ? { ...a, behavior: { ...a.behavior, path: r.map((pt) => ({ ...pt, landmark: null })) } } : a;
};
const offense = (): Assignment[] => presnapOffense().map(fix).map(routed);
const SLOT = { Y: 5, X: 6, Z: 7, H: 8, QB: 9, RB: 10, RE: SLOTS_PER_TEAM + 3 } as const;

/** FIXTURE quarterback plays: a three-read dropback with a checkdown, and a zone read off the end. */
export function qbPlayOf(kind: Kind, O: readonly Assignment[]): QbPlay | null {
  if (kind === 'pass') {
    const t = (slot: number) => qbTargetOf(slot, O[slot]!);
    return { ...basePlay(SLOT.QB, 'gun3', [
      { kind: 'receiver', target: t(SLOT.X), priorValue: 0.5 }, { kind: 'receiver', target: t(SLOT.Z), priorValue: 0.6 }, { kind: 'receiver', target: t(SLOT.Y), priorValue: 0.3 },
    ]), checkdown: t(SLOT.H) };
  }
  if (kind === 'run') {
    return { ...basePlay(SLOT.QB, 'gun3', []), kind: 'mesh', mesh: { keySlot: SLOT.RE, backSlot: SLOT.RB, startS: 0, endS: 0.2, onCrash: 'keep' }, eligible: [SLOT.Y, SLOT.X, SLOT.Z, SLOT.H, SLOT.RB] };
  }
  return null;
}
const defense = (): Assignment[] => presnapDefense().map(fix);

export type Kind = 'pass' | 'run' | KickKind;

/** The run fixture: the pass fixture with run blocks and the back taking the snap-side run path. */
function runOffense(): Assignment[] {
  return offense().map((a) => (
    a.role === 'RB' ? { ...a, behavior: { ...a.behavior, type: 'ballCarrier' } }
      : a.behavior.type === 'passSet' ? { ...a, behavior: { ...a.behavior, type: 'runBlock' } } : a));
}
function runDefense(): Assignment[] {
  return defense().map((a) => (a.behavior.type === 'passRush' ? { ...a, behavior: { ...a.behavior, type: 'runFit' } } : a));
}
/** Punt and place-kick units: a snapper, the man who takes the snap, protection across the line. */
function kickUnit(kind: KickKind): Assignment[] {
  const out: Assignment[] = [];
  for (let i = 0; i < 9; i++) out.push(i === 4 ? asg('LS', 'snapper', -0.4, 0, true) : asg(`P${i}`, 'protectKick', -0.4, (i - 4) * 1.4, i >= 1 && i <= 7));
  if (kind === 'punt') { out.push(asg('PP', 'protectKick', -6, 1, false), asg('P', 'kicker', -14, 0, false)); }
  else { out.push(asg('H', 'holder', -7.5, 0.4, false), asg('K', 'kicker', -9.5, -1.5, false)); }
  return out;
}
function rushUnit(returner: boolean): Assignment[] {
  const out: Assignment[] = [];
  for (let i = 0; i < 10; i++) out.push(asg(`R${i}`, 'rushKick', 1, (i - 4.5) * 1.4, true));
  out.push(returner ? asg('PR', 'returner', 45, 0, false) : asg('S', 'rushKick', 6, 0, false));
  return out;
}
/** Free kick: ten across behind the ball and the kicker; the receiving team spread deep. */
function freeKickUnit(): Assignment[] {
  const out: Assignment[] = [];
  for (let i = 0; i < 10; i++) out.push(asg(`C${i}`, 'kickCoverage', -1, (i - 4.5) * 4.5, false));
  out.push(asg('K', 'kicker', -1, 0, false));
  return out;
}
function receivingUnit(): Assignment[] {
  const out: Assignment[] = [];
  for (let i = 0; i < 9; i++) out.push(asg(`B${i}`, 'kickReturnBlock', 12 + (i % 3) * 12, (i - 4) * 5, false));
  out.push(asg('KR1', 'returner', 60, 6, false), asg('KR2', 'returner', 60, -6, false));
  return out;
}

const UNITS = new Map<string, { O: Assignment[]; D: Assignment[] }>();
/** The same assignment objects every time a kind is asked for, as a real content set gives (the resolver caches compiled forms by object). */
export function unitsOf(kind: Kind): { O: Assignment[]; D: Assignment[] } {
  let u = UNITS.get(kind);
  if (!u) {
    u = kind === 'pass' ? { O: offense(), D: defense() }
      : kind === 'run' ? { O: runOffense(), D: runDefense() }
      : kind === 'punt' ? { O: kickUnit(kind), D: rushUnit(true) }
      : kind === 'field_goal' || kind === 'try_kick' ? { O: kickUnit(kind), D: rushUnit(false) }
      : kind === 'fair_catch_kick' ? { O: kickUnit(kind), D: receivingUnit() }
      : { O: freeKickUnit(), D: receivingUnit() };
    UNITS.set(kind, u);
  }
  return u;
}

export function kindOf(input: PlayInput): Kind {
  const c = input.calls.snapping;
  return c.unit === 'kick' ? c.kickKind : c.kind === 'run' ? 'run' : 'pass';
}

/** FIXTURE content port: a pure function of the calls. */
export const CONTENT: PlayContentPort = {
  setup(input: PlayInput): PlaySetup {
    const kind = kindOf(input), u = unitsOf(kind);
    const qb = u.O.findIndex((a) => a.behavior.type === 'quarterback');
    const slots: PlaySetup['slots'] = Array.from({ length: SLOT_COUNT }, () => ({ conceptId: `fixture.${kind}` }));
    return {
      presnap: presnapInput({
        shotgun: true, snapFoulPhase: input.calls.snapping.unit === 'kick' ? 'scrimmage_kick' : kind === 'run' ? 'running_play' : 'pass_play',
        offense: offenseInput({ assignments: u.O, signalCaller: qb >= 0 ? qb : 4 }),
        defense: defenseInput({ assignments: u.D, manMatch: kind === 'pass' || kind === 'run' ? { 6: 6, 7: 7, 8: 8 } : {} }),
      }),
      slots, context: qb >= 0 ? { qbSlot: qb } : {}, qb: qbPlayOf(kind, u.O),
      perception: Array.from({ length: SLOT_COUNT }, (_, s) => (s >= SLOTS_PER_TEAM ? { readsKeys: true, boxDefender: s < SLOTS_PER_TEAM + 6 } : {})),
    };
  },
};

export interface Spec { seed?: number; playNumber?: number; kind?: Kind; ballX?: number; attackDir?: 1 | -1; clockTenths?: number; detail?: 'full' | 'summary'; params?: ParamTable; stopAtTick?: number; grade?: (slot: number) => Record<string, number> }

function team(side: 0 | 1, base: number, grade: Spec['grade'], firstSlot: number): SimTeam {
  const players = [];
  for (let i = 0; i < SLOTS_PER_TEAM; i++) {
    const p = fixturePlayer(base + i, grade ? { attributes: grade(firstSlot + i) } : {});
    if (firstSlot === 0) p.jersey = JERSEYS[i]!;
    players.push(p);
  }
  return { teamId: side + 1, side, players, depth: {}, teamDiscipline: { defCoverage: 1, postPlay: 1 } };
}

export function playInput(spec: Spec = {}): PlayInput {
  const kind = spec.kind ?? 'pass', geometry = fieldGeometry(RULES);
  const attackDir = spec.attackDir ?? 1, ballX = spec.ballX ?? 35, ballY = geometry.centreY, distanceYd = 10;
  const free = kind === 'kickoff' || kind === 'onside_kick' || kind === 'safety_kick' || kind === 'fair_catch_kick';
  const situation: GameSituation = {
    gameId: 1, playNumber: spec.playNumber ?? 1, driveNumber: 1, playKind: kind === 'try_kick' ? 'try' : free ? (kind === 'onside_kick' ? 'kickoff' : kind) : 'scrimmage',
    period: 1, overtime: false, clockTenths: spec.clockTenths ?? 9000, clockStatus: 'running', playClockAtSnapTenths: 50, offense: 0, attackDir,
    down: 1, distanceYd, goalToGo: false, ballX, ballY, lineToGainX: ballX + distanceYd * attackDir, score: [0, 0], timeoutsLeft: [3, 3],
    insideTwoMinute: false, untimedDown: false,
  };
  const u = unitsOf(kind);
  const fielded = (base: number, as: Assignment[]) => as.map((a, i) => ({ playerId: base + i, role: a.role }));
  const kickPlay = kind !== 'pass' && kind !== 'run';
  const calls: PlayCalls = {
    snapping: kickPlay
      ? { unit: 'kick', kickKind: kind, callContentId: null, contentHash: null, direction: null, players: fielded(100, u.O) }
      : { unit: 'offense', playContentId: null, contentHash: null, kind: kind === 'run' ? 'run' : 'dropback_pass', personnelCode: '11', formationId: null, strength: null,
        motionId: null, protectionId: null, tags: [], runDirection: null, shotgun: true, tempo: 'huddle', players: fielded(100, u.O) },
    opposing: kickPlay
      ? { unit: 'return', returnKind: kind === 'punt' ? 'punt_return' : kind === 'field_goal' ? 'field_goal_block' : kind === 'try_kick' ? 'try_block' : 'kick_return', callContentId: null, contentHash: null, players: fielded(200, u.D) }
      : { unit: 'defense', callContentId: null, contentHash: null, packageId: null, frontId: null, coverageId: null, pressureId: null, coverageFamily: 'cover2', rushers: 4, boxCount: 6, players: fielded(200, u.D) },
  };
  return {
    situation, calls, teams: [team(0, 100, spec.grade, 0), team(1, 200, spec.grade, SLOTS_PER_TEAM)], environment: NEUTRAL_ENVIRONMENT, geometry,
    streams: streamSource(seedFromNumber(spec.seed ?? 7)), math: DMATH, rules: RULES, params: spec.params ?? TABLE,
    options: spec.stopAtTick === undefined ? { detail: spec.detail ?? 'summary' } : { detail: spec.detail ?? 'summary', stopAtTick: spec.stopAtTick },
  };
}

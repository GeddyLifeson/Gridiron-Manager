// Test fixtures for WP-05. Everything here is a FIXTURE: the rule values below are made up for the
// tests and are not the real rule sets. The real values and their fact rows belong to WP-01; the
// real-value cases of Q1.1.1 run after integration (engine build plan, section 2).
import { DMATH, seedFromNumber, streamSource } from '@gm/engine-core';
import {
  PlayTruth, foulKey, playTruthProblems,
  type FieldGeometry, type FoulRecord, type GameSituation, type GameState, type OfficialsCrew, type ParamTable, type RuleSet,
  type RulingContext, type Side, type TruthEvent,
} from '@gm/schema';
import { PARAMS as CREW_PARAMS, CREW, neutralCrew, paramTable } from '../../src/crew/index.ts';
import { PARAMS as REPLAY_PARAMS } from '../../src/replay/index.ts';

type Value = number | boolean | string;

const ASPECTS = ['catch', 'down_by_contact', 'spot', 'forward_or_backward_pass', 'in_bounds', 'score', 'possession',
  'fumble_before_down', 'kick_good', 'touching', 'foul'];
const BOOTH_ONLY = ['after_two_minute', 'overtime', 'scoring_play', 'try', 'turnover', 'failed_fourth_down', 'kick_possession', 'disqualification'];

function foulRows(id: string, v: { yards: number; cls: string; dq: string; reviewed?: boolean; removable?: boolean; exists?: boolean }): [string, Value][] {
  return [
    [foulKey(id, 'exists'), v.exists ?? true], [foulKey(id, 'yards'), v.yards], [foulKey(id, 'afd'), false], [foulKey(id, 'lod'), false],
    [foulKey(id, 'spot_foul'), false], [foulKey(id, 'dead_ball'), false], [foulKey(id, 'runoff_eligible'), false],
    [foulKey(id, 'class'), v.cls], [foulKey(id, 'dq'), v.dq],
    [`foul.${id}.replay_reviewed`, v.reviewed ?? false], [`foul.${id}.assist_removable`, v.removable ?? false],
  ];
}

/** Fixture A: coach challenges plus a booth with its own list. Fixture B: a booth that may stop any play. */
function fixtureValues(model: 'challenge_plus_booth' | 'booth_all_plays'): Map<string, Value> {
  const flag = model === 'challenge_plus_booth';
  const m = new Map<string, Value>([
    ['catch.feet_required', flag ? 2 : 1],
    ['series.downs', 4],
    ['replay.model', model],
    ['challenge.count', 2],
    ['challenge.third_if', 'either_of_first_two_won'],
    ['challenge.requires_timeout', true],
    ['challenge.overturn_refunds_timeout', true],
    ['challenge.allowed_in_overtime', !flag],
    ['replay.no_recovery_end_zone_yardline', 1],
  ]);
  for (const a of ASPECTS) {
    m.set(`replay.reviewable.${a}`, a !== 'foul' && a !== 'down_by_contact');
    m.set(`replay.assist.${a}`, flag && ['forward_or_backward_pass', 'in_bounds', 'score', 'touching', 'possession'].includes(a));
  }
  for (const b of BOOTH_ONLY) m.set(`replay.booth_only.${b}`, flag);
  for (const [k, v] of [
    ...foulRows('fx_hold', { yards: 10, cls: 'other', dq: 'none' }),
    ...foulRows('fx_early', { yards: 5, cls: 'other', dq: 'none' }),
    ...foulRows('fx_mask', { yards: 15, cls: 'personal', dq: 'if_flagrant', removable: true }),
    ...foulRows('fx_head', { yards: 15, cls: 'personal', dq: 'automatic', reviewed: true }),
    ...foulRows('fx_gone', { yards: 5, cls: 'other', dq: 'none', exists: false }),
  ]) m.set(k, v);
  return m;
}

export function fixtureRules(model: 'challenge_plus_booth' | 'booth_all_plays' = 'challenge_plus_booth', overrides: Record<string, Value> = {}): RuleSet {
  const m = fixtureValues(model);
  for (const [k, v] of Object.entries(overrides)) m.set(k, v);
  const get = (key: string) => { const v = m.get(key); if (v === undefined) throw new Error(`fixture rule set: missing key ${key}`); return v; };
  return {
    id: model === 'challenge_plus_booth' ? 'fixture_a' : 'fixture_b', level: 'pro', seasonYear: 2026,
    num(key) { const v = get(key); if (typeof v !== 'number') throw new Error(`${key} is not a number`); return v; },
    bool(key) { const v = get(key); if (typeof v !== 'boolean') throw new Error(`${key} is not a switch`); return v; },
    opt(key) { const v = get(key); if (typeof v !== 'string') throw new Error(`${key} is not an option`); return v; },
    keys() { return [...m.keys()].sort(); },
  };
}

/** A 120 by 53.33 yard field with goal lines at x = 10 and x = 110. Fixture numbers. */
export const GEOMETRY: FieldGeometry = {
  lengthYd: 120, widthYd: 53.33, goalLineWestX: 10, goalLineEastX: 110, hashSouthY: 23.58, hashNorthY: 29.75, centreY: 26.665,
  uprightSouthY: 23.58, uprightNorthY: 29.75, crossbarHeightYd: 3.33,
};

export function situation(over: Partial<GameSituation> = {}): GameSituation {
  return {
    gameId: 1, playNumber: 1, driveNumber: 1, playKind: 'scrimmage', period: 3, overtime: false, clockTenths: 5400,
    clockStatus: 'running', playClockAtSnapTenths: 50, offense: 0, attackDir: 1, down: 1, distanceYd: 10, goalToGo: false,
    ballX: 40, ballY: 26.665, lineToGainX: 50, score: [0, 0], timeoutsLeft: [3, 3], insideTwoMinute: false, untimedDown: false,
    ...over,
  };
}

export interface CtxOptions {
  seed?: number;
  model?: 'challenge_plus_booth' | 'booth_all_plays';
  rules?: Record<string, Value>;
  params?: Record<string, number>;
  crew?: Partial<OfficialsCrew>;
  situation?: Partial<GameSituation>;
  before?: Partial<Pick<GameState, 'gameType' | 'challengesUsed' | 'challengesWon' | 'timeoutsLeft'>>;
}

export function params(overrides: Record<string, number> = {}): ParamTable {
  return paramTable([CREW_PARAMS, REPLAY_PARAMS], overrides);
}

/** Parameter overrides that switch every officiating error off (the WP-05 acceptance case). */
export const NO_ERRORS: Record<string, number> = {
  [CREW.errorAtBoundary]: 0, [CREW.spotSdOpenYd]: 0, [CREW.spotSdCrowdedYd]: 0, [CREW.spotSdPileYd]: 0,
  [CREW.phantomMaxChance]: 0, [CREW.erroneousWhistlePerGame]: 0,
};

export function ctx(o: CtxOptions = {}): RulingContext {
  const sit = situation(o.situation);
  // Only the fields officiating reads are filled; the rest of the game state is not this module's business.
  const before = { gameType: 'regular', challengesUsed: [0, 0], challengesWon: [0, 0], timeoutsLeft: sit.timeoutsLeft, ...o.before } as unknown as GameState;
  return {
    rules: fixtureRules(o.model, o.rules), params: params(o.params), geometry: GEOMETRY, before, situation: sit,
    crew: { ...neutralCrew(1), ...o.crew }, streams: streamSource(seedFromNumber(o.seed ?? 7)), math: DMATH,
  };
}

// ---- Truth builders. Field frame, offense is side 0 attacking east (+x) from its own 30 (x = 40). ----

const far = { marginYd: null, marginS: null, visibility: 'open' as const };
type Close = { marginYd?: number | null; marginS?: number | null; visibility?: 'open' | 'crowded' | 'pile' };
const judged = (c: Close = {}) => ({ marginYd: c.marginYd ?? null, marginS: c.marginS ?? null, visibility: c.visibility ?? 'open' as const });

export const ev = {
  snap: (): TruthEvent => ({ type: 'snap', t: 0, snapperId: 50, toPlayerId: 12, quality: 'clean' }),
  possession: (t: number, side: Side, playerId: number, x: number, how: Extract<TruthEvent, { type: 'possession' }>['how'], y = 26): TruthEvent =>
    ({ type: 'possession', t, side, playerId, spot: { x, y }, how }),
  release: (t: number, forward: boolean, c: Close = {}, landX = 55): TruthEvent => ({
    type: 'pass_release', t, ...judged(c), passerId: 12, targetId: 80, forward, releaseSpot: { x: 34, y: 26 }, aimSpot: { x: landX, y: 20 },
    landingSpot: { x: landX, y: 20 }, airYd: landX - 40, throwaway: false, spike: false, underPressure: false, passerOutsidePocket: false, ballBeyondLine: false,
  }),
  catchPoint: (t: number, outcome: Extract<TruthEvent, { type: 'catch_point' }>['outcome'], c: Close = {}, x = 55, catcherId: number | null = 80): TruthEvent => ({
    type: 'catch_point', t, ...judged(c), outcome, spot: { x, y: 20 }, intendedId: 80,
    catcherId: outcome === 'catch' || outcome === 'interception' ? catcherId : null, defenderIds: [24], feetInBounds: outcome === 'catch' ? 2 : 0, contested: true,
  }),
  tackle: (t: number, outcome: 'made' | 'broken' | 'missed', carrierId: number, x: number): TruthEvent =>
    ({ type: 'tackle_attempt', t, outcome, carrierId, tacklerIds: [55], spot: { x, y: 24 } }),
  fumble: (t: number, kind: Extract<TruthEvent, { type: 'fumble' }>['kind'], playerId: number, side: Side, x: number, c: Close = {}): TruthEvent =>
    ({ type: 'fumble', t, ...judged(c), kind, playerId, side, forcedById: null, spot: { x, y: 24 } }),
  boundary: (t: number, kind: Extract<TruthEvent, { type: 'boundary' }>['kind'], playerId: number | null, x: number, c: Close = {}, y = 24): TruthEvent =>
    ({ type: 'boundary', t, ...judged(c), kind, playerId, spot: { x, y } }),
  kick: (t: number, kickKind: Extract<TruthEvent, { type: 'kick' }>['kickKind'], landX: number): TruthEvent => ({
    type: 'kick', t, kickKind, kickerId: 4, kickSpot: { x: 33, y: 26 }, landingSpot: { x: landX, y: 26 }, hangTimeS: 4.2, crossedLine: true, blockedById: null,
  }),
  kickTouch: (t: number, kind: Extract<TruthEvent, { type: 'kick_touch' }>['kind'], playerId: number, side: Side, x: number, c: Close = {}): TruthEvent =>
    ({ type: 'kick_touch', t, ...judged(c), kind, playerId, side, spot: { x, y: 24 } }),
  foul: (t: number, foulId: string, side: Side, o: Partial<Extract<TruthEvent, { type: 'foul_committed' }>> = {}): TruthEvent => ({
    type: 'foul_committed', t, foulId, side, playerId: 70, spot: { x: 41, y: 26 }, timing: 'live', phase: 'pass_play', severity: 0.5,
    visibility: 'open', atPointOfAttack: true, flagrant: false, borderline: false, ordered: false, ...o,
  }),
  dead: (t: number, reason: Extract<TruthEvent, { type: 'dead_ball' }>['reason'], x: number, side: Side | null, carrierId: number | null, c: Close = {}, y = 24): TruthEvent =>
    ({ type: 'dead_ball', t, ...judged(c), reason, spot: { x, y }, side, carrierId }),
};

export function truthOf(events: TruthEvent[], over: Partial<PlayTruth> = {}): PlayTruth {
  const dead = events.find((e) => e.type === 'dead_ball');
  const t = PlayTruth.parse({
    resolverId: 'reference', resolverVersion: 'fixture', gameId: 1, playNumber: 1, originX: 40, originY: 26.665, attackDir: 1,
    liveDurationTenths: dead ? Math.max(0, Math.round(dead.t * 10)) : 0, endZoneImpetus: null, events, ...over,
  });
  const problems = playTruthProblems(t);
  if (problems.length) throw new Error(`fixture truth is not well formed: ${problems.join('; ')}`);
  return t;
}

/** What WP-04's `candidates` will hand over: one record per `foul_committed` event that is a real foul. */
export function candidatesOf(truth: PlayTruth, includeBorderline = false): FoulRecord[] {
  const out: FoulRecord[] = [];
  truth.events.forEach((e, i) => {
    if (e.type !== 'foul_committed' || (e.borderline && !includeBorderline)) return;
    out.push({
      foulId: e.foulId, side: e.side, playerId: e.playerId, spot: { ...e.spot }, t: e.t, timing: e.timing, phase: e.phase,
      yards: 10, afd: false, lod: false, spotFoul: false, runoffEligible: false, foulClass: e.foulId === 'fx_mask' || e.foulId === 'fx_head' ? 'personal' : 'other',
      dq: 'none', beforeChangeOfPossession: true, eventIndex: i, sameAct: null, called: false, correct: false, flagrant: e.flagrant,
    });
  });
  return out;
}

// ---- A set of plays that touches every kind of ruling. `c` sets how close the close call is. ----

export const plays = {
  /** Run, tackled at the 34 (x = 44). */
  run: (x = 44, c: Close = {}) => truthOf([ev.snap(), ev.possession(0.6, 0, 22, 38, 'exchange'), ev.tackle(3.1, 'made', 22, x), ev.dead(3.1, 'down_by_contact', x, 0, 22, c)]),
  /** Run with a broken tackle at x = 42 before the tackle at x = 47. */
  brokenTackle: () => truthOf([ev.snap(), ev.possession(0.6, 0, 22, 38, 'exchange'), ev.tackle(2.0, 'broken', 22, 42), ev.tackle(3.6, 'made', 22, 47), ev.dead(3.6, 'down_by_contact', 47, 0, 22)]),
  /** Catch at x = 55, run to x = 63. */
  catchAndRun: (c: Close = {}) => truthOf([
    ev.snap(), ev.release(2.4, true), ev.catchPoint(3.5, 'catch', c), ev.possession(3.5, 0, 80, 55, 'catch', 20),
    ev.tackle(5.0, 'made', 80, 63), ev.dead(5.0, 'down_by_contact', 63, 0, 80),
  ]),
  /** Pass dropped at x = 55. */
  drop: (c: Close = {}, release: Close = {}) => truthOf([ev.snap(), ev.release(2.4, true, release), ev.catchPoint(3.5, 'drop', c), ev.dead(3.5, 'incomplete_pass', 55, null, null, {}, 20)]),
  /** Interception at x = 55 by player 24, returned to x = 50. */
  interception: (c: Close = {}) => truthOf([
    ev.snap(), ev.release(2.4, true), ev.catchPoint(3.5, 'interception', c, 55, 24), ev.possession(3.5, 1, 24, 55, 'interception', 20),
    ev.tackle(4.4, 'made', 24, 50), ev.dead(4.4, 'down_by_contact', 50, 1, 24),
  ]),
  /** Catch at x = 55, fumble at once at x = 56, defender 31 picks it up at x = 57 after `gapS` and runs it back to x = 30. */
  catchFumble: (catchClose: Close = {}, gapS = 0.6) => truthOf([
    ev.snap(), ev.release(2.4, true), ev.catchPoint(3.5, 'catch', catchClose), ev.possession(3.5, 0, 80, 55, 'catch', 20),
    ev.fumble(3.9, 'fumble', 80, 0, 56), ev.possession(3.9 + gapS, 1, 31, 57, 'fumble_recovery'),
    ev.tackle(8.4, 'made', 31, 30), ev.dead(8.4, 'down_by_contact', 30, 1, 31),
  ]),
  /** Run to x = 46, fumble there, defender 55 recovers at x = 47 after `gapS` and is tackled at x = 45. */
  runFumble: (c: Close = {}, gapS = 0.8) => truthOf([
    ev.snap(), ev.possession(0.6, 0, 22, 38, 'exchange'), ev.fumble(3.0, 'fumble', 22, 0, 46, c),
    ev.possession(3.0 + gapS, 1, 55, 47, 'fumble_recovery'), ev.tackle(3.4 + gapS, 'made', 55, 45), ev.dead(3.4 + gapS, 'down_by_contact', 45, 1, 55),
  ]),
  /** Backward pass that hits the ground at x = 33; defender 91 scoops it at x = 32 and scores. */
  backwardLoose: (c: Close = {}) => truthOf([
    ev.snap(), ev.release(1.2, false, c, 33), ev.fumble(1.9, 'backward_pass_loose', 12, 0, 33), ev.possession(2.6, 1, 91, 32, 'fumble_recovery'),
    ev.boundary(5.0, 'ball_crosses_goal_line', 91, 10), ev.dead(5.0, 'ball_across_goal_line_in_possession', 10, 1, 91),
  ], { endZoneImpetus: 1 }),
  /** Run from the 4 (x = 106): the ball breaks the plane by `c.marginYd`. */
  goalLineScore: (c: Close = {}) => truthOf([
    ev.snap(), ev.possession(0.6, 0, 22, 104, 'exchange'), ev.boundary(2.2, 'ball_crosses_goal_line', 22, 110, c), ev.dead(2.2, 'ball_across_goal_line_in_possession', 110, 0, 22, c),
  ], { originX: 106, endZoneImpetus: 0 }),
  /** Run from the 4 (x = 106), down `short` yards from the goal line. */
  goalLineShort: (short = 0.2, visibility: 'open' | 'crowded' | 'pile' = 'open') => truthOf([
    ev.snap(), ev.possession(0.6, 0, 22, 104, 'exchange'), ev.tackle(2.2, 'made', 22, 110 - short), ev.dead(2.2, 'down_by_contact', 110 - short, 0, 22, { visibility }),
  ], { originX: 106 }),
  /** Field goal, good or no good, `c.marginYd` inside or outside the upright. */
  fieldGoal: (good: boolean, c: Close = {}) => truthOf([
    ev.snap(), ev.kick(1.3, 'field_goal', 119), ev.dead(3.4, good ? 'kick_through_uprights' : 'kick_failed', 120, null, null, c, 26),
  ], { originX: 85 }),
  /** Punt that glances off receiver 21 at x = 82 and is recovered by kicker-side player 47. */
  muffedPunt: (c: Close = {}) => truthOf([
    ev.snap(), ev.kick(2.0, 'punt', 82), ev.kickTouch(6.3, 'touched_by_receivers', 21, 1, 82, c), ev.fumble(6.3, 'muff', 21, 1, 82),
    ev.possession(7.0, 0, 47, 84, 'kick_recovery'), ev.dead(7.0, 'kick_recovered_by_kickers', 84, 0, 47),
  ]),
  /** A false start: the play never became live. */
  falseStart: () => truthOf([ev.foul(-0.4, 'fx_early', 0, { timing: 'before_snap', phase: 'running_play', atPointOfAttack: false }), ev.dead(-0.4, 'pre_snap_foul', 40, null, null, {}, 26.665)]),
  /** Run with a foul by the offense; `o` sets severity, sight line, borderline. */
  runWithFoul: (foulId: string, o: Partial<Extract<TruthEvent, { type: 'foul_committed' }>> = {}) => truthOf([
    ev.snap(), ev.possession(0.6, 0, 22, 38, 'exchange'), ev.foul(1.4, foulId, 0, { phase: 'running_play', ...o }), ev.tackle(3.1, 'made', 22, 44), ev.dead(3.1, 'down_by_contact', 44, 0, 22),
  ]),
};

export { far };

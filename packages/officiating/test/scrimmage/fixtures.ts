// Test fixtures for WP-02. FIXTURE VALUES, NOT FACTS: the rule sets below are built in the test and
// cite no fact row. They exist so the modules can be tested before WP-01 lands the real values; the
// real-value cases of Q1.1.1 run after integration. Set B deliberately uses odd point values and the
// other option of every switch, so a number or a level hidden in code would fail a test.
import type {
  ClockStatus, EnforcementSummary, FieldGeometry, GameSituation, GameState, PlayOutcome, PlayTruth, RuleSet, RulingContext, Side, TruthEvent,
} from '@gm/schema';

type Value = number | boolean | string;

const SET_A: Record<string, Value> = {
  'clock.periods': 4, 'clock.periods_per_half': 2, 'clock.period_length_s': 900, 'clock.period_break_s': 120, 'clock.halftime_min': 13,
  'clock.play_clock_s': 40, 'clock.play_clock_after_stoppage_s': 25, 'clock.play_clock_after_runoff_s': 30, 'clock.play_clock_floor_s': 10,
  'clock.two_minute_timeout': true, 'clock.two_minute_s': 120, 'clock.first_down_stop': 'never',
  'clock.out_of_bounds_restart': 'signal_before_2min_first_half_late_window_second_half', 'clock.late_window_second_half_s': 300,
  'clock.foul_restart_on_snap_late': true, 'clock.runoff_s': 10, 'clock.defense_half_end_window_s': 40, 'timeout.per_half': 3,
  'series.downs': 4, 'series.yards_to_gain': 10, 'field.hash_from_sideline_ft': 70.75, 'field.ball_length_yd': 0.31,
  'score.touchdown': 6, 'score.safety': 2, 'try.two_point_points': 2, 'try.safety_points': 1, 'try.defense_can_score': true,
  'fumble.advance_restriction': 'fourth_down_try_and_after_two_minute_warning',
  'touchback.yardline': 20, 'touchback.momentum_min_yardline': 1, 'deadball.loose_at_rest_yardline': 1,
};

const SET_B: Record<string, Value> = {
  ...SET_A,
  'clock.halftime_min': 20, 'clock.first_down_stop': 'after_two_minute_timeout', 'clock.out_of_bounds_restart': 'signal_before_2min_snap_after',
  'clock.foul_restart_on_snap_late': false, 'field.hash_from_sideline_ft': 60,
  'series.downs': 3, 'series.yards_to_gain': 12, 'score.touchdown': 7, 'score.safety': 3, 'try.two_point_points': 5, 'try.safety_points': 4,
  'fumble.advance_restriction': 'fourth_down_and_try', 'touchback.yardline': 25, 'touchback.momentum_min_yardline': 3, 'deadball.loose_at_rest_yardline': 2,
};

export function fixtureRules(id: 'fixture_a' | 'fixture_b', overrides: Record<string, Value> = {}): RuleSet {
  const values = { ...(id === 'fixture_a' ? SET_A : SET_B), ...overrides };
  const get = (key: string): Value => {
    const v = values[key];
    if (v === undefined) throw new Error(`fixture rule set ${id}: missing key ${key}`);
    return v;
  };
  return {
    id, level: 'pro', seasonYear: 2026,
    num: (k) => { const v = get(k); if (typeof v !== 'number') throw new Error(`${k} is not a number`); return v; },
    bool: (k) => { const v = get(k); if (typeof v !== 'boolean') throw new Error(`${k} is not a switch`); return v; },
    opt: (k) => { const v = get(k); if (typeof v !== 'string') throw new Error(`${k} is not an option`); return v; },
    keys: () => Object.keys(values),
  };
}
export const FIXTURE_KEYS: readonly string[] = Object.keys(SET_A);

/** A fixture field: goal lines at x = 10 and x = 110, hashes from the fixture key. Built here because WP-09 owns the real builder. */
export function fixtureGeometry(rules: RuleSet): FieldGeometry {
  const widthYd = 160 / 3;
  const hash = rules.num('field.hash_from_sideline_ft') / 3;
  return {
    lengthYd: 120, widthYd, goalLineWestX: 10, goalLineEastX: 110, hashSouthY: hash, hashNorthY: widthYd - hash, centreY: widthYd / 2,
    uprightSouthY: widthYd / 2 - 3.08, uprightNorthY: widthYd / 2 + 3.08, crossbarHeightYd: 10 / 3,
  };
}

export interface Setup {
  rules?: RuleSet;
  offense?: Side;
  /** +1 attacks east. Yard lines below are "own" yards for the offense. */
  attackDir?: 1 | -1;
  /** Ball on the offense's own yard line (50 is midfield, 93 is the opponent's 7). */
  ballOn?: number;
  ballY?: number;
  down?: number | null;
  /** Yards to go; null computes a fresh series from the fixture's yards to gain. */
  toGo?: number | null;
  period?: number;
  clockS?: number;
  clockStatus?: ClockStatus;
  playKind?: GameSituation['playKind'];
  insideTwoMinute?: boolean;
  untimedDown?: boolean;
  overtime?: boolean;
  score?: [number, number];
  timeoutsLeft?: [number, number];
  phase?: GameState['phase'];
}

/** Field x of the offense's own yard line `n`. */
export function xOn(n: number, dir: 1 | -1 = 1): number { return dir === 1 ? 10 + n : 110 - n; }

export function context(s: Setup = {}): RulingContext {
  const rules = s.rules ?? fixtureRules('fixture_a');
  const geometry = fixtureGeometry(rules);
  const offense = s.offense ?? 0;
  const dir = s.attackDir ?? 1;
  const ballX = xOn(s.ballOn ?? 25, dir);
  const ballY = s.ballY ?? geometry.centreY;
  const kind = s.playKind ?? 'scrimmage';
  const scrimmage = kind === 'scrimmage';
  const goalX = dir === 1 ? 110 : 10;
  const toGoal = (goalX - ballX) * dir;
  const toGo = s.toGo ?? Math.min(rules.num('series.yards_to_gain'), toGoal);
  const lineToGainX = scrimmage ? ballX + dir * toGo : null;
  const clockTenths = Math.round((s.clockS ?? 600) * 10);
  const clockStatus = s.clockStatus ?? 'running';
  const score = s.score ?? [0, 0];
  const timeoutsLeft = s.timeoutsLeft ?? [3, 3];
  const situation: GameSituation = {
    gameId: 1, playNumber: 1, driveNumber: 1, playKind: kind, period: s.period ?? 1, overtime: s.overtime ?? false, clockTenths, clockStatus,
    playClockAtSnapTenths: 50, offense, attackDir: dir, down: scrimmage ? s.down ?? 1 : null, distanceYd: scrimmage ? toGo : null,
    goalToGo: scrimmage && lineToGainX === goalX, ballX, ballY, lineToGainX, score, timeoutsLeft,
    insideTwoMinute: s.insideTwoMinute ?? false, untimedDown: s.untimedDown ?? false,
  };
  // Only the fields the modules read are meaningful; the rest of the state is filled so the shape is whole.
  const before = {
    gameId: 1, ruleSetId: rules.id, gameType: 'regular', teamIds: [1, 2], seedHex: '0000000000000001', crew: null, environment: null,
    phase: s.phase ?? 'pre_snap', period: situation.period, overtime: null, clockTenths, clockStatus, playClockTenths: 50, playClockRunning: true,
    elapsedTenths: 0, score, scoreByPeriod: [], possession: offense, attackDir: offense === 0 ? [dir, -dir] : [-dir, dir], nextPlayKind: kind,
    ballX, ballY, down: situation.down, lineToGainX, seriesStartX: ballX, timeoutsLeft, challengesUsed: [0, 0], challengesWon: [0, 0],
    insideTwoMinute: situation.insideTwoMinute, untimedDownOwed: situation.untimedDown, pendingRunoff: null, toss: null, carriedPenalty: null,
    pendingDecisions: [], nextRequestId: 1, playCounter: 0, drive: null, driveCounter: 0, gameDay: [{}, {}],
  } as unknown as GameState;
  const none = (): never => { throw new Error('the WP-02 modules draw no random number and use no transcendental math'); };
  return {
    rules, params: { version: 'fixture', num: none, has: () => false }, geometry, before, situation,
    crew: null as unknown as RulingContext['crew'], streams: { stream: none } as unknown as RulingContext['streams'], math: {} as RulingContext['math'],
  };
}

const J = { marginYd: null, marginS: null, visibility: 'open' as const };
const QB = 12; const RB = 22; const WR = 80; const LB = 54; const CB = 24;
export const IDS = { QB, RB, WR, LB, CB };
const at = (x: number, y = 26.67) => ({ x, y });

/** Short builders for truth events. Times are given by the caller in order. */
export const ev = {
  snap: (): TruthEvent => ({ type: 'snap', t: 0, snapperId: 60, toPlayerId: QB, quality: 'clean' }),
  poss: (t: number, side: Side, playerId: number, x: number, how: Extract<TruthEvent, { type: 'possession' }>['how'], y = 26.67): TruthEvent =>
    ({ type: 'possession', t, side, playerId, spot: at(x, y), how }),
  pass: (t: number, x: number, forward: boolean, extra: Partial<Extract<TruthEvent, { type: 'pass_release' }>> = {}): TruthEvent => ({
    type: 'pass_release', t, ...J, passerId: QB, targetId: WR, forward, releaseSpot: at(x), aimSpot: at(x), landingSpot: at(x), airYd: 0,
    throwaway: false, spike: false, underPressure: false, passerOutsidePocket: false, ballBeyondLine: false, ...extra,
  }),
  catchPoint: (t: number, x: number, outcome: Extract<TruthEvent, { type: 'catch_point' }>['outcome']): TruthEvent => ({
    type: 'catch_point', t, ...J, outcome, spot: at(x), intendedId: WR, catcherId: outcome === 'interception' ? CB : WR, defenderIds: [CB], feetInBounds: 2, contested: false,
  }),
  fumble: (t: number, side: Side, playerId: number, x: number, kind: Extract<TruthEvent, { type: 'fumble' }>['kind'] = 'fumble', y = 26.67): TruthEvent =>
    ({ type: 'fumble', t, ...J, kind, playerId, side, forcedById: null, spot: at(x, y) }),
  sack: (t: number, x: number): TruthEvent => ({ type: 'pressure', t, kind: 'sack', rusherId: LB, passerId: QB, spot: at(x) }),
  injury: (t: number, playerId: number, finishesPlay: boolean): TruthEvent =>
    ({ type: 'injury', t, playerId, mechanism: 'contact', region: 'knee', severitySeed: 0.5, finishesPlay, headImpact: false }),
  kick: (t: number, x: number): TruthEvent =>
    ({ type: 'kick', t, kickKind: 'punt', kickerId: 4, kickSpot: at(x), landingSpot: at(x + 40), hangTimeS: 4, crossedLine: true, blockedById: null }),
  dead: (t: number, reason: Extract<TruthEvent, { type: 'dead_ball' }>['reason'], x: number, side: Side | null, carrierId: number | null = null, y = 26.67): TruthEvent =>
    ({ type: 'dead_ball', t, ...J, reason, spot: at(x, y), side, carrierId }),
};

export function truthOf(ctx: RulingContext, events: TruthEvent[], endZoneImpetus: Side | null = null): PlayTruth {
  const last = events[events.length - 1]!;
  return {
    resolverId: 'reference', resolverVersion: 'fixture', gameId: 1, playNumber: 1, originX: ctx.situation.ballX, originY: ctx.situation.ballY,
    attackDir: ctx.situation.attackDir, liveDurationTenths: Math.round(last.t * 10), endZoneImpetus, events,
  };
}

/** A hand-built outcome for clock and series tests: a runner down in bounds at the offense's own yard line `on`. */
export function outcomeAt(ctx: RulingContext, on: number, over: Partial<PlayOutcome> = {}): PlayOutcome {
  const sit = ctx.situation;
  const spotX = xOn(on, sit.attackDir);
  return {
    resultType: 'run', noPlay: false, snappingSide: sit.offense, possessionAfter: sit.offense, changeOfPossession: false, spotX, spotY: sit.ballY,
    previousSpotX: sit.ballX, score: null, touchback: false, endedOutOfBounds: false, incomplete: false, runnerDownInBounds: true,
    yardsGained: (spotX - sit.ballX) * sit.attackDir, injuryStoppage: [], enforcement: null, ...over,
  };
}

export function enforcement(over: Partial<EnforcementSummary> = {}): EnforcementSummary {
  return {
    enforced: [0], declined: [], offsetting: false, yardsWalked: 0, fromSpot: null, halfDistanceApplied: false, automaticFirstDown: false,
    lossOfDown: false, replayDown: false, carriedTo: null, runoffTaken: false, disqualified: [], ...over,
  };
}

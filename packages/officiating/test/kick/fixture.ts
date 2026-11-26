// FIXTURE for the WP-03 tests (plans/engine-build-plan.md, "Rule keys"). These rule sets are built in
// the test and are NOT the shipped rule data: WP-01 owns the real values and their fact rows. Each
// value below is copied from the bible leaf named beside it so the acceptance cases of B6, B10 and
// B13 can run before WP-01 lands. A value marked "inert" has no meaning at that level and only
// switches a behaviour off. A value marked "fixture only" has no bible source yet.
import {
  NEUTRAL_ENVIRONMENT,
  type AttackDir, type FieldGeometry, type GameSituation, type GameState, type OvertimeState, type ParamTable,
  type PlayKind, type PlayTruth, type RuleSet, type RulingContext, type Side, type TruthEvent,
} from '@gm/schema';

type Value = number | boolean | string;

export function fixtureRuleSet(id: string, level: 'pro' | 'college', values: Record<string, Value>): RuleSet {
  const get = (key: string): Value => {
    if (!(key in values)) throw new Error(`fixture rule set ${id}: missing key ${key}`);
    return values[key]!;
  };
  return {
    id, level, seasonYear: 2026,
    num(key) { const v = get(key); if (typeof v !== 'number') throw new Error(`${key} is not a number`); return v; },
    bool(key) { const v = get(key); if (typeof v !== 'boolean') throw new Error(`${key} is not a switch`); return v; },
    opt(key) { const v = get(key); if (typeof v !== 'string') throw new Error(`${key} is not an option`); return v; },
    keys() { return Object.keys(values).sort(); },
  };
}

/** Pro values, by leaf. */
export const PRO_VALUES: Record<string, Value> = {
  // B6.1.1, B6.1.2
  'kickoff.format': 'dynamic',
  'kickoff.kick_yardline': 35,
  'kickoff.safety_kick_yardline': 20,
  'kickoff.kicking_team_line_yardline': 40,
  'kickoff.receiving_line_yardline': 35,
  'kickoff.setup_zone_back_yardline': 30,
  'kickoff.landing_zone_yardline': 20,
  // B6.1.4
  'kickoff.touchback_yardline': 35,
  'kickoff.touchback_landing_zone_yardline': 20,
  'kickoff.touchback_reduced_kick_yardline': 50,
  'kickoff.touchback_reduced_yardline': 20,
  'kickoff.short_spot_yd_from_kick': 25,
  'kickoff.safety_kick_short_spot_yd_from_kick': 30,
  'kickoff.out_of_bounds_yd_from_kick': 25,
  'kickoff.safety_kick_out_of_bounds_yd_from_kick': 30,
  'kickoff.fair_catch_inside_25_to_25': false, // B13.1.1
  // B6.2.1
  'onside.min_distance_yd': 10,
  'onside.setup_zone_depth_yd': 15,
  'onside.untouched_dead_beyond_yd': 25,
  'onside.untouched_beyond_penalty_yd': 15,
  // B6.3.3
  'touchback.yardline': 20,
  'punt.first_touch_min_yardline': 1,
  // B6.5.2, B13.6.2
  'fg.miss_spot': 'kick_spot_min_20',
  'fg.miss_spot_min_yardline': 20,
  'fg.fair_catch_kick': true, // B6.4.3
  // B7.1.1, B7.3.1, B7.3.2
  'score.touchdown': 6, 'score.field_goal': 3, 'score.safety': 2,
  'try.kick_points': 1, 'try.two_point_points': 2, 'try.defense_return_points': 2, 'try.safety_points': 1,
  'try.kick_snap_yardline': 15, 'try.two_point_snap_yardline': 2,
  // B1.3.1
  'clock.play_clock_s': 40, 'clock.play_clock_after_stoppage_s': 25,
  // B1.1.2, B10.1.1
  'toss.defer_allowed': true,
  'overtime.toss_defer_allowed': true,
  // B8.5.3
  'enforce.half_distance_divisor': 2,
  // B10.2.1, B10.3.1, B10.5.1
  'overtime.format': 'timed_period',
  'overtime.regular.period_length_s': 600, 'overtime.postseason.period_length_s': 900,
  'overtime.regular.max_periods': 1, 'overtime.postseason.max_periods': 0,
  'overtime.regular.timeouts': 2, 'overtime.postseason.timeouts': 3,
  'overtime.regular.periods_per_half': 1, 'overtime.postseason.periods_per_half': 2,
  'overtime.regular.new_toss_after_periods': 0, 'overtime.postseason.new_toss_after_periods': 4,
  'overtime.regular.loser_chooses_at_period': 0, 'overtime.postseason.loser_chooses_at_period': 3,
  'overtime.intermission_s': 180,
  'overtime.period_break_s': 120,
  'overtime.two_minute_warning': true, // B10.2.1 item 7 (Rulebook only, inferred)
  // inert at this level (B13.7.1)
  'overtime.series_start_yardline': 25,
  'overtime.two_point_required_from_period': 0,
  'overtime.try_only_from_period': 0,
};

/** College values, by leaf. */
export const COLLEGE_VALUES: Record<string, Value> = {
  // B13.6.1
  'kickoff.format': 'traditional',
  'kickoff.kick_yardline': 35,
  'kickoff.safety_kick_yardline': 20,
  'kickoff.kicking_team_line_yardline': 0, // inert: the kicking team lines up on its own restraining line
  'kickoff.receiving_line_yardline': 0, // inert: the receiving line is onside.min_distance_yd from the kick
  'kickoff.setup_zone_back_yardline': 0, // inert
  'kickoff.landing_zone_yardline': 0, // inert
  'kickoff.touchback_yardline': 25,
  'kickoff.touchback_landing_zone_yardline': 25, // inert: equal to the touchback yard line
  'kickoff.touchback_reduced_kick_yardline': 50, // inert
  'kickoff.touchback_reduced_yardline': 25, // inert: equal to the touchback yard line
  'kickoff.short_spot_yd_from_kick': 0, // inert
  'kickoff.safety_kick_short_spot_yd_from_kick': 0, // inert
  'kickoff.out_of_bounds_yd_from_kick': 30, // B13.13.1: 30 yards beyond the kicking team's restraining line
  'kickoff.safety_kick_out_of_bounds_yd_from_kick': 30, // fixture only: same rule assumed for a safety kick
  'kickoff.fair_catch_inside_25_to_25': true,
  'onside.min_distance_yd': 10, // B13.6.1 edge case
  'onside.setup_zone_depth_yd': 0, // inert
  'onside.untouched_dead_beyond_yd': 0, // inert: 0 switches the rule off
  'onside.untouched_beyond_penalty_yd': 0, // inert
  'touchback.yardline': 20, // B13.6.1: punt and other touchbacks at the 20
  'punt.first_touch_min_yardline': 1, // fixture only: no college leaf states it
  // B13.6.2
  'fg.miss_spot': 'previous_spot_min_20',
  'fg.miss_spot_min_yardline': 20,
  'fg.fair_catch_kick': true,
  // B7.1.1, B13.6.3
  'score.touchdown': 6, 'score.field_goal': 3, 'score.safety': 2,
  'try.kick_points': 1, 'try.two_point_points': 2, 'try.defense_return_points': 2, 'try.safety_points': 1,
  'try.kick_snap_yardline': 3, 'try.two_point_snap_yardline': 3,
  'clock.play_clock_s': 40, 'clock.play_clock_after_stoppage_s': 25,
  'toss.defer_allowed': true, // fixture only: B13 does not state the opening toss
  'overtime.toss_defer_allowed': false, // B13.7.1: he cannot defer
  'enforce.half_distance_divisor': 2,
  // B13.7.1
  'overtime.format': 'alternating_series_25',
  'overtime.series_start_yardline': 25,
  'overtime.two_point_required_from_period': 2,
  'overtime.try_only_from_period': 3,
  'overtime.regular.timeouts': 1, 'overtime.postseason.timeouts': 1,
  'overtime.regular.periods_per_half': 1, 'overtime.postseason.periods_per_half': 1,
  // inert at this level (B10)
  'overtime.regular.period_length_s': 0, 'overtime.postseason.period_length_s': 0,
  'overtime.regular.max_periods': 0, 'overtime.postseason.max_periods': 0,
  'overtime.regular.new_toss_after_periods': 0, 'overtime.postseason.new_toss_after_periods': 0,
  'overtime.regular.loser_chooses_at_period': 0, 'overtime.postseason.loser_chooses_at_period': 0,
  'overtime.intermission_s': 0, // fixture only
  'overtime.period_break_s': 0, // fixture only
  'overtime.two_minute_warning': false,
};

export const PRO = fixtureRuleSet('fixture_pro', 'pro', PRO_VALUES);
export const COLLEGE = fixtureRuleSet('fixture_college', 'college', COLLEGE_VALUES);
export const BOTH = [['pro fixture', PRO], ['college fixture', COLLEGE]] as const;

/** Goal lines at x = 10 and x = 110 (J1.1.1). Hash positions do not matter to these tests beyond being inside the field. */
export const GEOMETRY: FieldGeometry = {
  lengthYd: 120, widthYd: 160 / 3, goalLineWestX: 10, goalLineEastX: 110,
  hashSouthY: 23.58, hashNorthY: 160 / 3 - 23.58, centreY: 80 / 3,
  uprightSouthY: 80 / 3 - 3.08, uprightNorthY: 80 / 3 + 3.08, crossbarHeightYd: 10 / 3,
};
export const CENTRE_Y = GEOMETRY.centreY;

const PARAMS: ParamTable = { version: 'fixture', num(name) { throw new Error(`no parameter ${name}`); }, has() { return false; } };

/** Field x of a yard line of the team that attacks east (its own goal line is the west one). */
export const own = (yd: number): number => 10 + yd;
/** Field x of a yard line of the team that defends the east goal line. */
export const opp = (yd: number): number => 110 - yd;

export function makeState(over: Partial<GameState> = {}): GameState {
  return {
    gameId: 1, ruleSetId: 'fixture', gameType: 'regular', teamIds: [1, 2], seedHex: '0000000000000001',
    crew: { crewId: 1, positions: ['referee'], crewFactor: {}, accuracy: 1, pace: 1 },
    environment: NEUTRAL_ENVIRONMENT,
    phase: 'ruling', period: 1, overtime: null, clockTenths: 9000, clockStatus: 'stopped_start_on_snap',
    playClockTenths: 400, playClockRunning: false, elapsedTenths: 0,
    score: [0, 0], scoreByPeriod: [[0, 0]], possession: 0, attackDir: [1, -1], nextPlayKind: 'scrimmage',
    ballX: own(25), ballY: CENTRE_Y, down: 1, lineToGainX: own(35), seriesStartX: own(25),
    timeoutsLeft: [3, 3], challengesUsed: [0, 0], challengesWon: [0, 0], insideTwoMinute: false, untimedDownOwed: false,
    pendingRunoff: null, toss: null, carriedPenalty: null, pendingDecisions: [], nextRequestId: 1, playCounter: 0,
    drive: null, driveCounter: 0, gameDay: [{}, {}],
    ...over,
  };
}

export interface CtxOptions {
  rules: RuleSet;
  /** Team that snaps or kicks. Default 0, attacking east. */
  offense?: Side;
  attackDir?: AttackDir;
  playKind?: PlayKind;
  ballX?: number;
  ballY?: number;
  state?: Partial<GameState>;
  overtime?: OvertimeState | null;
}

export function makeCtx(o: CtxOptions): RulingContext {
  const offense = o.offense ?? 0;
  const attackDir = o.attackDir ?? (offense === 0 ? 1 : -1);
  const dirs: [AttackDir, AttackDir] = offense === 0 ? [attackDir, attackDir === 1 ? -1 : 1] : [attackDir === 1 ? -1 : 1, attackDir];
  const before = makeState({ possession: offense, attackDir: dirs, ballX: o.ballX ?? own(35), ballY: o.ballY ?? CENTRE_Y,
    nextPlayKind: o.playKind ?? 'kickoff', overtime: o.overtime ?? null, ...o.state });
  const situation: GameSituation = {
    gameId: 1, playNumber: 1, driveNumber: 0, playKind: before.nextPlayKind, period: before.period, overtime: before.overtime !== null,
    clockTenths: before.clockTenths, clockStatus: before.clockStatus, playClockAtSnapTenths: 50, offense, attackDir,
    down: null, distanceYd: null, goalToGo: false, ballX: before.ballX, ballY: before.ballY, lineToGainX: null,
    score: before.score, timeoutsLeft: before.timeoutsLeft, insideTwoMinute: false, untimedDown: false,
  };
  return {
    rules: o.rules, params: PARAMS, geometry: GEOMETRY, before, situation, crew: before.crew,
    streams: () => { throw new Error('the kick, restart and overtime rules draw no random number'); },
    math: new Proxy({}, { get() { throw new Error('the kick, restart and overtime rules use no transcendental math'); } }) as RulingContext['math'],
  };
}

// ---- truth record builders -------------------------------------------------------------------

const J = { marginYd: null, marginS: null, visibility: 'open' as const };
type KickKindName = Extract<TruthEvent, { type: 'kick' }>['kickKind'];
type Reason = Extract<TruthEvent, { type: 'dead_ball' }>['reason'];
type How = Extract<TruthEvent, { type: 'possession' }>['how'];

/** Player ids: 1 to 11 the kicking team, 21 to 31 the receivers. */
export const KICKER = 1, GUNNER = 2, RETURNER = 21, UPBACK = 22;

export const ev = {
  snap: (t = 0): TruthEvent => ({ type: 'snap', t, snapperId: 5, toPlayerId: KICKER, quality: 'clean' }),
  kick: (kickKind: KickKindName, x: number, landX: number, o: { t?: number; crossed?: boolean; blockedBy?: number; y?: number } = {}): TruthEvent => ({
    type: 'kick', t: o.t ?? 0, kickKind, kickerId: KICKER, kickSpot: { x, y: o.y ?? CENTRE_Y }, landingSpot: { x: landX, y: CENTRE_Y },
    hangTimeS: 4, crossedLine: o.crossed ?? true, blockedById: o.blockedBy ?? null }),
  landed: (t: number, x: number, y = CENTRE_Y): TruthEvent => ({ type: 'kick_touch', t, ...J, kind: 'landed', playerId: null, side: null, spot: { x, y } }),
  touchK: (t: number, x: number, side: Side = 0, y = CENTRE_Y): TruthEvent => ({ type: 'kick_touch', t, ...J, kind: 'touched_by_kickers', playerId: GUNNER, side, spot: { x, y } }),
  touchR: (t: number, x: number, side: Side = 1, y = CENTRE_Y): TruthEvent => ({ type: 'kick_touch', t, ...J, kind: 'touched_by_receivers', playerId: RETURNER, side, spot: { x, y } }),
  signal: (t: number, x: number, valid = true, playerId = RETURNER): TruthEvent => ({ type: 'kick_touch', t, ...J, kind: valid ? 'fair_catch_signal' : 'invalid_signal', playerId, side: 1, spot: { x, y: CENTRE_Y } }),
  poss: (t: number, side: Side, x: number, how: How, playerId?: number, y = CENTRE_Y): TruthEvent => ({ type: 'possession', t, side, playerId: playerId ?? (side === 0 ? GUNNER : RETURNER), spot: { x, y }, how }),
  fumble: (t: number, side: Side, x: number, kind: 'fumble' | 'muff' = 'fumble'): TruthEvent => ({ type: 'fumble', t, ...J, kind, playerId: side === 0 ? GUNNER : RETURNER, side, forcedById: null, spot: { x, y: CENTRE_Y } }),
  dead: (t: number, reason: Reason, x: number, side: Side | null, o: { y?: number; carrierId?: number | null } = {}): TruthEvent => ({
    type: 'dead_ball', t, ...J, reason, spot: { x, y: o.y ?? CENTRE_Y }, side,
    carrierId: o.carrierId === undefined ? (side === null ? null : side === 0 ? GUNNER : RETURNER) : o.carrierId }),
};

export function truthOf(events: TruthEvent[], o: { attackDir?: AttackDir; originX?: number; impetus?: Side | null } = {}): PlayTruth {
  const last = events[events.length - 1]!;
  return { resolverId: 'reference', resolverVersion: 'fixture', gameId: 1, playNumber: 1, originX: o.originX ?? own(35), originY: CENTRE_Y,
    attackDir: o.attackDir ?? 1, liveDurationTenths: Math.round(last.t * 10), endZoneImpetus: o.impetus ?? null, events };
}

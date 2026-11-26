// TEST FIXTURE, NOT RULE DATA. A rule set built in the test so the foul module can be tested before
// WP-01 lands (plans/engine-build-plan.md section 2, "Rule keys"). The values are copied from the
// bible tables named on each line (B8.1.2 for the pro set, B13.5 and B13.8 for the college overrides)
// and carry the status printed there. The shipped values and their fact rows are WP-01's.
import {
  FOUL_FIELDS, foulKey, otherSide,
  type AttackDir, type FieldGeometry, type FoulRecord, type GameSituation, type GameState, type PlayOutcome,
  type PlayResultType, type RuleSet, type RulingContext, type ScoreEvent, type Side,
} from '@gm/schema';
import { FOUL_IDS, RULE_KEYS, catalogue } from '../../src/fouls/index.ts';

type V = number | boolean | string;

/** [yards, flags]. Flags: A automatic first down, L loss of down, S spot foul, D always dead ball, R runoff, p/u class, f/a disqualification. */
const PRO: Record<string, [number, string]> = {
  false_start: [5, 'R'], encroachment: [5, ''], neutral_zone_infraction: [5, ''], offside: [5, ''], illegal_shift: [5, ''],
  illegal_motion: [5, ''], illegal_formation: [5, ''], illegal_snap: [5, ''], snap_to_ineligible: [5, ''], delay_of_game: [5, ''],
  delay_of_game_spike: [5, 'D'], excess_timeout: [5, ''], illegal_substitution: [5, 'R'], too_many_men: [5, ''], too_many_men_formation: [5, ''],
  illegal_forward_pass_beyond_line: [5, 'LSR'], second_forward_pass: [5, 'LR'], forward_pass_after_change: [5, 'S'],
  illegal_touching_ineligible: [5, ''], illegal_touching_after_oob: [0, 'L'], grounding: [10, 'LR'], ineligible_downfield: [5, ''],
  illegal_contact: [5, 'A'], illegal_cut_block: [15, 'A'], def_holding: [5, 'A'], dpi: [0, 'AS'], opi: [10, ''],
  backward_pass_oob: [5, 'LR'], illegal_handoff_forward: [5, 'L'],
  holding_offense: [10, ''], illegal_hands_offense: [10, ''], block_in_back: [10, ''], assist_runner: [10, ''],
  illegal_hands_defense: [5, 'A'], clipping: [15, 'Ap'], peel_back: [15, 'p'], low_block: [15, 'Ap'], chop_block: [15, 'p'],
  crackback: [15, 'p'], blindside_block: [15, 'Ap'],
  unnecessary_roughness: [15, 'Apf'], defenseless_player: [15, 'Apf'], helmet_use: [15, 'Apf'], roughing_passer: [15, 'Apf'],
  roughing_kicker: [15, 'Apf'], running_into_kicker: [5, ''], roughing_holder: [15, 'Apf'], striking: [15, 'Apf'],
  face_mask: [15, 'Apf'], horse_collar: [15, 'Ap'], helmet_weapon: [15, 'Apa'], hip_drop: [15, 'Ap'], targeting: [15, 'Apa'],
  unsportsmanlike: [15, 'Auf'], taunting: [15, 'ADuf'], kick_block_leverage: [15, 'Au'], kick_block_leaping: [15, 'Au'],
  clock_manipulation: [15, 'u'], palpably_unfair: [15, 'uf'], league_dq: [15, 'pa'], illegal_bat: [10, 'LR'], illegal_kick: [10, 'LR'],
  non_player_unsportsmanlike: [15, 'Auf'], foul_against_official: [15, 'Aua'], challenge_without_timeout: [15, 'u'], excess_injury_timeout: [5, ''],
  free_kick_offside: [5, ''], free_kick_illegal_formation: [5, ''], free_kick_early_movement: [5, ''], illegal_free_kick: [5, ''],
  free_kick_illegal_block: [10, ''], wedge: [15, 'Sp'], illegal_double_team: [15, 'Sp'], onside_untouched_past_zone: [15, 'u'],
  free_kick_illegal_touching: [5, ''], free_kick_voluntary_oob: [5, ''], running_into_free_kicker: [5, ''],
  illegal_scrimmage_kick: [5, 'L'], ineligible_downfield_kick: [5, ''], kick_voluntary_oob: [5, ''], def_illegal_formation_kick: [5, ''],
  pushing_teammates_formation: [15, 'Ap'], pull_and_shoot_holding: [5, 'A'], kick_holding: [10, ''], kick_illegal_touching_after_oob: [5, ''],
  kick_catch_interference: [15, 'Sp'], fair_catch_interference: [15, 'Sp'], invalid_fair_catch_signal: [5, 'S'],
  muff_opportunity_interference: [0, 'S'], block_after_fair_catch_signal: [15, 'Sp'], contact_with_fair_catcher: [15, 'pf'],
};

const GLOBAL_PRO: Record<string, V> = {
  'series.downs': 4, 'series.yards_to_gain': 10, 'score.safety': 2, 'try.safety_points': 1, 'clock.periods_per_half': 2,
  'enforce.half_distance.applies': true, 'enforce.half_distance.fraction': 0.5,
  'enforce.five_fifteen.applies': true, 'enforce.five_fifteen.minor_yards': 5, 'enforce.five_fifteen.major_yards': 15,
  'enforce.interference.capped': false, 'enforce.interference.max_yards': 0, 'enforce.interference.floor_yardline': 1,
  'enforce.interference.floor_rule': 'end_zone_only', 'enforce.interference.half_inside_yardline': 2, 'enforce.interference.half_inclusive': false,
  'enforce.end_zone_foul_yardline': 20, 'enforce.double_foul_safety_yardline': 1, 'enforce.clean_hands.personal_offsets': true,
  'enforce.spike_delay_foul': 'delay_of_game_spike', 'enforce.defensive_foul_extends_period': true, 'enforce.touchdown_foul_to_kickoff': true,
};

function build(level: 'pro' | 'college'): Map<string, V> {
  const m = new Map<string, V>(Object.entries(GLOBAL_PRO));
  for (const f of FOUL_IDS) {
    const row = PRO[f.id];
    if (!row) throw new Error(`fixture has no row for ${f.id}`);
    const [yards, flags] = row;
    const v: Record<(typeof FOUL_FIELDS)[number], V> = {
      exists: f.id !== 'targeting', yards, afd: flags.includes('A'), lod: flags.includes('L'), spot_foul: flags.includes('S'),
      dead_ball: flags.includes('D'), runoff_eligible: flags.includes('R'),
      class: flags.includes('p') ? 'personal' : flags.includes('u') ? 'unsportsmanlike' : 'other',
      dq: flags.includes('a') ? 'automatic' : flags.includes('f') ? 'if_flagrant' : 'none',
    };
    for (const field of FOUL_FIELDS) m.set(foulKey(f.id, field), v[field]);
    for (const e of f.ext ?? []) m.set(`foul.${f.id}.${e}`, e === 'enforcement' ? 'standard' : true);
  }
  m.set('foul.dpi.enforcement', 'interference_spot');
  m.set('foul.grounding.enforcement', 'previous_or_spot_worse');
  m.set('foul.palpably_unfair.enforcement', 'equitable');
  if (level === 'college') {
    // B13.5.1: 15-yard limit, the 2-yard line, half the distance from on or inside the 2.
    m.set('enforce.interference.capped', true); m.set('enforce.interference.max_yards', 15);
    m.set('enforce.interference.floor_yardline', 2); m.set('enforce.interference.floor_rule', 'inside_floor');
    m.set('enforce.interference.half_inclusive', true);
    // B13.5.2: holding 10 yards, no illegal contact foul. B13.5.4: grounding at the spot. B13.8.1: targeting.
    m.set('foul.def_holding.yards', 10); m.set('foul.illegal_contact.exists', false);
    m.set('foul.grounding.yards', 0); m.set('foul.grounding.spot_foul', true); m.set('foul.grounding.enforcement', 'standard');
    m.set('foul.targeting.exists', true);
  }
  return m;
}

export function fixtureRules(level: 'pro' | 'college'): RuleSet {
  const m = build(level);
  const get = (key: string): V => { const v = m.get(key); if (v === undefined) throw new Error(`fixture: missing key ${key}`); return v; };
  return {
    id: `fixture_${level}`, level, seasonYear: 2026,
    num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string, keys: () => [...m.keys()],
  };
}

/** Keys the fixture holds that the manifest does not name, and the reverse. Both must be empty. */
export function fixtureKeyProblems(level: 'pro' | 'college'): string[] {
  const have = new Set(build(level).keys());
  const want = new Set(RULE_KEYS.map((k) => k.key));
  return [...[...want].filter((k) => !have.has(k)).map((k) => `missing ${k}`), ...[...have].filter((k) => !want.has(k)).map((k) => `extra ${k}`)];
}

export const GEOMETRY: FieldGeometry = {
  lengthYd: 120, widthYd: 53.33, goalLineWestX: 10, goalLineEastX: 110, hashSouthY: 23.58, hashNorthY: 29.75, centreY: 26.67,
  uprightSouthY: 23.58, uprightNorthY: 29.75, crossbarHeightYd: 3.33,
};

export interface Setup {
  level?: 'pro' | 'college'; dir?: AttackDir; offense?: Side;
  /** Yards from Team A's goal line. */
  ball: number; down?: number | null; toGo?: number | null; playKind?: GameSituation['playKind'];
  insideTwoMinute?: boolean; clockRunning?: boolean; period?: number; clockTenths?: number; untimedDown?: boolean;
}

export interface Bench { ctx: RulingContext; x: (yardsFromA: number) => number; yardA: (fieldX: number) => number; A: Side; B: Side }

export function bench(s: Setup): Bench {
  const dir = s.dir ?? 1;
  const A = s.offense ?? 0;
  const x = (p: number) => (dir === 1 ? GEOMETRY.goalLineWestX + p : GEOMETRY.goalLineEastX - p);
  const yardA = (fx: number) => (dir === 1 ? fx - GEOMETRY.goalLineWestX : GEOMETRY.goalLineEastX - fx);
  const playKind = s.playKind ?? 'scrimmage';
  const scrimmage = playKind === 'scrimmage';
  const down = scrimmage ? (s.down ?? 1) : null;
  const toGo = scrimmage ? (s.toGo ?? 10) : null;
  const situation: GameSituation = {
    gameId: 1, playNumber: 1, driveNumber: 1, playKind, period: s.period ?? 1, overtime: false,
    clockTenths: s.clockTenths ?? 6000, clockStatus: s.clockRunning ? 'running' : 'stopped_start_on_snap', playClockAtSnapTenths: 50,
    offense: A, attackDir: dir, down, distanceYd: toGo, goalToGo: toGo !== null && s.ball + toGo >= 100,
    ballX: x(s.ball), ballY: GEOMETRY.centreY, lineToGainX: toGo === null ? null : x(Math.min(s.ball + toGo, 100)),
    score: [0, 0], timeoutsLeft: [3, 3], insideTwoMinute: s.insideTwoMinute ?? false, untimedDown: s.untimedDown ?? false,
  };
  const rules = fixtureRules(s.level ?? 'pro');
  const params = { version: 'fixture', num: (n: string): number => { throw new Error(`no parameter ${n}`); }, has: () => false };
  // The foul module reads only the rule set, the geometry and the situation.
  const ctx = { rules, params, geometry: GEOMETRY, situation, before: {} as GameState } as unknown as RulingContext;
  return { ctx, x, yardA, A, B: otherSide(A) };
}

export interface PlaySpec {
  result?: PlayResultType; end: number; to?: 'A' | 'B'; score?: ScoreEvent['type'] | null; scoreBy?: 'A' | 'B';
  touchback?: boolean; incomplete?: boolean; noPlay?: boolean;
}

/** A called play outcome: snapped at the bench's ball spot, succeeding spot `end` (Team A yards). */
export function play(b: Bench, p: PlaySpec): PlayOutcome {
  const s = b.ctx.situation;
  const start = b.yardA(s.ballX);
  const side = (t: 'A' | 'B') => (t === 'A' ? b.A : b.B);
  const to = side(p.to ?? 'A');
  const points: Record<string, number> = { touchdown: 6, field_goal: 3, safety: 2, try_kick: 1, try_two: 2, defensive_try: 2, try_safety: 1 };
  return {
    resultType: p.result ?? 'run', noPlay: p.noPlay ?? false, snappingSide: b.A, possessionAfter: to, changeOfPossession: to !== b.A,
    spotX: b.x(p.end), spotY: s.ballY, previousSpotX: s.ballX,
    score: p.score ? { type: p.score, side: side(p.scoreBy ?? 'A'), points: points[p.score]!, scorerId: null } : null,
    touchback: p.touchback ?? false, endedOutOfBounds: false, incomplete: p.incomplete ?? false, runnerDownInBounds: !(p.incomplete ?? false),
    yardsGained: p.end - start, injuryStoppage: [], enforcement: null,
  };
}

export interface FoulSpec {
  at?: number; timing?: FoulRecord['timing']; phase?: FoulRecord['phase']; t?: number; flagrant?: boolean;
  afterChange?: boolean; playerId?: number | null; called?: boolean; sameAct?: number | null;
}

/** A called foul record with its catalogue fields read from the fixture rule set. */
export function foul(b: Bench, id: string, by: 'A' | 'B', f: FoulSpec = {}): FoulRecord {
  const row = catalogue(id, b.ctx);
  const s = b.ctx.situation;
  const timing = f.timing ?? (row.deadBall ? 'dead_ball' : 'live');
  return {
    foulId: id, side: by === 'A' ? b.A : b.B, playerId: f.playerId === undefined ? 50 : f.playerId,
    spot: { x: b.x(f.at ?? b.yardA(s.ballX)), y: s.ballY }, t: f.t ?? (timing === 'before_snap' ? -1 : 2),
    timing, phase: f.phase ?? (f.afterChange ? 'after_change_of_possession' : 'running_play'),
    yards: row.yards, afd: row.afd, lod: row.lod, spotFoul: row.spotFoul, runoffEligible: row.runoffEligible,
    foulClass: row.foulClass, dq: row.dq, beforeChangeOfPossession: !f.afterChange, eventIndex: 0, sameAct: f.sameAct ?? null,
    called: f.called ?? true, correct: true, flagrant: f.flagrant ?? false,
  };
}

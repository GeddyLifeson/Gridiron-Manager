// TEST FAKES for the game flow (WP-06). Nothing here is football: the resolver, the officiating
// facade and the deciders are the simplest things that satisfy the contract interfaces, so the
// state machine can be driven through whole games before the real parts exist. Every number in
// this file is a fixture value for these fakes and must never be read as a rule or a rate.
import { Contract, DMATH, seedFromHex, streamSource } from '@gm/engine-core';
import { resolveRuleSet } from '@gm/rules-data';
import { OPT, PARAMS, defaultLineup, defaultOpposingCall, defaultSnappingCall, type FlowEnv } from '../../src/flow/index.ts';

type Side = Contract.Side;
type GameState = Contract.GameState;
type PlayOutcome = Contract.PlayOutcome;
type Ctx = Contract.RulingContext;
const other = Contract.otherSide;

// ---------------------------------------------------------------------------------------------
// Fixture rule sets and inputs
// ---------------------------------------------------------------------------------------------

export type FixtureFormat = 'timed_period' | 'alternating_series_25';

/** FIXTURE values for keys the real rule-set files do not hold yet, and for keys only these fakes read. */
const FIXTURE_KEYS: Record<string, number | boolean | string> = {
  'timeout.length_seconds': 30,
  'fixture.end_zone_yd': 10, 'fixture.width_yd': 53.3, 'fixture.kickoff_yardline': 35, 'fixture.safety_kick_yardline': 20,
  'fixture.touchback_yardline': 25, 'fixture.ot_series_yardline': 25, 'fixture.two_minute_s': 120, 'fixture.runoff_s': 10,
  'fixture.challenges': 2, 'fixture.ot_intermission_s': 180,
};

/** A real rule set of this repo with the fixture keys laid over it. Its id says it is a fixture. */
export function fixtureRules(base: 'pro_2026' | 'college_2026', format: FixtureFormat, over: Record<string, number | boolean | string> = {}): Contract.RuleSet {
  const real = resolveRuleSet(base);
  const extra: Record<string, number | boolean | string> = {
    ...FIXTURE_KEYS, 'overtime.format': format, 'overtime.period_length_s': format === 'timed_period' ? 600 : 0,
    'fixture.ot_timeouts': format === 'timed_period' ? 2 : 1, ...over,
  };
  const get = (key: string) => (key in extra ? extra[key]! : undefined);
  return {
    id: `${real.id}+fixture`, level: real.level, seasonYear: real.seasonYear,
    num(key) { const v = get(key); if (v === undefined) return real.num(key); if (typeof v !== 'number') throw new Error(`${key} is not a number`); return v; },
    bool(key) { const v = get(key); if (v === undefined) return real.bool(key); if (typeof v !== 'boolean') throw new Error(`${key} is not a switch`); return v; },
    opt(key) { const v = get(key); if (v === undefined) return real.opt(key); if (typeof v !== 'string') throw new Error(`${key} is not an option`); return v; },
    keys() { return [...new Set([...real.keys(), ...Object.keys(extra)])].sort(); },
  };
}

export function fixtureGeometry(rules: Contract.RuleSet): Contract.FieldGeometry {
  const ez = rules.num('fixture.end_zone_yd'), width = rules.num('fixture.width_yd');
  const hash = rules.num('field.hash_from_sideline_ft') / 3;
  return {
    lengthYd: rules.num('field.goal_to_goal_yd') + 2 * ez, widthYd: width, goalLineWestX: ez, goalLineEastX: ez + rules.num('field.goal_to_goal_yd'),
    hashSouthY: hash, hashNorthY: width - hash, centreY: width / 2, uprightSouthY: width / 2 - 3, uprightNorthY: width / 2 + 3, crossbarHeightYd: 3.3,
  };
}

export function paramTable(files: readonly Contract.ParamFile[] = [PARAMS], over: Record<string, number> = {}): Contract.ParamTable {
  const map = new Map<string, number>();
  for (const f of files) for (const p of f.params) map.set(p.name, p.value);
  for (const [k, v] of Object.entries(over)) map.set(k, v);
  return {
    version: files.map((f) => `${f.module}@${f.version}`).join(','),
    has: (name) => map.has(name),
    num(name) { const v = map.get(name); if (v === undefined) throw new Error(`unknown parameter ${name}`); return v; },
  };
}

const DAY: Contract.GameDayState = {
  freshness: 1, freshnessLongTerm: 1, conditioning: 50, playingHurt: [], knowledge: {}, snapsThisGame: 0, requiredAbsenceDowns: 0, ejected: false, unavailable: false,
};

export function fakeTeam(side: Side, players = 12): Contract.SimTeam {
  const attributes = Object.fromEntries(Contract.ATTRIBUTE_IDS.map((id) => [id, 50]));
  return {
    teamId: side + 1, side, depth: {}, teamDiscipline: { defCoverage: 1, postPlay: 1 },
    players: Array.from({ length: players }, (_, i) => ({
      playerId: (side + 1) * 100 + i + 1, position: 'P', jersey: i + 1, heightIn: 74, weightLb: 220, ageYears: 25, attributes,
      tests: { fortyS: 4.6, tenSplitS: 1.6, threeConeS: null, shuttleS: null, verticalIn: null, broadIn: null, changeOfDirectionZ: 0 }, gameDay: DAY,
    })),
  };
}

export function fakeInput(rules: Contract.RuleSet, seed: number, gameType: GameState['gameType'] = 'regular'): Contract.GameInput {
  return {
    gameId: seed + 1, ruleSetId: rules.id, gameType, teams: [fakeTeam(0), fakeTeam(1)],
    crew: { crewId: 1, positions: ['referee', 'umpire', 'down_judge'], crewFactor: {}, accuracy: 1, pace: 1 },
    environment: Contract.NEUTRAL_ENVIRONMENT, seedHex: (seed + 1).toString(16).padStart(16, '0'), fidelityTier: 'A',
  };
}

// ---------------------------------------------------------------------------------------------
// Fake resolver
// ---------------------------------------------------------------------------------------------

/** What happened on a fake play. It travels to the fake officiating inside a `detail` truth event. */
export interface FakeOutcome {
  kind: 'run' | 'complete' | 'incomplete' | 'sack' | 'kneel' | 'interception' | 'fumble_lost' | 'punt' | 'field_goal' | 'kickoff' | 'try_kick' | 'try_two' | 'presnap_foul';
  /** Yards along the snapping team's attack direction: the gain, the spot of a turnover, or the length of a kick. */
  yards: number;
  /** Return yards by the other team. */
  ret: number;
  /** Kicks and tries. */
  good: boolean;
  oob: boolean;
  liveTenths: number;
  /** A live-ball foul the offended coach may accept or decline. */
  foul: null | { on: 'offense' | 'defense'; yards: number };
  injury: boolean;
  /** The crew spots the ball a yard short; replay can fix it. */
  reviewWrong: boolean;
  defenseScoresOnTry: boolean;
}

export type FakeScript = (situation: Contract.GameSituation, calls: Contract.PlayCalls) => Partial<FakeOutcome> | undefined;
/** Six numbers in [0, 1) per play. */
export type FakeNumbers = (situation: Contract.GameSituation) => readonly number[] | undefined;

const FAKE_CODE = 'fake:';

export function fakeOutcomeOf(truth: Contract.PlayTruth): FakeOutcome {
  const d = Contract.eventsOf(truth, 'detail').find((e) => e.code.startsWith(FAKE_CODE));
  if (!d) throw new Error('truth record did not come from the fake resolver');
  return JSON.parse(d.code.slice(FAKE_CODE.length)) as FakeOutcome;
}

function outcomeFromNumbers(situation: Contract.GameSituation, calls: Contract.PlayCalls, u: readonly number[]): FakeOutcome {
  const n = (i: number) => u[i] ?? 0;
  const base: FakeOutcome = {
    kind: 'run', yards: 0, ret: 0, good: false, oob: n(2) < 0.15, liveTenths: 30 + Math.floor(n(2) * 40), foul: null,
    injury: n(5) < 0.02, reviewWrong: n(5) >= 0.03 && n(5) < 0.08, defenseScoresOnTry: false,
  };
  const call = calls.snapping;
  if (call.unit === 'kick') {
    if (call.kickKind === 'field_goal') return { ...base, kind: 'field_goal', good: n(0) < 0.8 };
    if (call.kickKind === 'try_kick') return { ...base, kind: 'try_kick', good: n(0) < 0.94 };
    if (call.kickKind === 'punt') return { ...base, kind: 'punt', yards: 30 + n(0) * 25, ret: n(1) * 15 };
    return { ...base, kind: 'kickoff', yards: 50 + n(0) * 25, ret: n(1) > 0.98 ? 120 : n(1) * 40 };
  }
  if (n(3) < 0.03) return { ...base, kind: 'presnap_foul', foul: { on: n(4) < 0.5 ? 'offense' : 'defense', yards: 5 }, liveTenths: 0 };
  const foul = n(3) < 0.09 ? { on: n(4) < 0.5 ? 'offense' as const : 'defense' as const, yards: n(4) * 2 % 1 < 0.5 ? 5 : 10 } : null;
  if (situation.playKind === 'try') return { ...base, kind: 'try_two', good: n(0) < 0.48, defenseScoresOnTry: n(0) > 0.985, foul };
  if (call.kind === 'kneel') return { ...base, kind: 'kneel', yards: -1, oob: false, foul: null };
  if (call.kind === 'spike') return { ...base, kind: 'incomplete', foul: null };
  if (call.kind === 'run' || call.kind === 'draw' || call.kind === 'qb_run') {
    if (n(1) < 0.02) return { ...base, kind: 'fumble_lost', yards: n(0) * 8, ret: n(4) * 20, foul };
    return { ...base, kind: 'run', yards: -3 + n(0) * n(0) * 28, foul };
  }
  if (n(1) < 0.03) return { ...base, kind: 'interception', yards: n(0) * 30, ret: n(4) > 0.9 ? 120 : n(4) * 25, foul };
  if (n(1) < 0.36) return { ...base, kind: 'incomplete', foul };
  if (n(1) < 0.43) return { ...base, kind: 'sack', yards: -3 - n(0) * 9, oob: false, foul };
  return { ...base, kind: 'complete', yards: n(0) * n(0) * 45, foul };
}

/** Normalises an outcome to the snap it is for, so a script or a generator cannot ask for the impossible. */
function fitOutcome(o: FakeOutcome, situation: Contract.GameSituation, calls: Contract.PlayCalls): FakeOutcome {
  const freeKick = situation.playKind !== 'scrimmage' && situation.playKind !== 'try';
  if (freeKick) return { ...o, kind: 'kickoff', foul: null, yards: o.kind === 'kickoff' ? o.yards : 60 };
  if (situation.playKind === 'try') return o.kind === 'try_kick' || o.kind === 'try_two' || o.kind === 'presnap_foul' ? o : { ...o, kind: calls.snapping.unit === 'kick' ? 'try_kick' : 'try_two' };
  return o.kind === 'kickoff' || o.kind === 'try_kick' || o.kind === 'try_two' ? { ...o, kind: 'run' } : o;
}

export function fakeResolver(opts: { script?: FakeScript; numbers?: FakeNumbers } = {}): Contract.Resolver {
  return {
    id: 'reference', version: 'fake 1', mayProduceSavedResults: false,
    simulatePlay(input) {
      const { situation, calls, geometry: g } = input;
      const s = input.streams('resolver', [situation.gameId, situation.playNumber]);
      const drawn = Array.from({ length: 6 }, () => s.uniform());
      const u = opts.numbers?.(situation) ?? drawn;
      const fo = fitOutcome({ ...outcomeFromNumbers(situation, calls, u), ...opts.script?.(situation, calls) }, situation, calls);
      const dir = situation.attackDir;
      const off = situation.offense, def = other(off);
      const goalAhead = dir === 1 ? g.goalLineEastX : g.goalLineWestX;
      const ownGoal = dir === 1 ? g.goalLineWestX : g.goalLineEastX;
      /** Yards past the line of scrimmage for a field x; negative behind it. */
      const depth = (x: number) => (x - situation.ballX) * dir;
      const toGoal = depth(goalAhead), toOwn = depth(ownGoal);
      const at = (yards: number) => Contract.roundYd(situation.ballX + yards * dir);
      const y = situation.ballY;
      type Dead = Contract.TruthEventOf<'dead_ball'>;
      let reason: Dead['reason'] = 'down_by_contact';
      let spotX = situation.ballX;
      let side: Side | null = off;
      let impetus: Side | null = null;
      /** A team carrying the ball from `from` for `gain` yards toward the goal at depth `target`: a touchdown, or down in the field. */
      const carry = (carrier: Side, from: number, gain: number, towardOwnGoalOfOffense: boolean) => {
        side = carrier;
        const d = towardOwnGoalOfOffense ? from - gain : from + gain;
        if (towardOwnGoalOfOffense ? d <= toOwn : d >= toGoal) { reason = 'ball_across_goal_line_in_possession'; spotX = towardOwnGoalOfOffense ? ownGoal : goalAhead; } else {
          reason = fo.oob ? 'runner_out_of_bounds' : 'down_by_contact';
          spotX = at(Math.min(toGoal - 0.5, Math.max(toOwn + 0.5, d)));
        }
      };
      switch (fo.kind) {
        case 'presnap_foul': reason = 'pre_snap_foul'; break;
        case 'incomplete': reason = 'incomplete_pass'; side = null; break;
        case 'field_goal': case 'try_kick': reason = fo.good ? 'kick_through_uprights' : 'kick_failed'; side = null; break;
        case 'try_two':
          if (fo.defenseScoresOnTry) carry(def, 0, 200, true);
          else if (fo.good) carry(off, 0, 200, false);
          break;
        case 'kickoff': case 'punt':
          if (fo.yards >= toGoal) { reason = 'ball_dead_in_end_zone'; side = def; impetus = off; spotX = goalAhead; } else carry(def, fo.yards, fo.ret, true);
          break;
        case 'interception': case 'fumble_lost':
          carry(def, Math.min(toGoal - 1, Math.max(toOwn + 1, fo.yards)), fo.ret, true);
          break;
        default:
          if (fo.yards <= toOwn) { reason = 'ball_dead_in_end_zone'; side = off; impetus = off; spotX = ownGoal; } else carry(off, 0, fo.yards, false);
      }
      const live = fo.kind === 'presnap_foul' ? 0 : fo.liveTenths;
      const t = live / 10;
      const spot = { x: spotX, y };
      const events: Contract.TruthEvent[] = [];
      if (fo.foul !== null) {
        events.push({
          type: 'foul_committed', t: fo.kind === 'presnap_foul' ? -1 : 0, foulId: 'fixture_foul', side: fo.foul.on === 'offense' ? off : def, playerId: null,
          spot: { x: situation.ballX, y }, timing: fo.kind === 'presnap_foul' ? 'before_snap' : 'live', phase: 'running_play', severity: 1, visibility: 'open',
          atPointOfAttack: true, flagrant: false, borderline: false, ordered: false,
        });
      }
      events.push({ type: 'detail', t: fo.kind === 'presnap_foul' ? -1 : 0, code: FAKE_CODE + JSON.stringify(fo), playerIds: [], spot: null, value: null });
      events.push({ type: 'dead_ball', t, marginYd: null, marginS: null, visibility: 'open', reason, spot, side, carrierId: null });
      const truth: Contract.PlayTruth = {
        resolverId: 'reference', resolverVersion: 'fake 1', gameId: situation.gameId, playNumber: situation.playNumber,
        originX: situation.ballX, originY: situation.ballY, attackDir: dir, liveDurationTenths: live, endZoneImpetus: impetus, events,
      };
      const deltas = [...calls.snapping.players, ...calls.opposing.players].map((p) => ({ playerId: p.playerId, energyCost: 0.01, hitLoad: 0, onField: true }));
      return { truth, deltas, liveDurationTenths: live, trajectory: null, explain: null };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Fake officiating
// ---------------------------------------------------------------------------------------------

const tenths = (s: number) => s * 10;

export function fakeOfficiating(g: Contract.FieldGeometry): Contract.Officiating {
  const goalOf = (dir: Contract.AttackDir) => (dir === 1 ? g.goalLineEastX : g.goalLineWestX);
  const ownGoalOf = (dir: Contract.AttackDir) => (dir === 1 ? g.goalLineWestX : g.goalLineEastX);
  const fromOwnGoal = (state: GameState, side: Side, yards: number) => ownGoalOf(state.attackDir[side]) + yards * state.attackDir[side];
  const hashY = (y: number) => Math.min(g.hashNorthY, Math.max(g.hashSouthY, y));
  const playClock = (reason: Contract.PlayClockReason, src: Contract.NumberSources) =>
    tenths(src.rules.num(reason === 'normal' ? 'clock.play_clock_s' : 'clock.play_clock_after_stoppage_s'));

  const blank = (ctx: Ctx): PlayOutcome => ({
    resultType: 'run', noPlay: false, snappingSide: ctx.situation.offense, possessionAfter: ctx.situation.offense, changeOfPossession: false,
    spotX: ctx.situation.ballX, spotY: ctx.situation.ballY, previousSpotX: ctx.situation.ballX, score: null, touchback: false,
    endedOutOfBounds: false, incomplete: false, runnerDownInBounds: false, yardsGained: 0, injuryStoppage: [], enforcement: null,
  });

  /** The rule as these fakes write it, applied to a fake truth record. `short` moves the spot a yard back: the crew's error. */
  function ruleTruth(truth: Contract.PlayTruth, ctx: Ctx, short: boolean): PlayOutcome {
    const fo = fakeOutcomeOf(truth);
    const dead = Contract.deadBallOf(truth);
    const sit = ctx.situation;
    const off = sit.offense, def = other(off);
    const rules = ctx.rules;
    const out = blank(ctx);
    const isTry = sit.playKind === 'try';
    const kinds: Record<FakeOutcome['kind'], Contract.PlayResultType> = {
      run: 'run', complete: 'pass_complete', incomplete: 'pass_incomplete', sack: 'sack', kneel: 'kneel', interception: 'interception', fumble_lost: 'fumble_lost',
      punt: 'punt', field_goal: 'field_goal_missed', kickoff: sit.playKind === 'safety_kick' ? 'safety_kick' : sit.playKind === 'fair_catch_kick' ? 'fair_catch_kick' : 'kickoff',
      try_kick: 'try_failed', try_two: 'try_failed', presnap_foul: 'no_play',
    };
    out.resultType = kinds[fo.kind];
    out.injuryStoppage = fo.injury && ctx.before.gameDay[off] ? [Number(Object.keys(ctx.before.gameDay[off])[0])] : [];
    const give = (side: Side, x: number) => { out.possessionAfter = side; out.changeOfPossession = side !== off; out.spotX = x; out.spotY = dead.spot.y; };
    switch (dead.reason) {
      case 'pre_snap_foul': out.noPlay = true; break;
      case 'incomplete_pass': out.incomplete = true; break;
      case 'kick_through_uprights':
        out.resultType = isTry ? 'try_good' : 'field_goal_good';
        out.score = isTry ? { type: 'try_kick', side: off, points: rules.num('try.kick_points'), scorerId: null } : { type: 'field_goal', side: off, points: rules.num('score.field_goal'), scorerId: null };
        break;
      case 'kick_failed':
        if (!isTry) give(def, sit.ballX);
        break;
      case 'ball_across_goal_line_in_possession': {
        const scorer = dead.side ?? off;
        if (isTry) {
          out.resultType = scorer === off ? 'try_good' : 'try_failed';
          out.score = { type: scorer === off ? 'try_two' : 'defensive_try', side: scorer, points: rules.num('try.two_point_points'), scorerId: null };
        } else {
          out.score = { type: 'touchdown', side: scorer, points: rules.num('score.touchdown'), scorerId: null };
          give(scorer, dead.spot.x);
        }
        break;
      }
      case 'ball_dead_in_end_zone': {
        const holder = dead.side ?? off;
        if (truth.endZoneImpetus === holder) {
          out.score = { type: 'safety', side: other(holder), points: rules.num('score.safety'), scorerId: null };
          give(holder, dead.spot.x);
        } else { out.touchback = true; give(holder, fromOwnGoal(ctx.before, holder, rules.num('fixture.touchback_yardline'))); }
        break;
      }
      default: {
        const holder = dead.side ?? off;
        const x = short && holder === off && sit.playKind === 'scrimmage' ? dead.spot.x - sit.attackDir : dead.spot.x;
        give(holder, x);
        out.endedOutOfBounds = dead.reason === 'runner_out_of_bounds';
        out.runnerDownInBounds = dead.reason === 'down_by_contact';
      }
    }
    if (isTry) { out.possessionAfter = off; out.changeOfPossession = false; out.spotX = sit.ballX; }
    if (!out.changeOfPossession && sit.playKind === 'scrimmage' && out.score === null) out.yardsGained = Contract.roundYd((out.spotX - sit.ballX) * sit.attackDir);
    return out;
  }

  /** A crew that errs only where the fake outcome says so, and only on plain gains inside the field. */
  const crewIsShort = (truth: Contract.PlayTruth, ctx: Ctx, exact: PlayOutcome) => {
    const fo = fakeOutcomeOf(truth);
    const room = (exact.spotX - ctx.situation.attackDir - (ctx.situation.attackDir === 1 ? g.goalLineWestX : g.goalLineEastX)) * ctx.situation.attackDir;
    return fo.reviewWrong && ctx.situation.playKind === 'scrimmage' && exact.score === null && !exact.changeOfPossession && !exact.noPlay && !exact.incomplete && room > 1;
  };

  function enforce(base: PlayOutcome, foul: Contract.FoulRecord, ctx: Ctx): PlayOutcome {
    const sit = ctx.situation;
    const againstOffense = foul.side === sit.offense;
    const dir = sit.attackDir;
    const wanted = againstOffense ? -foul.yards : foul.yards;
    // Stay a yard clear of both goal lines: half the distance, as these fakes write it.
    const lo = (ownGoalOf(dir) - sit.ballX) * dir + 1, hi = (goalOf(dir) - sit.ballX) * dir - 1;
    const walked = Math.min(hi, Math.max(lo, wanted));
    return {
      ...blank(ctx), resultType: 'no_play', noPlay: true, spotX: Contract.roundYd(sit.ballX + walked * dir), injuryStoppage: base.injuryStoppage,
      enforcement: {
        enforced: [0], declined: [], offsetting: false, yardsWalked: walked, fromSpot: { x: sit.ballX, y: sit.ballY }, halfDistanceApplied: walked !== wanted,
        automaticFirstDown: !againstOffense, lossOfDown: false, replayDown: true, carriedTo: null, runoffTaken: false, disqualified: [],
      },
    };
  }

  function callPlay(truth: Contract.PlayTruth, ctx: Ctx, perfectSight: boolean): Contract.CalledPlay {
    const fo = fakeOutcomeOf(truth);
    const trueOutcome = ruleTruth(truth, ctx, false);
    const short = !perfectSight && crewIsShort(truth, ctx, trueOutcome);
    const calledOutcome = short ? ruleTruth(truth, ctx, true) : trueOutcome;
    const deadIndex = truth.events.findIndex((e) => e.type === 'dead_ball');
    const rulings: Contract.Ruling[] = [{
      aspect: 'spot', eventIndex: deadIndex, trueValue: String(trueOutcome.spotX), calledValue: String(calledOutcome.spotX), marginYd: short ? 1 : null, marginS: null,
      visibility: 'open', official: 'down_judge', reviewable: ctx.situation.playKind === 'scrimmage',
    }];
    const foulIndex = truth.events.findIndex((e) => e.type === 'foul_committed');
    const fe = foulIndex >= 0 ? truth.events[foulIndex] : undefined;
    if (!fe || fe.type !== 'foul_committed' || fo.foul === null || ctx.situation.playKind !== 'scrimmage') {
      return { rulings, fouls: [], trueOutcome, calledOutcome, options: [{ optionId: 'result', side: ctx.situation.offense, labelKey: 'fixture.result', outcome: calledOutcome }], defaultOptionId: 'result' };
    }
    const foul: Contract.FoulRecord = {
      foulId: fe.foulId, side: fe.side, playerId: null, spot: fe.spot, t: fe.t, timing: fe.timing, phase: fe.phase, yards: fo.foul.yards, afd: fe.side !== ctx.situation.offense,
      lod: false, spotFoul: false, runoffEligible: true, foulClass: 'other', dq: 'none', beforeChangeOfPossession: true, eventIndex: foulIndex, sameAct: null,
      called: true, correct: true, flagrant: false,
    };
    const offended = other(fe.side);
    const accept: Contract.EnforcementOption = { optionId: 'accept', side: offended, labelKey: 'fixture.accept', outcome: enforce(calledOutcome, foul, ctx) };
    if (fo.kind === 'presnap_foul') return { rulings, fouls: [foul], trueOutcome, calledOutcome: accept.outcome, options: [accept], defaultOptionId: 'accept' };
    const declined: PlayOutcome = {
      ...calledOutcome,
      enforcement: {
        enforced: [], declined: [0], offsetting: false, yardsWalked: 0, fromSpot: null, halfDistanceApplied: false, automaticFirstDown: false, lossOfDown: false,
        replayDown: false, carriedTo: null, runoffTaken: false, disqualified: [],
      },
    };
    const decline: Contract.EnforcementOption = { optionId: 'decline', side: offended, labelKey: 'fixture.decline', outcome: declined };
    const better = calledOutcome.score?.side === offended || (calledOutcome.changeOfPossession && calledOutcome.possessionAfter === offended);
    return { rulings, fouls: [foul], trueOutcome, calledOutcome, options: [decline, accept], defaultOptionId: better ? 'decline' : 'accept' };
  }

  const series: Contract.SeriesRules = {
    newSeries(side, ballX, ballY, ctx) {
      const dir = ctx.before.attackDir[side];
      const goal = goalOf(dir);
      const want = ballX + ctx.rules.num('series.yards_to_gain') * dir;
      const line = (want - goal) * dir >= 0 ? goal : want;
      return {
        playKind: 'scrimmage', possession: side, down: 1, distanceYd: Math.max(0, (line - ballX) * dir), goalToGo: line === goal, ballX, ballY: hashY(ballY),
        lineToGainX: line, seriesStartX: ballX, firstDownAwarded: true, turnoverOnDowns: false,
      };
    },
    next(o, ctx) {
      const sit = ctx.situation;
      const off = sit.offense;
      if (sit.playKind !== 'scrimmage') {
        if (o.possessionAfter !== off || !o.noPlay) return series.newSeries(o.possessionAfter, o.spotX, o.spotY, ctx);
        return { playKind: sit.playKind, possession: off, down: null, distanceYd: null, goalToGo: false, ballX: o.spotX, ballY: sit.ballY, lineToGainX: null, seriesStartX: null, firstDownAwarded: false, turnoverOnDowns: false };
      }
      if (o.possessionAfter !== off) return { ...series.newSeries(o.possessionAfter, o.spotX, o.spotY, ctx), firstDownAwarded: false };
      const line = sit.lineToGainX!;
      const reached = (o.spotX - line) * sit.attackDir >= 0;
      if (reached || o.enforcement?.automaticFirstDown) return series.newSeries(off, o.spotX, o.spotY, ctx);
      const same = { playKind: 'scrimmage' as const, possession: off, goalToGo: sit.goalToGo, ballX: o.spotX, ballY: hashY(o.incomplete ? sit.ballY : o.spotY), lineToGainX: line, seriesStartX: ctx.before.seriesStartX, firstDownAwarded: false };
      const distanceYd = Math.max(0, (line - o.spotX) * sit.attackDir);
      // A penalty against the offense can move the ball behind the start of the series.
      const seriesStartX = (line - o.spotX) * sit.attackDir > (line - (same.seriesStartX ?? o.spotX)) * sit.attackDir ? o.spotX : same.seriesStartX;
      if (o.noPlay) return { ...same, seriesStartX, down: sit.down, distanceYd, turnoverOnDowns: false };
      if (sit.down! >= ctx.rules.num('series.downs')) return { ...series.newSeries(other(off), o.spotX, o.spotY, ctx), firstDownAwarded: false, turnoverOnDowns: true };
      return { ...same, seriesStartX, down: sit.down! + 1, distanceYd, turnoverOnDowns: false };
    },
  };

  const lastPeriodOfHalf = (period: number, src: Contract.NumberSources) => {
    const periods = src.rules.num('clock.periods');
    return period === periods / 2 || period === periods;
  };

  const clock: Contract.ClockRules = {
    atSnap(_clockTenths, status, ctx) {
      if (status === 'untimed' || ctx.situation.playKind === 'try') return status;
      return 'running';
    },
    afterPlay(o, live, ctx) {
      const before = ctx.before;
      const stopKind = o.score !== null || o.changeOfPossession || o.enforcement !== null || o.noPlay || ctx.situation.playKind !== 'scrimmage';
      const playClockTenths = playClock(stopKind ? 'administrative' : 'normal', ctx);
      if (before.clockStatus === 'untimed') return { clockTenths: 0, status: 'untimed', playClockTenths, periodExpired: false, untimedDown: false, twoMinuteStop: false, runoff: null };
      const ran = ctx.situation.clockStatus === 'running' ? live : 0;
      const clockTenths = Math.max(0, before.clockTenths - ran);
      const two = tenths(ctx.rules.num('fixture.two_minute_s'));
      // Fixture rule: the first play that ends at or under the mark stops the clock.
      const twoMinuteStop = !before.insideTwoMinute && lastPeriodOfHalf(before.period, ctx) && clockTenths <= two && clockTenths > 0;
      const inside = before.insideTwoMinute || twoMinuteStop;
      const stopped = stopKind || o.incomplete || o.endedOutOfBounds || twoMinuteStop || o.injuryStoppage.length > 0;
      const status: Contract.ClockStatus = !stopped ? 'running' : o.endedOutOfBounds && !inside && !stopKind ? 'stopped_start_on_ready' : 'stopped_start_on_snap';
      const periodExpired = clockTenths === 0;
      const foulOnOffense = o.enforcement !== null && o.enforcement.enforced.length > 0 && !o.enforcement.automaticFirstDown;
      const foulOnDefense = o.enforcement !== null && o.enforcement.enforced.length > 0 && o.enforcement.automaticFirstDown;
      return {
        clockTenths, status, playClockTenths, periodExpired, twoMinuteStop,
        untimedDown: periodExpired && foulOnDefense,
        runoff: inside && foulOnOffense && !periodExpired && before.clockStatus === 'running' ? { against: ctx.situation.offense, tenths: tenths(ctx.rules.num('fixture.runoff_s')) } : null,
      };
    },
    playClockTenths: playClock,
    timeoutAllowed(state, side) { return state.timeoutsLeft[side] > 0 ? { allowed: true, refusedKey: null } : { allowed: false, refusedKey: 'fixture.no_timeouts' }; },
    endOfPeriod(state, src) {
      const periods = src.rules.num('clock.periods');
      const tied = state.score[0] === state.score[1];
      const done = (next: Contract.PeriodTransition['next'], intermissionS: number): Contract.PeriodTransition =>
        ({ next, swapEnds: false, resetTimeouts: false, intermissionTenths: tenths(intermissionS), carryOverSeries: false });
      if (state.period > periods) return done(tied && state.gameType === 'postseason' ? 'overtime' : 'final', src.rules.num('fixture.ot_intermission_s'));
      if (state.period === periods) return done(tied ? 'overtime' : 'final', src.rules.num('fixture.ot_intermission_s'));
      if (state.period === periods / 2) return { next: 'halftime', swapEnds: true, resetTimeouts: true, intermissionTenths: tenths(src.rules.num('clock.halftime_min') * 60), carryOverSeries: false };
      return { next: 'next_period', swapEnds: true, resetTimeouts: false, intermissionTenths: tenths(60), carryOverSeries: true };
    },
  };

  const kickSpot = (state: GameState, side: Side, kind: 'kickoff' | 'safety_kick', src: Contract.NumberSources): Contract.RestartSetup => {
    const carried = kind === 'kickoff' && state.carriedPenalty?.to === 'kickoff' ? (state.carriedPenalty.against === side ? -1 : 1) * state.carriedPenalty.yards : 0;
    const yardline = src.rules.num(kind === 'kickoff' ? 'fixture.kickoff_yardline' : 'fixture.safety_kick_yardline') + carried;
    return { playKind: kind, side, ballX: fromOwnGoal(state, side, yardline), ballY: g.centreY, playClockTenths: playClock('administrative', src) };
  };

  const restarts: Contract.RestartRules = {
    tossOptions(kind, src) {
      if (kind === 'opening') return [OPT.receive, OPT.kick, OPT.defendWest, OPT.defendEast, OPT.defer];
      return src.rules.opt('overtime.format') === 'timed_period' ? [OPT.receive, OPT.kick, OPT.defendWest, OPT.defendEast] : [OPT.offense, OPT.defense, OPT.defendWest, OPT.defendEast];
    },
    afterScore(score, _state, ctx) {
      if (score.type === 'touchdown') return restarts.trySetup(score.side, 'kick', ctx);
      if (score.type === 'safety') return kickSpot(ctx.before, other(score.side), 'safety_kick', ctx);
      return kickSpot(ctx.before, score.side, 'kickoff', ctx);
    },
    trySetup(side, choice, ctx) {
      const dir = ctx.before.attackDir[side];
      const yard = ctx.rules.num(choice === 'kick' ? 'try.kick_snap_yardline' : 'try.two_point_snap_yardline');
      return { playKind: 'try', side, ballX: goalOf(dir) - yard * dir, ballY: g.centreY, playClockTenths: playClock('administrative', ctx) };
    },
    kickoffSetup(kicking, kind, ctx) { return kickSpot(ctx.before, kicking, kind, ctx); },
  };

  const overtime: Contract.OvertimeRules = {
    timeoutsPerTeam(_state, src) { return src.rules.num('fixture.ot_timeouts'); },
    start(state, src) {
      const ot = state.overtime;
      if (ot === null) return { next: 'toss', restart: null, state: null };
      const cur = state.period - src.rules.num('clock.periods');
      if (src.rules.opt('overtime.format') === 'timed_period') {
        return { next: 'kickoff', restart: kickSpot(state, other(ot.firstPossession), 'kickoff', src), state: { ...ot, otPeriod: cur, possessions: [] } };
      }
      const first = cur % 2 === 1 ? ot.firstPossession : other(ot.firstPossession);
      return { next: 'series', restart: otSeries(state, first, src), state: { ...ot, otPeriod: cur, possessions: [{ side: first, points: 0, ended: false }] } };
    },
    afterPossession(state, o, ctx) {
      const ot = state.overtime!;
      const tied = state.score[0] === state.score[1];
      const poss = ot.possessions.map((p) => ({ ...p }));
      if (ctx.rules.opt('overtime.format') === 'timed_period') {
        // Fixture rule: a field goal on the first possession does not end it; any other lead does.
        const offense = ctx.situation.offense;
        if (ctx.situation.playKind === 'scrimmage' && (poss.length === 0 || poss[poss.length - 1]!.side !== offense)) poss.push({ side: offense, points: 0, ended: false });
        const cur = poss[poss.length - 1];
        if (cur && !o.noPlay && (o.score !== null || o.changeOfPossession || state.possession !== cur.side)) { cur.ended = true; if (o.score?.side === cur.side) cur.points += o.score.points; }
        const firstFieldGoal = poss.length === 1 && o.score?.type === 'field_goal';
        const decided = !tied && !firstFieldGoal && !o.noPlay && (o.score !== null || (poss.length >= 2 && cur !== undefined && cur.ended));
        return { next: decided ? 'final_win' : 'series', restart: null, state: { ...ot, possessions: poss } };
      }
      const cur = poss[poss.length - 1]!;
      if (o.noPlay) return { next: 'series', restart: null, state: ot };
      if (o.score !== null && o.score.side === cur.side) cur.points += o.score.points;
      if (o.score !== null && o.score.side !== cur.side && ctx.situation.playKind !== 'try') return { next: 'final_win', restart: null, state: { ...ot, possessions: poss } };
      const over = ctx.situation.playKind === 'try' || (o.score !== null && o.score.type !== 'touchdown') || (o.score === null && state.possession !== cur.side);
      if (!over) return { next: 'series', restart: null, state: { ...ot, possessions: poss } };
      cur.ended = true;
      if (poss.length === 1) {
        const second = other(cur.side);
        return { next: 'series', restart: otSeries(state, second, ctx), state: { ...ot, possessions: [...poss, { side: second, points: 0, ended: false }] } };
      }
      if (!tied) return { next: 'final_win', restart: null, state: { ...ot, possessions: poss } };
      return { next: 'next_ot_period', restart: null, state: { ...ot, otPeriod: ot.otPeriod + 1, possessions: [] } };
    },
  };
  function otSeries(state: GameState, side: Side, src: Contract.NumberSources): Contract.RestartSetup {
    const dir = state.attackDir[side];
    return { playKind: 'scrimmage', side, ballX: goalOf(dir) - src.rules.num('fixture.ot_series_yardline') * dir, ballY: g.centreY, playClockTenths: playClock('administrative', src) };
  }

  const wrongSpot = (called: Contract.CalledPlay) => called.rulings.some((r) => r.reviewable && r.trueValue !== r.calledValue);
  const replay: Contract.ReplayRules = {
    challengeable(called, side, ctx) {
      const s = ctx.before;
      const ok = called.rulings.some((r) => r.reviewable) && s.timeoutsLeft[side] > 0 && s.challengesUsed[side] < ctx.rules.num('fixture.challenges') && !ctx.situation.overtime && !s.insideTwoMinute;
      return ok ? ['spot'] : [];
    },
    boothReview(called, ctx) { return ctx.before.insideTwoMinute && wrongSpot(called) ? { source: 'booth', side: null, aspects: ['spot'] } : null; },
    review(seen, _truth, rulings, _request, _ctx) { return { allowed: true, refusedKey: null, reversed: rulings.flatMap((r, i) => (r.trueValue !== r.calledValue ? [i] : [])), seen }; },
  };

  return {
    rulePlay: (truth, ctx) => callPlay(truth, ctx, false),
    review(called, truth, request, ctx) {
      const reversed = called.rulings.flatMap((r, i) => (r.trueValue !== r.calledValue ? [i] : []));
      const lost = request.source === 'coach_challenge' && reversed.length === 0;
      return { allowed: true, refusedKey: null, reversed, called: callPlay(truth, ctx, true), timeoutCharged: lost, challengeLost: lost };
    },
    series, clock, restarts, overtime, replay,
  };
}

// ---------------------------------------------------------------------------------------------
// Fake deciders and assembled dependencies
// ---------------------------------------------------------------------------------------------

export const silentDecider = (side: Side): Contract.Decider => ({ side, decide: () => null });

export interface ChartPolicy {
  /** Picks among the options of a request; return undefined to take the default. */
  pick?: (request: Contract.DecisionRequest, situation: Contract.GameSituation) => string | undefined;
  /** Play-clock value at which calls are accepted; null lets the flow place the snap. */
  acceptedAt?: (request: Contract.DecisionRequest) => number | null;
  tempo?: 'huddle' | 'no_huddle' | 'hurry_up';
}

/** A scripted chart caller: sensible calls from the public situation alone. */
export function chartDecider(side: Side, env: FlowEnv, input: Contract.GameInput, policy: ChartPolicy = {}): Contract.Decider {
  const lineup = input.teams[side].players.slice(0, 11).map((p) => ({ playerId: p.playerId, role: p.position }));
  return {
    side,
    decide({ request, situation }) {
      const base: Contract.Decision = {
        requestId: request.requestId, type: request.type, side, optionId: null, snappingCall: null, opposingCall: null,
        acceptedAtPlayClockTenths: policy.acceptedAt?.(request) ?? null, actor: { kind: 'ai', personId: null },
      };
      if (request.type === 'snapping_call') {
        const call = defaultSnappingCall(env, situation, lineup);
        if (call.unit === 'offense') {
          const twoPointSpot = situation.playKind === 'try';
          const pass = situation.playNumber % 2 === 0 || twoPointSpot;
          return { ...base, snappingCall: { ...call, kind: pass ? 'dropback_pass' : 'run', tempo: policy.tempo ?? 'huddle' } };
        }
        if (call.kickKind === 'try_kick') {
          const yards = (situation.attackDir === 1 ? env.geometry.goalLineEastX - situation.ballX : situation.ballX - env.geometry.goalLineWestX);
          if (yards < env.rules.num('try.kick_snap_yardline')) return { ...base, snappingCall: { ...defaultSnappingCall(env, { ...situation, playKind: 'scrimmage', down: 1 }, lineup) } };
        }
        return { ...base, snappingCall: call };
      }
      if (request.type === 'opposing_call') return { ...base, opposingCall: defaultOpposingCall(env, situation, lineup) };
      const picked = policy.pick?.(request, situation);
      return { ...base, optionId: picked !== undefined && request.options.some((o) => o.optionId === picked) ? picked : request.defaultOptionId };
    },
  };
}

export interface FakeGame {
  readonly rules: Contract.RuleSet;
  readonly input: Contract.GameInput;
  readonly deps: Contract.GameDeps;
}

export interface FakeGameOptions {
  base?: 'pro_2026' | 'college_2026';
  format?: FixtureFormat;
  seed?: number;
  gameType?: GameState['gameType'];
  rulesOver?: Record<string, number | boolean | string>;
  paramsOver?: Record<string, number>;
  script?: FakeScript;
  numbers?: FakeNumbers;
  deciders?: (env: FlowEnv, input: Contract.GameInput) => readonly [Contract.Decider, Contract.Decider];
  policy?: ChartPolicy;
  /** Replaces parts of the fake officiating, for example with a real rules module. */
  officiating?: (fake: Contract.Officiating) => Contract.Officiating;
}

/** A whole fake game: fixture rules, fake resolver, fake officiating and chart deciders on a seeded stream source. */
export function fakeGame(o: FakeGameOptions = {}): FakeGame {
  const base = o.base ?? 'pro_2026';
  const rules = fixtureRules(base, o.format ?? (base === 'pro_2026' ? 'timed_period' : 'alternating_series_25'), o.rulesOver);
  const input = fakeInput(rules, o.seed ?? 1, o.gameType);
  const geometry = fixtureGeometry(rules);
  const fake = fakeOfficiating(geometry);
  const env: FlowEnv = { rules, params: paramTable([PARAMS], o.paramsOver), geometry, streams: streamSource(seedFromHex(input.seedHex)), math: DMATH, officiating: o.officiating?.(fake) ?? fake };
  const deciders = o.deciders?.(env, input) ?? [chartDecider(0, env, input, o.policy), chartDecider(1, env, input, o.policy)];
  return { rules, input, deps: { ...env, resolver: fakeResolver({ script: o.script, numbers: o.numbers }), deciders } };
}

export { defaultLineup };

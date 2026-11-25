// Phase 0 dummy game (R1.2.1). A seeded game that reads rule keys, draws from keyed streams, runs the
// play clock on every snap (binding ruling: the play clock always runs), and hashes state after every
// play. It is a determinism harness, not football simulation: outcomes come from toy distributions
// in data/dummy-params.json. Pure: (state, input, seed) -> (state', events) (P1.1.1).
import {
  stream, stateHash, chainNext, CHAIN_GENESIS, logistic, ENGINE_CORE_VERSION,
  type RuleSet, type DummyGameState, type PlayRow, type WorldSeed,
} from '@gm/engine-core';
import params from '../data/dummy-params.json' with { type: 'json' };

export const DUMMY_PARAMETER_SET = params.parameterSetVersion;
export const ENGINE_VERSION = `engine-core ${ENGINE_CORE_VERSION} / dummy-game 1`;

export interface DummyTeam { readonly teamId: number; readonly strength: number }

export interface GameEvent { readonly type: string; readonly playNumber: number; readonly detail: string }

export interface PlayResult { readonly state: DummyGameState; readonly row: PlayRow; readonly events: readonly GameEvent[] }

type Call = PlayRow['call'];

const r2 = (x: number) => Math.round(x * 100) / 100;

export function newGame(gameId: number, home: DummyTeam, away: DummyTeam, rules: RuleSet, seed: WorldSeed): DummyGameState {
  const toss = stream(seed, 'toss', [gameId]).int(0, 1);
  return {
    gameId,
    ruleSetId: rules.id,
    phase: 'kickoff',
    period: 1,
    clockS: rules.num('clock.period_length_s'),
    playClockS: rules.num('clock.play_clock_s'),
    clockRunning: false,
    openingKicker: toss,
    playNumber: 0,
    possession: toss, // the kicking team "has" the ball for the kickoff
    down: 1,
    yardsToGain: rules.num('series.yards_to_gain'),
    ballOn: params.kickoffStartYd,
    teams: [
      { teamId: home.teamId, score: 0, timeoutsLeft: rules.num('timeout.per_half'), strength: home.strength },
      { teamId: away.teamId, score: 0, timeoutsLeft: rules.num('timeout.per_half'), strength: away.strength },
    ],
  };
}

function cloneState(s: DummyGameState): DummyGameState {
  return { ...s, teams: [{ ...s.teams[0] }, { ...s.teams[1] }] };
}

function firstDown(s: DummyGameState, rules: RuleSet): void {
  s.down = 1;
  const field = rules.num('field.goal_to_goal_yd');
  s.yardsToGain = Math.min(rules.num('series.yards_to_gain'), field - s.ballOn);
}

function changePossession(s: DummyGameState, rules: RuleSet, newBallOnForOffense: number): void {
  s.possession = s.possession === 0 ? 1 : 0;
  s.ballOn = newBallOnForOffense;
  firstDown(s, rules);
}

function score(s: DummyGameState, team: number, points: number): void {
  s.teams[team as 0 | 1].score += points;
}

/** Runs one snap (or kickoff, or try) from a dead-ball state. */
export function stepPlay(prev: DummyGameState, rules: RuleSet, seed: WorldSeed): PlayResult {
  if (prev.phase === 'final') throw new Error('game is over');
  const s = cloneState(prev);
  const events: GameEvent[] = [];
  const playNumber = s.playNumber + 1;
  s.playNumber = playNumber;
  const play = stream(seed, 'dummyPlay', [s.gameId, playNumber]);
  const coach = stream(seed, 'coachAI', [s.gameId, playNumber, s.possession, 'call']);
  const field = rules.num('field.goal_to_goal_yd');
  const off = s.possession;
  const def = off === 0 ? 1 : 0;
  const before = { period: s.period, clock: s.clockS, down: s.down, ytg: s.yardsToGain, ballOn: s.ballOn };

  // The play clock runs before every snap. If the game clock is running it runs with it.
  const playClockMax = s.playClockS;
  const used = play.int(Math.min(params.playClockUsedMin, playClockMax), playClockMax);
  if (s.clockRunning && s.phase === 'callWindow') s.clockS = Math.max(0, s.clockS - used);

  // Late in a half the trailing defense spends a timeout to stop the clock (exercises timeout keys).
  const trailing = s.teams[def as 0 | 1].score < s.teams[off as 0 | 1].score;
  const lateHalf = (s.period === 2 || s.period === rules.num('clock.periods')) && s.clockS <= params.lateTimeoutWindowS;
  let playClockNext = rules.num('clock.play_clock_s');
  if (s.phase === 'callWindow' && s.clockRunning && trailing && lateHalf && s.teams[def as 0 | 1].timeoutsLeft > 0) {
    s.teams[def as 0 | 1].timeoutsLeft -= 1;
    s.clockRunning = false;
    events.push({ type: 'timeout', playNumber, detail: `team ${def}` });
  }

  let call: Call;
  let gain = 0;
  let result = '';
  let elapsed = play.int(params.playSecondsMin, params.playSecondsMax);
  let stopClock = false;
  const edge = s.teams[off as 0 | 1].strength - s.teams[def as 0 | 1].strength;

  if (s.phase === 'kickoff') {
    call = 'kickoff';
    elapsed = play.int(params.playSecondsMin, params.playSecondsMax);
    changePossession(s, rules, params.kickoffStartYd);
    result = 'kickoff';
    stopClock = true;
  } else if (s.phase === 'try') {
    const two = coach.chance(params.twoPointRate);
    call = two ? 'try_two' : 'try_kick';
    elapsed = 0; // the game clock does not run during a try
    // Toy effect of the snap spot so the two rule sets visibly diverge (pro kicks from 15, college from 3).
    const spot = rules.num(two ? 'try.two_point_snap_yardline' : 'try.kick_snap_yardline');
    const ok = play.chance(two ? params.tryTwoSuccess + edge - params.trySpotPenaltyPerYd * spot : params.tryKickSuccess - params.trySpotPenaltyPerYd * spot);
    if (ok) score(s, off, rules.num(two ? 'try.two_point_points' : 'try.kick_points'));
    result = ok ? 'try good' : 'try failed';
    s.phase = 'kickoff';
    stopClock = true;
  } else {
    // Scrimmage down.
    const toGoal = field - s.ballOn;
    const fgDistance = toGoal + params.fgEndZoneYd + params.fgSnapToKickYd;
    if (s.down === rules.num('series.downs') && s.yardsToGain > params.goForItRangeYd) {
      call = s.ballOn >= params.fieldGoalRangeFromOwnGoalYd && fgDistance <= params.fgMaxKickYd ? 'field_goal' : 'punt';
    } else {
      call = coach.pick([1, 1]) === 0 ? 'run' : 'pass';
    }
    if (call === 'field_goal') {
      const p = logistic((params.fgLogisticMid - fgDistance) * params.fgLogisticScale);
      if (play.chance(p)) {
        score(s, off, rules.num('score.field_goal'));
        result = `field goal good from ${fgDistance}`;
        s.phase = 'kickoff';
      } else {
        result = `field goal missed from ${fgDistance}`;
        changePossession(s, rules, Math.max(field - s.ballOn, params.kickoffStartYd));
      }
      stopClock = true;
    } else if (call === 'punt') {
      const net = Math.round(params.puntNetMeanYd + params.puntNetSdYd * play.normal());
      const land = s.ballOn + net;
      const spot = land >= field ? params.kickoffStartYd - 5 : field - land;
      changePossession(s, rules, Math.max(1, spot));
      result = `punt net ${Math.min(net, field - s.ballOn)}`;
      stopClock = true;
    } else {
      if (call === 'run') {
        gain = r2(params.runMeanYd * (1 + edge) + params.runSdYd * play.normal());
      } else {
        const complete = play.chance(params.passCompleteBase + edge);
        gain = complete ? r2(params.passMeanYd * (1 + edge) + params.passSdYd * play.normal()) : 0;
        if (!complete) { stopClock = true; result = 'incomplete'; }
      }
      const newSpot = s.ballOn + gain;
      if (newSpot >= field) {
        gain = r2(field - s.ballOn);
        score(s, off, rules.num('score.touchdown'));
        result = 'touchdown';
        s.phase = 'try';
        s.ballOn = field - rules.num('try.kick_snap_yardline');
        stopClock = true;
      } else if (newSpot <= 0) {
        score(s, def, rules.num('score.safety'));
        result = 'safety';
        s.phase = 'kickoff';
        s.possession = off; // team scored upon kicks off
        stopClock = true;
      } else {
        s.ballOn = r2(newSpot);
        if (gain >= s.yardsToGain) { firstDown(s, rules); result ||= 'first down'; }
        else if (s.down === rules.num('series.downs')) {
          changePossession(s, rules, r2(field - s.ballOn));
          result = 'turnover on downs';
          stopClock = true;
        } else {
          s.down += 1;
          s.yardsToGain = r2(s.yardsToGain - gain);
          result ||= `${gain} yd`;
        }
      }
    }
  }

  if (result === 'kickoff') s.phase = 'callWindow';

  s.clockS = Math.max(0, s.clockS - elapsed);
  s.clockRunning = !stopClock;
  if (events.some((e) => e.type === 'timeout')) playClockNext = rules.num('clock.play_clock_after_stoppage_s');
  s.playClockS = playClockNext;

  // Period end.
  if (s.clockS === 0 && s.phase !== 'try') {
    events.push({ type: 'periodEnd', playNumber, detail: `period ${s.period}` });
    const periods = rules.num('clock.periods');
    if (s.period >= periods) {
      s.phase = 'final';
    } else {
      const half = periods / 2;
      s.period += 1;
      s.clockS = rules.num('clock.period_length_s');
      s.clockRunning = false;
      if (s.period === half + 1) {
        // Second half: the team that kicked off to open the game receives; timeouts reset per half.
        s.teams[0].timeoutsLeft = rules.num('timeout.per_half');
        s.teams[1].timeoutsLeft = rules.num('timeout.per_half');
        s.phase = 'kickoff';
        s.possession = s.openingKicker === 0 ? 1 : 0;
        s.ballOn = params.kickoffStartYd;
      }
    }
  }

  const hash = stateHash(s);
  const row: PlayRow = {
    gameId: s.gameId, playNumber, period: before.period, clockBeforeS: before.clock, offense: off,
    down: before.down, yardsToGain: before.ytg, ballOn: before.ballOn, call, gain, elapsedS: elapsed, result, stateHash: hash,
  };
  events.push({ type: 'play', playNumber, detail: `${call}: ${result}` });
  return { state: s, row, events };
}

export interface GameRecord {
  readonly gameId: number;
  readonly ruleSetId: string;
  readonly finalState: DummyGameState;
  readonly plays: readonly PlayRow[];
  readonly chainHead: string;
  readonly finalHash: string;
}

/** Plays a full dummy game. The hash chain links every play's state hash (P5.3.2 style). */
export function playGame(gameId: number, home: DummyTeam, away: DummyTeam, rules: RuleSet, seed: WorldSeed, maxPlays = 400): GameRecord {
  let s = newGame(gameId, home, away, rules, seed);
  const plays: PlayRow[] = [];
  let chain = CHAIN_GENESIS;
  while (s.phase !== 'final') {
    if (plays.length >= maxPlays) throw new Error(`game ${gameId} exceeded ${maxPlays} plays`);
    const r = stepPlay(s, rules, seed);
    s = r.state;
    plays.push(r.row);
    chain = chainNext({ prev: chain, stateHash: r.row.stateHash, logSequence: r.row.playNumber, engineVersion: ENGINE_VERSION, parameterSetVersion: DUMMY_PARAMETER_SET });
  }
  return { gameId, ruleSetId: rules.id, finalState: s, plays, chainHead: chain, finalHash: stateHash(s) };
}

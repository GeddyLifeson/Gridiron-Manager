// Reading the game state: the situation of the next snap, the ruling context, restart placement and
// the small predicates the reducer and the driver share. Everything here is pure.
import { Contract } from '@gm/engine-core';

export type GameState = Contract.GameState;
export type Side = Contract.Side;

/**
 * What the flow needs besides the game input: the rule set, the parameters, the field, the streams,
 * the math and the officiating facade. `Contract.GameDeps` satisfies it. `apply` is bound to one of
 * these, because the contract's events do not carry the rule values a transition needs (period
 * length, timeouts per half, restart spots): see the WP-06 report.
 */
export interface FlowEnv extends Contract.NumberSources {
  readonly geometry: Contract.FieldGeometry;
  readonly streams: Contract.StreamSource;
  readonly math: Contract.DeterministicMath;
  readonly officiating: Contract.Officiating;
}

export const SIDES: readonly [Side, Side] = [0, 1];
export const other = Contract.otherSide;

export function isFreeKick(kind: Contract.PlayKind): boolean {
  return kind === 'kickoff' || kind === 'safety_kick' || kind === 'fair_catch_kick';
}

/** True from the first overtime period on, before and after the overtime toss. */
export function inOvertime(env: Contract.NumberSources, state: GameState): boolean {
  return state.overtime !== null || state.period > env.rules.num('clock.periods');
}

/** The period is over at this dead ball: clock at zero, no untimed down owed, no try still to play (B1.7, J11.4.1 rule 6). */
export function periodExpired(state: GameState): boolean {
  return state.clockStatus !== 'untimed' && state.clockStatus !== 'intermission' && state.clockTenths === 0
    && !state.untimedDownOwed && state.nextPlayKind !== 'try';
}

/** Where the game rests before the next snap. A try that has just been earned goes to the try choice first. */
export function restPhase(state: GameState, fromDeadBall: boolean): Contract.GameFlowPhase {
  if (isFreeKick(state.nextPlayKind)) return 'kickoff_setup';
  if (state.nextPlayKind === 'try' && fromDeadBall) return 'try_decision';
  return 'call_window';
}

/** The situation of the next snap, read off the state (contract type `SituationOf`, with the field and rules it needs). */
export function situationOf(env: FlowEnv, state: GameState): Contract.GameSituation {
  const offense = state.possession;
  const attackDir = state.attackDir[offense];
  const scrimmage = state.down !== null && state.lineToGainX !== null;
  const goalX = attackDir === 1 ? env.geometry.goalLineEastX : env.geometry.goalLineWestX;
  return {
    gameId: state.gameId,
    playNumber: state.playCounter + 1,
    driveNumber: state.drive ? state.drive.driveNumber : state.driveCounter + (state.nextPlayKind === 'scrimmage' ? 1 : 0),
    playKind: state.nextPlayKind,
    period: state.period,
    overtime: inOvertime(env, state),
    clockTenths: state.clockTenths,
    clockStatus: state.clockStatus,
    playClockAtSnapTenths: state.playClockTenths,
    offense,
    attackDir,
    down: state.down,
    distanceYd: scrimmage ? Math.max(0, (state.lineToGainX! - state.ballX) * attackDir) : null,
    goalToGo: scrimmage && state.lineToGainX === goalX,
    ballX: state.ballX,
    ballY: state.ballY,
    lineToGainX: state.lineToGainX,
    score: state.score,
    timeoutsLeft: state.timeoutsLeft,
    insideTwoMinute: state.insideTwoMinute,
    untimedDown: state.untimedDownOwed,
  };
}

export function rulingContext(env: FlowEnv, before: GameState, situation: Contract.GameSituation = situationOf(env, before)): Contract.RulingContext {
  return { rules: env.rules, params: env.params, geometry: env.geometry, before, situation, crew: before.crew, streams: env.streams, math: env.math };
}

/** A restart as the series it sets up. A scrimmage restart (an overtime series) is a fresh series by the series rule. */
export function seriesFromRestart(env: FlowEnv, setup: Contract.RestartSetup, ctx: Contract.RulingContext): Contract.SeriesState {
  if (setup.playKind === 'scrimmage') return env.officiating.series.newSeries(setup.side, setup.ballX, setup.ballY, ctx);
  return {
    playKind: setup.playKind, possession: setup.side, down: null, distanceYd: null, goalToGo: false,
    ballX: setup.ballX, ballY: setup.ballY, lineToGainX: null, seriesStartX: null, firstDownAwarded: false, turnoverOnDowns: false,
  };
}

/** Places the ball for a series: possession, kind of play, spot, down and line to gain. */
export function withSeries(state: GameState, s: Contract.SeriesState): GameState {
  return {
    ...state, possession: s.possession, nextPlayKind: s.playKind, ballX: s.ballX, ballY: s.ballY,
    down: s.down, lineToGainX: s.lineToGainX, seriesStartX: s.seriesStartX,
  };
}

export function withRestart(env: FlowEnv, state: GameState, setup: Contract.RestartSetup): GameState {
  const placed = withSeries(state, seriesFromRestart(env, setup, rulingContext(env, state)));
  return { ...placed, playClockTenths: setup.playClockTenths, playClockRunning: true };
}

/** The same spot seen from the other end of the field (J11.8.1 quarter change). */
export function mirrorX(g: Contract.FieldGeometry, x: number): number { return g.goalLineWestX + g.goalLineEastX - x; }
export function mirrorY(g: Contract.FieldGeometry, y: number): number { return g.widthYd - y; }

export function pairSet<T>(pair: readonly [T, T], side: Side, value: T): [T, T] {
  return side === 0 ? [value, pair[1]] : [pair[0], value];
}

/**
 * What a decider may be shown of the last ruling (Q1.4.1, EX-0001): called values only. Uncalled fouls are
 * dropped (foul indexes are renumbered) and every field of class truth is left out, so the object holds no key
 * a decider could read the truth from.
 */
export function publicCalled(called: Contract.CalledPlay): Contract.ObservedCalledPlay {
  const index = new Map<number, number>();
  const fouls: Contract.ObservedFoul[] = [];
  called.fouls.forEach((f, i) => {
    if (!f.called) return;
    index.set(i, fouls.length);
    const { eventIndex: _e, correct: _c, ...seen } = f;
    fouls.push({ ...seen, sameAct: null });
  });
  const remap = (list: readonly number[]) => list.filter((i) => index.has(i)).map((i) => index.get(i)!);
  const outcome = (o: Contract.PlayOutcome): Contract.PlayOutcome => (o.enforcement === null ? o
    : { ...o, enforcement: { ...o.enforcement, enforced: remap(o.enforcement.enforced), declined: remap(o.enforcement.declined) } });
  return {
    rulings: called.rulings.map(({ aspect, calledValue, official, reviewable }) => ({ aspect, calledValue, official, reviewable })),
    fouls,
    calledOutcome: outcome(called.calledOutcome),
    options: called.options.map((o) => ({ ...o, outcome: outcome(o.outcome) })),
    defaultOptionId: called.defaultOptionId,
  };
}

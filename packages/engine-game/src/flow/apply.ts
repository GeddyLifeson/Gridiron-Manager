// `next = apply(state, event)` (J11.1.1): the only way the game state changes. Pure and total over
// the transition table. It never mutates its input; every level it changes is copied.
//
// The reducer is bound to a `FlowEnv`, because some contract events name a transition without the
// rule values it needs (a period change, a toss, a try choice). Those values are computed here from
// the state through the officiating facade, which is itself pure, so replaying an event list with
// the same rule set reproduces the state bit for bit.
import { Contract } from '@gm/engine-core';
import { OPT, TENTHS_PER_S } from './params.ts';
import { FlowTransitionError, REQUEST_PHASES, transitionRow } from './table.ts';
import { tossOutcome } from './defaults.ts';
import {
  mirrorX, mirrorY, other, pairSet, periodExpired, restPhase, rulingContext, withRestart, withSeries,
  type FlowEnv, type GameState, type Side,
} from './situation.ts';

type GameEvent = Contract.GameEvent;
type EventOf<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;

function fail(state: GameState, event: GameEvent, detail: string): never {
  throw new FlowTransitionError(state.phase, event.type, detail);
}

const isCall = (t: Contract.DecisionType) => t === 'snapping_call' || t === 'opposing_call';

/** Game-clock time taken off a clock that may already be near zero. */
function runClock(state: GameState, tenths: number): GameState {
  const used = Math.min(state.clockTenths, tenths);
  if (used === 0) return state;
  return {
    ...state, clockTenths: state.clockTenths - used,
    drive: state.drive ? { ...state.drive, clockUsedTenths: state.drive.clockUsedTenths + used } : null,
  };
}

function regulationClockTenths(env: FlowEnv): number { return env.rules.num('clock.period_length_s') * TENTHS_PER_S; }

function onDecisionRequested(state: GameState, e: EventOf<'decision_requested'>): GameState {
  const req = e.request;
  if (!REQUEST_PHASES[req.type].includes(state.phase)) fail(state, e, `cannot request ${req.type}`);
  if (req.requestId !== state.nextRequestId) fail(state, e, `request id ${req.requestId}, expected ${state.nextRequestId}`);
  const phase = req.type === 'challenge' ? 'challenge_window' : req.type === 'penalty_choice' ? 'penalty_decision' : state.phase;
  return { ...state, phase, pendingDecisions: [...state.pendingDecisions, req], nextRequestId: req.requestId + 1 };
}

function applyRunoff(state: GameState): GameState {
  const r = state.pendingRunoff;
  return r === null ? state : { ...runClock(state, r.tenths), pendingRunoff: null };
}

function onDecisionMade(env: FlowEnv, state: GameState, e: EventOf<'decision_made'>): GameState {
  const d = e.decision;
  const req = state.pendingDecisions.find((r) => r.requestId === d.requestId);
  if (!req || req.type !== d.type || req.side !== d.side) fail(state, e, `answers no pending request (${d.requestId})`);
  const pending = state.pendingDecisions.filter((r) => r.requestId !== d.requestId);
  let next: GameState = { ...state, pendingDecisions: pending };
  switch (d.type) {
    case 'snapping_call': case 'opposing_call':
      if (state.phase === 'call_window' && !pending.some((r) => isCall(r.type))) next.phase = 'pre_snap';
      return next;
    case 'challenge':
      next.phase = d.optionId !== null && d.optionId !== OPT.none ? 'review' : 'ruling';
      return next;
    case 'try_choice': {
      const setup = env.officiating.restarts.trySetup(d.side, d.optionId === OPT.tryTwo ? 'two_point' : 'kick', rulingContext(env, next));
      next = withRestart(env, next, setup);
      next.phase = 'call_window';
      return next;
    }
    case 'runoff_choice': {
      const r = state.pendingRunoff;
      if (r === null) return next;
      if (d.side === r.against) return d.optionId === OPT.runoffTimeout ? { ...next, pendingRunoff: null } : applyRunoff(next);
      if (d.optionId !== OPT.runoffTake) return { ...next, pendingRunoff: null };
      // The offender may still spend a timeout (B1.6.1); with none to spend the runoff applies now.
      return env.officiating.clock.timeoutAllowed(next, r.against, env).allowed ? next : applyRunoff(next);
    }
    default:
      return next;
  }
}

function onClockAdvanced(state: GameState, e: EventOf<'clock_advanced'>): GameState {
  let next: GameState = { ...state, elapsedTenths: state.elapsedTenths + e.tenths };
  if (e.reason !== 'intermission') {
    if (next.playClockRunning) next.playClockTenths = Math.max(0, next.playClockTenths - e.tenths);
    if (next.clockStatus === 'running') next = runClock(next, e.tenths);
  }
  switch (state.phase) {
    case 'dead_ball':
      if (e.reason !== 'spotting') return next;
      // The ball is spotted and the referee signals ready: a clock that waits for the signal starts (B1.2.3).
      if (next.clockStatus === 'stopped_start_on_ready') next.clockStatus = 'running';
      next.playClockRunning = true;
      next.phase = periodExpired(next) ? 'period_end' : restPhase(next, true);
      return next;
    case 'call_window':
      if (e.reason !== 'intermission' && periodExpired(next)) next.phase = 'period_end';
      return next;
    case 'pre_snap':
      next.phase = periodExpired(next) ? 'period_end' : 'play';
      if (next.phase === 'play') next.playClockRunning = false;
      return next;
    case 'kickoff_setup':
      if (e.reason === 'pre_snap') { next.phase = 'play'; next.playClockRunning = false; }
      return next;
    case 'timeout':
      next.phase = restPhase(next, false);
      next.playClockRunning = true;
      return next;
    default:
      return next;
  }
}

function onTimeoutCharged(env: FlowEnv, state: GameState, e: EventOf<'timeout_charged'>): GameState {
  const next: GameState = { ...state };
  if (e.kind === 'team') {
    if (e.side === null) fail(state, e, 'a team timeout needs a side');
    if (state.timeoutsLeft[e.side] > 0) next.timeoutsLeft = pairSet(state.timeoutsLeft, e.side, state.timeoutsLeft[e.side] - 1);
    if (next.clockStatus === 'running' || next.clockStatus === 'stopped_start_on_ready') next.clockStatus = 'stopped_start_on_snap';
  }
  if (state.phase === 'call_window' || state.phase === 'kickoff_setup') {
    next.phase = 'timeout';
    next.playClockTenths = env.officiating.clock.playClockTenths('administrative', env);
  }
  if (state.phase !== 'ruling') next.playClockRunning = false;
  return next;
}

/** Bench bookkeeping the flow owns until the bench module (WP-18) takes it: snaps, required absences, ejections (J11.5.1 steps 3 and 6). */
function benchAfterPlay(state: GameState, record: Contract.PlayRecord): GameState['gameDay'] {
  const onField = new Set(record.deltas.filter((d) => d.onField).map((d) => String(d.playerId)));
  const ejected = new Set((record.final.enforcement?.disqualified ?? []).map(String));
  const counts = !record.final.noPlay;
  const side = (bench: GameState['gameDay'][0]) => {
    let out = bench;
    for (const id of Object.keys(bench)) {
      const p = bench[id]!;
      const snaps = counts && onField.has(id) ? p.snapsThisGame + 1 : p.snapsThisGame;
      const absence = counts && p.requiredAbsenceDowns > 0 ? p.requiredAbsenceDowns - 1 : p.requiredAbsenceDowns;
      const out2 = p.ejected || ejected.has(id);
      if (snaps === p.snapsThisGame && absence === p.requiredAbsenceDowns && out2 === p.ejected) continue;
      if (out === bench) out = { ...bench };
      out[id] = { ...p, snapsThisGame: snaps, requiredAbsenceDowns: absence, ejected: out2 };
    }
    return out;
  };
  const a = side(state.gameDay[0]), b = side(state.gameDay[1]);
  return a === state.gameDay[0] && b === state.gameDay[1] ? state.gameDay : [a, b];
}

function carriedAfterPlay(state: GameState, record: Contract.PlayRecord): GameState['carriedPenalty'] {
  const enf = record.final.enforcement;
  if (enf && enf.carriedTo !== null) {
    const foul = record.called.fouls[enf.enforced[0] ?? -1];
    if (foul) return { against: foul.side, yards: foul.yards, to: enf.carriedTo };
  }
  const c = state.carriedPenalty;
  if (c === null || record.final.noPlay) return c;
  const kind = record.situation.playKind;
  return (c.to === 'try' && kind === 'try') || (c.to === 'kickoff' && kind === 'kickoff') ? null : c;
}

export interface PlayResolution {
  readonly state: GameState;
  /** What the overtime rule said after this play, or null in regulation. */
  readonly overtimeStep: Contract.OvertimeStep | null;
}

/** The state after a play record, and the overtime step that came with it. `apply` uses the state; the driver also reads the step. */
export function resolvePlay(env: FlowEnv, state: GameState, record: Contract.PlayRecord): PlayResolution {
  const { final, clockAfter, situation } = record;
  let drive = state.drive;
  if (situation.playKind === 'scrimmage') {
    drive ??= {
      driveNumber: state.driveCounter + 1, side: situation.offense, startPeriod: situation.period, startClockTenths: situation.clockTenths,
      startX: situation.ballX, plays: 0, yards: 0, clockUsedTenths: 0, result: 'in_progress',
    };
    drive = {
      ...drive,
      plays: drive.plays + (final.noPlay ? 0 : 1),
      yards: drive.yards + (final.noPlay ? 0 : final.yardsGained),
      clockUsedTenths: drive.clockUsedTenths + Math.max(0, state.clockTenths - clockAfter.clockTenths),
    };
  }
  const periodRow = state.scoreByPeriod.length - 1;
  const gained: [number, number] = [record.scoreAfter[0] - state.score[0], record.scoreAfter[1] - state.score[1]];
  let next: GameState = {
    ...withSeries(state, record.seriesAfter),
    phase: 'dead_ball',
    playCounter: record.index,
    clockTenths: clockAfter.clockTenths,
    clockStatus: clockAfter.status,
    playClockTenths: clockAfter.playClockTenths,
    playClockRunning: true,
    elapsedTenths: state.elapsedTenths + record.truth.liveDurationTenths,
    score: [record.scoreAfter[0], record.scoreAfter[1]],
    scoreByPeriod: state.scoreByPeriod.map((row, i) => (i === periodRow ? [row[0] + gained[0], row[1] + gained[1]] as [number, number] : row)),
    untimedDownOwed: clockAfter.untimedDown,
    pendingRunoff: clockAfter.runoff,
    insideTwoMinute: state.insideTwoMinute || clockAfter.twoMinuteStop,
    carriedPenalty: carriedAfterPlay(state, record),
    pendingDecisions: [],
    drive,
    gameDay: benchAfterPlay(state, record),
  };
  if (state.overtime === null) return { state: next, overtimeStep: null };
  const step = env.officiating.overtime.afterPossession(next, final, rulingContext(env, state, situation));
  if (step.state !== null) next = { ...next, overtime: step.state };
  if (step.restart !== null) next = withRestart(env, next, step.restart);
  return { state: next, overtimeStep: step };
}

function onReviewResolved(state: GameState, e: EventOf<'review_resolved'>): GameState {
  const next: GameState = { ...state, phase: 'ruling' };
  const { source, side, aspects } = e.request;
  // A refused request is logged with no aspects and costs nothing.
  if (source === 'coach_challenge' && side !== null && aspects.length > 0) {
    next.challengesUsed = pairSet(state.challengesUsed, side, state.challengesUsed[side] + 1);
    if (e.reversed) next.challengesWon = pairSet(state.challengesWon, side, state.challengesWon[side] + 1);
  }
  return next;
}

function freshPeriod(state: GameState): GameState {
  return {
    ...state, period: state.period + 1, scoreByPeriod: [...state.scoreByPeriod, [0, 0]],
    untimedDownOwed: false, pendingRunoff: null, playClockRunning: true,
  };
}

/** Enters an overtime period: clock by the rule set, timeouts and the next step by the overtime rule (J11.8.2). */
function enterOvertimePeriod(env: FlowEnv, state: GameState, e: GameEvent): GameState {
  const length = env.rules.num('overtime.period_length_s') * TENTHS_PER_S;
  let next: GameState = {
    ...freshPeriod(state), clockTenths: length, clockStatus: length > 0 ? 'stopped_start_on_snap' : 'untimed', insideTwoMinute: false,
    playClockTenths: env.officiating.clock.playClockTenths('administrative', env),
  };
  const timeouts = env.officiating.overtime.timeoutsPerTeam(next, env);
  next.timeoutsLeft = [timeouts, timeouts];
  // The overtime rules place a restart only when they are given a ruling context: a spot needs the field (WP-03).
  const step = env.officiating.overtime.start(next, rulingContext(env, next));
  if (step.state !== null) next.overtime = step.state;
  if (step.next === 'toss') { next.phase = 'overtime_toss'; return next; }
  if (step.restart === null) fail(state, e, `overtime start answered ${step.next} with no restart`);
  next = withRestart(env, next, step.restart);
  next.phase = restPhase(next, false);
  return next;
}

function onPeriodEnded(env: FlowEnv, state: GameState, e: EventOf<'period_ended'>): GameState {
  if (e.period !== state.period) fail(state, e, `names period ${e.period}, the game is in period ${state.period}`);
  if (state.pendingDecisions.length > 0) fail(state, e, 'with a decision pending');
  if (state.phase === 'dead_ball') {
    // Only an overtime period without a clock ends here, by the overtime rule (J11.8.2).
    if (e.next !== 'overtime' || state.overtime === null) fail(state, e, 'outside overtime');
    return enterOvertimePeriod(env, state, e);
  }
  const t = env.officiating.clock.endOfPeriod(state, env);
  if (t.next !== e.next) fail(state, e, `says ${e.next}, the rule set says ${t.next}`);
  if (t.next === 'final') return state;
  if (t.next === 'overtime') return enterOvertimePeriod(env, { ...state, drive: null }, e);
  let next = freshPeriod(state);
  next.clockTenths = regulationClockTenths(env);
  next.clockStatus = 'stopped_start_on_snap';
  next.playClockTenths = env.officiating.clock.playClockTenths('administrative', env);
  if (t.swapEnds) {
    const g = env.geometry;
    next.attackDir = [state.attackDir[1], state.attackDir[0]];
    next.ballX = mirrorX(g, state.ballX);
    next.ballY = mirrorY(g, state.ballY);
    next.lineToGainX = state.lineToGainX === null ? null : mirrorX(g, state.lineToGainX);
    next.seriesStartX = state.seriesStartX === null ? null : mirrorX(g, state.seriesStartX);
  }
  if (t.resetTimeouts) {
    const n = env.rules.num('timeout.per_half');
    next.timeoutsLeft = [n, n];
    next.insideTwoMinute = false;
  }
  if (!t.carryOverSeries) {
    if (state.toss === null) fail(state, e, 'no toss on record for the kickoff');
    next.drive = null;
    next = withRestart(env, next, env.officiating.restarts.kickoffSetup(state.toss.secondHalfKicker, 'kickoff', rulingContext(env, next)));
  }
  next.phase = restPhase(next, false);
  return next;
}

function onToss(env: FlowEnv, state: GameState, e: EventOf<'toss'>): GameState {
  if (state.pendingDecisions.length > 0) fail(state, e, 'with a decision pending');
  const out = tossOutcome(e.winner, e.choiceId, e.loserChoiceId);
  let next: GameState = { ...state, attackDir: out.attackDir ?? state.attackDir };
  if (state.phase === 'pre_game') {
    const firstHalfKicker = other(out.receiver);
    next.toss = { winner: e.winner, firstHalfKicker, secondHalfKicker: other(out.secondHalfReceiver) };
    next.clockStatus = 'stopped_start_on_snap';
    next = withRestart(env, next, env.officiating.restarts.kickoffSetup(firstHalfKicker, 'kickoff', rulingContext(env, next)));
    next.phase = 'kickoff_setup';
    return next;
  }
  next.overtime = { otPeriod: state.overtime?.otPeriod ?? 1, possessions: [], tossWinner: e.winner, firstPossession: out.receiver };
  const step = env.officiating.overtime.start(next, rulingContext(env, next));
  if (step.restart === null) fail(state, e, `overtime start answered ${step.next} with no restart after the toss`);
  if (step.state !== null) next.overtime = step.state;
  next = withRestart(env, next, step.restart);
  next.phase = restPhase(next, false);
  return next;
}

function reduce(env: FlowEnv, state: GameState, e: GameEvent): GameState {
  switch (e.type) {
    case 'game_started':
      if (state.clockStatus !== 'intermission') fail(state, e, 'twice');
      return { ...state, clockStatus: 'stopped_start_on_snap' };
    case 'toss': return onToss(env, state, e);
    case 'decision_requested': return onDecisionRequested(state, e);
    case 'decision_made': return onDecisionMade(env, state, e);
    case 'deadline_missed':
      if (!state.pendingDecisions.some((r) => r.requestId === e.requestId)) fail(state, e, `names no pending request (${e.requestId})`);
      return state;
    case 'clock_advanced': return onClockAdvanced(state, e);
    case 'timeout_charged': return onTimeoutCharged(env, state, e);
    case 'play_resolved':
      if (e.record.index !== state.playCounter + 1) fail(state, e, `record ${e.record.index} after play ${state.playCounter}`);
      return resolvePlay(env, state, e.record).state;
    case 'review_resolved': return onReviewResolved(state, e);
    case 'score_changed':
      if (e.scoreAfter[0] !== state.score[0] || e.scoreAfter[1] !== state.score[1]) fail(state, e, 'disagrees with the play record');
      return state;
    case 'substitution': return state;
    case 'drive_ended': return { ...state, drive: null, driveCounter: Math.max(state.driveCounter, e.drive.driveNumber) };
    case 'period_ended': return onPeriodEnded(env, state, e);
    case 'environment_updated': return { ...state, environment: e.environment };
    case 'game_final':
      if (e.score[0] !== state.score[0] || e.score[1] !== state.score[1]) fail(state, e, 'disagrees with the score');
      return { ...state, phase: 'final', pendingDecisions: [], playClockRunning: false, drive: null };
  }
}

/** The reducer of J11.1.1. Throws `FlowTransitionError` on a pair that is not in the transition table. */
export function applyEvent(env: FlowEnv, state: GameState, event: GameEvent): GameState {
  const row = transitionRow(state.phase, event.type);
  if (!row) throw new FlowTransitionError(state.phase, event.type, 'is not in the transition table');
  const next = reduce(env, state, event);
  if (!row.to.includes(next.phase)) throw new FlowTransitionError(state.phase, event.type, `led to ${next.phase}, which the table does not allow`);
  return next;
}

/** Folds an event list over a state: the replay of J11.1.1 and P5. */
export function replayEvents(env: FlowEnv, initial: GameState, events: readonly GameEvent[]): GameState {
  let s = initial;
  for (const e of events) s = applyEvent(env, s, e);
  return s;
}

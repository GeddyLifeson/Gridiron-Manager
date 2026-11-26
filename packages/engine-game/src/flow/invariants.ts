// State invariants of a game (Q1.2.2, last item: clock, down, distance and ball spot inside their
// legal ranges), plus the bookkeeping the flow itself promises. A reusable checker: tests run it
// after every transition, the phase 1 gate runs it over 10,000 games. Every bound is read from the
// rule set, the field geometry or the officiating facade; none is written here.
import type { Contract } from '@gm/engine-core';
import { TENTHS_PER_S } from './params.ts';
import { transitionRow, REQUEST_PHASES } from './table.ts';
import { isFreeKick, type FlowEnv, type GameState } from './situation.ts';

const isCount = (n: number) => Number.isInteger(n) && n >= 0;

/** Problems with one state, empty when it is consistent. */
export function stateInvariantProblems(env: FlowEnv, s: GameState): string[] {
  const out: string[] = [];
  const bad = (msg: string) => { out.push(`${msg} (phase ${s.phase}, play ${s.playCounter})`); };
  const g = env.geometry;
  const rules = env.rules;
  const regulationPeriods = rules.num('clock.periods');
  const overtime = s.period > regulationPeriods;

  // Clocks: integer tenths inside the period and the play clock (J11.1.1, J13.3.2).
  const periodTenths = (overtime ? rules.num('overtime.period_length_s') : rules.num('clock.period_length_s')) * TENTHS_PER_S;
  if (!isCount(s.clockTenths) || s.clockTenths > periodTenths) bad(`game clock ${s.clockTenths} outside 0 to ${periodTenths} tenths`);
  const playClockMax = Math.max(env.officiating.clock.playClockTenths('normal', env), env.officiating.clock.playClockTenths('administrative', env));
  if (!isCount(s.playClockTenths) || s.playClockTenths > playClockMax) bad(`play clock ${s.playClockTenths} outside 0 to ${playClockMax} tenths`);
  if (!isCount(s.elapsedTenths)) bad(`elapsed time ${s.elapsedTenths} is not a whole number of tenths`);
  if (s.clockStatus === 'untimed' && !overtime) bad('untimed clock in regulation');
  if (s.clockStatus === 'intermission' && s.phase !== 'pre_game') bad('intermission clock status after the game started');

  // Period and overtime.
  if (!Number.isInteger(s.period) || s.period < 1) bad(`period ${s.period}`);
  if (s.overtime !== null && !overtime) bad('overtime state in regulation');
  if (s.scoreByPeriod.length !== s.period) bad(`score by period has ${s.scoreByPeriod.length} rows in period ${s.period}`);

  // Down, distance and spot.
  const scrimmage = s.nextPlayKind === 'scrimmage';
  if (scrimmage) {
    const downs = rules.num('series.downs');
    if (s.down === null || !Number.isInteger(s.down) || s.down < 1 || s.down > downs) bad(`down ${s.down} outside 1 to ${downs}`);
    if (s.lineToGainX === null || s.seriesStartX === null) bad('scrimmage down with no line to gain or series start');
    else {
      if (s.lineToGainX < g.goalLineWestX || s.lineToGainX > g.goalLineEastX) bad(`line to gain ${s.lineToGainX} outside the goal lines`);
      if ((s.lineToGainX - s.seriesStartX) * s.attackDir[s.possession] < 0) bad('line to gain behind the start of the series');
    }
    if (s.ballX < g.goalLineWestX || s.ballX > g.goalLineEastX) bad(`ball x ${s.ballX} outside the goal lines on a scrimmage down`);
  } else if (s.down !== null || s.lineToGainX !== null) bad(`down or line to gain set on a ${s.nextPlayKind}`);
  if (!(s.ballX >= 0 && s.ballX <= g.lengthYd)) bad(`ball x ${s.ballX} outside the field`);
  if (!(s.ballY >= 0 && s.ballY <= g.widthYd)) bad(`ball y ${s.ballY} outside the field`);
  if (s.attackDir[0] !== -s.attackDir[1]) bad('both teams attack the same goal');

  // Score, timeouts, challenges.
  for (const side of [0, 1] as const) {
    if (!isCount(s.score[side])) bad(`score ${s.score[side]}`);
    if (!isCount(s.timeoutsLeft[side])) bad(`timeouts left ${s.timeoutsLeft[side]}`);
    if (!isCount(s.challengesUsed[side]) || s.challengesWon[side] > s.challengesUsed[side]) bad('challenges won exceed challenges used');
    const byPeriod = s.scoreByPeriod.reduce((sum, row) => sum + row[side], 0);
    if (byPeriod !== s.score[side]) bad(`score by period sums to ${byPeriod}, score is ${s.score[side]}`);
  }
  if (s.pendingRunoff !== null && s.phase !== 'dead_ball') bad('runoff pending outside the dead ball');

  // Decisions.
  const ids = new Set<number>();
  for (const r of s.pendingDecisions) {
    if (ids.has(r.requestId) || r.requestId >= s.nextRequestId) bad(`pending request id ${r.requestId}`);
    ids.add(r.requestId);
    if (r.defaultOptionId !== null && r.options.length > 0 && !r.options.some((o) => o.optionId === r.defaultOptionId)) bad(`request ${r.requestId}: default is not an option`);
    if (r.options.length > 0 && r.defaultOptionId === null) bad(`request ${r.requestId}: no default (J11.6.1)`);
    if (r.deadlinePlayClockTenths === null && r.windowTenths === null) bad(`request ${r.requestId}: no deadline (J11.6.1)`);
    if (!REQUEST_PHASES[r.type].includes(s.phase) && !(s.phase === 'challenge_window' && r.type === 'challenge') && !(s.phase === 'penalty_decision' && r.type === 'penalty_choice')) {
      bad(`request ${r.requestId} of type ${r.type} pending in the wrong phase`);
    }
  }

  // Phase-specific promises.
  if (s.toss === null && s.phase !== 'pre_game') bad('no toss on record after the pre-game');
  if (s.phase === 'final' && s.pendingDecisions.length > 0) bad('decision pending after the final whistle');
  if (s.phase === 'kickoff_setup' && !isFreeKick(s.nextPlayKind)) bad(`kickoff setup with a ${s.nextPlayKind} next`);
  if (s.phase === 'call_window' && isFreeKick(s.nextPlayKind)) bad('call window with a free kick next');
  if (s.phase === 'try_decision' && s.nextPlayKind !== 'try') bad('try decision with no try next');
  if ((s.phase === 'call_window' || s.phase === 'pre_snap') && !s.playClockRunning) bad('the play clock is not running before the snap (I2.1.2)');

  // Drive bookkeeping (J11.9.1).
  if (s.drive !== null) {
    if (s.drive.driveNumber !== s.driveCounter + 1) bad(`open drive ${s.drive.driveNumber} after ${s.driveCounter} finished drives`);
    if (s.drive.result !== 'in_progress') bad('open drive carries a result');
    if (!isCount(s.drive.plays) || !isCount(s.drive.clockUsedTenths)) bad('drive counts are not whole numbers');
  }
  return out;
}

/** Problems with one transition `next = apply(prev, event)`, empty when it is legal. */
export function transitionProblems(prev: GameState, event: Contract.GameEvent, next: GameState): string[] {
  const out: string[] = [];
  const row = transitionRow(prev.phase, event.type);
  if (!row) out.push(`(${prev.phase}, ${event.type}) is not in the transition table`);
  else if (!row.to.includes(next.phase)) out.push(`(${prev.phase}, ${event.type}) led to ${next.phase}`);
  if (next.elapsedTenths < prev.elapsedTenths) out.push('simulated time ran backwards');
  if (next.playCounter < prev.playCounter || next.playCounter > prev.playCounter + 1) out.push(`play counter went from ${prev.playCounter} to ${next.playCounter}`);
  if (next.nextRequestId < prev.nextRequestId) out.push('request ids went backwards');
  if (next.period < prev.period || next.period > prev.period + 1) out.push(`period went from ${prev.period} to ${next.period}`);
  // A play record may restore time: replay puts back what should not have run (J11.4.1 edge case, B9).
  if (event.type !== 'play_resolved' && next.period === prev.period && next.clockTenths > prev.clockTenths) out.push('the game clock gained time inside a period');
  if (next.driveCounter < prev.driveCounter) out.push('drive counter went backwards');
  for (const side of [0, 1] as const) {
    if (next.score[side] < prev.score[side]) out.push('a score went down');
    if (event.type !== 'period_ended' && next.timeoutsLeft[side] > prev.timeoutsLeft[side]) out.push('a timeout came back outside a period change');
  }
  if (prev.phase === 'final') out.push('an event after the final whistle');
  return out;
}

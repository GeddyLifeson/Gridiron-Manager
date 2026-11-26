// Clock state, timeout and challenge controls (I5.4.1, I5.5.1, I5.6.1, O2.4.1). The status and the
// next-start rule are the rule engine's; the arithmetic panel is the time a clock coach tracks: what the
// leading team can run off with kneel-downs, with and without the trailing team's timeouts.
import { param } from './params.ts';
import type { ClockView, ControlView, GameManagementInputs, GameManagementView, LiveGameInput, SideIndex } from './types.ts';

const other = (s: SideIndex): SideIndex => (s === 0 ? 1 : 0);

/** The last five minutes of a half (or any overtime period). */
export function inPanelWindow(live: LiveGameInput): boolean {
  const halfEnd = live.overtime || live.halfEndPeriods.includes(live.period);
  return halfEnd && live.clockTenths / 10 <= param('game_management.clock_panel_window_s');
}

/**
 * Seconds the side with the ball can run off with kneel-downs (I5.4.1). Each snap uses the play clock less
 * the snap delay, plus the kneel itself. The first gap runs only if the clock is running or starts on the
 * ready signal. Each stop the trailing team holds (timeouts, plus the two-minute warning when the clock will
 * cross it) removes the longest remaining gap.
 */
export function kneelBurn(live: LiveGameInput, kneels: number, stops: number): { burnS: number; burnAgainstS: number } {
  const snapLeft = param('game_management.snap_left_s');
  const play = param('game_management.kneel_play_s');
  const firstRuns = live.clockRunning || live.nextStart === 'ready';
  const gaps: number[] = [];
  for (let i = 0; i < kneels; i++) {
    if (i === 0) gaps.push(firstRuns ? Math.max(0, live.playClockTenths / 10 - snapLeft) : 0);
    else gaps.push(Math.max(0, live.playClockFullS - snapLeft));
  }
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  const burnS = kneels * play + sum(gaps);
  const kept = [...gaps].sort((a, b) => b - a).slice(Math.min(stops, gaps.length));
  return { burnS, burnAgainstS: kneels * play + sum(kept) };
}

export function buildClock(live: LiveGameInput): ClockView {
  const own = live.ownSide, opp = other(own);
  const base = {
    clockTenths: live.clockTenths,
    playClockTenths: live.playClockTenths,
    status: live.clockRunning ? 'running' as const : 'stopped' as const,
    startsOn: live.clockRunning ? null : live.nextStart,
    timeoutsOwn: live.timeoutsLeft[own],
    timeoutsOpp: live.timeoutsLeft[opp],
  };
  const diff = live.score[own] - live.score[opp];
  if (!inPanelWindow(live) || diff === 0 || live.possession === null || live.down === null) return { ...base, panel: null };
  const leaderSide: SideIndex = diff > 0 ? own : opp;
  if (live.possession !== leaderSide) return { ...base, panel: null }; // A-G61-5: the panel shows the run-off when the leader has the ball
  const kneels = Math.max(0, live.downsPerSeries - live.down + 1);
  const clockS = live.clockTenths / 10;
  const warning = live.twoMinuteWarningAhead && live.twoMinuteWarningS !== null && clockS > live.twoMinuteWarningS ? 1 : 0;
  const trailingTimeouts = live.timeoutsLeft[other(leaderSide)];
  const { burnS, burnAgainstS } = kneelBurn(live, kneels, trailingTimeouts + warning);
  const lastPeriod = live.overtime || live.period === Math.max(...live.halfEndPeriods);
  return {
    ...base,
    panel: {
      leader: leaderSide === own ? 'own' : 'opp',
      kneels,
      burnS,
      trailingTimeouts,
      burnAgainstTimeoutsS: burnAgainstS,
      kneelEndsGame: leaderSide === own && lastPeriod && burnAgainstS >= clockS,
    },
  };
}

/** Timeout and challenge controls: always visible to the head coach with counts, dimmed with the engine's reason (O2.4.1). */
export function buildControls(inputs: GameManagementInputs): Pick<GameManagementView, 'timeout' | 'challenge'> {
  const { controls: c, live, coach } = inputs;
  if (coach.seat !== 'head_coach') return { timeout: null, challenge: null }; // coordinators ask for timeouts (S5.4.1): a request command
  const setting = coach.certified ? 'on' : coach.guards;
  const holdable = setting !== 'off' && live.playClockTenths / 10 >= param('game_management.guard_min_play_clock_s');
  const lateHalf = (live.overtime || live.halfEndPeriods.includes(live.period)) && live.clockTenths / 10 <= param('game_management.late_timeout_window_s');
  const timeout: ControlView = {
    enabled: c.timeout.allowed && !c.timeout.pending,
    reasonKey: c.timeout.pending ? 'game_management.timeout.pending' : c.timeout.allowed ? null : c.timeout.refusedKey,
    count: live.timeoutsLeft[live.ownSide],
    guarded: holdable && setting === 'on' && lateHalf,
  };
  return {
    timeout,
    challenge: {
      enabled: c.challenge.allowed && c.challenge.aspects.length > 0,
      reasonKey: c.challenge.allowed ? (c.challenge.aspects.length > 0 ? null : 'game_management.challenge.nothing_reviewable') : c.challenge.refusedKey,
      count: c.challenge.left,
      guarded: holdable,
      aspects: c.challenge.aspects,
      windowS: c.challenge.windowS,
      byTimeout: c.challenge.byTimeout,
    },
  };
}

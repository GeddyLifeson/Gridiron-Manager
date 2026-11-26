// Game day through the G-60 console: the user's side is called only by keys through the live key map, the other
// side by the calibration chart caller, on the real engine and rule set of the level. The coach's picks come
// from a seeded stream, so every seed calls a different game. After the game the event log and final state are
// checked: schema validity, score steps, timeouts per half, downs, ties, the play clock and the end of the game.
import { gameCallingCommands as gc } from '@gm/app-services';
import { seedFromHex, stream } from '@gm/engine-core';
import { realGame, calibration } from '@gm/headless';
import { GameEvent, GameState, type Side } from '@gm/schema';
import { OWNERS } from '../owners.ts';
import type { Recorder } from '../recorder.ts';
import { consoleConfig, resolveKey } from '../sheets.ts';

const KEY_MS = 250; // virtual ms per key press: a named playtest assumption, not a measured value
const LIVE_MS = 6000; // virtual ms from a committed call to the next dead ball: a named playtest assumption
const LEGAL_SCORE_STEPS: ReadonlySet<number> = new Set([1, 2, 3, 6]);

export interface GameDayResult { readonly final: boolean; readonly plays: number; readonly score: readonly [number, number]; readonly userSide: Side; readonly steps: number }

export function playGameDay(rec: Recorder, ruleSetId: string, seedHex: string, gameIndex: number, maxSteps: number): GameDayResult {
  const rg = realGame.createRealGame(ruleSetId);
  const input = rg.input(gameIndex, seedHex);
  const deps = rg.deps(input);
  const pick = stream(seedFromHex(seedHex), 'playtest', ['game_day', gameIndex]);
  const userSide: Side = pick.uniform() < 0.5 ? 0 : 1;
  const roster = calibration.depthRoster(input.teams[userSide].depth);
  const session = new gc.GameCallingSession({
    input, deps, userSide, console: consoleConfig(ruleSetId), lineup: (unit) => roster(unit, null), resolve: resolveKey,
    keyIntervalMs: KEY_MS, startMs: 0, liveMs: () => LIVE_MS, bookLine: () => null,
  });
  const area = 'game_day';
  session.start();

  let lastOpen = -1;
  let sameOpen = 0;
  let steps = 0;
  let timeoutsTried = 0;
  for (; steps < maxSteps && !session.final; steps++) {
    const s = session.driver.state;
    if (session.holding) { session.wait(LIVE_MS); continue; }
    const p = session.pending;
    if (p?.late) { session.wait(1000); continue; }
    if (!p || !s.open) {
      rec.add('stuck', area, 'console.no_open_request', 'The session waits with no request open and the game is not over.', OWNERS.console, { ruleSetId, period: session.game.period, phase: session.game.phase });
      break;
    }
    const id = p.request.requestId;
    if (id === lastOpen) {
      sameOpen++;
      if (sameOpen > 200) {
        rec.add('stuck', area, `console.request_never_answered:${p.request.type}`, `Request ${p.request.type} stayed open through 200 console steps.`, OWNERS.console, { ruleSetId, step: s.step, unit: s.open.unit, notice: s.notice });
        break;
      }
      if (sameOpen > 3) { session.settle(); continue; }
    } else { sameOpen = 0; lastOpen = id; }
    if (s.step === 'prompt') { session.press(p.request.type === 'challenge' ? 'Digit1' : 'Enter'); continue; }
    if (s.step === 'fourth') {
      const toGoal = s.open.situation.toGoal;
      session.press(toGoal <= 35 ? 'Digit3' : pick.uniform() < 0.15 ? 'Digit1' : 'Digit2');
      continue;
    }
    if (s.step !== 'select') { session.settle(); continue; }
    if (s.notice === 'console.queuedReady' && s.selected) { session.press('Enter'); session.settle(); continue; }
    if (p.preview && s.open.unit === 'offense' && timeoutsTried < 2 && session.game.period === 2 && s.open.insideTwoMinute) {
      session.press('Hold+KeyT'); timeoutsTried++; continue;
    }
    const sheet = s.cfg.sheets[s.open.unit];
    const b = sheet?.boxes.find((x) => x.id === s.focus.boxId);
    const count = Math.min(b?.entries.length ?? 0, 9);
    if (count === 0) {
      rec.add('invalid', area, `console.empty_box:${s.open.unit}:${s.focus.boxId}`, `The console focused an empty box (${s.open.unit} ${s.focus.boxId}).`, OWNERS.console);
      session.settle(); continue;
    }
    session.press(`Digit${1 + Math.floor(pick.uniform() * count)}`);
    if (!session.driver.state.open) continue;
    session.press('Enter');
    session.settle();
  }

  if (!session.final && steps >= maxSteps) {
    rec.add('stuck', area, 'console.step_guard', `The game did not finish in ${maxSteps} console steps.`, OWNERS.console, { ruleSetId, period: session.game.period, phase: session.game.phase, plays: session.game.playCounter });
  }
  checkGame(rec, session, ruleSetId, userSide, deps.rules.num('timeout.per_half'));
  const score = session.game.score as [number, number];
  return { final: session.final, plays: session.game.playCounter, score: [score[0], score[1]], userSide, steps };
}

/** The post-game checks; exported so a test can plant faults and see each one caught. */
export interface CheckedGame { readonly game: gc.GameCallingSession['game']; readonly events: readonly gc.GameCallingSession['events'][number][]; readonly final: boolean }

export function checkGame(rec: Recorder, session: CheckedGame, ruleSetId: string, userSide: Side, perHalf: number): void {
  const area = 'game_day';
  const st = GameState.safeParse(session.game);
  if (!st.success) rec.add('invalid', area, 'state.schema', `Final game state fails its schema: ${st.error.issues[0]?.path.join('.')} ${st.error.issues[0]?.message}`, OWNERS.engine, { ruleSetId });
  let prev: [number, number] = [0, 0];
  let half = 1;
  const used: [number, number] = [0, 0];
  let finals = 0;
  let period = 1;
  for (const e of session.events) {
    const ok = GameEvent.safeParse(e);
    if (!ok.success) rec.add('invalid', area, `event.schema:${e.type}`, `A ${e.type} event fails its schema: ${ok.error.issues[0]?.path.join('.')} ${ok.error.issues[0]?.message}`, OWNERS.engine, { ruleSetId });
    if (e.type === 'score_changed') {
      const after = e.scoreAfter as [number, number];
      for (const side of [0, 1] as const) {
        const d = after[side] - prev[side];
        if (d < 0) rec.add('rule', area, 'score.decreased', 'A team score went down.', OWNERS.engine, { ruleSetId, before: prev, after });
        if (d > 0 && !LEGAL_SCORE_STEPS.has(d)) rec.add('rule', area, `score.illegal_step:${d}`, `A score changed by ${d}, which no scoring play gives.`, OWNERS.engine, { ruleSetId, before: prev, after });
      }
      prev = [after[0], after[1]];
    }
    if (e.type === 'timeout_charged' && e.side !== null && e.kind === 'team' && period <= 4) {
      used[e.side]++;
      if (used[e.side] > perHalf) rec.add('rule', area, 'timeouts.over_half_limit', `A team was charged timeout ${used[e.side]} in one half (limit ${perHalf}).`, OWNERS.engine, { ruleSetId, side: e.side, half });
    }
    if (e.type === 'period_ended') {
      period = e.period + 1;
      if (e.next === 'halftime') { half = 2; used[0] = 0; used[1] = 0; }
    }
    if (e.type === 'play_resolved') {
      const sit = e.record.situation;
      if (sit.down !== null && (sit.down < 1 || sit.down > 4)) rec.add('rule', area, 'down.out_of_range', `A snap was on down ${sit.down}.`, OWNERS.engine, { ruleSetId });
    }
    if (e.type === 'decision_made') {
      const d = e.decision;
      if (d.side === userSide && d.actor.kind === 'user' && d.acceptedAtPlayClockTenths !== null && d.acceptedAtPlayClockTenths < 0) {
        rec.add('rule', area, 'play_clock.negative_accept', 'A user call was accepted after the play clock ran out.', OWNERS.console, { ruleSetId });
      }
    }
    if (e.type === 'game_final') {
      finals++;
      if (e.tie && ruleSetId.startsWith('college')) rec.add('rule', area, 'college.tie', 'A college game ended in a tie; college overtime has no ties.', OWNERS.engine, { ruleSetId, score: e.score });
      if (e.score[0] !== prev[0] || e.score[1] !== prev[1]) rec.add('invalid', area, 'final.score_mismatch', 'The final score differs from the last score change.', OWNERS.engine, { ruleSetId, final: e.score, last: prev });
    }
  }
  if (session.final && finals !== 1) rec.add('invalid', area, 'final.count', `The game ended with ${finals} game_final events.`, OWNERS.engine, { ruleSetId });
  const plays = session.game.playCounter;
  const [lo, hi] = ruleSetId.startsWith('college') ? [100, 260] : [100, 220];
  if (session.final && (plays < lo || plays > hi)) rec.add('note', area, 'plays.out_of_band', `A ${ruleSetId} game ran ${plays} plays (playtest band ${lo} to ${hi}, an assumption).`, OWNERS.engine, { ruleSetId, plays });
  const userCalls = session.events.filter((e) => e.type === 'decision_made' && e.decision.side === userSide && e.decision.actor.kind === 'user').length;
  if (session.final && userCalls < 30) rec.add('invalid', area, 'console.few_user_calls', `Only ${userCalls} of the user's decisions reached the engine as user calls; the console is not calling the game.`, OWNERS.console, { ruleSetId, userCalls });
  const missed = session.events.filter((e) => e.type === 'deadline_missed').length;
  if (missed > 0) rec.add('note', area, 'console.deadlines_missed', `The scripted coach missed ${missed} call deadlines (default calls played).`, OWNERS.console, { ruleSetId, missed });
}

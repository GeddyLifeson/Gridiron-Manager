// Game-day target: one game on the G-60 calling console, on the real engine and rule set of the level. The rig
// mixes a careful coach's answers with key mashing (every bound chord and some unbound ones), rapid bursts,
// presses while a play is still running, timeout spam, odd waits (zero, negative, NaN, an hour) and presses
// after the final whistle. After every step the game state must still be a legal football state, and the
// game's event log is checked at the end with the playtest's full game check.
import { gameCallingCommands as gc } from '@gm/app-services';
import { seedFromHex, stateHash, stream } from '@gm/engine-core';
import { calibration, realGame } from '@gm/headless';
import { GameEvent, GameState, type Side } from '@gm/schema';
import { Recorder } from '../../playtest/recorder.ts';
import { checkGame } from '../../playtest/stages/game-day.ts';
import { BINDINGS, consoleConfig, resolveKey } from '../../playtest/sheets.ts';
import type { Action, BreakTarget, Mode, Outcome, Rnd, Violation } from '../types.ts';

const OWNER = 'G-60 game-day console (app-services commands/game-calling); engine rulings to "Fix engine bugs from module testing"';
const KEY_MS = 250;
const LIVE_MS = 6000;
const FINISH_STEPS = 40_000;
const JUNK_KEYS = ['', 'F13', 'Digit0', 'Escape', 'Ctrl+Alt+Delete', 'Shift+Shift', 'KeyZ', 'Hold+Hold+KeyT', 'Space', 'Tab', 'Hold+', '+'];

export class GameDayTarget implements BreakTarget {
  readonly name: string;
  readonly owner = OWNER;
  private session: gc.GameCallingSession | null = null;
  private userSide: Side = 0;
  private perHalf = 3;
  private periodTenths = 9000;
  private seenEvents = 0;
  private last: { score: [number, number]; period: number; plays: number; elapsed: number } | null = null;
  private allKeys: string[] = [];
  private seedHex = '';

  constructor(private readonly ruleSetId: string) { this.name = `game-day:${ruleSetId}`; }

  private get s(): gc.GameCallingSession { if (!this.session) throw new Error('no game'); return this.session; }

  async reset(seedHex: string): Promise<void> {
    this.seedHex = seedHex;
    const rg = realGame.createRealGame(this.ruleSetId);
    const input = rg.input(1, seedHex);
    const deps = rg.deps(input);
    const pick = stream(seedFromHex(seedHex), 'breaktest', ['game_day', 'side']);
    this.userSide = pick.uniform() < 0.5 ? 0 : 1;
    this.perHalf = deps.rules.num('timeout.per_half');
    this.periodTenths = deps.rules.num('clock.period_length_s') * 10;
    const roster = calibration.depthRoster(input.teams[this.userSide].depth);
    this.session = new gc.GameCallingSession({
      input, deps, userSide: this.userSide, console: consoleConfig(this.ruleSetId), lineup: (unit) => roster(unit, null), resolve: resolveKey,
      keyIntervalMs: KEY_MS, startMs: 0, liveMs: () => LIVE_MS, bookLine: () => null,
    });
    this.allKeys = [...new Set(BINDINGS.flatMap((b) => b.keys))].sort();
    this.seenEvents = 0;
    this.last = null;
    this.session.start();
  }

  propose(mode: Mode, r: Rnd): Action {
    switch (mode) {
      case 'legal': return { kind: 'coach', mode, args: { roll: r.uniform() } };
      case 'hostile': return { kind: 'press', mode, args: { key: r.chance(0.8) ? r.pick(this.allKeys) : r.pick(JUNK_KEYS) } };
      case 'boundary': return r.chance(0.5)
        ? { kind: 'wait', mode, args: { ms: r.pick([0, -1, -60_000, NaN, Infinity, 1, 59_999, 3_600_000]) } }
        : { kind: 'settle', mode, args: { stepMs: r.pick([0, -100, 1, 100_000, NaN]) } };
      case 'out_of_order': return r.chance(0.5)
        ? { kind: 'burst', mode, args: { keys: Array.from({ length: r.int(5, 30) }, () => r.pick(this.allKeys)) } }
        : { kind: 'burst', mode, args: { keys: Array.from({ length: r.int(3, 8) }, () => 'Hold+KeyT') } };
    }
  }

  expect(): undefined { return undefined; }

  async apply(a: Action): Promise<Outcome> {
    const s = this.s;
    const wasFinal = s.final;
    const before = wasFinal ? this.hash() : '';
    switch (a.kind) {
      case 'coach': this.coach(a.args['roll'] as number); break;
      case 'press': s.press(a.args['key'] as string); break;
      case 'burst': s.pressAll(a.args['keys'] as string[]); break;
      case 'wait': s.wait(a.args['ms'] as number); break;
      case 'settle': s.driver.settle(a.args['stepMs'] as number); s.wait(0); break; // the host's raw frame step, then the session catches up
      default: return { accepted: false, reason: `unknown action ${a.kind}` };
    }
    if (wasFinal && this.hash() !== before) return { accepted: true, note: 'state changed after the final whistle' };
    return { accepted: true };
  }

  /** One careful answer to whatever the console has open (the playtest's coach, one step). */
  private coach(roll: number): void {
    const s = this.s;
    if (s.final) return;
    if (s.holding) { s.wait(LIVE_MS); return; }
    const p = s.pending;
    const st = s.driver.state;
    if (p?.late || !p || !st.open) { s.wait(1000); return; }
    if (st.step === 'prompt') { s.press(p.request.type === 'challenge' ? 'Digit1' : 'Enter'); return; }
    if (st.step === 'fourth') { s.press(st.open.situation.toGoal <= 35 ? 'Digit3' : roll < 0.15 ? 'Digit1' : 'Digit2'); return; }
    if (st.step !== 'select') { s.settle(); return; }
    if (st.notice === 'console.queuedReady' && st.selected) { s.press('Enter'); s.settle(); return; }
    const sheet = st.cfg.sheets[st.open.unit];
    const b = sheet?.boxes.find((x) => x.id === st.focus.boxId);
    const count = Math.min(b?.entries.length ?? 0, 9);
    if (count === 0) { s.settle(); return; }
    s.press(`Digit${1 + Math.floor(roll * count)}`);
    if (!s.driver.state.open) return;
    s.press('Enter');
    s.settle();
  }

  invariants(): Violation[] {
    const s = this.s;
    const g = s.game;
    const out: Violation[] = [];
    const ok = GameState.safeParse(g);
    if (!ok.success) out.push({ code: `state.schema:${ok.error.issues[0]?.path.join('.')}`, message: `The game state fails its schema: ${ok.error.issues[0]?.path.join('.')} ${ok.error.issues[0]?.message}` });
    if (g.down !== null && (g.down < 1 || g.down > 4)) out.push({ code: 'state.down_range', message: `Down ${g.down} is outside 1 to 4.` });
    if (g.clockTenths < 0 || g.clockTenths > this.periodTenths) out.push({ code: 'state.clock_range', message: `Game clock ${g.clockTenths} tenths is outside one period.`, detail: { period: g.period } });
    if (g.playClockTenths < 0) out.push({ code: 'state.play_clock_negative', message: 'The play clock is below zero.' });
    for (const side of [0, 1] as const) {
      if (g.timeoutsLeft[side] < 0 || g.timeoutsLeft[side] > this.perHalf) out.push({ code: 'state.timeouts_range', message: `Side ${side} has ${g.timeoutsLeft[side]} timeouts left (per half ${this.perHalf}).` });
    }
    if (!Number.isFinite(g.ballX) || !Number.isFinite(g.ballY)) out.push({ code: 'state.ball_not_finite', message: 'The ball spot is not a finite number.' });
    const periodSum: [number, number] = [0, 0];
    for (const p of g.scoreByPeriod) { periodSum[0] += p[0]; periodSum[1] += p[1]; }
    if (g.scoreByPeriod.length > 0 && (periodSum[0] !== g.score[0] || periodSum[1] !== g.score[1])) out.push({ code: 'state.score_by_period_sum', message: 'Score by period does not add up to the score (box score versus scoreboard).', detail: { score: g.score, byPeriod: periodSum } });
    if (this.last) {
      if (g.score[0] < this.last.score[0] || g.score[1] < this.last.score[1]) out.push({ code: 'state.score_went_down', message: 'A score went down between two console steps.' });
      if (g.period < this.last.period) out.push({ code: 'state.period_went_back', message: 'The period went backwards.' });
      if (g.playCounter < this.last.plays) out.push({ code: 'state.plays_went_back', message: 'The play counter went backwards.' });
      if (g.elapsedTenths < this.last.elapsed) out.push({ code: 'state.time_went_back', message: 'Simulated time since kickoff went backwards.' });
    }
    this.last = { score: [g.score[0], g.score[1]], period: g.period, plays: g.playCounter, elapsed: g.elapsedTenths };
    for (; this.seenEvents < s.events.length; this.seenEvents++) {
      const e = s.events[this.seenEvents]!;
      const v = GameEvent.safeParse(e);
      if (!v.success) out.push({ code: `event.schema:${e.type}:${v.error.issues[0]?.path.join('.').replace(/\d+/g, 'N')}`, message: `A ${e.type} event fails its schema: ${v.error.issues[0]?.path.join('.')} ${v.error.issues[0]?.message}`, detail: { value: String(JSON.stringify(v.error.issues[0]?.path.reduce((o: any, k) => o?.[k], e))).slice(0, 200) } });
    }
    return out;
  }

  hash(): string { return stateHash(this.s.game as never); }

  /** Plays the game out with the careful coach, then runs the playtest's full event-log check. */
  async finish(): Promise<Violation[]> {
    const out: Violation[] = [];
    const s = this.s;
    let steps = 0;
    for (; steps < FINISH_STEPS && !s.final; steps++) this.coach((steps * 0.618) % 1);
    if (!s.final) out.push({ code: 'game.not_finished', message: `After the hostile run the game did not finish in ${FINISH_STEPS} careful coach steps: it is stuck.`, detail: { period: s.game.period, phase: s.game.phase, plays: s.game.playCounter } });
    const rec = new Recorder(this.seedHex);
    checkGame(rec, this.s, this.ruleSetId, this.userSide, this.perHalf);
    for (const f of rec.findings) if (f.kind !== 'note') out.push({ code: `game.${f.code}`, message: f.message });
    return out;
  }

  unreachable() { return []; }

  async close(): Promise<void> { this.session = null; }
}

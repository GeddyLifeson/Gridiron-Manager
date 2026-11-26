// The console's game session: the bridge between the game flow's pending requests and the console (J11.6.1,
// I2.1.1, I3.1.1, O2.4). The flow is stepped with `advance`: it stops at each request for the user's team, the
// console opens on it, and the console's commands become the answers. The other team answers through its own
// decider (coach AI, or the chart caller in tests).
//
// Order per snap (engine-game flow `timeoutWindow`, `unitPlay`): a `timeout` request for each side that may
// call one, then the two call requests. The user's console opens on the coming call while the timeout request
// is pending, so the clock the user sees is the clock the call is made against (I2.1.2): `T` answers the
// timeout request with a timeout at the current reading; a confirmed call answers it "none" and then answers
// the call request with the call and the play-clock reading at the confirm. If the other team calls a timeout
// in between, the held call is dropped and the console opens again on the new clock.
//
// Today the flow only takes a team timeout before the calls; a timeout after the call is made needs the engine
// change listed in the integrator requests (I2.1.3, O2.4.1). Nothing here reads the wall clock: the host moves
// the driver's `nowMs`.
import { flow } from '@gm/engine-game';
import { yardsToGoal, type Decider, type Decision, type DecisionRequest, type GameDeps, type GameEvent, type GameInput, type Side } from '@gm/schema';
import { openRequest, type ConsoleConfig, type ConsoleCommand, type OpenInput, type SentCall } from './console.ts';
import { callDecision, defaultDecision, optionDecision, type LineupFor } from './decision.ts';
import { ConsoleKeyDriver, type ConsoleKeyDriverOptions } from './driver.ts';
import { initialConsole } from './console.ts';
import type { SheetSituation } from './sheet.ts';

type GameState = ReturnType<typeof flow.newGame>;

export interface GameSessionOptions {
  readonly input: GameInput;
  /** The game's dependencies; the decider of the user's side is replaced by the console. */
  readonly deps: GameDeps;
  readonly userSide: Side;
  readonly console: ConsoleConfig;
  readonly lineup: LineupFor;
  readonly resolve: ConsoleKeyDriverOptions['resolve'];
  /** Virtual milliseconds per key press (a test assumption; a real host measures time). */
  readonly keyIntervalMs?: number;
  readonly startMs?: number;
  readonly flowOptions?: flow.FlowOptions;
  /** Personnel on the field before the first call (I3.1.1); later the last group the user sent. */
  readonly firstPersonnel?: string;
}

/** A request the console is open on. `preview` marks the timeout request standing in for the coming call. */
export interface PendingRequest {
  readonly request: DecisionRequest;
  readonly preview: boolean;
  readonly openedAtMs: number;
  readonly playClockTenths: number;
}

/** One answer the console gave, for the decision log (N3) and the tests. */
export interface SessionAnswer {
  readonly request: DecisionRequest;
  readonly decision: Decision;
  readonly openedAtMs: number;
  readonly playClockAtOpenTenths: number;
  /** The confirm moment for a call, else the moment of the key. */
  readonly atMs: number;
}

function snapPlay(kind: string): boolean { return kind === 'scrimmage' || kind === 'try'; }

export class GameCallingSession {
  game: GameState;
  readonly events: GameEvent[] = [];
  readonly answers: SessionAnswer[] = [];
  readonly driver: ConsoleKeyDriver;
  pending: PendingRequest | null = null;
  private resume: flow.FlowResume | null = null;
  private readonly deps: GameDeps;
  private readonly o: GameSessionOptions;
  private queued: Decision[] = [];
  private held: { call: SentCall; timeouts: number; confirmMs: number } | null = null;
  private defaultNext = false;
  private drained = 0;
  private personnel: string;
  private lastPlays = -1;

  constructor(o: GameSessionOptions) {
    this.o = o;
    this.personnel = o.firstPersonnel ?? '11';
    const user: Decider = {
      side: o.userSide,
      decide: (view) => {
        const q = this.queued[0];
        if (q && q.requestId === view.request.requestId) { this.queued.shift(); return q; }
        return null;
      },
    };
    const d = o.deps.deciders;
    this.deps = { ...o.deps, deciders: o.userSide === 0 ? [user, d[1]] : [d[0], user] };
    this.game = flow.newGame(o.input, this.deps);
    const start = { ...initialConsole(o.console), nowMs: o.startMs ?? 0 };
    this.driver = new ConsoleKeyDriver(start, { resolve: o.resolve, ...(o.keyIntervalMs === undefined ? {} : { keyIntervalMs: o.keyIntervalMs }) });
  }

  get final(): boolean { return this.game.phase === 'final'; }

  /** Runs the game to the first request for the user's team. */
  start(): void { this.step(); }

  press(key: string): void { this.driver.press(key); this.drain(); }
  pressAll(keys: readonly string[]): void { for (const k of keys) { if (this.final) return; this.press(k); } }
  wait(ms: number): void { this.driver.wait(ms); this.drain(); }
  settle(): void { this.driver.settle(); this.drain(); }

  private count(type: GameEvent['type'], pred: (e: GameEvent) => boolean = () => true): number {
    return this.events.reduce((n, e) => n + (e.type === type && pred(e) ? 1 : 0), 0);
  }

  private timeoutsCharged(): number { return this.count('timeout_charged'); }

  /** Steps the flow until it waits on the user's team or the game is final. */
  private step(): void {
    for (let guard = 0; guard < 100_000; guard++) {
      const r = flow.advance(this.game, this.o.input, this.deps, this.o.flowOptions ?? {}, this.resume);
      this.events.push(...r.events);
      this.game = r.state;
      this.resume = r.resume;
      if (r.resume === null) { this.pending = null; this.driver.state = { ...this.driver.state, open: null, step: 'idle' }; return; }
      const req = this.waiting();
      if (!req) throw new Error('game session: the flow stopped with no request for the user team');
      // Integrator stopgap (PR 144 with PR 146): the flow now also asks for a timeout after the calls, up to the snap.
      // The console has no window for it yet, so it is answered "none" here instead of opening as a coming call.
      if (req.type === 'timeout' && this.callsAreIn()) {
        this.queue(req, optionDecision(req, flow.OPT.none, this.game.playClockTenths), this.driver.nowMs);
        continue;
      }
      if ((req.type === 'snapping_call' || req.type === 'opposing_call') && this.defaultNext) {
        this.defaultNext = false;
        this.queue(req, defaultDecision(req), this.driver.nowMs);
        continue;
      }
      if ((req.type === 'snapping_call' || req.type === 'opposing_call') && this.held) {
        const h = this.held;
        this.held = null;
        if (h.timeouts === this.timeoutsCharged()) {
          const d = callDecision(req, h.call, this.o.lineup);
          if (d.snappingCall?.unit === 'offense') this.personnel = d.snappingCall.personnelCode;
          this.queue(req, d, h.confirmMs);
          continue;
        }
      }
      this.open(req);
      return;
    }
    throw new Error('game session: no stop after many units');
  }

  /** True when the user's call for the coming play is already answered (no play resolved since). */
  private callsAreIn(): boolean {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i]!;
      if (e.type === 'play_resolved' || e.type === 'timeout_charged') return false;
      if (e.type === 'decision_made' && e.decision.side === this.o.userSide && (e.decision.type === 'snapping_call' || e.decision.type === 'opposing_call')) return true;
    }
    return false;
  }

  /** The newest request for the user's team with no answer yet. */
  private waiting(): DecisionRequest | null {
    const answered = new Set<number>();
    for (const e of this.events) if (e.type === 'decision_made') answered.add(e.decision.requestId);
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i]!;
      if (e.type === 'decision_requested' && e.request.side === this.o.userSide && !answered.has(e.request.requestId)) return e.request;
    }
    return null;
  }

  private queue(request: DecisionRequest, decision: Decision, atMs: number): void {
    const p = this.pending;
    this.answers.push({ request, decision, atMs, openedAtMs: p?.openedAtMs ?? atMs, playClockAtOpenTenths: p?.playClockTenths ?? this.game.playClockTenths });
    this.queued.push(decision);
  }

  private lastTryChoice(): string | null {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i]!;
      if (e.type === 'decision_made' && e.decision.type === 'try_choice') return e.decision.optionId;
    }
    return null;
  }

  private open(req: DecisionRequest): void {
    const s = flow.situationOf(this.deps, this.game);
    const userOffense = s.offense === this.o.userSide;
    const atMs = this.driver.nowMs;
    const clock = this.game.playClockTenths;
    const preview = req.type === 'timeout';
    const callType = userOffense ? 'snapping_call' : 'opposing_call';
    const request: DecisionRequest = preview
      ? { ...req, type: callType, options: [], defaultOptionId: null, windowTenths: null, deadlinePlayClockTenths: Math.min(clock, flow.flowParam(this.deps, 'callDeadlinePlayClockTenths')) }
      : req;
    let kind: OpenInput['kind'] = 'option';
    let kickKind: string | null = null;
    if (request.type === 'snapping_call' || request.type === 'opposing_call') {
      if (!snapPlay(s.playKind)) { kind = userOffense ? 'own_kick' : 'opponent_kick'; kickKind = userOffense ? s.playKind : 'kick_return'; }
      else if (s.playKind === 'try' && userOffense && this.lastTryChoice() === flow.OPT.tryKick) { kind = 'own_kick'; kickKind = 'try_kick'; }
      else kind = s.playKind === 'scrimmage' && s.down === 4 ? 'fourth_down' : 'scrimmage';
    }
    const plays = this.count('play_resolved');
    const sinceLastPlay = (() => { for (let i = this.events.length - 1; i >= 0; i--) { const t = this.events[i]!.type; if (t === 'play_resolved') return false; if (t === 'timeout_charged') return true; } return false; })();
    const toGoal = Math.round(yardsToGoal(this.deps.geometry, s.ballX, s.attackDir));
    const situation: SheetSituation = {
      down: s.down, distance: s.distanceYd === null ? null : Math.round(s.distanceYd), toGoal, twoMinute: s.insideTwoMinute, lastPlayOfHalf: false,
      scoreDiff: s.score[this.o.userSide] - s.score[this.o.userSide === 0 ? 1 : 0], personnel: null, suddenChange: false, noHuddle: false,
    };
    const input: OpenInput = {
      request, situation, kind, kickKind, playClockTenths: clock, atMs, personnelOnField: this.personnel, insideTwoMinute: s.insideTwoMinute,
      legal: { timeout: preview, challenge: req.type === 'challenge' },
      timeoutReason: preview ? null : 'console.timeoutNotLegal', challengeReason: req.type === 'challenge' ? null : 'console.challengeNotLegal',
      // The defensive marker needs the offense's set time; the flow's call deadline is the latest it can be (assumption).
      offenseSetTenths: request.deadlinePlayClockTenths ?? 0,
      afterTimeout: sinceLastPlay, suggestion: null, sameDeadBall: plays === this.lastPlays,
    };
    this.lastPlays = plays;
    this.pending = { request: req, preview, openedAtMs: atMs, playClockTenths: clock };
    this.driver.state = openRequest(this.driver.state, input);
    this.driver.wait(0);
  }

  /** Turns the console's new commands into answers and steps the flow on. */
  private drain(): void {
    while (this.drained < this.driver.commands.length) {
      const c = this.driver.commands[this.drained++]!;
      if (this.answer(c)) this.step();
    }
  }

  private answer(c: ConsoleCommand): boolean {
    const p = this.pending;
    if (!p) return false;
    const req = p.request;
    const now = this.driver.nowMs;
    switch (c.type) {
      case 'call.commit': {
        const confirmMs = p.openedAtMs + (p.playClockTenths - c.call.acceptedAtPlayClockTenths) * 100;
        if (p.preview) {
          this.queue(req, optionDecision(req, flow.OPT.none, c.call.acceptedAtPlayClockTenths), confirmMs);
          this.held = { call: c.call, timeouts: this.timeoutsCharged(), confirmMs };
        } else {
          const d = callDecision(req, c.call, this.o.lineup);
          if (d.snappingCall?.unit === 'offense') this.personnel = d.snappingCall.personnelCode;
          this.queue(req, d, confirmMs);
        }
        break;
      }
      case 'option.send': this.queue(req, optionDecision(req, c.optionId, c.acceptedAtPlayClockTenths), now); break;
      case 'deadline.default':
        if (p.preview) { this.queue(req, defaultDecision(req), now); this.defaultNext = true; }
        else this.queue(req, defaultDecision(req), now);
        break;
      case 'timeout':
        if (!p.preview) return false;
        this.held = null;
        this.queue(req, optionDecision(req, flow.OPT.timeout, c.atPlayClockTenths), now);
        break;
      case 'challenge': {
        const aspect = req.type === 'challenge' ? req.options.find((o) => o.optionId !== flow.OPT.none) : undefined;
        if (!aspect) return false;
        this.queue(req, optionDecision(req, aspect.optionId, c.atPlayClockTenths), now);
        break;
      }
      default: return false;
    }
    this.pending = null;
    return true;
  }
}

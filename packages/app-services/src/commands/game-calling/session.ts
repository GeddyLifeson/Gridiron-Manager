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
//
// With a staff (`staff` option, plans/head-coach-nuance.md item 2b) the user's side is the K6 staff decider: each
// coordinator calls his own unit and the head coach keeps game management, unless he says otherwise before the game
// (`keep`) or at a dead ball (`takeOver`, `handBack`; Marlon 2026-11-26 19:15 UTC). The console opens only on what he
// holds. With `watch` the staff's snaps are paced for watching (I9.4.1): each play runs out on screen at real or
// double speed, or is summarised, and the game halts on his stop rules until he goes on (`resumeWatch`).
import { flow } from '@gm/engine-game';
import { staff as staffAi } from '@gm/coach-ai';
import { yardsToGoal, type Decider, type Decision, type DecisionRequest, type GameDeps, type GameEvent, type GameInput, type GameSituation, type PlayRecord, type Side } from '@gm/schema';
import { openRequest, playClockAt, type ConsoleConfig, type ConsoleCommand, type OpenInput, type SentCall } from './console.ts';
import { callDecision, defaultDecision, optionDecision, type LineupFor } from './decision.ts';
import { ConsoleKeyDriver, type ConsoleKeyDriverOptions } from './driver.ts';
import { initialConsole } from './console.ts';
import type { SheetEntry, SheetSituation, Unit } from './sheet.ts';
import { addInGameCall } from './in-game.ts';
import { DEFAULT_KEEP, SEAT_UNITS, callerOf, chartKeeping, holderOf, unitOfDuty, type SeatStaff, type SeatUnit } from './staff-seat.ts';
import { defaultStopRules, stopAfterPlay, stopBeforeSnap, type StopRule, type WatchMode } from '../../read-models/film/watch.ts';

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
  /**
   * Real milliseconds from a committed call to the dead-ball record of the play it starts: relay, the snap, the
   * live play and the spot (I2.1.1 stages 3 to 6 and 1). The host knows it from the play viewer (G-63). While it
   * runs the console stays on the sent call, so the next-call queue can be filled (I2.3.6). Default 0.
   */
  readonly liveMs?: (record: PlayRecord | null) => number;
  /** The decision book's fourth-down line for the situation, shown on third down (I4.1.1, I1.4.2). */
  readonly bookLine?: (situation: GameSituation) => string | null;
  /** The head coach's staff. Without it the user calls every unit himself (the console-only session). */
  readonly staff?: SessionStaffOptions;
}

export interface SessionStaffOptions {
  readonly seat: SeatStaff;
  /** Units the head coach keeps from the start. Default: game management only (Marlon 2026-11-26 19:15 UTC). */
  readonly keep?: readonly SeatUnit[];
  /** Pace the staff's snaps for watching (I9.4.1). Without it the staff's snaps run straight to his next decision. */
  readonly watch?: WatchOptions;
}

export interface WatchOptions {
  readonly mode?: WatchMode;
  /** I9.4.1 stop rules; default `defaultStopRules()`. An empty list never halts. */
  readonly stopRules?: readonly StopRule[];
  /** Real milliseconds between one play's end on screen and the next snap in watch and double modes. Default 0. */
  readonly betweenPlaysMs?: number;
}

/** A unit changing hands during a game (I9.4.2 proposed, L4.1.2): the record the staff, the room and N3 read. */
export interface TakeoverEntry {
  readonly unit: SeatUnit;
  readonly to: 'user' | 'staff';
  /** The staff member the unit was taken from or handed to. */
  readonly coordinatorId: number | null;
  /** The next snap's play number: the change holds from that snap on. */
  readonly playNumber: number;
  readonly period: number;
  readonly clockTenths: number;
  readonly atMs: number;
}

/** Where watching stands: running out a play on screen, or halted on a stop rule until the user goes on. */
export interface WatchState {
  readonly mode: WatchMode;
  readonly untilMs: number;
  readonly paused: boolean;
  /** The stop rule kind that halted it, when paused. */
  readonly reason: StopRule['kind'] | null;
}

export type SimulateTarget = 'series' | 'half' | 'end';

/** A request the console is open on. `preview` marks the timeout request standing in for the coming call. */
export interface PendingRequest {
  readonly request: DecisionRequest;
  readonly preview: boolean;
  /** The flow's second timeout request, after the calls and before the snap (late timeout, I2.1.3, O2.4.1). */
  readonly late?: boolean;
  /** The head coach's fourth-down choice while a coordinator calls the offense (go, punt, field goal; I2.6.4). */
  readonly lastDown?: boolean;
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

/** The fourth-down prompt when the head coach keeps game management and a coordinator calls the offense. */
const LAST_DOWN_OPTIONS: DecisionRequest['options'] = [
  { optionId: 'go', labelKey: 'console.go' },
  { optionId: 'punt', labelKey: 'console.punt' },
  { optionId: 'field_goal', labelKey: 'console.fieldGoal' },
];

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
  private heldSnaps = 0;
  private lastOffense: Side | null = null;
  private deferred: DecisionRequest | null = null;
  private holdUntilMs = 0;
  /** Staff: the chart in force, the units the head coach holds now, the K6 decider and the takeover record. */
  private chart: staffAi.StaffChart | null = null;
  private readonly kept = new Set<SeatUnit>();
  private staffDecider: staffAi.StaffDecider | null = null;
  readonly takeovers: TakeoverEntry[] = [];
  /** Watching: the last play number allowed to run without a hold, the held request and its state. */
  private watchMode: WatchMode | null = null;
  private stopRules: readonly StopRule[] = [];
  private releasedPlay = 0;
  private heldReq: { requestId: number; playNumber: number } | null = null;
  watching: WatchState | null = null;
  /** The pace the staff's snaps are watched at, or null when they run straight through (I9.4.1). */
  get watchPace(): WatchMode | null { return this.watchMode; }
  private eventsAtHold = 0;
  private simTarget: { target: SimulateTarget; offense: Side; period: number } | null = null;
  private timeoutWanted = false;
  private readonly lastDowns = new Map<number, staffAi.LastDownChoice>();
  private readonly timedOutReqs = new Set<number>();

  constructor(o: GameSessionOptions) {
    this.o = o;
    this.personnel = o.firstPersonnel ?? '11';
    const queuedFor = (view: { request: DecisionRequest }): Decision | null => {
      const q = this.queued[0];
      if (q && q.requestId === view.request.requestId) { this.queued.shift(); return q; }
      return null;
    };
    let user: Decider = { side: o.userSide, decide: queuedFor };
    if (o.staff) {
      const seat = o.staff.seat;
      for (const u of o.staff.keep ?? DEFAULT_KEEP) this.kept.add(u);
      this.chart = chartKeeping(seat.chart, this.kept);
      const userSeat: staffAi.UserSeat = {
        decide: (view) => queuedFor(view) ?? this.seatAnswer(view),
        timedOut: (request) => this.timedOutReqs.has(request.requestId),
        lastDown: (view) => this.lastDowns.get(view.request.requestId) ?? null,
      };
      const dec = staffAi.createStaffDecider({
        side: o.userSide, chart: this.chart, chartNow: () => this.chart!, geometry: o.deps.geometry, lastDown: o.deps.rules.num('series.downs'),
        instructions: seat.instructions ?? [], caller: seat.caller, manager: seat.manager, user: userSeat, draws: (scope) => seat.draws(scope),
        ...(seat.sheets ? { sheets: seat.sheets } : {}), ...(seat.conservative ? { conservative: (v: staffAi.DecisionView) => seat.conservative!(v) } : {}),
      });
      this.staffDecider = dec;
      user = { side: o.userSide, decide: (view) => (this.holdFor(view) ? null : dec.decide(view)) };
      if (o.staff.watch) {
        this.watchMode = o.staff.watch.mode ?? 'watch';
        this.stopRules = o.staff.watch.stopRules ?? defaultStopRules();
      }
    }
    const d = o.deps.deciders;
    this.deps = { ...o.deps, deciders: o.userSide === 0 ? [user, d[1]] : [d[0], user] };
    this.game = flow.newGame(o.input, this.deps);
    const start = { ...initialConsole(o.console), nowMs: o.startMs ?? 0 };
    this.driver = new ConsoleKeyDriver(start, { resolve: o.resolve, ...(o.keyIntervalMs === undefined ? {} : { keyIntervalMs: o.keyIntervalMs }) });
  }

  get final(): boolean { return this.game.phase === 'final'; }

  /** The public situation of the next snap (scoreboard facts only, J1.6.1), for the console strip. */
  situation(): GameSituation { return flow.situationOf(this.deps, this.game); }

  /** The field geometry of this game, for the strip's spot and hash wording. */
  get geometry(): GameDeps['geometry'] { return this.deps.geometry; }

  /** The side the console calls for. */
  get userSide(): Side { return this.o.userSide; }

  /** The game's rule set (strip clock lengths, challenge counts). */
  get rules(): GameDeps['rules'] { return this.deps.rules; }

  /** The game's parameter table (the statistics module reads it for the play-by-play rows). */
  get params(): GameDeps['params'] { return this.deps.params; }

  /** The user's personnel group on the field now (I3.1.1). */
  get personnelOnField(): string { return this.personnel; }

  /** Runs the game to the first request for the user's team. */
  start(): void { this.step(); }

  /** True while the play the last call started is still running on screen (the queue window, I2.3.6). */
  get holding(): boolean { return this.deferred !== null; }

  press(key: string): void { this.driver.press(key); this.drain(); this.release(); }
  pressAll(keys: readonly string[]): void { for (const k of keys) { if (this.final) return; this.press(k); } }
  wait(ms: number): void { this.driver.wait(ms); this.drain(); this.release(); }
  settle(): void { this.driver.settle(); this.drain(); this.release(); }

  /** Opens the held request once the play has run out on screen; closes the late-timeout window at the snap. */
  private release(): void {
    const p = this.pending;
    if (p?.late && p.request.deadlinePlayClockTenths !== null && this.clockNow() <= p.request.deadlinePlayClockTenths) {
      this.queue(p.request, optionDecision(p.request, flow.OPT.none, this.clockNow()), this.driver.nowMs);
      this.pending = null;
      this.step();
    }
    if (this.deferred && this.driver.nowMs >= this.holdUntilMs) { const r = this.deferred; this.deferred = null; this.open(r); }
    const w = this.watching;
    if (w && !w.paused && this.driver.nowMs >= w.untilMs) this.releaseHold();
  }

  private count(type: GameEvent['type'], pred: (e: GameEvent) => boolean = () => true): number {
    return this.events.reduce((n, e) => n + (e.type === type && pred(e) ? 1 : 0), 0);
  }

  private timeoutsCharged(): number { return this.count('timeout_charged'); }

  /** A team timeout was charged after the last snapping call: no snap ran (a late timeout, PR 146). */
  private timeoutAfterLastSnap(): boolean {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i]!;
      if (e.type === 'timeout_charged') return true;
      if (e.type === 'decision_made' && e.decision.type === 'snapping_call') return false;
    }
    return false;
  }

  /** The play clock as the console shows it now. */
  private clockNow(): number { return playClockAt(this.driver.state, this.driver.nowMs); }

  /**
   * The late timeout request comes after both calls, while the flow waits in `pre_snap` (or `kickoff_setup`
   * before a free kick); the pre-call one comes in `call_window`.
   */
  private isLate(req: DecisionRequest): boolean {
    return req.type === 'timeout' && (this.game.phase === 'pre_snap' || this.game.phase === 'kickoff_setup');
  }

  /** The late-timeout window: the console stays on the sent call and T is live until the snap reading. */
  private openLate(req: DecisionRequest): void {
    const st = this.driver.state;
    if (st.open) this.driver.state = { ...st, open: { ...st.open, legal: { ...st.open.legal, timeout: true }, timeoutReason: null } };
    this.pending = { request: req, preview: false, late: true, openedAtMs: this.driver.nowMs, playClockTenths: this.clockNow() };
    this.release();
  }

  /** Steps the flow until it waits on the user's team or the game is final. */
  private step(): void {
    for (let guard = 0; guard < 100_000; guard++) {
      const r = flow.advance(this.game, this.o.input, this.deps, this.o.flowOptions ?? {}, this.resume);
      this.events.push(...r.events);
      this.game = r.state;
      this.resume = r.resume;
      if (r.resume === null) { this.pending = null; this.watching = null; this.heldReq = null; this.driver.state = { ...this.driver.state, open: null, step: 'idle' }; return; }
      const req = this.waiting();
      if (!req) throw new Error('game session: the flow stopped with no request for the user team');
      if (this.heldReq && req.requestId === this.heldReq.requestId) {
        if (this.beginHold()) continue;
        return;
      }
      if (this.staffDecider && req.type === 'timeout' && this.timeoutWanted && !this.ownsCallAt(flow.situationOf(this.deps, this.game))) {
        this.timeoutWanted = false;
        this.queue(req, optionDecision(req, flow.OPT.timeout, this.game.playClockTenths), this.driver.nowMs);
        continue;
      }
      if (this.isLastDownPrompt(req)) { this.open(req, true); return; }
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
      if (this.isLate(req)) { this.openLate(req); return; }
      // A snap ran since the console last opened: the play runs on screen before anything after it shows,
      // the challenge window and the penalty choice included (I2.1.1 stages 3 to 6 and 1).
      const snaps = this.count('decision_made', (e) => e.type === 'decision_made' && e.decision.type === 'snapping_call');
      if (this.o.liveMs && snaps > this.heldSnaps && !this.timeoutAfterLastSnap()) {
        this.heldSnaps = snaps;
        // The play's record when the flow logged it already (after any challenge or penalty choice it waits for).
        let rec: PlayRecord | null = null;
        for (let i = this.events.length - 1; i >= 0; i--) {
          const e = this.events[i]!;
          if (e.type === 'play_resolved') { rec = e.record; break; }
          if (e.type === 'decision_made' && e.decision.type === 'snapping_call') break;
        }
        const ms = this.o.liveMs(rec);
        if (ms > 0) { this.deferred = req; this.holdUntilMs = this.driver.nowMs + ms; this.pending = null; return; }
      }
      this.open(req);
      return;
    }
    throw new Error('game session: no stop after many units');
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

  private open(req: DecisionRequest, lastDown = false): void {
    const s = flow.situationOf(this.deps, this.game);
    const userOffense = s.offense === this.o.userSide;
    const atMs = this.driver.nowMs;
    const clock = this.game.playClockTenths;
    const preview = req.type === 'timeout';
    const callType = userOffense ? 'snapping_call' : 'opposing_call';
    const request: DecisionRequest = lastDown
      ? { ...req, options: LAST_DOWN_OPTIONS, defaultOptionId: null }
      : preview
        ? { ...req, type: callType, options: [], defaultOptionId: null, windowTenths: null, deadlinePlayClockTenths: Math.min(clock, flow.flowParam(this.deps, 'callDeadlinePlayClockTenths')) }
        : req;
    let kind: OpenInput['kind'] = 'option';
    let kickKind: string | null = null;
    if (!lastDown && (request.type === 'snapping_call' || request.type === 'opposing_call')) {
      if (!snapPlay(s.playKind)) { kind = userOffense ? 'own_kick' : 'opponent_kick'; kickKind = userOffense ? s.playKind : 'kick_return'; }
      else if (s.playKind === 'try' && userOffense && this.lastTryChoice() === flow.OPT.tryKick) { kind = 'own_kick'; kickKind = 'try_kick'; }
      else kind = s.playKind === 'scrimmage' && s.down === 4 ? 'fourth_down' : 'scrimmage';
    }
    const plays = this.count('play_resolved');
    // I2.3.6: a turnover, score or penalty on the last play clears the queue.
    const lastRec = [...this.events].reverse().find((e) => e.type === 'play_resolved');
    const penalty = !!lastRec && lastRec.type === 'play_resolved' && lastRec.record.called.fouls.some((f) => f.called);
    const scoreSince = (() => { for (let i = this.events.length - 1; i >= 0; i--) { const t = this.events[i]!.type; if (t === 'score_changed') return true; if (t === 'decision_requested' && i < this.events.length - 1 && this.events.slice(i).some((x) => x.type === 'play_resolved')) break; } return false; })();
    const clearQueue = penalty || scoreSince || (this.lastOffense !== null && this.lastOffense !== s.offense);
    this.lastOffense = s.offense;
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
      afterTimeout: sinceLastPlay, suggestion: null, sameDeadBall: plays === this.lastPlays, clearQueue,
      bookLine: this.o.bookLine && userOffense && s.down === 3 ? this.o.bookLine(s) : null,
    };
    this.lastPlays = plays;
    this.pending = { request: req, preview, ...(lastDown ? { lastDown: true } : {}), openedAtMs: atMs, playClockTenths: clock };
    this.driver.state = openRequest(this.driver.state, input);
    this.driver.wait(0);
  }

  /**
   * Puts a call found by the playbook search, or drawn on the sideline, on the sheet's in-game box and selects
   * it (in-game.ts). The play clock keeps running: this only moves the console's state.
   */
  addCall(unit: Unit, entry: SheetEntry): boolean {
    const r = addInGameCall(this.driver.state, unit, entry, this.driver.nowMs);
    this.driver.state = r.state;
    return r.handled;
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
      case 'option.send':
        if (p.lastDown) { this.lastDowns.set(req.requestId, c.optionId as staffAi.LastDownChoice); break; }
        this.queue(req, optionDecision(req, c.optionId, c.acceptedAtPlayClockTenths), now);
        break;
      case 'deadline.default':
        // His fourth-down choice timed out: the staff member next in line decides it (J11.6.1 default order).
        if (p.lastDown) { this.timedOutReqs.add(req.requestId); break; }
        if (p.preview) { this.queue(req, defaultDecision(req), now); this.defaultNext = true; }
        else this.queue(req, defaultDecision(req), now);
        break;
      case 'timeout':
        if (!p.preview && !p.late) return false;
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

  // ---- The head coach's staff (item 2b): who calls what, taking a unit and handing it back. ----

  /** True when the session runs the user's side through his staff. */
  get hasStaff(): boolean { return this.staffDecider !== null; }

  /** Who calls each unit right now: the user, or a staff member by id. */
  callers(): Readonly<Record<SeatUnit, { readonly isUser: boolean; readonly personId: number | null }>> {
    const chart = this.requireChart();
    const out = {} as Record<SeatUnit, { isUser: boolean; personId: number | null }>;
    for (const u of SEAT_UNITS) out[u] = callerOf(chart, u);
    return out;
  }

  /** The units the head coach holds now. */
  get keptUnits(): readonly SeatUnit[] { return SEAT_UNITS.filter((u) => this.kept.has(u)); }

  /** K6.1.1 rows: who decided each request of the user's side and why (N3 `decidedBy`). */
  staffRows(): readonly staffAi.StaffDecisionRow[] { return this.staffDecider?.rows() ?? []; }

  /**
   * The head coach takes a unit's calls (I9.4.2 proposed). It holds from the next request of that unit: requests only
   * come at dead balls. Only he decides this; nothing takes a unit from a coordinator on its own.
   */
  takeOver(unit: SeatUnit): void {
    const chart = this.requireChart();
    if (this.kept.has(unit)) return;
    const from = callerOf(chart, unit).personId;
    this.kept.add(unit);
    this.chart = chartKeeping(this.o.staff!.seat.chart, this.kept);
    this.logTakeover(unit, 'user', from);
    // A staff hold on the unit he just took ends at once: the console opens on his call.
    if (this.heldReq && !this.watching?.paused) this.releaseHold();
  }

  /** He gives a unit back to the staff member the staff chart gives it to. */
  handBack(unit: SeatUnit): void {
    this.requireChart();
    if (!this.kept.has(unit)) return;
    const holder = holderOf(this.o.staff!.seat.chart, unit);
    if (holder === null) throw new Error(`game session: nobody on the staff holds ${unit}; it stays with the head coach`);
    const reroute = this.pendingUnit() === unit;
    this.kept.delete(unit);
    this.chart = chartKeeping(this.o.staff!.seat.chart, this.kept);
    this.logTakeover(unit, 'staff', holder);
    if (reroute) {
      // The console was open on this unit's call: the coordinator answers it instead.
      this.pending = null;
      this.held = null;
      this.driver.state = { ...this.driver.state, open: null, step: 'idle' };
      this.step();
    }
  }

  /** Ask for a team timeout on the next dead ball the staff is calling (the head coach's own call, I5.5). */
  callTimeout(): void { this.requireChart(); this.timeoutWanted = true; }

  /** Watching: change the pace (I9.4.1). Takes effect from the next play. */
  setWatchMode(mode: WatchMode | null): void {
    this.requireChart();
    this.watchMode = mode;
    if (mode === null && this.heldReq) this.releaseHold();
  }

  /** Watching: go on after a stop rule halted the game. */
  resumeWatch(): void {
    const w = this.watching;
    if (!w || !w.paused) return;
    this.watching = { ...w, paused: false, reason: null };
    this.release();
  }

  /**
   * K6.4.1, J14.4.1: the staff runs the game to the end of the series, the half or the game, the units he holds
   * included; they come back to him when it stops. Reserved decisions are not modelled here yet.
   */
  simulateTo(target: SimulateTarget): void {
    this.requireChart();
    if (this.final) return;
    const s = flow.situationOf(this.deps, this.game);
    this.simTarget = { target, offense: s.offense, period: s.period };
    this.simKept = new Set(this.kept);
    this.kept.clear();
    this.chart = chartKeeping(this.o.staff!.seat.chart, this.kept);
    this.watching = null;
    if (this.pending) {
      this.pending = null;
      this.held = null;
      this.driver.state = { ...this.driver.state, open: null, step: 'idle' };
    }
    if (this.heldReq) { this.releaseHold(); return; }
    this.step();
  }

  private simKept: Set<SeatUnit> | null = null;

  private requireChart(): staffAi.StaffChart {
    if (!this.chart) throw new Error('game session: no staff on this session');
    return this.chart;
  }

  private logTakeover(unit: SeatUnit, to: 'user' | 'staff', coordinatorId: number | null): void {
    const s = flow.situationOf(this.deps, this.game);
    this.takeovers.push({ unit, to, coordinatorId, playNumber: s.playNumber, period: s.period, clockTenths: s.clockTenths, atMs: this.driver.nowMs });
  }

  private tryIsTwo(): boolean { return this.lastTryChoice() === flow.OPT.tryTwo; }

  /** Whether the head coach holds the call of the coming snap or kick. */
  private ownsCallAt(s: GameSituation): boolean {
    if (!this.chart) return true;
    const type = s.offense === this.o.userSide ? 'snapping_call' : 'opposing_call';
    const unit = unitOfDuty(staffAi.dutyFor(type, s, this.tryIsTwo()));
    return unit === null || callerOf(this.chart, unit).isUser;
  }

  /** The unit the open console request belongs to. */
  private pendingUnit(): SeatUnit | null {
    const p = this.pending;
    if (!p) return null;
    if (p.lastDown) return 'management';
    const s = flow.situationOf(this.deps, this.game);
    const type = p.preview || p.late ? (s.offense === this.o.userSide ? 'snapping_call' : 'opposing_call') : p.request.type;
    return unitOfDuty(staffAi.dutyFor(type, s, this.tryIsTwo()));
  }

  /** The user's seat answers what needs no console: a timeout window before a call his staff makes. */
  private seatAnswer(view: { request: DecisionRequest; situation: GameSituation }): Decision | null {
    const r = view.request;
    if (r.type !== 'timeout' || this.ownsCallAt(view.situation) || this.timeoutWanted) return null;
    const none = r.options.find((o) => o.optionId === flow.OPT.none)?.optionId ?? r.defaultOptionId;
    if (none === null) return null;
    return { requestId: r.requestId, type: r.type, side: r.side, optionId: none, snappingCall: null, opposingCall: null, acceptedAtPlayClockTenths: null, actor: { kind: 'user', personId: this.chart?.userId ?? null } };
  }

  /** The flow stopped on a fourth-down call his coordinator makes, waiting on the head coach's go, punt or kick. */
  private isLastDownPrompt(req: DecisionRequest): boolean {
    if (!this.chart || req.type !== 'snapping_call') return false;
    const s = flow.situationOf(this.deps, this.game);
    if (s.playKind !== 'scrimmage' || s.down === null || s.down < this.deps.rules.num('series.downs')) return false;
    return !callerOf(this.chart, 'offense').isUser && callerOf(this.chart, 'management').isUser;
  }

  /** The first request of each play is held while watching or simulating, so the staff's snaps are paced. */
  private holdFor(view: { request: DecisionRequest; situation: GameSituation }): boolean {
    if (this.watchMode === null && this.simTarget === null) return false;
    const n = view.situation.playNumber;
    if (n <= this.releasedPlay) return false;
    if (this.heldReq && this.heldReq.requestId !== view.request.requestId) return false;
    this.heldReq = { requestId: view.request.requestId, playNumber: n };
    return true;
  }

  private simReached(s: GameSituation): boolean {
    const t = this.simTarget!;
    if (t.target === 'series') return s.offense !== t.offense;
    if (t.target === 'half') {
      const half = this.deps.rules.num('clock.periods') / 2;
      const part = (p: number) => (p <= half ? 0 : 1);
      return s.overtime || part(s.period) !== part(t.period);
    }
    return false;
  }

  /** Starts a hold on the play the flow stopped before. True when it is released at once (summary, simulating). */
  private beginHold(): boolean {
    const h = this.heldReq!;
    const since = this.events.slice(this.eventsAtHold);
    this.eventsAtHold = this.events.length;
    const s = flow.situationOf(this.deps, this.game);
    if (this.simTarget) {
      if (!this.simReached(s)) return this.releaseNow(h);
      for (const u of this.simKept ?? []) this.kept.add(u);
      this.simKept = null;
      this.simTarget = null;
      this.chart = chartKeeping(this.o.staff!.seat.chart, this.kept);
      if (this.watchMode === null) return this.releaseNow(h);
    }
    if (this.watchMode === null) return this.releaseNow(h);
    let rec: PlayRecord | null = null;
    for (let i = since.length - 1; i >= 0; i--) { const e = since[i]!; if (e.type === 'play_resolved') { rec = e.record; break; } }
    let reason: StopRule['kind'] | null = null;
    if (this.stopRules.length) {
      const after = {
        score: since.some((e) => e.type === 'score_changed'),
        turnover: since.some((e) => e.type === 'drive_ended' && e.drive.result === 'turnover'),
        starterInjured: false,
      };
      const strip = {
        down: s.down, distanceYd: s.distanceYd, yardLine: 100 - yardsToGoal(this.deps.geometry, s.ballX, s.attackDir), userHasBall: s.offense === this.o.userSide,
        scoreMargin: s.score[this.o.userSide] - s.score[this.o.userSide === 0 ? 1 : 0], period: s.period, clockTenths: s.clockTenths,
        personnel: null, formationFamily: null, afterTwoMinute: s.insideTwoMinute,
      };
      if (rec && stopAfterPlay(this.stopRules, after)) reason = after.score ? 'score' : 'turnover';
      else if (s.playKind === 'scrimmage' && stopBeforeSnap(this.stopRules, strip)) reason = this.firstRuleHit(strip);
    }
    const mode = this.watchMode;
    const live = rec && this.o.liveMs ? this.o.liveMs(rec) : 0;
    const ms = mode === 'summary' ? 0 : Math.round(mode === 'double' ? live / 2 : live) + (this.o.staff?.watch?.betweenPlaysMs ?? 0);
    // The play ran out on screen here, so the console does not hold the same play again.
    this.heldSnaps = this.count('decision_made', (e) => e.type === 'decision_made' && e.decision.type === 'snapping_call');
    if (reason === null && ms <= 0) return this.releaseNow(h);
    this.watching = { mode, untilMs: this.driver.nowMs + ms, paused: reason !== null, reason };
    this.pending = null;
    this.driver.state = { ...this.driver.state, open: null, step: 'idle' };
    return false;
  }

  private firstRuleHit(strip: Parameters<typeof stopBeforeSnap>[1]): StopRule['kind'] | null {
    for (const r of this.stopRules) if (stopBeforeSnap([r], strip)) return r.kind;
    return null;
  }

  private releaseNow(h: { playNumber: number }): true {
    this.releasedPlay = h.playNumber;
    this.heldReq = null;
    this.watching = null;
    return true;
  }

  private releaseHold(): void {
    const h = this.heldReq;
    if (!h) return;
    this.releaseNow(h);
    this.step();
  }
}

// The game driver (J11.2.1, J11.6.1, J14.1.1): it asks the coaches, calls the resolver, hands the
// truth to officiating and logs what happened as events. It holds no football judgment: every rule
// comes from the officiating facade and the rule set, every decision from a decider or a default.
//
// The driver works in units. A unit starts in a phase from which the state alone says what comes
// next (the pre-game, a call window, a try choice, a period end, an overtime toss) and runs to the
// next such phase. Inside a unit the play, its ruling and its choices live in local variables, as
// the contract's state has no field for a play in progress. When a decider gives no answer the
// unit stops; `advance` hands back a `FlowResume`, and the next call re-runs the unit from its
// start with the answers so far. Every step is deterministic, so the re-run repeats the same
// events and continues where it stopped.
import { Contract, stateHash } from '@gm/engine-core';
import { OPT, TENTHS_PER_S, flowParam } from './params.ts';
import { UNIT_START_PHASES } from './table.ts';
import { applyEvent, replayEvents, resolvePlay } from './apply.ts';
import { defaultLineup, defaultOpposingCall, defaultSnappingCall, defaultTossChoice, loserMenu, tossMenu } from './defaults.ts';
import {
  SIDES, isFreeKick, other, periodExpired, publicCalled, rulingContext, seriesFromRestart, situationOf,
  type FlowEnv, type GameState, type Side,
} from './situation.ts';

type GameEvent = Contract.GameEvent;
type Decision = Contract.Decision;
type DecisionRequest = Contract.DecisionRequest;
type GameDeps = Contract.GameDeps;
type GameInput = Contract.GameInput;

/** Observers of a running game. `onPlay` is the statistics sink: it gets each final play record once (J11.9.1). */
export interface FlowSink {
  onEvent?(event: GameEvent, before: GameState, after: GameState): void;
  onPlay?(record: Contract.PlayRecord): void;
  onDrive?(drive: Contract.DriveRecord): void;
}

export interface FlowOptions {
  readonly sink?: FlowSink;
  /** Record detail asked of the resolver (J14.1.1). Default 'summary'. */
  readonly detail?: Contract.RecordDetail;
}

interface Answer { readonly decision: Decision; readonly missed: boolean }

/** What `advance` needs to continue a unit it stopped in. Held in memory by the caller; never saved (J13.5.2). */
export interface FlowResume {
  readonly base: GameState;
  readonly answers: readonly Answer[];
  readonly returned: number;
  readonly lastCalled: Contract.ObservedCalledPlay | null;
}

export interface AdvanceResult { state: GameState; events: GameEvent[]; resume: FlowResume | null }

/** The contract's `GameFlow`, with the resume value `advance` needs to stop inside a unit. */
export interface FlowApi extends Contract.GameFlow {
  advance(state: GameState, input: GameInput, deps: GameDeps, resume?: FlowResume | null): AdvanceResult;
}

/**
 * A decider's way to say "the deadline passed" when a game is stepped with `advance`: the flow logs
 * `deadline_missed` and applies the default (J11.6.1). `simulateGame` does the same for a null answer.
 */
export function deadlinePassed(request: DecisionRequest): Decision {
  return {
    requestId: request.requestId, type: request.type, side: request.side, optionId: null, snappingCall: null, opposingCall: null,
    acceptedAtPlayClockTenths: null, actor: { kind: 'default', personId: null },
  };
}

class Stop { constructor(readonly request: DecisionRequest) {} }

interface RequestSpec {
  readonly type: Contract.DecisionType;
  readonly side: Side;
  readonly options?: readonly string[];
  readonly defaultOptionId?: string;
  readonly deadlinePlayClockTenths?: number;
  readonly windowTenths?: number;
}

class Run {
  state: GameState;
  readonly events: GameEvent[] = [];
  readonly answers: Answer[] = [];
  /** Decisions since the last play record: the N3 feed of the next one. */
  decisions: Decision[] = [];

  constructor(
    readonly deps: GameDeps, readonly input: GameInput, base: GameState, private readonly recorded: readonly Answer[],
    private readonly mode: 'stop' | 'default', private readonly quiet: number, readonly options: FlowOptions,
    public lastCalled: Contract.ObservedCalledPlay | null,
  ) { this.state = base; }

  /** True for events a re-run repeats: the sinks have seen them already. */
  private get repeating(): boolean { return this.events.length < this.quiet; }

  emit(event: GameEvent): void {
    const next = applyEvent(this.deps, this.state, event);
    if (!this.repeating) this.options.sink?.onEvent?.(event, this.state, next);
    this.state = next;
    this.events.push(event);
  }

  notifyPlay(record: Contract.PlayRecord): void { if (!this.repeating) this.options.sink?.onPlay?.(record); }
  notifyDrive(drive: Contract.DriveRecord): void { if (!this.repeating) this.options.sink?.onDrive?.(drive); }

  num(name: Parameters<typeof flowParam>[1]): number { return flowParam(this.deps, name); }

  request(spec: RequestSpec): DecisionRequest {
    const options = spec.options ?? [];
    const request: DecisionRequest = {
      requestId: this.state.nextRequestId, type: spec.type, side: spec.side,
      options: options.map((optionId) => ({ optionId, labelKey: `decision.${spec.type}.${optionId}` })),
      deadlinePlayClockTenths: spec.deadlinePlayClockTenths ?? null,
      windowTenths: spec.deadlinePlayClockTenths === undefined ? (spec.windowTenths ?? this.num('fixedDecisionWindowTenths')) : null,
      defaultOptionId: spec.defaultOptionId ?? null,
    };
    this.emit({ type: 'decision_requested', request });
    return request;
  }

  /** The answer to a pending request: a recorded one on a re-run, else the decider's, else the default. */
  answer(request: DecisionRequest, defaults: { snappingCall?: () => Contract.SnappingCall; opposingCall?: () => Contract.OpposingCall } = {}): Decision {
    let a = this.recorded[this.answers.length];
    if (!a) {
      const view: Contract.DecisionView = { situation: situationOf(this.deps, this.state), lastCalled: this.lastCalled, request };
      const raw = this.deps.deciders[request.side].decide(view);
      if (raw === null && this.mode === 'stop') throw new Stop(request);
      const clock = this.state.playClockTenths;
      if (raw !== null && raw.actor.kind !== 'default' && this.acceptable(request, raw)) {
        const at = raw.acceptedAtPlayClockTenths;
        a = { missed: false, decision: {
          requestId: request.requestId, type: request.type, side: request.side,
          optionId: request.options.length > 0 ? raw.optionId : null,
          snappingCall: request.type === 'snapping_call' ? raw.snappingCall : null,
          opposingCall: request.type === 'opposing_call' ? raw.opposingCall : null,
          acceptedAtPlayClockTenths: at === null ? null : Math.max(0, Math.min(clock, Math.trunc(at))),
          actor: raw.actor,
        } };
      } else {
        a = { missed: true, decision: {
          ...deadlinePassed(request), optionId: request.defaultOptionId,
          snappingCall: request.type === 'snapping_call' ? defaults.snappingCall!() : null,
          opposingCall: request.type === 'opposing_call' ? defaults.opposingCall!() : null,
          acceptedAtPlayClockTenths: request.deadlinePlayClockTenths,
        } };
      }
    }
    this.answers.push(a);
    if (a.missed) this.emit({ type: 'deadline_missed', requestId: request.requestId });
    this.emit({ type: 'decision_made', decision: a.decision });
    this.decisions.push(a.decision);
    return a.decision;
  }

  ask(spec: RequestSpec): Decision { return this.answer(this.request(spec)); }

  /** A malformed answer is no answer. A legal-or-not football choice is never refused: illegal plays still run. */
  private acceptable(request: DecisionRequest, d: Decision): boolean {
    if (d.requestId !== request.requestId || d.type !== request.type || d.side !== request.side) return false;
    if (request.options.length > 0 && !request.options.some((o) => o.optionId === d.optionId)) return false;
    if (request.type === 'snapping_call') return d.snappingCall !== null && (!isFreeKick(this.state.nextPlayKind) || d.snappingCall.unit === 'kick');
    if (request.type === 'opposing_call') return d.opposingCall !== null;
    return true;
  }
}

// ---------------------------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------------------------

/** The toss of B1.1.2 and B10.1.1: the visiting captain calls, the coin is a draw from stream `toss`. */
function runToss(r: Run, kind: 'opening' | 'overtime', tossIndex: number): void {
  const visitor: Side = 1;
  const call = r.ask({ type: 'toss_call', side: visitor, options: [OPT.heads, OPT.tails], defaultOptionId: OPT.heads });
  const coin = r.deps.streams('toss', [r.state.gameId, tossIndex]).int(0, 1) === 0 ? OPT.heads : OPT.tails;
  const winner: Side = call.optionId === coin ? visitor : other(visitor);
  const menu = tossMenu(r.deps.officiating.restarts.tossOptions(kind, r.deps));
  const choice = r.ask({ type: 'toss_choice', side: winner, options: menu, defaultOptionId: defaultTossChoice(menu) }).optionId!;
  const rest = loserMenu(menu, choice);
  const loserChoice = rest.length > 0 ? r.ask({ type: 'toss_choice', side: other(winner), options: rest, defaultOptionId: rest[0]! }).optionId : null;
  r.emit({ type: 'toss', tossIndex, winner, choiceId: choice, loserChoiceId: loserChoice });
}

function unitPreGame(r: Run): void {
  if (r.state.clockStatus === 'intermission') r.emit({ type: 'game_started' });
  runToss(r, 'opening', 0);
}

function unitTry(r: Run): void {
  r.ask({ type: 'try_choice', side: r.state.possession, options: [OPT.tryKick, OPT.tryTwo], defaultOptionId: OPT.tryKick });
}

function unitPeriodEnd(r: Run): void {
  const s = r.state;
  const t = r.deps.officiating.clock.endOfPeriod(s, r.deps);
  if (t.next !== 'next_period' && s.drive !== null) endDrive(r, 'end_of_half');
  r.emit({ type: 'period_ended', period: s.period, next: t.next });
  if (t.next === 'final') r.emit({ type: 'game_final', score: r.state.score, tie: r.state.score[0] === r.state.score[1] });
  else if (t.intermissionTenths > 0) r.emit({ type: 'clock_advanced', tenths: t.intermissionTenths, reason: 'intermission' });
}

function endDrive(r: Run, result: Contract.DriveRecord['result']): void {
  const drive = r.state.drive;
  if (drive === null) return;
  const done = { ...drive, result };
  r.emit({ type: 'drive_ended', drive: done });
  r.notifyDrive(done);
}

function driveResult(drive: Contract.DriveRecord, record: Contract.PlayRecord, after: GameState): Contract.DriveRecord['result'] | null {
  const f = record.final;
  if (f.noPlay || record.situation.playKind !== 'scrimmage') return null;
  if (f.score !== null) {
    if (f.score.type === 'touchdown') return f.score.side === drive.side ? 'touchdown' : 'opponent_touchdown';
    if (f.score.type === 'field_goal') return 'field_goal';
    if (f.score.type === 'safety') return 'safety';
  }
  if (f.resultType === 'punt') return 'punt';
  if (f.resultType === 'field_goal_missed') return 'missed_field_goal';
  if (record.seriesAfter.turnoverOnDowns) return 'downs';
  if (f.changeOfPossession || after.possession !== drive.side || after.nextPlayKind !== 'scrimmage') return 'turnover';
  return null;
}

/** Spotting delay (J11.4.2): drawn from the dead-ball type, the distance from the previous spot and the crew's pace. */
function spottingTenths(r: Run, record: Contract.PlayRecord): number {
  const f = record.final;
  const u = r.deps.streams('between', [record.gameId, record.index]).uniform();
  const min = r.num('spottingMinTenths');
  const stoppage = f.incomplete || f.endedOutOfBounds || f.enforcement !== null;
  const raw = min + u * (r.num('spottingMaxTenths') - min) + Math.abs(f.spotX - f.previousSpotX) * r.num('spottingPerYardTenths')
    + (stoppage ? r.num('spottingStoppageExtraTenths') : 0);
  return Math.max(0, Math.round(raw / r.state.crew.pace));
}

/** Second key of the pre-snap draws, so they never share a stream with the spotting draw of the same play. */
const PRE_SNAP_DRAWS = 1;

/**
 * The play-clock value at the snap (I2.1.1 stages 3 to 6, J5.8.1). From the accepted call the offense needs its
 * procedure time (relay, huddle, break, align, set, cadence) before it can snap. Then the tempo decides: a huddle
 * offense snaps at a target play-clock value near the end of the clock, a no-huddle or hurry-up offense snaps a
 * drawn wait after it is set and never plans to go under the latest value. An offense that is set late snaps as
 * soon as it is set, and at zero when the clock ran out first (the delay foul is the resolver's and the crew's).
 */
function snapClockTenths(r: Run, call: Contract.SnappingCall, acceptedAt: number): number {
  if (isFreeKick(r.state.nextPlayKind)) return Math.max(0, acceptedAt - r.num('kickRestartPreSnapTenths'));
  const tempo = call.unit === 'offense' ? call.tempo : 'huddle';
  const draws = r.deps.streams('between', [r.state.gameId, r.state.playCounter, PRE_SNAP_DRAWS]);
  const spread = r.num('preSnapSpreadShare');
  const base = r.num(tempo === 'hurry_up' ? 'preSnapHurryUpTenths' : tempo === 'no_huddle' ? 'preSnapNoHuddleTenths' : 'preSnapHuddleTenths');
  const ready = acceptedAt - base * (1 - spread + (spread + spread) * draws.uniform());
  // One exponential draw: mean times minus the log of a uniform in (0, 1].
  const exp = (mean: number) => -mean * r.deps.math.log(1 - draws.uniform());
  let snap: number;
  if (tempo === 'huddle') snap = Math.min(ready, r.num('snapTargetHuddleFloorTenths') + exp(r.num('snapTargetHuddleMeanTenths')));
  else {
    const wait = exp(r.num(tempo === 'hurry_up' ? 'snapWaitHurryUpMeanTenths' : 'snapWaitNoHuddleMeanTenths'));
    snap = Math.max(ready - wait, Math.min(ready, r.num('snapLatestPlayClockTenths')));
  }
  return Math.max(0, Math.round(snap));
}

/** Teams as the resolver reads them: the input's players with the game-day state the game has reached. */
function currentTeams(input: GameInput, state: GameState): readonly [Contract.SimTeam, Contract.SimTeam] {
  const team = (t: Contract.SimTeam): Contract.SimTeam =>
    ({ ...t, players: t.players.map((p) => ({ ...p, gameDay: state.gameDay[t.side][String(p.playerId)] ?? p.gameDay })) });
  return [team(input.teams[0]), team(input.teams[1])];
}

/** Charged team timeouts in the call window (J11.6.1). Returns false when the period ran out while a coach waited. */
function timeoutWindow(r: Run): boolean {
  const clock = r.deps.officiating.clock;
  for (const side of SIDES) {
    if (!clock.timeoutAllowed(r.state, side, r.deps).allowed) continue;
    const d = r.ask({ type: 'timeout', side, options: [OPT.none, OPT.timeout], defaultOptionId: OPT.none, deadlinePlayClockTenths: 0 });
    if (d.optionId !== OPT.timeout) continue;
    const wait = r.state.playClockTenths - Math.min(r.state.playClockTenths, d.acceptedAtPlayClockTenths ?? r.state.playClockTenths);
    if (wait > 0) r.emit({ type: 'clock_advanced', tenths: wait, reason: 'between_plays' });
    if (r.state.phase !== 'call_window') return false;
    r.emit({ type: 'timeout_charged', side, kind: 'team' });
    r.emit({ type: 'clock_advanced', tenths: r.deps.rules.num('timeout.length_seconds') * TENTHS_PER_S, reason: 'intermission' });
  }
  return true;
}

/**
 * Charged team timeouts after the calls are in and before the snap (B1.4.1 rule 2: any time the ball is dead;
 * J11.6.1: any dead ball before the snap). The request's deadline is the play-clock value of the snap. A request
 * that comes at or after the snap, or with the play clock at zero, is not granted (B1.4.1 edge case, J11.6.1 edge
 * case). After a charged timeout the calls are void and are made again; when the period ran out while a coach
 * waited, the unit ends.
 */
function lateTimeoutWindow(r: Run, sides: readonly Side[], snapAt: number): 'none' | 'charged' | 'period_end' {
  const clock = r.deps.officiating.clock;
  for (const side of sides) {
    if (!clock.timeoutAllowed(r.state, side, r.deps).allowed) continue;
    const d = r.ask({ type: 'timeout', side, options: [OPT.none, OPT.timeout], defaultOptionId: OPT.none, deadlinePlayClockTenths: snapAt });
    if (d.optionId !== OPT.timeout) continue;
    const playClock = r.state.playClockTenths;
    const at = Math.min(playClock, d.acceptedAtPlayClockTenths ?? playClock);
    if (at < snapAt || at <= 0) continue;
    if (playClock > at) r.emit({ type: 'clock_advanced', tenths: playClock - at, reason: 'between_plays' });
    if (r.state.phase === 'period_end') return 'period_end';
    r.emit({ type: 'timeout_charged', side, kind: 'team' });
    r.emit({ type: 'clock_advanced', tenths: r.deps.rules.num('timeout.length_seconds') * TENTHS_PER_S, reason: 'intermission' });
    return 'charged';
  }
  return 'none';
}

/** One snap or kick, from the calls to the spotted ball (J11.2.1 phases `callWindow` to `deadBall`). */
function unitPlay(r: Run): void {
  const { deps } = r;
  const off = deps.officiating;
  const freeKick = isFreeKick(r.state.nextPlayKind);
  const offense = r.state.possession;
  let calls: Contract.PlayCalls;
  let playClock: number;
  let snapAt: number;
  for (;;) {
    if (!freeKick && !timeoutWindow(r)) return;

    // Calls. Both requests are open before either coach answers, so neither sees the other's call.
    const preview = situationOf(deps, r.state);
    const deadline = Math.min(r.state.playClockTenths, r.num('callDeadlinePlayClockTenths'));
    const lineup = (side: Side) => defaultLineup(deps, r.input.teams[side], r.state);
    const reqS = r.request({ type: 'snapping_call', side: offense, deadlinePlayClockTenths: deadline });
    const reqO = r.request({ type: 'opposing_call', side: other(offense), deadlinePlayClockTenths: deadline });
    const dS = r.answer(reqS, { snappingCall: () => defaultSnappingCall(deps, preview, lineup(offense)) });
    const dO = r.answer(reqO, { opposingCall: () => defaultOpposingCall(deps, preview, lineup(other(offense))) });
    calls = { snapping: dS.snappingCall!, opposing: dO.opposingCall! };

    // The play clock always runs (I2.1.2): the call and the pre-snap procedure use it, and a running game clock with it.
    playClock = r.state.playClockTenths;
    const acceptedAt = Math.min(playClock, dS.acceptedAtPlayClockTenths ?? playClock);
    snapAt = snapClockTenths(r, calls.snapping, acceptedAt);
    // Either coach may still take a timeout until the snap; after one, the calls are made again.
    const late = lateTimeoutWindow(r, [offense, other(offense)], snapAt);
    if (late === 'period_end') return;
    if (late === 'none') break;
  }
  r.emit({ type: 'clock_advanced', tenths: playClock - snapAt, reason: 'pre_snap' });
  if (r.state.phase !== 'play') return; // the period ran out before the snap

  // Play, then ruling. An illegal play still runs: the resolver records it, officiating flags it.
  const before = r.state;
  const atSnap = off.clock.atSnap(before.clockTenths, before.clockStatus, rulingContext(deps, before));
  const situation: Contract.GameSituation = { ...situationOf(deps, before), clockStatus: atSnap };
  const ctx = rulingContext(deps, before, situation);
  const result = deps.resolver.simulatePlay({
    rules: deps.rules, params: deps.params, situation, calls, teams: currentTeams(r.input, before), environment: before.environment,
    geometry: deps.geometry, streams: deps.streams, math: deps.math, options: { detail: r.options.detail ?? 'summary' },
  });
  let called = off.rulePlay(result.truth, ctx);
  const optionOf = (c: Contract.CalledPlay, id: string | null) => c.options.find((o) => o.optionId === id) ?? c.options.find((o) => o.optionId === c.defaultOptionId) ?? c.options[0]!;
  const draft = (c: Contract.CalledPlay, optionId: string | null) => buildRecord(r, before, situation, calls, result, c, optionOf(c, optionId), ctx);

  // Replay (B9): a booth review, or one coach's challenge. The ruling steps after it run again.
  const review = (request: Contract.ReviewRequest) => {
    const res = off.review(called, result.truth, request, ctx);
    if (res.allowed) called = res.called;
    r.lastCalled = publicCalled(called);
    r.emit({ type: 'review_resolved', request: res.allowed ? request : { ...request, aspects: [] }, reversed: res.allowed && res.reversed.length > 0, record: draft(called, null).record });
    if (res.timeoutCharged && request.side !== null) r.emit({ type: 'timeout_charged', side: request.side, kind: 'team' });
  };
  r.lastCalled = publicCalled(called);
  const booth = off.replay.boothReview(called, ctx);
  if (booth !== null) review(booth);
  else {
    for (const side of [offense, other(offense)]) {
      const aspects = off.replay.challengeable(called, side, ctx);
      if (aspects.length === 0) continue;
      const d = r.ask({ type: 'challenge', side, options: [OPT.none, ...aspects], defaultOptionId: OPT.none });
      if (d.optionId === null || d.optionId === OPT.none) continue;
      review({ source: 'coach_challenge', side, aspects: aspects.filter((a) => a === d.optionId) });
      break;
    }
  }

  // Penalty choice (B8.5.8): more than one option means a coach chooses.
  let chosen: string | null = called.defaultOptionId;
  if (called.options.length > 1) {
    chosen = r.ask({
      type: 'penalty_choice', side: called.options[0]!.side, options: called.options.map((o) => o.optionId),
      defaultOptionId: optionOf(called, null).optionId, windowTenths: r.num('penaltyDecisionWindowTenths'),
    }).optionId;
  }
  const { record, overtimeStep } = draft(called, chosen);
  r.decisions = [];
  r.emit({ type: 'play_resolved', record });
  r.notifyPlay(record);
  deadBall(r, record, overtimeStep);
}

function buildRecord(
  r: Run, before: GameState, situation: Contract.GameSituation, calls: Contract.PlayCalls, result: Contract.PlayResult,
  called: Contract.CalledPlay, option: Contract.EnforcementOption, ctx: Contract.RulingContext,
): { record: Contract.PlayRecord; overtimeStep: Contract.OvertimeStep | null } {
  const off = r.deps.officiating;
  const final = option.outcome;
  // What follows (J11.7.1): a try after a touchdown, a kick after any other score and after a try, the series rule otherwise.
  let seriesAfter: Contract.SeriesState;
  if (final.noPlay) seriesAfter = off.series.next(final, ctx);
  else if (situation.playKind === 'try') seriesAfter = seriesFromRestart(r.deps, off.restarts.kickoffSetup(situation.offense, 'kickoff', ctx), ctx);
  else if (final.score !== null) seriesAfter = seriesFromRestart(r.deps, off.restarts.afterScore(final.score, before, ctx), ctx);
  else seriesAfter = off.series.next(final, ctx);
  const scoreAfter: [number, number] = [before.score[0], before.score[1]];
  if (final.score !== null && !final.noPlay) scoreAfter[final.score.side] += final.score.points;
  const draft: Contract.PlayRecord = {
    gameId: before.gameId, index: situation.playNumber, fidelityTier: r.input.fidelityTier, situation, calls,
    truth: result.truth, deltas: [...result.deltas], called, chosenOptionId: option.optionId, final, seriesAfter,
    clockAfter: off.clock.afterPlay(final, result.liveDurationTenths, ctx), scoreAfter, decisions: [...r.decisions], stateHash: '',
  };
  // The hash is of the state this record leads to, from the state as it stands now (the choices around the play are in it).
  const resolved = resolvePlay(r.deps, r.state, draft);
  return { record: { ...draft, stateHash: stateHash(resolved.state) }, overtimeStep: resolved.overtimeStep };
}

/** The dead ball after a play record (J11.3 to J11.5): score, drive, stoppages, runoff, then the spotted ball. */
function deadBall(r: Run, record: Contract.PlayRecord, overtimeStep: Contract.OvertimeStep | null): void {
  const final = record.final;
  if (final.score !== null && !final.noPlay) r.emit({ type: 'score_changed', score: final.score, scoreAfter: record.scoreAfter });
  const drive = r.state.drive;
  if (drive !== null) {
    const result = driveResult(drive, record, r.state);
    if (result !== null) endDrive(r, result);
  }
  if (overtimeStep !== null && (overtimeStep.next === 'final_win' || overtimeStep.next === 'final_tie')) {
    endDrive(r, 'end_of_half');
    r.emit({ type: 'game_final', score: r.state.score, tie: r.state.score[0] === r.state.score[1] });
    return;
  }
  if (record.clockAfter.twoMinuteStop) officialStop(r, 'two_minute', r.num('officialTimeoutTenths'));
  if (final.injuryStoppage.length > 0) officialStop(r, 'injury', r.num('injuryTimeoutTenths'));

  // Runoff (B1.6.1): the opponent's option, then the offender's timeout option.
  const runoff = r.state.pendingRunoff;
  if (runoff !== null) {
    r.ask({ type: 'runoff_choice', side: other(runoff.against), options: [OPT.runoffTake, OPT.runoffDecline], defaultOptionId: OPT.runoffTake });
    if (r.state.pendingRunoff !== null) {
      const d = r.ask({ type: 'runoff_choice', side: runoff.against, options: [OPT.runoffAccept, OPT.runoffTimeout], defaultOptionId: OPT.runoffAccept });
      if (d.optionId === OPT.runoffTimeout) r.emit({ type: 'timeout_charged', side: runoff.against, kind: 'team' });
    }
  }

  if (overtimeStep !== null && overtimeStep.next === 'next_ot_period') {
    endDrive(r, 'end_of_half');
    r.emit({ type: 'period_ended', period: r.state.period, next: 'overtime' });
    return;
  }
  r.emit({ type: 'clock_advanced', tenths: periodExpired(r.state) ? 0 : spottingTenths(r, record), reason: 'spotting' });
}

function officialStop(r: Run, kind: 'two_minute' | 'injury', tenths: number): void {
  r.emit({ type: 'timeout_charged', side: null, kind });
  r.emit({ type: 'clock_advanced', tenths, reason: 'intermission' });
}

function runUnit(r: Run): void {
  switch (r.state.phase) {
    case 'pre_game': return unitPreGame(r);
    case 'kickoff_setup': case 'call_window': return unitPlay(r);
    case 'try_decision': return unitTry(r);
    case 'period_end': return unitPeriodEnd(r);
    case 'overtime_toss': return runToss(r, 'overtime', r.state.period - r.deps.rules.num('clock.periods'));
    default: throw new Error(`game flow: no unit starts in phase ${r.state.phase}`);
  }
}

// ---------------------------------------------------------------------------------------------
// The GameFlow surface
// ---------------------------------------------------------------------------------------------

export function newGame(input: GameInput, deps: FlowEnv): GameState {
  if (input.ruleSetId !== deps.rules.id) throw new Error(`game ${input.gameId}: input names rule set ${input.ruleSetId}, the rules given are ${deps.rules.id}`);
  const timeouts = deps.rules.num('timeout.per_half');
  const bench = (t: Contract.SimTeam) => Object.fromEntries(t.players.map((p) => [String(p.playerId), p.gameDay]));
  const g = deps.geometry;
  return {
    gameId: input.gameId, ruleSetId: input.ruleSetId, gameType: input.gameType, teamIds: [input.teams[0].teamId, input.teams[1].teamId],
    seedHex: input.seedHex, crew: input.crew, environment: input.environment,
    phase: 'pre_game', period: 1, overtime: null,
    clockTenths: deps.rules.num('clock.period_length_s') * TENTHS_PER_S, clockStatus: 'intermission',
    playClockTenths: deps.officiating.clock.playClockTenths('administrative', deps), playClockRunning: false, elapsedTenths: 0,
    score: [0, 0], scoreByPeriod: [[0, 0]], possession: 0, attackDir: [1, -1], nextPlayKind: 'kickoff',
    // The toss is held at midfield (B1.1.2); the kickoff spot replaces it when the toss is logged.
    ballX: (g.goalLineWestX + g.goalLineEastX) / 2, ballY: g.centreY, down: null, lineToGainX: null, seriesStartX: null,
    timeoutsLeft: [timeouts, timeouts], challengesUsed: [0, 0], challengesWon: [0, 0],
    insideTwoMinute: false, untimedDownOwed: false, pendingRunoff: null, toss: null, carriedPenalty: null,
    pendingDecisions: [], nextRequestId: 1, playCounter: 0, drive: null, driveCounter: 0,
    gameDay: [bench(input.teams[0]), bench(input.teams[1])],
  };
}

function checkPlayGuard(deps: FlowEnv, state: GameState): void {
  if (state.playCounter > flowParam(deps, 'maxPlays')) throw new Error(`game ${state.gameId}: engine fault, more than ${flowParam(deps, 'maxPlays')} plays`);
}

export function advance(state: GameState, input: GameInput, deps: GameDeps, options: FlowOptions = {}, resume: FlowResume | null = null): AdvanceResult {
  if (resume === null && !UNIT_START_PHASES.includes(state.phase)) {
    throw new Error(`game flow: phase ${state.phase} is inside a play; pass the resume value of the advance that stopped there, or reload the last dead ball (J13.5.2)`);
  }
  const events: GameEvent[] = [];
  let base = resume?.base ?? state;
  let recorded = resume?.answers ?? [];
  let returned = resume?.returned ?? 0;
  let lastCalled = resume?.lastCalled ?? null;
  for (;;) {
    if (base.phase === 'final') return { state: base, events, resume: null };
    checkPlayGuard(deps, base);
    const run = new Run(deps, input, base, recorded, 'stop', returned, options, lastCalled);
    try {
      runUnit(run);
    } catch (e) {
      if (!(e instanceof Stop)) throw e;
      events.push(...run.events.slice(returned));
      return { state: run.state, events, resume: { base, answers: run.answers, returned: run.events.length, lastCalled } };
    }
    events.push(...run.events.slice(returned));
    base = run.state; recorded = []; returned = 0; lastCalled = run.lastCalled;
  }
}

export function simulateGame(input: GameInput, deps: GameDeps, options: FlowOptions = {}): Contract.GameResult {
  let state = newGame(input, deps);
  const events: GameEvent[] = [];
  let lastCalled: Contract.ObservedCalledPlay | null = null;
  while (state.phase !== 'final') {
    checkPlayGuard(deps, state);
    const run = new Run(deps, input, state, [], 'default', 0, options, lastCalled);
    runUnit(run);
    for (const e of run.events) events.push(e);
    state = run.state;
    lastCalled = run.lastCalled;
  }
  const records: Contract.PlayRecord[] = [];
  const drives: Contract.DriveRecord[] = [];
  for (const e of events) {
    if (e.type === 'play_resolved') records.push(e.record);
    else if (e.type === 'drive_ended') drives.push(e.drive);
  }
  return { final: state, events, records, drives };
}

/**
 * The game flow bound to its rule sources. `apply` uses the bound sources; `newGame`, `advance` and
 * `simulateGame` use the dependencies they are given, which must hold the same rule set.
 */
export function createGameFlow(env: FlowEnv, options: FlowOptions = {}): FlowApi {
  return {
    newGame: (input, deps) => newGame(input, deps),
    apply: (state, event) => applyEvent(env, state, event),
    advance: (state, input, deps, resume) => advance(state, input, deps, options, resume ?? null),
    simulateGame: (input, deps) => simulateGame(input, deps, options),
  };
}

export { replayEvents };

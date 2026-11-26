// Overtime rules (contract: OvertimeRules, WP-03; J11.8.2). The format is data: key `overtime.format`
// selects one of two drivers, and every length, count and yard line is a rule key (params.ts).
//
//   timed_period           B10: a kickoff, an opportunity to possess for each team, then sudden death.
//                          Period length, period limit and timeouts are read by the type of game.
//   alternating_series_25  B13.7.1: each team gets a series from a fixed yard line each period, with
//                          no game clock; later periods force the two-point try, then become tries only.
//
// How the game state machine calls it (these readings fill gaps in the contract; see the WP-03 report):
//   - `start(state, src)` with `state.overtime` null answers `toss`. After the toss the caller stores
//     `begin(...)` in the state and calls `start` again to put the ball in play. The restart is filled
//     only when `src` is a RulingContext, because a spot needs the field geometry.
//   - `afterPossession(state, outcome, ctx)` is called after every play in overtime. `state` is the game
//     state after the play was applied (score, possession), still holding the overtime state from before
//     the play. `ctx.before` is the state at the snap.
//   - A step with `next: 'series'` and no restart means "play on": nothing ended. This includes the try
//     after a touchdown that did not end the game (B10.5.1 item 4).
//   - A step with a restart, or a final, replaces the regulation restart. In the timed format the
//     regulation restarts (try, kickoff) are correct as they are, so the step never carries one.
//   - `periodExpired(state, src)` is called when a timed overtime period runs out.
// Who won is read from the score; a step never names a winner.
import {
  TICKS_PER_SECOND, otherSide, xAtYardsToGoal,
  type GameState, type NumberSources, type OvertimeRules, type OvertimeState, type OvertimeStep, type PlayOutcome,
  type RestartRules, type RestartSetup, type RulingContext, type Side,
} from '@gm/schema';
import { createRestartRules } from '../restart/index.ts';
import { KEY, OT_ALTERNATING, gameKey, type ByGame, type Group } from './params.ts';

type Possession = OvertimeState['possessions'][number];

/** B10.4.1 `ot_state`, and its counterparts for alternating series. */
export type OvertimePhase = 'not_started' | 'first_possession' | 'second_possession' | 'sudden_death';

/** Who acts first at the start of an overtime period. */
export type PeriodOpening =
  | { readonly kind: 'toss' }
  | { readonly kind: 'choice'; readonly side: Side }
  /** The period continues the one before, as between the first and second quarters (B10.3.1 edge case). */
  | { readonly kind: 'carry_over' };

/** The overtime rules with the extras the contract's OvertimeRules has no room for (see the WP-03 report). */
export interface OvertimeRulesX extends OvertimeRules {
  /** The overtime state at the start of a period, once the toss or the choice is settled. */
  begin(otPeriod: number, tossWinner: Side, firstPossession: Side): OvertimeState;
  /** A timed overtime period ran out (B10.2.1 item 5, B10.3.1 item 4). */
  periodExpired(state: GameState, src: NumberSources): OvertimeStep;
  /** Who acts first at the start of the current overtime period (B10.3.1 items 9 and 10, B13.7.1 item 1). */
  periodOpening(state: GameState, tossWinnerDeferred: boolean, src: NumberSources): PeriodOpening;
  phase(state: GameState, src: NumberSources): OvertimePhase;
  /** Length of an overtime period in tenths; 0 when overtime has no game clock. */
  periodLengthTenths(state: GameState, src: NumberSources): number;
  /** True when the current overtime period starts a half, so timeouts are renewed (B10.5.1 item 3). */
  timeoutsRenewed(state: GameState, src: NumberSources): boolean;
  /** Intermission before the current overtime period, in tenths (B10.1.1 item 4, B10.3.1 item 5). */
  intermissionTenths(state: GameState, src: NumberSources): number;
  /** Key `overtime.two_minute_warning` (B10.2.1 item 7; B5.6.2 reads the same key for the fumble limit). */
  twoMinuteWarning(src: NumberSources): boolean;
}

function group(state: GameState): Group { return state.gameType === 'postseason' ? 'postseason' : 'regular'; }
function byGame(state: GameState, src: NumberSources, name: ByGame): number { return src.rules.num(gameKey(group(state), name)); }
function alternating(src: NumberSources): boolean { return src.rules.opt(KEY.format) === OT_ALTERNATING; }
function isContext(src: NumberSources): src is RulingContext { return 'geometry' in src && 'before' in src && 'situation' in src; }
function overtimeOf(state: GameState): OvertimeState {
  if (!state.overtime) throw new Error('overtime rules called on a game that is not in overtime');
  return state.overtime;
}
function copy(ot: OvertimeState): Possession[] { return ot.possessions.map((p) => ({ ...p })); }
function lead(state: GameState): number { return state.score[0] - state.score[1]; }
function step(next: OvertimeStep['next'], state: OvertimeState | null, restart: RestartSetup | null = null): OvertimeStep { return { next, restart, state }; }
function open(side: Side): Possession { return { side, points: 0, ended: false }; }
function closed(side: Side, points: number): Possession { return { side, points, ended: true }; }
/** Position of the period within the cycle that a new toss restarts, from 1. */
function periodInCycle(otPeriod: number, cycle: number): number { return cycle > 0 ? ((otPeriod - 1) % cycle) + 1 : otPeriod; }
function tryOnly(ot: OvertimeState, src: NumberSources): boolean {
  const from = src.rules.num(KEY.tryOnlyFrom);
  return from > 0 && ot.otPeriod >= from;
}

// ---------------------------------------------------------------------------------------------
// Timed period (B10)
// ---------------------------------------------------------------------------------------------

/**
 * B10.4.1: books the play into the possession log. An entry is one opportunity to possess. A free kick
 * is the receiving team's opportunity; a kick the kicking team gets back after the receivers touched it
 * counts as theirs too (items 2 and 3).
 */
function bookTimed(ot: OvertimeState, state: GameState, outcome: PlayOutcome, ctx: RulingContext): Possession[] {
  const log = copy(ot);
  const offense = outcome.snappingSide;
  const defense = otherSide(offense);
  const s = outcome.score && outcome.score.points > 0 ? outcome.score : null;
  const last = log.length > 0 ? log[log.length - 1]! : null;
  const kind = ctx.situation.playKind;

  if (kind === 'try') {
    // Points on a try belong to the possession that scored the touchdown; a try opens no opportunity.
    if (s) for (let i = log.length - 1; i >= 0; i--) if (log[i]!.side === s.side) { log[i]!.points += s.points; break; }
    return log;
  }
  if (kind === 'kickoff' || kind === 'safety_kick') {
    if (last && !last.ended) last.ended = true;
    if (s) {
      // A return for a score is the receivers' opportunity. A score by the kicking team on its own free
      // kick (a recovery in the end zone, a safety on the return) comes after that opportunity.
      if (s.side === defense) log.push(closed(defense, s.points));
      else log.push(closed(defense, 0), closed(offense, s.points));
      return log;
    }
    if (state.possession === defense) { log.push(open(defense)); return log; }
    // The kicking team has the ball after its own free kick: the receivers have had their opportunity.
    log.push(closed(defense, 0), open(offense));
    return log;
  }
  // A scrimmage down or a fair catch kick by the team with the ball.
  const cur = last && !last.ended && last.side === offense ? last : null;
  if (!cur) { if (last && !last.ended) last.ended = true; log.push(open(offense)); }
  const mine = log[log.length - 1]!;
  if (s) {
    mine.ended = true;
    if (s.side === offense) mine.points += s.points;
    else log.push(closed(defense, s.points));
    return log;
  }
  if (state.possession !== offense) { mine.ended = true; log.push(open(defense)); return log; }
  if (outcome.changeOfPossession) {
    // The ball changed hands and came back on the same down (a muffed kick recovered, or a double
    // change of possession): the other team has had its possession (B10.4.1 item 3, B10.4.2 item 4).
    mine.ended = true;
    log.push(closed(defense, 0), open(offense));
  }
  return log;
}

function firstTeam(log: readonly Possession[]): Side | null { return log.length > 0 ? log[0]!.side : null; }
function firstEntryOf(log: readonly Possession[], side: Side): Possession | null { return log.find((p) => p.side === side) ?? null; }

function afterTimed(state: GameState, outcome: PlayOutcome, ctx: RulingContext): OvertimeStep {
  const ot = overtimeOf(state);
  const next: OvertimeState = { ...ot, possessions: bookTimed(ot, state, outcome, ctx) };
  const first = firstTeam(next.possessions);
  const second = first === null ? null : firstEntryOf(next.possessions, otherSide(first));
  const margin = lead(state);
  // B10.5.1 item 4: a touchdown that does not put its team ahead is followed by the try.
  const s = outcome.score;
  if (s && s.type === 'touchdown' && state.score[s.side] <= state.score[otherSide(s.side)]) return step('series', next);
  // B10.2.1 items 2 to 4: once both teams have had their opportunity, the team ahead wins.
  if (second && second.ended && margin !== 0) return step('final_win', next);
  return step('series', next);
}

function expiredTimed(state: GameState, src: NumberSources): OvertimeStep {
  const ot = overtimeOf(state);
  const max = byGame(state, src, 'max_periods');
  const margin = lead(state);
  if (max > 0 && ot.otPeriod >= max) return step(margin !== 0 ? 'final_win' : 'final_tie', ot);
  const first = firstTeam(ot.possessions);
  const second = first === null ? null : firstEntryOf(ot.possessions, otherSide(first));
  if (margin !== 0 && second && second.ended) return step('final_win', ot);
  // B10.3.1 item 4: tied, or the second team's first possession has not ended: another period.
  return step('next_ot_period', { ...ot, otPeriod: ot.otPeriod + 1 });
}

function phaseTimed(ot: OvertimeState, state: GameState): OvertimePhase {
  const first = firstTeam(ot.possessions);
  if (first === null) return 'not_started';
  const second = firstEntryOf(ot.possessions, otherSide(first));
  if (!second) return 'first_possession';
  if (!second.ended && lead(state) !== 0) return 'second_possession';
  return 'sudden_death';
}

// ---------------------------------------------------------------------------------------------
// Alternating series (B13.7.1)
// ---------------------------------------------------------------------------------------------

function seriesRestart(restarts: RestartRules, state: GameState, ot: OvertimeState, side: Side, ctx: RulingContext): RestartSetup {
  const here: RulingContext = { ...ctx, before: state };
  if (tryOnly(ot, ctx)) return restarts.trySetup(side, 'two_point', here);
  return {
    playKind: 'scrimmage', side,
    ballX: xAtYardsToGoal(ctx.geometry, ctx.rules.num(KEY.seriesStart), state.attackDir[side]),
    ballY: ctx.geometry.centreY,
    playClockTenths: ctx.rules.num(KEY.playClockStoppage) * TICKS_PER_SECOND,
  };
}

function afterAlternating(restarts: RestartRules, state: GameState, outcome: PlayOutcome, ctx: RulingContext): OvertimeStep {
  const ot = overtimeOf(state);
  const log = copy(ot);
  if (log.length === 0 || log[log.length - 1]!.ended) log.push(open(log.length === 0 ? ot.firstPossession : otherSide(log[log.length - 1]!.side)));
  const cur = log[log.length - 1]!;
  const offense = cur.side;
  const next: OvertimeState = { ...ot, possessions: log };
  const s = outcome.score && outcome.score.points > 0 ? outcome.score : null;

  if (ctx.situation.playKind === 'try') {
    // The try ends the series whatever happened on it; a defensive score on the try counts but does not end the game.
    if (s && s.side === offense) cur.points += s.points;
    cur.ended = true;
  } else if (s && s.side === offense) {
    cur.points += s.points;
    // A touchdown is followed by its try, which belongs to the same series.
    if (s.type === 'touchdown') return step('series', next);
    cur.ended = true;
  } else if (s) {
    // B13.7.1 item 6: the defense scored on the series other than on the try. The game ends.
    cur.ended = true;
    if (lead(state) !== 0) return step('final_win', next);
  } else if (state.possession !== offense || outcome.changeOfPossession) {
    // A turnover, a failure to make the line to gain, or a missed field goal.
    cur.ended = true;
  } else {
    return step('series', next);
  }

  if (log.length === 1) {
    const other = otherSide(offense);
    log.push(open(other));
    return step(tryOnly(ot, ctx) ? 'try_only' : 'series', next, seriesRestart(restarts, state, ot, other, ctx));
  }
  if (lead(state) !== 0) return step('final_win', next);
  // Tied after a series each: another period. The order alternates until the captain with first choice says otherwise.
  return step('next_ot_period', { otPeriod: ot.otPeriod + 1, possessions: [], tossWinner: ot.tossWinner, firstPossession: otherSide(ot.firstPossession) });
}

function phaseAlternating(ot: OvertimeState): OvertimePhase {
  const done = ot.possessions.filter((p) => p.ended).length;
  if (ot.possessions.length === 0) return 'not_started';
  return done === 0 ? 'first_possession' : 'second_possession';
}

// ---------------------------------------------------------------------------------------------

export function createOvertimeRules(restarts: RestartRules = createRestartRules()): OvertimeRulesX {
  return {
    begin(otPeriod: number, tossWinner: Side, firstPossession: Side): OvertimeState {
      return { otPeriod, possessions: [], tossWinner, firstPossession };
    },

    start(state: GameState, src: NumberSources): OvertimeStep {
      const ot = state.overtime;
      if (!ot) return step('toss', null);
      const ctx = isContext(src) ? src : null;
      if (alternating(src)) {
        const next: OvertimeState = { ...ot, possessions: [open(ot.firstPossession)] };
        return step(tryOnly(ot, src) ? 'try_only' : 'series', next, ctx ? seriesRestart(restarts, state, ot, ot.firstPossession, ctx) : null);
      }
      const kicking = otherSide(ot.firstPossession);
      return step('kickoff', ot, ctx ? restarts.kickoffSetup(kicking, 'kickoff', { ...ctx, before: state }) : null);
    },

    afterPossession(state: GameState, outcome: PlayOutcome, ctx: RulingContext): OvertimeStep {
      // A play that does not count changes nothing.
      if (outcome.noPlay) return step('series', overtimeOf(state));
      return alternating(ctx) ? afterAlternating(restarts, state, outcome, ctx) : afterTimed(state, outcome, ctx);
    },

    timeoutsPerTeam(state: GameState, src: NumberSources): number { return byGame(state, src, 'timeouts'); },

    periodExpired(state: GameState, src: NumberSources): OvertimeStep {
      // Alternating series have no game clock: nothing can expire.
      return alternating(src) ? step('series', overtimeOf(state)) : expiredTimed(state, src);
    },

    periodOpening(state: GameState, tossWinnerDeferred: boolean, src: NumberSources): PeriodOpening {
      const ot = overtimeOf(state);
      const loser = otherSide(ot.tossWinner);
      if (alternating(src)) {
        // B13.7.1 item 1: the winner chooses in the first period; first choice then alternates, the loser in even periods.
        return { kind: 'choice', side: ((ot.otPeriod - 1) & 1) === 1 ? loser : ot.tossWinner };
      }
      const cycle = byGame(state, src, 'new_toss_after_periods');
      const n = periodInCycle(ot.otPeriod, cycle);
      const firstChooser = tossWinnerDeferred ? loser : ot.tossWinner;
      if (n === 1) return ot.otPeriod === 1 ? { kind: 'choice', side: firstChooser } : { kind: 'toss' };
      if (n === byGame(state, src, 'loser_chooses_at_period')) return { kind: 'choice', side: otherSide(firstChooser) };
      return { kind: 'carry_over' };
    },

    phase(state: GameState, src: NumberSources): OvertimePhase {
      const ot = state.overtime;
      if (!ot) return 'not_started';
      return alternating(src) ? phaseAlternating(ot) : phaseTimed(ot, state);
    },

    periodLengthTenths(state: GameState, src: NumberSources): number { return byGame(state, src, 'period_length_s') * TICKS_PER_SECOND; },

    timeoutsRenewed(state: GameState, src: NumberSources): boolean {
      const perHalf = byGame(state, src, 'periods_per_half');
      return perHalf <= 1 || (overtimeOf(state).otPeriod - 1) % perHalf === 0;
    },

    intermissionTenths(state: GameState, src: NumberSources): number {
      const first = !state.overtime || state.overtime.otPeriod === 1;
      return src.rules.num(first ? KEY.intermission : KEY.periodBreak) * TICKS_PER_SECOND;
    },

    twoMinuteWarning(src: NumberSources): boolean { return src.rules.bool(KEY.twoMinuteWarning); },
  };
}

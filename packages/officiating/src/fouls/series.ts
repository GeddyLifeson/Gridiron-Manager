// The down after a penalty (B8.5.4) and the period extension that an accepted foul can give (B1.7.2).
// `SeriesRules.next` (WP-02) owns the series state; this file is the B8.5.4 reading of an outcome that
// carries an enforcement summary, offered to the series module and used by the foul tests.
import { otherSide, type FoulRecord, type PlayOutcome, type RulingContext, type Side } from '@gm/schema';
import { toFieldX, toTeamA } from './facts.ts';
import { K } from './params.ts';

export interface DownAfterPenalty {
  readonly possession: Side;
  readonly down: number;
  readonly distanceYd: number;
  readonly lineToGainX: number;
  readonly goalToGo: boolean;
  readonly firstDownAwarded: boolean;
  readonly turnoverOnDowns: boolean;
}

/**
 * B8.5.4 rules 1 to 8. Returns null when no scrimmage down follows from this outcome alone: a score, a
 * try, a free kick, or a penalty carried to one.
 */
export function downAfterPenalty(outcome: PlayOutcome, fouls: readonly FoulRecord[], ctx: RulingContext): DownAfterPenalty | null {
  const s = ctx.situation;
  if (outcome.score !== null || s.playKind !== 'scrimmage' || s.down === null || s.lineToGainX === null) return null;
  const A = outcome.snappingSide;
  const length = ctx.geometry.goalLineEastX - ctx.geometry.goalLineWestX;
  const downs = ctx.rules.num(K.downs);
  const toGain = ctx.rules.num(K.yardsToGain);
  const spot = toTeamA(ctx, outcome.spotX);
  const line = toTeamA(ctx, s.lineToGainX);
  const e = outcome.enforcement;

  // A new series for `side` from `at`, with the line to gain measured from `chainFrom`.
  const fresh = (side: Side, at: number, chainFrom: number, awarded: boolean, onDowns: boolean): DownAfterPenalty => {
    const own = side === A ? at : length - at;
    const chain = side === A ? chainFrom : length - chainFrom;
    const target = Math.min(chain + toGain, length);
    const lineA = side === A ? target : length - target;
    return { possession: side, down: 1, distanceYd: target - own, lineToGainX: toFieldX(ctx, lineA), goalToGo: chain + toGain >= length,
      firstDownAwarded: awarded, turnoverOnDowns: onDowns };
  };
  const same = (down: number): DownAfterPenalty => ({ possession: A, down, distanceYd: line - spot, lineToGainX: s.lineToGainX!,
    goalToGo: line >= length, firstDownAwarded: false, turnoverOnDowns: false });
  const counted = (): DownAfterPenalty => (s.down! >= downs ? fresh(otherSide(A), spot, spot, false, true) : same(s.down! + 1));

  // Rule 5: after a change of possession the team in possession starts a series where the ball ends.
  if (outcome.possessionAfter !== A) return fresh(outcome.possessionAfter, spot, spot, false, false);
  const reached = spot >= line;
  if (e === null || (e.enforced.length === 0 && !e.offsetting)) return reached ? fresh(A, spot, spot, true, false) : counted();
  // Rules 1, 3 and 7: the down is replayed with the same number unless the yardage reaches the line or gives a first down.
  if (outcome.noPlay) return e.automaticFirstDown || reached ? fresh(A, spot, spot, true, false) : same(s.down);

  const after = e.enforced.every((i) => fouls[i]!.timing === 'dead_ball' || fouls[i]!.timing === 'between_downs');
  if (after && e.fromSpot !== null) {
    // Rules 6 and 8: the down just played counts, then the yardage is added.
    const before = toTeamA(ctx, e.fromSpot.x);
    if (before >= line) {
      const between = e.enforced.every((i) => fouls[i]!.timing === 'between_downs');
      const byOffense = e.enforced.some((i) => fouls[i]!.side === A);
      // A dead-ball foul after the first down: first and ten after enforcement. A foul between downs by
      // the offense: the new series has started, so the line to gain stays where the play set it.
      return between && byOffense ? fresh(A, spot, before, true, false) : fresh(A, spot, spot, true, false);
    }
    if (e.automaticFirstDown || reached) return fresh(A, spot, spot, true, false);
    return counted();
  }
  // Rule 2: a loss-of-down foul counts the down.
  if (e.lossOfDown) return counted();
  if (e.automaticFirstDown || reached) return fresh(A, spot, spot, true, false);
  return e.replayDown ? same(s.down) : counted();
}

/**
 * B1.7.2 (a) and (h): may the period be extended by an untimed down because of this enforcement? True
 * for an accepted live-ball foul by the defense that is not carried to a later kick, and for a double
 * foul that replays the down. The clock module decides whether time had expired.
 */
export function periodExtension(outcome: PlayOutcome, fouls: readonly FoulRecord[], ctx: RulingContext): boolean {
  const e = outcome.enforcement;
  if (e === null || e.carriedTo !== null || e.enforced.length === 0) return false;
  if (e.offsetting) return outcome.noPlay;
  if (!ctx.rules.bool(K.defensiveFoulExtends)) return false;
  return e.enforced.some((i) => fouls[i]!.side !== outcome.snappingSide && fouls[i]!.timing === 'live');
}

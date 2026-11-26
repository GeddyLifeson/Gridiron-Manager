// The video evidence model (B9.2.1 rule 5). Replay never changes a correct ruling. A wrong ruling
// is changed with a chance equal to the evidence quality: how far the truth was from the decision
// boundary, how well the act could be seen, and how many cameras the game has.
import type { PlayTruth, Ruling, RulingContext } from '@gm/schema';
import { foulReplaySwitch } from '../crew/index.ts';
import { REPLAY, assistKey } from './params.ts';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function isWrong(r: Ruling): boolean { return r.calledValue !== r.trueValue; }

/** True when the ball at field x has reached the line to gain of this play. */
function reachedLine(x: number, ctx: RulingContext): boolean {
  const line = ctx.situation.lineToGainX;
  return line !== null && (x - line) * ctx.situation.attackDir >= 0;
}

/**
 * Does changing this ruling change the result of the play? A spot counts only when the correct spot
 * is on the other side of the line to gain (B9.3.1 "Line to gain": the ball is placed correctly in
 * every case, but the review succeeds only if the first-down ruling changes).
 */
export function changesTheResult(r: Ruling, ctx: RulingContext): boolean {
  if (!isWrong(r)) return false;
  if (r.aspect !== 'spot') return true;
  return reachedLine(Number(r.trueValue), ctx) !== reachedLine(Number(r.calledValue), ctx);
}

/** Evidence quality of one ruling, 0 to 1 (B9.2.1 rule 5). */
export function evidenceQuality(r: Ruling, ctx: RulingContext): number {
  const num = (name: string) => ctx.params.num(name);
  let m: number | null = null;
  if (r.aspect === 'spot') {
    const off = Number(r.trueValue) - Number(r.calledValue);
    m = (off < 0 ? -off : off) / num(REPLAY.evidenceScaleYd);
  } else {
    if (r.marginYd !== null) m = r.marginYd / num(REPLAY.evidenceScaleYd);
    if (r.marginS !== null) {
      const s = r.marginS / num(REPLAY.evidenceScaleS);
      if (m === null || s < m) m = s;
    }
  }
  const clarity = m === null ? num(REPLAY.evidenceNoMargin) : 1 - ctx.math.exp(-m);
  const sight = num(r.visibility === 'open' ? REPLAY.evidenceSightOpen : r.visibility === 'crowded' ? REPLAY.evidenceSightCrowded : REPLAY.evidenceSightPile);
  const cameras = ctx.before.gameType === 'postseason' ? num(REPLAY.postseasonCameraFactor) : 1;
  return clamp01(sight * clarity * cameras);
}

/** A flag with no foul behind it. Replay can pick a flag up; it never adds one (B9.5.1 rule 3). */
function mistakenFlag(r: Ruling): boolean {
  return r.aspect === 'foul' && r.trueValue === 'no_foul' && r.calledValue === 'foul';
}

/** May a formal review (coach or booth) change this ruling? */
export function reviewCanChange(r: Ruling): boolean {
  if (!r.reviewable || !isWrong(r)) return false;
  return r.aspect !== 'foul' || mistakenFlag(r);
}

/** May replay assist change this ruling (B9.5.1 rules 1 to 3)? */
export function assistCanChange(r: Ruling, truth: PlayTruth, ctx: RulingContext): boolean {
  if (!isWrong(r)) return false;
  if (r.aspect === 'down_by_contact') return false;
  if (r.aspect === 'foul') {
    const e = truth.events[r.eventIndex];
    return mistakenFlag(r) && e !== undefined && e.type === 'foul_committed' && foulReplaySwitch(ctx.rules, e.foulId, 'assist_removable');
  }
  return ctx.rules.bool(assistKey(r.aspect));
}

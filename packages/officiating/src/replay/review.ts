// ReplayRules.review (B9.2.1, B9.4.1, B9.5.1). A review looks at every ruling replay may change,
// whatever the reason it started (B9.2.1 rule 2), each one by itself (rule 3). It returns the
// corrected seen record; the facade rules and enforces that record again.
// Draws: stream `officials`, scope [game, play, n], where n is the first index after the field
// officials for a review and the next one for replay assist. One draw per ruling, wrong or not, so a
// ruling's result does not depend on the other rulings, and looking twice gives the same answer.
import type { PlayTruth, ReviewRequest, Ruling, RulingContext } from '@gm/schema';
import { ASSIST_STREAM_INDEX, BOOTH_STREAM_INDEX, seenFrom, type PlacementValues } from '../crew/index.ts';
import { challengeRefusal } from './challenge.ts';
import { assistCanChange, changesTheResult, evidenceQuality, reviewCanChange } from './evidence.ts';
import { KEY, REFUSED, REPLAY } from './params.ts';

export interface ReviewOutcome { allowed: boolean; refusedKey: string | null; reversed: number[]; seen: PlayTruth }

export function placementValues(ctx: RulingContext): PlacementValues {
  return {
    continuingActionS: ctx.params.num(REPLAY.continuingActionS),
    noRecoveryEndZoneYardline: ctx.rules.num(KEY.noRecoveryEndZoneYardline),
  };
}

export function review(seen: PlayTruth, truth: PlayTruth, rulings: readonly Ruling[], request: ReviewRequest, ctx: RulingContext): ReviewOutcome {
  if (request.source === 'coach_challenge') {
    let refusedKey = request.side === null ? REFUSED.notReviewable : challengeRefusal(null, request.side, ctx);
    if (refusedKey === null && !rulings.some((r) => r.reviewable && request.aspects.includes(r.aspect))) refusedKey = REFUSED.notReviewable;
    if (refusedKey !== null) return { allowed: false, refusedKey, reversed: [], seen };
  }
  const assist = request.source === 'replay_assist';
  const factor = assist ? ctx.params.num(REPLAY.assistFactor) : 1;
  const stream = ctx.streams('officials', [truth.gameId, truth.playNumber, assist ? ASSIST_STREAM_INDEX : BOOTH_STREAM_INDEX]);
  const corrected = new Set<number>();
  rulings.forEach((r, i) => {
    const u = stream.uniform();
    const open = assist ? assistCanChange(r, truth, ctx) : reviewCanChange(r);
    if (open && u < evidenceQuality(r, ctx) * factor) corrected.add(i);
  });
  if (corrected.size === 0) return { allowed: true, refusedKey: null, reversed: [], seen };
  const reversed = [...corrected].filter((i) => changesTheResult(rulings[i]!, ctx)).sort((a, b) => a - b);
  return { allowed: true, refusedKey: null, reversed, seen: seenFrom(truth, rulings, corrected, ctx, placementValues(ctx)) };
}

// Which crowd reaction a play gets (MB-7, O5.3.2 amendment rule 2). Pure: a feed in, at most one
// reaction out. The reaction follows the ruling on the field (B11), never the truth layer: the only
// inputs are the feed's ruling cues, the called result's yards and the play's camera positions.
//
// Perspective: the people in the stands back the home team (J12.6.1: noise is the home crowd). So a
// cheer needs a ruling that is good for the home side, and the one disapproval sound needs a flag
// that went against it. A road touchdown gets no reaction: the bed (the noise value) is the sound of
// that. The user's side never changes what the crowd does.

import { CROWD_REACTION_RANK, type CrowdReaction } from '../engine/index.ts';
import { isRuling, type CrowdFeed, type CrowdRulingCue, type CrowdRulingKind, type CrowdSide } from './types.ts';

/**
 * A first down this long or longer counts as a big gain. Assumption (design value): 20 yards is the
 * common "explosive play" line for a pass; it is a presentation threshold, not a game rule or a
 * measured fact, and no game result depends on it.
 */
export const BIG_GAIN_YARDS = 20;

/** Sound id per reaction (PV-07 recipes). */
export const REACTION_SOUND: Readonly<Record<CrowdReaction, string>> = {
  touchdown: 'crowd.react.touchdown',
  turnover: 'crowd.react.turnover',
  bigGain: 'crowd.react.bigGain',
  sack: 'crowd.react.sack',
  flagAgainstHome: 'crowd.react.flagAgainstHome',
  reviewReversal: 'crowd.react.reviewReversal',
};

/** Rulings that can make the home crowd cheer, when good for the home side. */
const CHEER: Partial<Record<CrowdRulingKind, CrowdReaction>> = {
  touchdown: 'touchdown',
  interception: 'turnover',
  fumble_lost: 'turnover',
  turnover_on_downs: 'turnover',
  // A safety scores for the defense and gives it the ball by free kick (B7): the turnover swell.
  safety: 'turnover',
  sack: 'sack',
  review_reversed: 'reviewReversal',
};

export interface ReactionPick {
  readonly kind: CrowdReaction;
  readonly soundId: string;
  /** The ruling cue that set it off; the reaction starts on its tick (MB-1). */
  readonly cue: CrowdRulingCue;
  /** Field x for the pan (MB-8): the last camera position at or before the ruling, if any. */
  readonly fieldX: number | undefined;
}

/** Every reaction the play's rulings call for, before the one-per-play pick. */
export function reactionCandidates(feed: CrowdFeed): { kind: CrowdReaction; cue: CrowdRulingCue }[] {
  const home: CrowdSide = feed.perspective.homeSide;
  const road: CrowdSide = home === 0 ? 1 : 0;
  const out: { kind: CrowdReaction; cue: CrowdRulingCue }[] = [];
  for (const c of feed.cues) {
    if (!isRuling(c)) continue;
    if (c.ruling === 'penalty') {
      // Good for the road side means the flag was against home. Offsetting fouls (null) draw nothing.
      if (c.favours === road) out.push({ kind: 'flagAgainstHome', cue: c });
      continue;
    }
    if (c.favours !== home) continue;
    const cheer = CHEER[c.ruling];
    if (cheer) out.push({ kind: cheer, cue: c });
    else if (c.ruling === 'first_down' && !feed.result.noPlay && feed.result.yardsGained >= BIG_GAIN_YARDS) out.push({ kind: 'bigGain', cue: c });
  }
  return out;
}

/** The one reaction for this play: highest rank, then earliest tick. Null when the crowd has nothing to react to. */
export function pickReaction(feed: CrowdFeed, rank: readonly CrowdReaction[] = CROWD_REACTION_RANK): ReactionPick | null {
  let best: { kind: CrowdReaction; cue: CrowdRulingCue } | null = null;
  for (const c of reactionCandidates(feed)) {
    if (!best) { best = c; continue; }
    const r = rank.indexOf(c.kind), b = rank.indexOf(best.kind);
    if (r < b || (r === b && c.cue.tick < best.cue.tick)) best = c;
  }
  if (!best) return null;
  return { kind: best.kind, soundId: REACTION_SOUND[best.kind], cue: best.cue, fieldX: fieldXAt(feed, best.cue) };
}

function fieldXAt(feed: CrowdFeed, ruling: CrowdRulingCue): number | undefined {
  let x: number | undefined;
  for (const c of feed.cues) {
    if (c.tick > ruling.tick) break;
    if (!isRuling(c) && typeof c.x === 'number') x = c.x;
  }
  return x;
}

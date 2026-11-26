// Non-foul rulings and their errors (B11.2.1, B11.3.2 rules 2 to 4). The crew walks the truth record
// in order and rules on each close act. A ruling that ends the play in the crew's eyes (a catch seen
// as incomplete, a fumble seen as down by contact, a whistle) stops the walk: nothing after it was
// ruled on. What each wrong ruling does to the record is in seen.ts.
//
// Wrong rulings this model can produce, and the ones it cannot (the truth record ends at the true
// dead ball, so a ruling that would let the play run on past it has nothing to run on):
//   catch                    both directions
//   fumble before down       a true fumble ruled down; not a true down ruled a fumble
//   forward or backward pass both directions, when the pass reached the ground
//   score                    both directions for a runner at the goal line
//   spot                     continuous error on every runner-down spot
//   touching of a kick       both directions: a true touch not seen, and a touch by the receivers that
//                            did not happen, ruled when the kickers recover or down the kick (the only
//                            time it changes the ruling: B6.3.2 item 4). The play runs on as it did.
//   field goal or try        both directions
//   in bounds                recorded, never wrong (a missed step out of bounds needs continuing action)
//   possession of a loose ball  not ruled: the possession event carries no margin
import {
  possible, roundYd, yardsToGoal,
  type OfficialPosition, type PlayTruth, type Side, type RandomStream, type Ruling, type RulingAspect, type RulingContext, type TruthEventOf,
} from '@gm/schema';
import { CREW, errorScaleSParam, errorScaleYdParam, reviewableKey, type MarginAspect } from './params.ts';
import { attackDirOf, deadBallIndex, possessionSideBefore } from './seen.ts';
import { viewOf, type OfficialSpot } from './zones.ts';

type Dead = TruthEventOf<'dead_ball'>;
type Judged = Pick<Dead, 'marginYd' | 'marginS' | 'visibility'>;

/** Dead-ball reasons that leave the ball in a runner's hands at a spot the crew has to mark. */
export const RUNNER_DOWN_REASONS: readonly Dead['reason'][] = [
  'down_by_contact', 'forward_progress_stopped', 'gave_himself_up', 'runner_out_of_bounds', 'touched_on_ground',
  'runner_down_without_contact',
];

const min = (a: number, b: number) => (a < b ? a : b);
const NOT_CLOSE: Judged = { marginYd: null, marginS: null, visibility: 'open' };

function errorSight(visibility: Judged['visibility'], ctx: RulingContext): number {
  const name = visibility === 'open' ? CREW.errorSightOpenFactor : visibility === 'crowded' ? CREW.errorSightCrowdedFactor : CREW.errorSightPileFactor;
  return ctx.params.num(name);
}

/**
 * B11.3.2 rule 2: error = 0.5 x exp(-margin / m0), scaled by visibility and crew accuracy, never
 * above the coin flip at the boundary. The margin is taken in yards or in seconds, whichever the act
 * carries; with both, the one nearer its boundary counts. No margin means it was not a close call.
 */
export function rulingErrorChance(aspect: MarginAspect, j: Judged, ctx: RulingContext): number {
  let m: number | null = null;
  if (j.marginYd !== null) m = j.marginYd / ctx.params.num(errorScaleYdParam(aspect));
  if (j.marginS !== null) {
    const s = j.marginS / ctx.params.num(errorScaleSParam(aspect));
    if (m === null || s < m) m = s;
  }
  if (m === null) return possible(0);
  const top = ctx.params.num(CREW.errorAtBoundary);
  return possible(min(top, top * ctx.math.exp(-m) * errorSight(j.visibility, ctx) * ctx.crew.accuracy));
}

/** Standard deviation of the spotting error in yards (B11.3.2 rule 3), scaled by crew accuracy. */
export function spotSd(visibility: Judged['visibility'], ctx: RulingContext): number {
  const name = visibility === 'open' ? CREW.spotSdOpenYd : visibility === 'crowded' ? CREW.spotSdCrowdedYd : CREW.spotSdPileYd;
  return ctx.params.num(name) * ctx.crew.accuracy;
}

export type StreamOf = (official: OfficialSpot) => RandomStream;

export function decideRulings(truth: PlayTruth, ctx: RulingContext, spots: readonly OfficialSpot[], streamOf: StreamOf): Ruling[] {
  const ev = truth.events;
  const g = ctx.geometry;
  const rulings: Ruling[] = [];
  const deadIndex = deadBallIndex(truth);
  const dead = deadIndex >= 0 ? (ev[deadIndex] as Dead) : null;
  const canReview = (aspect: RulingAspect) => ctx.rules.bool(reviewableKey(aspect));

  const official = (x: number, y: number) => viewOf(spots, x, y, null, ctx).official;
  const add = (aspect: RulingAspect, eventIndex: number, trueValue: string, calledValue: string, j: Judged, by: OfficialPosition, reviewable: boolean) => {
    rulings.push({ aspect, eventIndex, trueValue, calledValue, marginYd: j.marginYd, marginS: j.marginS, visibility: j.visibility, official: by, reviewable });
  };
  /** One close call: draws only when a mistake is possible. */
  const mistaken = (aspect: MarginAspect, j: Judged, by: OfficialSpot) => {
    const p = rulingErrorChance(aspect, j, ctx);
    return p > 0 && streamOf(by).chance(p);
  };

  const whistlePerEvent = ctx.params.num(CREW.erroneousWhistlePerGame) / ctx.params.num(CREW.whistleChancesPerGame) * ctx.crew.accuracy;

  let stopped = false;
  let deadRuled = false;
  /** Kick state for a touch that did not happen: the kicking team, whether the receivers touched or held the ball, the last landing. */
  let kickers: Side | null = null;
  let receiversTouched = false;
  let landing: Judged = NOT_CLOSE;
  for (let i = 0; i < ev.length && !stopped; i++) {
    const e = ev[i]!;
    if (dead && i > deadIndex) break;

    if (e.type === 'pass_release') {
      const by = official(e.releaseSpot.x, e.releaseSpot.y);
      if (e.forward) {
        // Matters only when the pass fell incomplete: ruled backward, the ball would be loose.
        if (dead && dead.reason === 'incomplete_pass') {
          const wrong = mistaken('forward_or_backward_pass', e, by);
          add('forward_or_backward_pass', i, 'forward', wrong ? 'backward' : 'forward', e, by.position, canReview('forward_or_backward_pass'));
          if (wrong) deadRuled = true;
        }
      } else if (ev.some((x, j) => j > i && x.type === 'fumble' && x.kind === 'backward_pass_loose')) {
        const wrong = mistaken('forward_or_backward_pass', e, by);
        add('forward_or_backward_pass', i, 'backward', wrong ? 'forward' : 'backward', e, by.position, canReview('forward_or_backward_pass'));
        if (wrong) stopped = true;
      }
    } else if (e.type === 'catch_point') {
      const by = official(e.spot.x, e.spot.y);
      if (e.outcome === 'catch' || e.outcome === 'interception') {
        const value = e.outcome === 'catch' ? 'complete' : 'intercepted';
        const wrong = mistaken('catch', e, by);
        add('catch', i, value, wrong ? 'incomplete' : value, e, by.position, canReview('catch'));
        if (wrong) stopped = true;
      } else if ((e.outcome === 'drop' || e.outcome === 'grounded') && e.intendedId !== null && dead && dead.reason === 'incomplete_pass'
        && !ev.some((x, j) => j > i && x.type === 'catch_point')) {
        const wrong = mistaken('catch', e, by);
        add('catch', i, 'incomplete', wrong ? 'complete' : 'incomplete', e, by.position, canReview('catch'));
        if (wrong) stopped = true;
      }
    } else if (e.type === 'fumble' && e.kind === 'fumble') {
      const by = official(e.spot.x, e.spot.y);
      const wrong = mistaken('fumble_before_down', e, by);
      add('fumble_before_down', i, 'fumble', wrong ? 'down' : 'fumble', e, by.position, canReview('fumble_before_down'));
      if (wrong) stopped = true;
    } else if (e.type === 'boundary') {
      const by = official(e.spot.x, e.spot.y);
      if (e.kind === 'player_out_of_bounds' && e.playerId !== null) {
        add('in_bounds', i, 'out', 'out', e, by.position, canReview('in_bounds'));
      } else if (e.kind === 'ball_crosses_goal_line' && dead && dead.reason === 'ball_across_goal_line_in_possession'
        && e.playerId !== null && e.playerId === dead.carrierId && !deadRuled) {
        const wrong = mistaken('score', e, by);
        add('score', i, 'score', wrong ? 'short' : 'score', e, by.position, canReview('score'));
        if (wrong) deadRuled = true;
      }
    } else if (e.type === 'kick') {
      kickers = possessionSideBefore(truth, i, ctx.situation.offense);
      receiversTouched = false;
      landing = NOT_CLOSE;
    } else if (e.type === 'kick_touch' && e.kind === 'landed') {
      landing = e;
    } else if (e.type === 'possession' && kickers !== null && !receiversTouched && e.side !== kickers) {
      receiversTouched = true;
    } else if (kickers !== null && !receiversTouched
      && ((e.type === 'possession' && e.side === kickers) || (e.type === 'dead_ball' && e.reason === 'kick_recovered_by_kickers' && e.side === kickers))) {
      // B11.3.2 rule 2 and A3.1 ruling 22: the receivers are ruled to have touched the kick before the kickers got
      // it, by recovering it or by downing it (a dead ball recovered by the kickers with no possession event).
      // The margin is the landing's, when the resolver gives one; otherwise only the floor chance.
      const by = official(e.spot.x, e.spot.y);
      if (mistaken('touching', landing, by)) add('touching', i, 'untouched', 'touched', landing, by.position, canReview('touching'));
      kickers = null;
    } else if (e.type === 'kick_touch' && (e.kind === 'touched_by_receivers' || e.kind === 'touched_by_kickers')) {
      if (e.kind === 'touched_by_receivers') receiversTouched = true;
      const by = official(e.spot.x, e.spot.y);
      const wrong = mistaken('touching', e, by);
      add('touching', i, 'touched', wrong ? 'untouched' : 'touched', e, by.position, canReview('touching'));
    } else if (e.type === 'tackle_attempt' && e.outcome !== 'made') {
      // B11.3.2 rule 4: the official thinks the runner is down and blows the play dead. Never reviewable.
      const by = official(e.spot.x, e.spot.y);
      if (whistlePerEvent > 0 && streamOf(by).chance(whistlePerEvent)) {
        add('down_by_contact', i, 'live', 'whistle', { marginYd: null, marginS: null, visibility: 'open' }, by.position, false);
        stopped = true;
      }
    } else if (e.type === 'dead_ball' && !deadRuled) {
      const by = official(e.spot.x, e.spot.y);
      if (e.reason === 'kick_through_uprights' || e.reason === 'kick_failed') {
        const value = e.reason === 'kick_through_uprights' ? 'good' : 'no_good';
        const wrong = mistaken('kick_good', e, by);
        add('kick_good', i, value, wrong ? (value === 'good' ? 'no_good' : 'good') : value, e, by.position, canReview('kick_good'));
      } else if (RUNNER_DOWN_REASONS.includes(e.reason) && e.side !== null && e.carrierId !== null) {
        // A runner down just short of the goal line he attacks: the margin is the distance to the plane.
        const toGoal = yardsToGoal(g, e.spot.x, attackDirOf(e.side, truth, ctx));
        let scoreCalled = false;
        if (toGoal > 0 && toGoal <= ctx.params.num(CREW.scoreWindowYd)) {
          const j: Judged = { marginYd: toGoal, marginS: null, visibility: e.visibility };
          scoreCalled = mistaken('score', j, by);
          add('score', i, 'short', scoreCalled ? 'score' : 'short', j, by.position, canReview('score'));
        }
        if (!scoreCalled) {
          // B11.3.2 rule 3: the called spot is the true spot plus an error along the field. An error
          // that would carry the ball across a goal line is dropped: a score is its own ruling.
          const sd = spotSd(e.visibility, ctx);
          let seenX = e.spot.x;
          if (sd > 0) {
            const x = roundYd(e.spot.x + streamOf(by).normal() * sd);
            if (x > g.goalLineWestX && x < g.goalLineEastX) seenX = x;
          }
          const line = ctx.situation.lineToGainX;
          const offenseBall = e.side === ctx.situation.offense;
          const margin = line !== null && offenseBall ? (e.spot.x > line ? e.spot.x - line : line - e.spot.x) : null;
          add('spot', i, String(e.spot.x), String(seenX), { marginYd: margin, marginS: null, visibility: e.visibility }, by.position,
            canReview('spot') && line !== null && offenseBall);
        }
      }
    }
  }
  return rulings;
}

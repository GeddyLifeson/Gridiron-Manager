// The rating response of the event contests a tackler, a ball carrier and a receiver decide alone (J6.1.3,
// Q1.7.3): one standard deviation of skill moves the outcome's log-odds by about what real player rates show
// (missed tackles 0.31, broken tackles 0.35, drops 0.29 logit per player sd; PFR advanced tables, 1 of 3), and
// not by the 0.5 the leaves started from. Bands are wide because the real numbers are one source.
import { describe, expect, it } from 'vitest';
import { contests } from './helpers.ts';

const logit = (p: number): number => Math.log(p / (1 - p));
const square = { angleQuality: 1, lunging: false, momentumRatio: 1, tacklers: 1, roomToCut: 0, moveWon: false, stripAttempt: false, zContactBalance: 0, type: 'headOn' as const };

describe('event contest rating response', () => {
  it('tackle: one z of tackler against carrier is worth 0.2 to 0.45 logit', () => {
    const ladder = [-2, -1, 0, 1, 2].map((dz) => contests.tackle.tackleProbability({ ...square, dz }));
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]!).toBeGreaterThan(ladder[i - 1]!);
    const perZ = (logit(ladder[4]!) - logit(ladder[0]!)) / 4;
    expect(perZ).toBeGreaterThan(0.2);
    expect(perZ).toBeLessThan(0.45);
  });

  it('uncontested catch: one z of hands is worth 0.2 to 0.4 logit', () => {
    const at = (zHands: number): number => contests.catchPoint.uncontestedCatchProbability({ zHands, placementError: 0.3, hitAtCatch: false, wet: false });
    const ladder = [-2, -1, 0, 1, 2].map(at);
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]!).toBeGreaterThan(ladder[i - 1]!);
    const perZ = (logit(ladder[4]!) - logit(ladder[0]!)) / 4;
    expect(perZ).toBeGreaterThan(0.2);
    expect(perZ).toBeLessThan(0.4);
  });

  it('holding on through the ground follows the same hands slope, scaled', () => {
    const perZ = (logit(contests.catchPoint.surviveGroundProbability(2, false)) - logit(contests.catchPoint.surviveGroundProbability(-2, false))) / 4;
    expect(perZ).toBeGreaterThan(0.15);
    expect(perZ).toBeLessThan(0.4);
  });
});

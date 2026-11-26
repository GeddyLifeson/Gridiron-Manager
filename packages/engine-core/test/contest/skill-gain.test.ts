// The rating response of the block engagements (J6.2.1 acceptance 3, Q1.7.3): a better player wins more
// often, by an amount of the size real win rates show, and never by so much that one grade step decides it.
import { describe, expect, it } from 'vitest';
import { contestStream, contests, runEngagement, share } from './helpers.ts';

const TRIALS = 6000;
const WINDOW_TICKS = 25; // ESPN's pass rush win: the block is beaten inside 2.5 seconds.
const logit = (p: number): number => Math.log(p / (1 - p));

function rusherWinShare(kind: 'pass' | 'run', zDifference: number): number {
  const params = kind === 'pass' ? contests.passRush.engagement('edge') : contests.runBlock.engagement('oneGap');
  const gain = kind === 'pass' ? contests.passRush.skillGain() : contests.runBlock.skillGain();
  return share(TRIALS, (i) => runEngagement(params, gain * zDifference, 0, WINDOW_TICKS, contestStream(i, `${kind}Block`)).a <= -1);
}

describe.each(['pass', 'run'] as const)('%s block rating response', (kind) => {
  const ladder = [2, 1, 0, -1, -2].map((dz) => rusherWinShare(kind, dz));

  it('is monotone: the worse the blocker against his man, the more often he is beaten', () => {
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]!).toBeGreaterThan(ladder[i - 1]!);
  });

  it('moves about 0.4 logit per z, the slope of ESPN win rates (band 0.2 to 0.7)', () => {
    const perZ = (logit(ladder[4]!) - logit(ladder[0]!)) / 4;
    expect(perZ).toBeGreaterThan(0.2);
    expect(perZ).toBeLessThan(0.7);
  });

  it('never lets one standard deviation decide the rep', () => {
    expect(ladder[3]!).toBeLessThan(0.35);
    expect(ladder[1]!).toBeGreaterThan(0.01);
  });
});

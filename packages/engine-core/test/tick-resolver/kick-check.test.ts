// I4.6.1 the trigger read of a fake, as pure functions: is the look there, and how likely the
// designated player is to read it right. FIXTURE alignments; the two chances are the bible's.
import { describe, expect, it } from 'vitest';
import type { Assignment } from '@gm/schema';
import { DMATH } from '../../src/index.ts';
import { checkReadChance, lookShown, tickResolverParams, type LookCondition } from '../../src/tick-resolver/index.ts';
import { asg } from '../presnap/support.ts';
import { ALL_TABLE } from './support.ts';

const O: Assignment[] = [];
for (let i = 0; i < 9; i++) O.push(asg(`P${i}`, 'protectKick', -0.4, (i - 4) * 1.4, true));
O.push(asg('PP', 'protectKick', -6, 1, false), asg('P', 'kicker', -14, 0, false));
/** Ten rushers across the front, 1.4 yd apart from -6.3 to +6.3, and a returner deep. */
const front = (): Assignment[] => {
  const out: Assignment[] = [];
  for (let i = 0; i < 10; i++) out.push(asg(`R${i}`, 'rushKick', 1, (i - 4.5) * 1.4, true));
  out.push(asg('PR', 'returner', 45, 0, false));
  return out;
};
const shown = (conds: LookCondition[], D: Assignment[] = front(), disguise: { teamSlot: number; shown: { px: number; py: number } }[] = []): boolean => lookShown(conds, O, D, disguise);

describe('I4.6.1 is the look there', () => {
  it('uncovered: nobody lined up over the man', () => {
    const gunner = [...O]; gunner[8] = asg('G', 'gunner', -0.4, 20, true);
    const over = (D: Assignment[]): boolean => lookShown([{ kind: 'uncovered', teamSlot: 8, lateralYd: 2, depthYd: 8 }], gunner, D, []);
    expect(over(front())).toBe(true);
    const covered = front(); covered[9] = asg('J', 'jammer', 1, 19, true);
    expect(over(covered)).toBe(false);
    // A man deep over him is not covering him at the line.
    const deep = front(); deep[9] = asg('S', 'returner', 30, 20, false);
    expect(over(deep)).toBe(true);
  });
  it('box at most: counts the defenders inside the width and depth', () => {
    expect(shown([{ kind: 'boxAtMost', count: 6, halfWidthYd: 8, depthYd: 5 }])).toBe(false);
    expect(shown([{ kind: 'boxAtMost', count: 10, halfWidthYd: 8, depthYd: 5 }])).toBe(true);
    expect(shown([{ kind: 'boxAtMost', count: 6, halfWidthYd: 4, depthYd: 5 }])).toBe(true);
  });
  it('edge open: nobody outside the mark on that side', () => {
    expect(shown([{ kind: 'edgeOpen', side: 1, outsidePy: 7, depthYd: 5 }])).toBe(true);
    expect(shown([{ kind: 'edgeOpen', side: 1, outsidePy: 5, depthYd: 5 }])).toBe(false);
    expect(shown([{ kind: 'edgeOpen', side: -1, outsidePy: 7, depthYd: 5 }])).toBe(true);
  });
  it('needs every condition', () => {
    expect(shown([{ kind: 'edgeOpen', side: 1, outsidePy: 7, depthYd: 5 }, { kind: 'boxAtMost', count: 6, halfWidthYd: 8, depthYd: 5 }])).toBe(false);
  });
  it('reads what the defense shows: a disguising defender counts where he shows, not where he will be', () => {
    const cond: LookCondition[] = [{ kind: 'edgeOpen', side: 1, outsidePy: 7, depthYd: 5 }];
    expect(shown(cond, front(), [{ teamSlot: 9, shown: { px: 1, py: 9 } }])).toBe(false);
    const wide = front(); wide[9] = asg('E', 'rushKick', 1, 9, true);
    expect(shown(cond, wide)).toBe(false);
    expect(shown(cond, wide, [{ teamSlot: 9, shown: { px: 1, py: 3 } }])).toBe(true);
  });
});

describe('I4.6.1 the chance he reads it right', () => {
  const q = tickResolverParams(ALL_TABLE);
  it('starts at 85% for a fake repped this week and 60% for one installed but not repped', () => {
    expect(checkReadChance(50, true, q, DMATH)).toBeCloseTo(0.85, 9);
    expect(checkReadChance(50, false, q, DMATH)).toBeCloseTo(0.60, 9);
  });
  it('rises with his recognition and is never certain or impossible', () => {
    let last = 0;
    for (const iss of [1, 20, 50, 80, 99]) {
      const p = checkReadChance(iss, true, q, DMATH);
      expect(p).toBeGreaterThan(last); expect(p).toBeGreaterThan(0); expect(p).toBeLessThan(1);
      last = p;
    }
  });
});

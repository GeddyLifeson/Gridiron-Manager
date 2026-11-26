import { describe, expect, it } from 'vitest';
import { alignTravelS, planPresnap, presnapParams } from '../../src/presnap/index.ts';
import { TABLE, input, ofType, run, world } from './support.ts';

const P = presnapParams(TABLE);
const FORMATION_FOULS = new Set(['illegal_formation', 'illegal_motion', 'illegal_shift']);

describe('J5.8.1 the time the plan gives the offense to reach its spots', () => {
  it('is nothing for a man on his spot, and a settle time plus a pace under the jog for a man who walks', () => {
    expect(alignTravelS(0, P)).toBe(0);
    expect(alignTravelS(0.05, P)).toBe(0);
    expect(alignTravelS(8, P)).toBeCloseTo(P['align.settleS']! + 8 / P['align.paceYps']!, 12);
    expect(alignTravelS(20, P)).toBeGreaterThan(20 / P['sub.jogSpeedYps']!);
  });
  it('the snap is on a tick at or after the set time, so a snap that waits for the set period is never a shift', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const plan = planPresnap(world({ seed }), input({ tempo: 'hurry_up' }));
      expect(plan.snapS).toBeGreaterThanOrEqual(plan.offenseSetS - 1e-9);
      expect(plan.snapS - plan.offenseSetS).toBeLessThan(0.1 + 1e-9);
      expect(plan.fouls.map((f) => f.foulId)).not.toContain('illegal_shift');
    }
  });
  it('a man the plan calls set is standing on his spot at the snap: no formation, motion or shift flag from a snap at the set time', () => {
    // Regression: the plan counted distance over jog speed, the movement engine took 2 to 5 s longer, and every snap
    // that came soon after the planned set time (hurry-up, a call that arrived late) found men still walking.
    for (let seed = 1; seed <= 12; seed++) {
      const r = run(input({ tempo: 'hurry_up' }), { seed });
      expect(ofType(r.w, 'snap')).toHaveLength(1);
      expect(ofType(r.w, 'foul_committed').filter((f) => FORMATION_FOULS.has(f.foulId)).map((f) => f.foulId)).toEqual([]);
    }
  });
});


// Between-play timing of the real game (J11.4, I2.1.1, J5.8.1): plays per game follow from the snap-to-snap gaps, and
// the chart caller reads its overrides (CR-G87-5), mixes its box counts and plays faster in college.
import { describe, expect, it } from 'vitest';
import { createRealGame } from '../../src/real-game/index.ts';

const seedOf = (i: number) => (i + 1).toString(16).padStart(16, '0');

function sample(ruleSetId: string, games: number, paramOverrides: Record<string, number> = {}) {
  // The chart and pace plumbing on the reference resolver: the tick engine's pace is the stat gate's to judge
  // (calibrate), and is not tuned yet.
  const game = createRealGame(ruleSetId, { paramOverrides, resolver: 'reference' });
  let plays = 0, noHuddle = 0, timeouts = 0;
  const gaps: number[] = [];
  const boxes = new Map<number, number>();
  for (let i = 0; i < games; i++) {
    const res = game.simulate(game.input(i, seedOf(i)));
    timeouts += res.events.filter((e) => e.type === 'timeout_charged' && e.kind === 'team').length;
    res.records.forEach((r, j) => {
      const c = r.calls.snapping;
      if (r.situation.playKind !== 'scrimmage' || c.unit !== 'offense' || r.final.noPlay || c.kind === 'kneel' || c.kind === 'spike') return;
      plays++;
      if (c.tempo !== 'huddle') noHuddle++;
      if (r.calls.opposing.unit === 'defense') boxes.set(r.calls.opposing.boxCount, (boxes.get(r.calls.opposing.boxCount) ?? 0) + 1);
      const n = res.records[j + 1];
      if (!n || n.calls.snapping.unit !== 'offense' || n.calls.snapping.tempo !== 'huddle' || n.situation.playKind !== 'scrimmage') return;
      if (n.situation.offense !== r.situation.offense || n.situation.period !== r.situation.period || r.situation.period > 3) return;
      if (r.final.incomplete || r.final.endedOutOfBounds || r.final.enforcement !== null || n.final.noPlay) return;
      if (r.situation.period === 2 && r.situation.clockTenths <= 1200) return;
      gaps.push((r.situation.clockTenths - n.situation.clockTenths) / 10);
    });
  }
  return { playsPerGame: plays / games, noHuddleShare: noHuddle / plays, timeoutsPerGame: timeouts / games, huddleGap: gaps.reduce((a, b) => a + b, 0) / gaps.length, boxes, plays };
}

describe('pace of the real game', () => {
  const pro = sample('pro_2026', 30);

  it('pro: plays per game and the huddle snap-to-snap gap sit near the real ones (124.2 plays, 38.8 s)', () => {
    // Wide bands: 30 games, and the gate (Q2) holds the tolerance. The fault this guards was 192 plays and a 21.6 s gap.
    expect(pro.playsPerGame).toBeGreaterThan(112);
    expect(pro.playsPerGame).toBeLessThan(136);
    expect(pro.huddleGap).toBeGreaterThan(37);
    expect(pro.huddleGap).toBeLessThan(40.5);
    expect(pro.noHuddleShare).toBeGreaterThan(0.06);
    expect(pro.noHuddleShare).toBeLessThan(0.16);
    expect(pro.timeoutsPerGame).toBeGreaterThan(3);
  });

  it('the chart mixes box counts by the resolver\'s real mix', () => {
    const share = (n: number) => (pro.boxes.get(n) ?? 0) / [...pro.boxes.values()].reduce((a, b) => a + b, 0);
    expect(share(6)).toBeGreaterThan(0.4);
    expect(share(7)).toBeGreaterThan(0.3);
    expect(share(8)).toBeGreaterThan(0.09);
    expect(share(9)).toBeGreaterThan(0.01);
  });

  it('chart.* overrides reach the callers (CR-G87-5)', () => {
    const allHuddle = sample('pro_2026', 4, { 'chart.noHuddleShare': 0, 'chart.noHuddle.trailingLateShare': 0, 'chart.hurry.share': 0, 'chart.box.six': 0, 'chart.box.eight': 0, 'chart.box.nine': 0 });
    expect(allHuddle.noHuddleShare).toBe(0);
    expect([...allHuddle.boxes.keys()]).toEqual([7]);
    expect(() => createRealGame('pro_2026', { paramOverrides: { 'chart.noSuchName': 1 } })).toThrow();
  });

  it('college: more no-huddle and more plays per team than the pro game', () => {
    const college = sample('college_2026', 30);
    expect(college.noHuddleShare).toBeGreaterThan(0.5);
    expect(college.playsPerGame / 2).toBeGreaterThan(60);
    expect(college.playsPerGame / 2).toBeLessThan(74);
    expect(college.playsPerGame).toBeGreaterThan(pro.playsPerGame);
  });
});

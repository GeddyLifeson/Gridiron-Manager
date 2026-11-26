// The passing game on the fixture, all three real modules: receivers plant at their breaks (J2.1.3), the
// quarterback sees the man he is reading (J7.2.1), and men play a ball in the air. FIXTURE units and
// parameters, so the floors here guard the mechanism, not a football rate: rates are WP-26's, against
// J15.4.1 on real content.
import { describe, expect, it } from 'vitest';
import { eventsOf, type PlayInput } from '@gm/schema';
import { availablePlugs, createTickResolver, type QuarterbackPlug } from '../../src/tick-resolver/index.ts';
import { decodeTrajectory } from '../../src/tick/trajectory.ts';
import { ALL_RULES, ALL_TABLE, CONTENT, playInput } from './support.ts';

const N = 120, X = 6, BALL_X = 35;
const input = (seed: number, detail: 'full' | 'summary' = 'summary'): PlayInput =>
  ({ ...playInput({ kind: 'pass', seed, playNumber: seed, params: ALL_TABLE, ballX: BALL_X, detail }), rules: ALL_RULES });
const plugs = availablePlugs();
const resolver = createTickResolver({ content: CONTENT, plugs });
const qbPlug = plugs.find((p) => p.id === 'qb') as QuarterbackPlug;

describe('the passing game on the fixture', () => {
  const tally = new Map<string, number>();
  const add = (k: string): void => { tally.set(k, (tally.get(k) ?? 0) + 1); };
  const n = (k: string): number => tally.get(k) ?? 0;
  it(`resolves ${N} dropbacks`, () => {
    for (let seed = 1; seed <= N; seed++) {
      const r = resolver.simulatePlay(input(seed));
      const points = eventsOf(r.truth, 'catch_point'), rec = qbPlug.quarterback()!.record(), thrown = rec.throwRecord;
      if (rec.sack !== null) add('sack');
      if (thrown === null || thrown.kind !== 'pass') continue;
      add('thrown');
      // A ball batted at the line never reaches a catch point: it is counted apart.
      if (thrown.battedBySlot >= 0) add('ball:batted');
      else if (points.length > 0) add(`ball:${points[points.length - 1]!.outcome}`);
    }
    if (process.env['GM_TICK_TALLY']) console.log(Object.fromEntries([...tally].sort()));
  }, 240_000);
  it('he throws to a receiver on most dropbacks, and more than two in five of those are caught (22% before the break and flight fixes)', () => {
    expect(n('thrown')).toBeGreaterThan(N * 0.6);
    expect(n('ball:catch') / n('thrown')).toBeGreaterThan(0.4);
  });
  it('few throws land where nobody can reach them', () => {
    expect(n('ball:uncatchable') / n('thrown')).toBeLessThan(0.1);
  });
  it('the quarterback is not sacked on a fifth of his dropbacks (he sees the man he is reading)', () => {
    expect(n('sack') / N).toBeLessThan(0.2);
  });
  it('the X receiver plants at the break of his dig and does not drift deep of it', () => {
    // The dig breaks at 10 yd. Rounding the break at speed carried him past 14 yd before the fix.
    let deepest = 0, plays = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = resolver.simulatePlay(input(seed, 'full'));
      const thrown = qbPlug.quarterback()!.record().throwRecord;
      if (r.trajectory === null || thrown === null) continue;
      plays++;
      for (const f of decodeTrajectory(r.trajectory as never)) {
        if (f.tick < 0 || f.tick > thrown.tick) continue;
        const depth = f.x[X]! - BALL_X;
        if (depth > deepest) deepest = depth;
      }
    }
    expect(plays).toBeGreaterThan(0);
    expect(deepest).toBeGreaterThan(9);
    expect(deepest).toBeLessThan(11.5);
  });
});

// K1.6.1 perception audit and J4.4.1 order invariance (Q1.4.1).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SLOT_COUNT } from '@gm/schema';
import { bench, goTo, job, mind, slotPlay, type Bench } from './helpers.ts';

const SRC = join(import.meta.dirname, '../../src/player-ai');

describe('K1.6.1 perception audit', () => {
  it('static check: no decision file imports the world; the stage reads other players only through the view (acceptance)', () => {
    for (const file of readdirSync(SRC)) {
      const text = readFileSync(join(SRC, file), 'utf8');
      if (file !== 'stage.ts') { expect(text, file).not.toMatch(/TickWorld|SimArrays|TruthEvent/); continue; }
      // In the stage, per-slot truth arrays may be indexed only by the deciding player's own slot `s` (or the communicator `c` for his own attributes).
      const reads = [...text.matchAll(/(?:players|world\.players)\.(\w+)\[(\w+)\]/g)];
      expect(reads.length).toBeGreaterThan(0);
      for (const r of reads) {
        expect(['fatigueNow', 'engagement', 'hasBall', 'behavior', 'behaviorState'], r[0]).toContain(r[1]);
        expect(r[2], r[0]).toBe('s');
      }
      expect(text).not.toMatch(/players\.(posX|posY|velX|velY|headingRad|gazeRad)\b/);
      expect(text).not.toMatch(/world\.ball\b/);
    }
  });

  /** Two worlds that differ only in true state no player perceives. */
  function pair(change: (b: Bench) => void) {
    const make = () => {
      const b = bench();
      for (let s = 0; s < SLOT_COUNT; s++) {
        b.plays[s] = slotPlay(goTo(s < 11 ? 'route' : 'manCover', 10, s - 10), { mind: mind({ riskTolerance: 80, ego: 70 }) });
        b.views[s]!.at(0, s - 10).see((s + 11) % SLOT_COUNT, 6, s - 9, 0, 6, 1).seeBall(-5, 0);
        b.world.slots[s]!.player.gameDay.knowledge['c'] = 60;
        b.views[s]!.read = { read: 'pass', side: 'none', confidence: 1 };
        b.world.slots[s]!.player.attributes['play_recognition'] = 70;
      }
      return b;
    };
    const a = make(), b = make();
    change(b);
    const trace = (x: Bench) => {
      const out: string[] = [];
      for (let n = 1; n <= 40; n++) {
        x.play(n, 6, (w) => { if (w.tick > 0) out.push(JSON.stringify(w.intents)); });
        out.push(JSON.stringify(x.ai.deviations()), JSON.stringify(x.world.events));
      }
      return out;
    };
    return { a: trace(a), b: trace(b) };
  }
  it('paired test: changing true positions, velocities and the true ball that nobody perceives changes no intent and no event (acceptance)', () => {
    const { a, b } = pair((x) => {
      const pl = x.world.players;
      for (let s = 0; s < SLOT_COUNT; s++) { pl.posX[s] = 40 - s; pl.posY[s] = s * 2 - 20; pl.velX[s] = 5; pl.velY[s] = -3; pl.headingRad[s] = 1; pl.gazeRad[s] = 2; }
      x.world.ball.x = 33; x.world.ball.y = -12; x.world.ball.velX = 9;
    });
    expect(b).toEqual(a);
  });
  it('the same world gives the same trace twice (determinism), and a different perceived view gives a different one', () => {
    expect(pair(() => {}).b).toEqual(pair(() => {}).a);
    const { a, b } = pair((x) => { x.views[15]!.ents.clear(); });
    expect(b).not.toEqual(a);
    expect(a.join('')).toContain('jumpRoute'); // the trace holds decisions made from what was seen
  });
});

describe('J4.4.1 simultaneous decisions', () => {
  it('gives the same intents, deviations and events content whatever order the slots are evaluated in (acceptance)', () => {
    const shuffled = [13, 2, 21, 7, 0, 18, 5, 11, 16, 3, 9, 20, 1, 14, 6, 19, 10, 4, 17, 8, 15, 12];
    const run = (order?: readonly number[]) => {
      const b = bench({}, order);
      const members = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
      for (let s = 0; s < SLOT_COUNT; s++) {
        let leg = 0;
        b.plays[s] = slotPlay(job(s < 11 ? 'route' : 'zoneDrop', (v, _i, pt) => { leg = v.tSinceSnapS > 0.2 ? 1 : 0; pt.px = 10 + leg * 4; pt.py = s - 10; }), { mind: mind({ riskTolerance: 80, ego: 80, roleGap: 0.5 }) });
        b.views[s]!.at(0, s - 10).see((s + 11) % SLOT_COUNT, 6, s - 9, 0, 6, 1).seeBall(-5, 0);
        b.world.slots[s]!.player.gameDay.knowledge['c'] = 40;
      }
      b.ai.setPlay(b.plays, { units: [{ communicator: 11, members }], playClockLeftS: 8, qbSlot: 0 });
      const out: string[] = [];
      for (let n = 1; n <= 60; n++) {
        b.play(n, 5, (w) => { for (const v of b.views) v.tSinceSnapS = w.tick * 0.1; if (w.tick > 0) out.push(JSON.stringify(w.intents)); });
        const key = (x: unknown) => JSON.stringify(x);
        out.push([...b.ai.deviations()].map(key).sort().join('|'), [...b.world.events].map(key).sort().join('|'), [...b.ai.explain()].map(key).sort().join('|'));
      }
      return out;
    };
    const plain = run();
    expect(run(shuffled)).toEqual(plain);
    expect(plain.join('').includes('mental_error')).toBe(true);
  });
});

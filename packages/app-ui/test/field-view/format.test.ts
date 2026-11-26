import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MOVE_MODES, BALL_STATES, type TrajectoryRecord, type FieldGeometry } from '@gm/schema';
import {
  decodeTrajectory, encodeLayout0, facingToRad, FILM_MOVE_MODES, FILM_BALL_STATES, LAYOUT0_TICK_BYTES, TrajectoryFormatError,
  type TrajectoryRecordLike, type FieldGeometryLike, type TickSample,
} from '../../src/field-view/index.ts';
import { fixturePlay, PRO, encodeLayout1, type V1Tick } from './fixtures.ts';

describe('trajectory layout 0 (P2.2.2)', () => {
  it('keeps the contract lists and shapes', () => {
    expect([...FILM_MOVE_MODES]).toEqual([...MOVE_MODES]);
    expect([...FILM_BALL_STATES]).toEqual([...BALL_STATES]);
    // The contract types fit the view's structural copies (compile-time check).
    const rec: TrajectoryRecord = fixturePlay().trajectory;
    const asLike: TrajectoryRecordLike = rec;
    const g: FieldGeometry = PRO;
    const gLike: FieldGeometryLike = g;
    expect(asLike.tickCount).toBeGreaterThan(0);
    expect(gLike.widthYd).toBeCloseTo(160 / 3, 10);
  });

  it('is 140 bytes per tick, as P2.2.2 sizes it', () => {
    expect(LAYOUT0_TICK_BYTES).toBe(22 * 6 + 8);
    const p = fixturePlay();
    expect(p.trajectory.buffer.byteLength).toBe(p.trajectory.tickCount * 140);
  });

  it('decodes within 0.005 yd of the engine values (P2.2.2 acceptance 1)', () => {
    const coord = fc.double({ min: -20, max: 140, noNaN: true });
    const player = fc.record({ x: coord, y: coord, facing: fc.integer({ min: 0, max: 255 }), state: fc.integer({ min: 0, max: FILM_MOVE_MODES.length - 1 }) });
    const tick = fc.record({
      players: fc.array(player, { minLength: 22, maxLength: 22 }),
      ball: fc.record({ x: coord, y: coord, z: fc.double({ min: 0, max: 30, noNaN: true }), kind: fc.integer({ min: 0, max: 7 }), carrier: fc.integer({ min: -1, max: 21 }) }),
    });
    fc.assert(fc.property(fc.array(tick, { minLength: 1, maxLength: 12 }), fc.integer({ min: -60, max: 0 }), (ticks: TickSample[], first: number) => {
      const f = decodeTrajectory(encodeLayout0(first, ticks));
      expect(f.firstTick).toBe(first);
      ticks.forEach((t, ti) => {
        t.players.forEach((p, s) => {
          const i = ti * 22 + s;
          expect(Math.abs(f.x[i]! - p.x)).toBeLessThanOrEqual(0.005 + 1e-9);
          expect(Math.abs(f.y[i]! - p.y)).toBeLessThanOrEqual(0.005 + 1e-9);
          expect(f.headingRad[i]).toBe(facingToRad(p.facing));
          expect(f.gazeRad[i]).toBe(f.headingRad[i]);
          expect(f.state[i]).toBe(p.state);
        });
        expect(Math.abs(f.ballZ[ti]! - t.ball.z)).toBeLessThanOrEqual(0.005 + 1e-9);
        expect(f.ballKind[ti]).toBe(t.ball.kind);
        expect(f.ballCarrier[ti]).toBe(t.ball.carrier);
      });
    }), { numRuns: 60 });
  });

  it('refuses buffers it cannot read', () => {
    const p = fixturePlay().trajectory;
    expect(() => decodeTrajectory({ ...p, formatVersion: 9 })).toThrow(TrajectoryFormatError);
    expect(() => decodeTrajectory({ ...p, tickCount: p.tickCount + 1 })).toThrow(/bytes/);
    expect(() => encodeLayout0(0, [{ players: [], ball: { x: 0, y: 0, z: 0, kind: 0, carrier: -1 } }])).toThrow(/22/);
  });

  it('decodes the same bytes to the same film every time (J1.6.2: old film plays from stored trajectories)', () => {
    const p = fixturePlay();
    const a = decodeTrajectory(p.trajectory), b = decodeTrajectory({ ...p.trajectory, buffer: p.trajectory.buffer.slice() });
    expect(Buffer.from(a.x.buffer).equals(Buffer.from(b.x.buffer))).toBe(true);
    expect(Buffer.from(a.y.buffer).equals(Buffer.from(b.y.buffer))).toBe(true);
  });
});

describe('trajectory layout 1 (the engine record, WP-09)', () => {
  const coord = fc.integer({ min: -2000, max: 14000 }).map((v) => v / 100);
  const ang = fc.integer({ min: 0, max: 4095 }).map((q) => (q / 4096) * 2 * Math.PI);
  const player = fc.record({ x: coord, y: coord, heading: ang, gaze: ang, mode: fc.integer({ min: 0, max: FILM_MOVE_MODES.length - 1 }), advantage: fc.option(fc.integer({ min: -100, max: 100 }).map((v) => v / 100)) });
  const official = fc.record({ x: coord, y: coord, gaze: ang });
  it('decodes positions, headings, gaze, move modes, ball and officials, and drops the advantage', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 7 }), fc.integer({ min: -40, max: 0 }), fc.integer({ min: 1, max: 8 }), (nOff, first, n) => {
      const ticks: V1Tick[] = fc.sample(fc.record({
        players: fc.array(player, { minLength: 22, maxLength: 22 }),
        ball: fc.record({ kind: fc.integer({ min: 0, max: 7 }), x: coord, y: coord, height: fc.integer({ min: 0, max: 3000 }).map((v) => v / 100), carrier: fc.integer({ min: -1, max: 21 }) }),
        officials: fc.array(official, { minLength: nOff, maxLength: nOff }),
      }), n);
      const f = decodeTrajectory(encodeLayout1(first, nOff, ticks));
      expect(f.officialCount).toBe(nOff);
      expect(Object.keys(f).some((k) => /advantage|engag/i.test(k))).toBe(false);
      ticks.forEach((t, ti) => {
        t.players.forEach((p, s) => {
          const i = ti * 22 + s;
          expect(f.x[i]).toBeCloseTo(p.x, 9); expect(f.y[i]).toBeCloseTo(p.y, 9);
          expect(f.headingRad[i]).toBeCloseTo(p.heading, 9); expect(f.gazeRad[i]).toBeCloseTo(p.gaze, 9);
          expect(f.state[i]).toBe(p.mode);
        });
        expect(f.ballKind[ti]).toBe(t.ball.kind); expect(f.ballCarrier[ti]).toBe(t.ball.carrier);
        expect(f.ballZ[ti]).toBeCloseTo(t.ball.height, 9);
        t.officials.forEach((o, k) => { expect(f.officialX[ti * nOff + k]).toBeCloseTo(o.x, 9); expect(f.officialY[ti * nOff + k]).toBeCloseTo(o.y, 9); });
      });
    }), { numRuns: 40 });
  });
  it('refuses a truncated or padded buffer', () => {
    const r = fixturePlay({ layout: 1 }).trajectory;
    expect(() => decodeTrajectory({ ...r, buffer: r.buffer.slice(0, r.buffer.length - 3) })).toThrow(TrajectoryFormatError);
    const padded = new Uint8Array(r.buffer.length + 1); padded.set(r.buffer);
    expect(() => decodeTrajectory({ ...r, buffer: padded })).toThrow(/after/);
  });
});

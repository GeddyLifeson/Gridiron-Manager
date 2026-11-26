// J3.2.2 what a key shows: the evidence source the tick resolver hands to perception. Each case moves
// FIXTURE players by hand and reads the evidence a defender would be given a few ticks later. The
// source may only use what happened on the field, never the play call.
import { describe, expect, it } from 'vitest';
import type { Assignment, TickWorld } from '@gm/schema';
import { createKeyEvidence } from '../../src/tick-resolver/key-evidence.ts';
import { tickResolverParams } from '../../src/tick-resolver/params.ts';
import { fixtureWorld, place } from '../tick/support.ts';
import { TABLE } from './support.ts';

const Q = tickResolverParams(TABLE);
const LT = 0, QB = 5, BACK = 6, WR = 7, VIEWER = 15;
const START: Record<number, [number, number]> = { 0: [-0.4, 2.8], 1: [-0.4, 1.4], 2: [-0.4, 0], 3: [-0.4, -1.4], 4: [-0.4, -2.8], 5: [-1, 0], 6: [-6, 0], 7: [-0.4, 18], 8: [-0.4, -18], 9: [-0.4, -5], 10: [-1, 9] };

function scene() {
  const w = fixtureWorld({ params: TABLE }), keys = createKeyEvidence();
  for (let s = 0; s < 11; s++) { place(w, s, START[s]![0], START[s]![1]); w.players.eligible[s] = s >= 5 ? 1 : 0; }
  w.ball.kind = 'held'; w.ball.carrierSlot = QB;
  keys.setPlay((slot) => (slot === QB ? ({ behavior: { type: 'quarterback', params: {}, path: [] } } as unknown as Assignment) : undefined));
  const at = (tick: number, move: (w: TickWorld) => void = () => {}): void => { w.tick = tick; move(w); keys.record(w); };
  const read = (key: number, delayTicks = 0): number[] => { const out = new Float64Array(4); keys.source(w, VIEWER, key, delayTicks, out); return [...out]; };
  return { w, at, read };
}

describe('J3.2.2 key evidence from what the offense did', () => {
  it('reads a lineman by his first step: low hat is run, high hat is pass, down the line is a pull with its direction', () => {
    const s = scene();
    s.at(0);
    expect(s.read(LT)).toEqual([0, 0, 0, 0]);
    s.at(1, (w) => { place(w, 0, -0.39 + Q['keyRead.lineStepYd']!, 2.8); place(w, 1, -0.41 - Q['keyRead.lineStepYd']!, 1.4); place(w, 3, -0.4, -1.39 + Q['keyRead.pullStepYd']!); });
    expect(s.read(0)[0]).toBe(Q['keyRead.lineRunEvidence']);
    expect(s.read(1)[0]).toBe(Q['keyRead.linePassEvidence']);
    expect(s.read(3).slice(0, 2)).toEqual([Q['keyRead.pullEvidence'], 1]);
    // The hat is what the first step showed: a run blocker driven back later has not become a pass setter.
    s.at(2, (w) => place(w, 0, -2, 2.8));
    expect(s.read(0)[0]).toBe(Q['keyRead.lineRunEvidence']);
  });
  it('gives the defender what the key showed his key delay ago, not what it shows now', () => {
    const s = scene();
    s.at(0); s.at(1); s.at(2); s.at(3, (w) => place(w, 0, 0.5, 2.8));
    expect(s.read(0, 2)[0]).toBe(0);
    expect(s.read(0, 0)[0]).toBe(Q['keyRead.lineRunEvidence']);
    s.at(4); s.at(5);
    expect(s.read(0, 2)[0]).toBe(Q['keyRead.lineRunEvidence']);
  });
  it('reads the backfield: a back coming downhill is run flow with a side, a handoff is stronger, a ball in the air is pass', () => {
    const s = scene();
    s.at(0);
    s.at(3, (w) => place(w, BACK, -6 + Q['keyRead.backStepYd']!, -1));
    expect(s.read(BACK).slice(0, 2)).toEqual([Q['keyRead.backPathEvidence'], -1]);
    expect(s.read(LT).slice(2)).toEqual([Q['keyRead.backPathEvidence'], -1]);
    // A defender keyed on the quarterback reads through him to the mesh.
    expect(s.read(QB).slice(0, 2)).toEqual([Q['keyRead.backPathEvidence'], -1]);
    s.at(6, (w) => { w.ball.carrierSlot = BACK; });
    expect(s.read(BACK)[0]).toBe(Q['keyRead.handoffEvidence']);
    expect(s.read(QB)[0]).toBe(Q['keyRead.handoffEvidence']);
    expect(s.read(LT)[2]).toBe(Q['keyRead.handoffEvidence']);
    s.at(8, (w) => { w.ball.kind = 'passInFlight'; w.ball.carrierSlot = -1; });
    expect(s.read(LT)[2]).toBe(Q['keyRead.ballInAirEvidence']);
  });
  it('reads a quarterback still holding the ball after the mesh, or dropping with no back coming, as pass', () => {
    const s = scene();
    s.at(0);
    s.at(2, (w) => place(w, QB, -1 - Q['keyRead.qbDropStepYd']!, 0));
    expect(s.read(LT)[2]).toBe(Q['keyRead.qbDropEvidence']);
    const late = scene();
    late.at(0);
    const mesh = Math.round(late.w.params.num('tickResolver.keyRead.meshS') / 0.1);
    late.at(mesh - 1);
    expect(late.read(QB)[0]).toBe(0);
    late.at(mesh);
    expect(late.read(QB)[0]).toBe(Q['keyRead.qbDropEvidence']);
    expect(late.read(BACK)[0]).toBe(Q['keyRead.qbDropEvidence']);
  });
  it('reads a receiver who has run his stem while the quarterback holds the ball as pass', () => {
    const s = scene();
    s.at(0);
    s.at(5, (w) => place(w, WR, -0.4 + Q['keyRead.releaseStemYd']!, 18));
    expect(s.read(WR)[0]).toBe(Q['keyRead.releaseEvidence']);
    s.at(6, (w) => { w.ball.carrierSlot = BACK; });
    expect(s.read(WR)[0]).toBe(0);
  });
  it('gives nothing before the snap, for a defensive slot, or for a tick it no longer holds', () => {
    const s = scene();
    s.w.tick = -3; expect(s.read(LT)).toEqual([0, 0, 0, 0]);
    s.at(0); s.at(1, (w) => place(w, 0, 0.5, 2.8));
    expect(s.read(12)).toEqual([0, 0, 0, 0]);
    for (let t = 2; t <= 40; t++) s.at(t);
    expect(s.read(LT, 30)).toEqual([0, 0, 0, 0]);
  });
});

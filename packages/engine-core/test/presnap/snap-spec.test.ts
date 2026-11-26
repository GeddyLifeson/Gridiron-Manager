// J5.6.2 with a play that names its own snap (`PresnapInput.snap`): a direct snap to a man who is not
// the quarterback, and a snap that takes time to get there (J9.1.2). FIXTURE units and values.
import { describe, expect, it } from 'vitest';
import type { ParamTable } from '@gm/schema';
import { PARAMS as BALL_PARAMS } from '../../src/ball/index.ts';
import { snapReceiverOf } from '../../src/presnap/index.ts';
import { paramTableFromFiles } from '../../src/tick/index.ts';
import { TABLE, input, offense, ofType, run } from './support.ts';

/** The pre-snap fixture table plus the ball module's rows, which a snap through the air reads. */
const BALL = paramTableFromFiles([BALL_PARAMS]);
const WITH_BALL: ParamTable = { version: 'test', has: (n) => TABLE.has(n) || BALL.has(n), num: (n) => (TABLE.has(n) ? TABLE.num(n) : BALL.num(n)) };

const RB = 10, QB = 9, C = 2;

describe('J5.6.2 the snap a play names', () => {
  it('goes to the quarterback, then the holder, then the punter when the play names nobody', () => {
    expect(snapReceiverOf(offense())).toBe(QB);
    expect(snapReceiverOf(offense(), null)).toBe(QB);
  });
  it('goes to the man the play names: a direct snap, in his hands at tick 0', () => {
    expect(snapReceiverOf(offense(), { toTeamSlot: RB, long: false, flightYps: null })).toBe(RB);
    const r = run(input({ snap: { toTeamSlot: RB, long: false, flightYps: null }, errorsDisabled: true }));
    const snap = r.ps.snap()!;
    expect(snap.receiverSlot).toBe(RB);
    expect(snap.snapperSlot).toBe(C);
    expect(snap.arriveS).toBe(0);
    expect(ofType(r.w, 'snap')[0]!.toPlayerId).toBe(r.w.slots[RB]!.playerId);
    if (snap.quality !== 'loose') { expect(r.w.ball.kind).toBe('held'); expect(r.w.ball.carrierSlot).toBe(RB); }
  });
  it('ignores a slot that is not one of the eleven', () => {
    expect(snapReceiverOf(offense(), { toTeamSlot: 11, long: false, flightYps: null })).toBe(QB);
    expect(snapReceiverOf(offense(), { toTeamSlot: -1, long: true, flightYps: 20 })).toBe(QB);
  });
  it('with a flight speed the ball is in the air and nobody has it until it has covered the distance', () => {
    const r = run(input({ snap: { toTeamSlot: QB, long: true, flightYps: 10 }, errorsDisabled: true }), { params: WITH_BALL });
    const snap = r.ps.snap()!, pl = r.w.players;
    const d = Math.hypot(pl.posX[QB]! - pl.posX[C]!, pl.posY[QB]! - pl.posY[C]!);
    expect(d).toBeGreaterThan(3);
    expect(snap.arriveS).toBeCloseTo(d / 10 + snap.extraS, 9);
    expect(r.w.ball.kind).toBe('snapInFlight');
    expect(r.w.ball.carrierSlot).toBe(-1);
    expect(ofType(r.w, 'snap')).toHaveLength(1);
    expect(ofType(r.w, 'possession')).toHaveLength(0);
    expect(ofType(r.w, 'fumble')).toHaveLength(0);
    // Aimed at him: the ball's ground velocity covers the distance in the travel time.
    expect(r.w.ball.velX * snap.arriveS).toBeCloseTo(pl.posX[QB]! - pl.posX[C]!, 6);
    expect(r.w.ball.velY * snap.arriveS).toBeCloseTo(pl.posY[QB]! - pl.posY[C]!, 6);
  });
  it('draws the same two numbers whatever the snap is: the snap quality does not depend on the flight', () => {
    const a = run(input({ snap: { toTeamSlot: QB, long: true, flightYps: 10 } }), { seed: 5, params: WITH_BALL }).ps.snap()!;
    const b = run(input({ snap: { toTeamSlot: QB, long: true, flightYps: null } }), { seed: 5, params: WITH_BALL }).ps.snap()!;
    expect(a.quality).toBe(b.quality);
    expect(a.extraS).toBe(b.extraS);
  });
});

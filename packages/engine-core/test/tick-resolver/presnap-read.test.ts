// The pre-snap phase's results on the field: a completed defensive check puts the defenders it reached on their
// new assignment (G2.5.1), and the quarterback's pre-snap read starts his progression (J7.2.1 steps 1 and 5).
import { describe, expect, it } from 'vitest';
import { SLOTS_PER_TEAM, type Assignment, type PlayInput } from '@gm/schema';
import { createTickResolver, quarterbackPlug, withPreSnapRead, type PlayContentPort } from '../../src/tick-resolver/index.ts';
import type { PresnapPlan, QbPreSnap } from '../../src/presnap/index.ts';
import { basePlay, type QbRead } from '../../src/qb/index.ts';
import { decodeTrajectory } from '../../src/tick/trajectory.ts';
import { CONTENT, playInput, unitsOf } from './support.ts';

const SS = 9;
const moved = (): Assignment => { const a = unitsOf('pass').D[SS]!; return { ...a, preSnap: { ...a.preSnap, align: { ...a.preSnap.align, px: 4, py: 12 } } }; };
const PATCHED = moved();
const withCheck = (trigger: 'formation' | 'empty'): PlayContentPort => ({
  setup(input: PlayInput) {
    const s = CONTENT.setup(input)!;
    return { ...s, presnap: { ...s.presnap, errorsDisabled: true, defense: { ...s.presnap.defense, checks: [{ name: 'walk_down', trigger, patch: [{ teamSlot: SS, assignment: PATCHED }] }] } } };
  },
});
const atSnap = (content: PlayContentPort, seed: number): { x: number; y: number; codes: string[] } => {
  const r = createTickResolver({ content, plugs: [quarterbackPlug()] }).simulatePlay(playInput({ seed, detail: 'full', stopAtTick: 0 }));
  const f = decodeTrajectory(r.trajectory as never).filter((k) => k.tick <= 0).pop()!;
  const s = SLOTS_PER_TEAM + SS, ball = playInput().situation;
  return { x: f.x[s]! - ball.ballX, y: f.y[s]! - ball.ballY, codes: r.truth.events.filter((e) => e.type === 'detail').map((e) => (e as { code: string }).code) };
};

describe('G2.5.1 a completed check changes the defense on the field', () => {
  it('the checked defender is at the patched spot at the snap; without the check he is at his own', () => {
    for (const seed of [1, 2, 3]) {
      const checked = atSnap(withCheck('formation'), seed);
      expect(checked.codes).toContain('presnap.check_patched');
      expect(Math.hypot(checked.x - 4, checked.y - 12)).toBeLessThan(1.5);
      const plain = atSnap(withCheck('empty'), seed);
      expect(plain.codes).not.toContain('presnap.check_patched');
      expect(Math.hypot(plain.x - 4, plain.y - 12)).toBeGreaterThan(3);
    }
  });
});

const read = (slot: number, py: number): QbRead => ({ kind: 'receiver', target: { slot, route: [{ px: 0, py }, { px: 10, py }], breakIndex: -1, settles: false }, priorValue: 0.5 });
const planWith = (qb: Partial<QbPreSnap>): PresnapPlan => ({ qb: { made: true, shell: 'one_high', shellCorrect: true, man: false, manCorrect: true, box: 6, boxCorrect: true, pressure: false, pressureCorrect: true, ...qb } } as unknown as PresnapPlan);

describe('J7.2.1 the quarterback starts from his pre-snap read', () => {
  const reads = [read(7, 15), read(9, 8), read(8, -15), read(10, -6)];
  const play = basePlay(5, 'gun3', reads);
  it('a right read leaves the play as drawn', () => {
    expect(withPreSnapRead(play, planWith({}))).toBe(play);
    expect(withPreSnapRead(play, null)).toBe(play);
    expect(withPreSnapRead(play, planWith({ made: false, shellCorrect: false }))).toBe(play);
  });
  it('a wrong read starts him on the other side and restarts him on the drawn order', () => {
    for (const wrong of [{ shellCorrect: false }, { manCorrect: false }]) {
      const p = withPreSnapRead(play, planWith(wrong));
      expect(p.reads.map((r) => r.target.slot)).toEqual([8, 10, 7, 9]);
      expect(p.correctedReads).toBe(reads);
    }
  });
  it('with every read on one side the order turns by one; a single read or a drawn correction is kept', () => {
    const oneSide = basePlay(5, 'gun3', [read(7, 15), read(9, 8)]);
    expect(withPreSnapRead(oneSide, planWith({ shellCorrect: false })).reads.map((r) => r.target.slot)).toEqual([9, 7]);
    const single = basePlay(5, 'gun3', [read(7, 15)]);
    expect(withPreSnapRead(single, planWith({ shellCorrect: false })).correctedReads).toBeNull();
  });
  it('a hot rule expects pressure when his read said pressure', () => {
    const hot = { ...play, hot: { rusherSlot: 16, target: reads[3]!.target, expectedPreSnap: false } };
    expect(withPreSnapRead(hot, planWith({ pressure: true })).hot!.expectedPreSnap).toBe(true);
    expect(withPreSnapRead(hot, planWith({ pressure: false })).hot!.expectedPreSnap).toBe(false);
  });
});

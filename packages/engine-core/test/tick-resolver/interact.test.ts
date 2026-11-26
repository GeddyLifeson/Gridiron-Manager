// J6.1.2, J6.2.1 the Interact stage as bodies: who a pass protector takes, and that two men locked up in a block
// do not pass through each other. FIXTURE players placed by hand.
import { describe, expect, it } from 'vitest';
import { BEHAVIORS, type TickWorld } from '@gm/schema';
import { createContests } from '../../src/contest/index.ts';
import { DMATH } from '../../src/index.ts';
import { createInteract } from '../../src/tick-resolver/interact.ts';
import { fixtureWorld, place, playX } from '../tick/support.ts';
import { ALL_TABLE } from './support.ts';

const PASS_SET = BEHAVIORS.indexOf('passSet'), RUN_BLOCK = BEHAVIORS.indexOf('runBlock');
const LT = 0, LG = 1, END = 11, TACKLE = 12;

function scene(setup: (w: TickWorld) => void) {
  const w = fixtureWorld({ params: ALL_TABLE }), it = createInteract();
  // Everyone else far away, so only the men a case places can meet.
  for (let s = 0; s < 22; s++) place(w, s, s < 11 ? -30 - s : 30 + s, 20);
  setup(w);
  it.setPlay(createContests(ALL_TABLE, DMATH), null);
  it.stage.begin!(w);
  const tick = (): void => { it.stage.run(w, 0.1); w.tick++; };
  return { w, tick };
}
const manOf = (w: TickWorld, blocker: number): number => { const e = w.players.engagement[blocker]!; return e < 0 ? -1 : w.contests[e]!.defenseSlot; };

describe('J6.2.1 who a pass protector takes', () => {
  it('leaves the tackle for the guard, who is nearer the ball, so the end is not left free', () => {
    const s = scene((w) => {
      w.players.behavior[LT] = PASS_SET; w.players.behavior[LG] = PASS_SET;
      place(w, LT, 0, 2); place(w, LG, 0, 1); place(w, TACKLE, 0.9, 1.5); place(w, END, 1, 2.8);
    });
    s.tick();
    // The defensive tackle is as near the left tackle as the guard: the guard takes him, the tackle waits for the end.
    expect(manOf(s.w, LG)).toBe(TACKLE);
    expect(manOf(s.w, LT)).toBe(-1);
    expect(s.w.contests[0]!.helperSlots).toEqual([]);
    place(s.w, END, 0.9, 2.2);
    s.tick();
    expect(manOf(s.w, LT)).toBe(END);
    expect(s.w.contests.length).toBe(2);
  });
  it('lets a protector with no rusher of his own near help on a blocked one', () => {
    const s = scene((w) => {
      w.players.behavior[LT] = PASS_SET; w.players.behavior[LG] = PASS_SET;
      place(w, LT, 0, 2); place(w, LG, 0, 1); place(w, TACKLE, 0.9, 1.5);
    });
    s.tick(); s.tick();
    expect(s.w.contests.length).toBe(1);
    expect(s.w.contests[0]!.offenseSlot).toBe(LG);
    expect(s.w.contests[0]!.helperSlots).toEqual([LT]);
  });
});

describe('J6.1.2 two men in a block are bodies', () => {
  it('moves a blocker who has run into his man back to contact instead of through him', () => {
    const s = scene((w) => { w.players.behavior[LG] = RUN_BLOCK; place(w, LG, 0, 0); place(w, TACKLE, 0.9, 0); });
    s.tick();
    expect(manOf(s.w, LG)).toBe(TACKLE);
    // The blocker's movement carried him past the defender's near side.
    place(s.w, LG, 0.7, 0);
    s.tick();
    const min = s.w.slots[LG]!.movement.bodyRadiusYd + s.w.slots[TACKLE]!.movement.bodyRadiusYd;
    expect(playX(s.w, TACKLE) - playX(s.w, LG)).toBeGreaterThanOrEqual(min - 1e-9);
    expect(manOf(s.w, LG)).toBe(TACKLE);
  });
});

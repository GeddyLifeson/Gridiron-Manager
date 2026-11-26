// F5, J5.4.2, J6.2.4 on the tick engine: blockers play the bound protection, so a protection set against the wrong
// picture leaves a real rusher to nobody. FIXTURE units: the test guards the mechanism, not a football rate.
import { describe, expect, it } from 'vitest';
import { SLOTS_PER_TEAM, type Assignment, type PlayInput, type TruthEvent } from '@gm/schema';
import { availablePlugs, createTickResolver, type PlayContentPort } from '../../src/tick-resolver/index.ts';
import { ALL_RULES, ALL_TABLE, CONTENT, playInput, unitsOf } from './support.ts';

const as = (a: Assignment, type: string): Assignment => ({ ...a, behavior: { ...a.behavior, type } });
// Five linemen in protection (the fixture's snapper blocks too), the back out, the Will coming with the four down.
const base = unitsOf('pass');
const O = base.O.map((a) => (a.role === 'C' ? as(a, 'passSet') : a.role === 'RB' ? as(a, 'route') : a));
const D = base.D.map((a) => (a.role === 'Will' ? as(a, 'blitz') : a));
const CALL = { id: 'test.man5', type: 'man' as const, slide: null, line: [0, 1, 2, 3, 4], extras: [] };
const content = (protection: typeof CALL | null): PlayContentPort => ({
  setup(input: PlayInput) {
    const s = CONTENT.setup(input)!;
    return { ...s, presnap: { ...s.presnap, offense: { ...s.presnap.offense, assignments: O, protection }, defense: { ...s.presnap.defense, assignments: D } } };
  },
});
const table = (intercept: number) => ({ version: 'test', has: (n: string) => ALL_TABLE.has(n), num: (n: string) => (n === 'presnap.prot.intercept' ? intercept : ALL_TABLE.num(n)) });
const N = 60;
function tally(protection: typeof CALL | null, intercept: number): Record<string, number> {
  const resolver = createTickResolver({ content: content(protection), plugs: availablePlugs() });
  const out: Record<string, number> = {};
  for (let seed = 1; seed <= N; seed++) {
    const r = resolver.simulatePlay({ ...playInput({ kind: 'pass', seed, playNumber: seed, params: table(intercept) }), rules: ALL_RULES });
    for (const e of r.truth.events as readonly TruthEvent[]) if (e.type === 'detail') out[e.code] = (out[e.code] ?? 0) + 1;
  }
  return out;
}

describe('a called protection on the tick engine', () => {
  const right = tally(CALL, 50), wrong = tally(CALL, -50), none = tally(null, 50);
  it('emits how the protection was set', () => {
    expect((right['presnap.protection_set'] ?? 0) + (right['presnap.protection_misset'] ?? 0)).toBeGreaterThan(N * 0.8);
    expect(wrong['presnap.protection_set'] ?? 0).toBe(0);
    expect(none['presnap.protection_set'] ?? 0).toBe(0);
    expect(none['presnap.protection_misset'] ?? 0).toBe(0);
  });
  it('F5.2.1 acceptance: the wrong declaration frees a rusher the right one blocks', () => {
    const free = (t: Record<string, number>): number => t['protection.unblocked_pressure'] ?? 0;
    const late = (t: Record<string, number>): number => t['protection.late_pickup'] ?? 0;
    // Set right, every rusher has a blocker; a blocker can still fail to reach his man on the odd snap.
    expect(free(right)).toBeLessThanOrEqual(N * 0.05);
    expect(free(wrong)).toBeGreaterThan(free(right));
    // J6.2.4: the centre, set on a Mike who dropped, finds the blitzer he did not have, late; sometimes not at all.
    expect(late(wrong)).toBeGreaterThan(late(right) + N * 0.3);
    // On the other snaps the ball is out before the blitzer reaches anyone.
    expect(late(wrong) + free(wrong)).toBeGreaterThan(N * 0.4);
  });
  it('a play that calls no protection notes none', () => {
    expect(none['protection.unblocked_pressure'] ?? 0).toBe(0);
    expect(none['protection.late_pickup'] ?? 0).toBe(0);
    expect(SLOTS_PER_TEAM).toBe(11);
  });
});

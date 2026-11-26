// Binding (J4.3.1): roles become slots, the quarterback is named, a flipped play mirrors, and
// landmarks become lateral positions for this field. A role with no assignment falls back to the
// position default and raises a content warning (J4.1.1 edge case).
import { describe, expect, it } from 'vitest';
import { bindAssignments, validateAssignment } from '../../src/lang/index.ts';
import { K, act, assignment, compiled, test, viewOf, when, world } from './world.ts';

const play = assignment({
  role: 'Sam',
  behavior: { type: 'manCover', params: { man: 'role:Y', playside: 'left', zonePy: 6 }, path: [{ px: 10, py: 6, kind: 'settle', landmark: 'curl' }, { px: 12, py: -3, kind: 'through', landmark: null }] },
  preSnap: { align: { px: 4, py: 7, rule: null }, motion: [{ px: 4, py: 2, kind: 'through', landmark: null }] },
  keys: ['role:Y', 'qb', '#2:left', 'final#3:right', '#1'],
  rules: [
    when(test('release', { target: 'role:Y', is: 'vertical' }), [act('carry', { target: '#2:left', toDepth: 12 })]),
    when(test('rushersVsBlockers', { side: 'left' }), [act('slide', { dir: 'right' }), act('dropTo', { px: 8, py: 5 }), act('dropTo', { px: 8, py: 5, landmark: 'hash' })], { op: 'not', of: test('cushion', { target: 'qb', lt: 5 }) }),
    when(test('receiversToSide', { side: 'mine', cmp: 'ge', n: 3 }), [act('convertRoute', { to: 'sit', px: 2, py: 1.5, relative: true })]),
  ],
});

describe('binding', () => {
  it('rewrites roles and the quarterback to slots, and leaves everything else alone', () => {
    const { bound, findings } = bindAssignments({ assignments: [play], slotOfRole: { Y: 6, Sam: 15 }, qbSlot: 0 });
    const b = bound[0]!;
    expect(findings).toEqual([]);
    expect(b.behavior.params).toEqual({ man: 'slot:6', playside: 'left', zonePy: 6, qb: 'slot:0' });
    expect(b.keys).toEqual(['slot:6', 'slot:0', '#2:left', 'final#3:right', '#1']);
    expect(b.rules[0]!.when).toEqual(test('release', { target: 'slot:6', is: 'vertical' }));
    expect(b.rules[1]!.guard).toEqual({ op: 'not', of: test('cushion', { target: 'slot:0', lt: 5 }) });
    expect(b.behavior.path).toEqual(play.behavior.path);
    expect(validateAssignment(b)).toEqual([]);
    // The input is not changed.
    expect(play.behavior.params['man']).toBe('role:Y');
  });

  it('a bound man is covered: the compiled assignment trails the slot the role was bound to', () => {
    const { bound } = bindAssignments({ assignments: [assignment({ behavior: { type: 'manCover', params: { man: 'role:Y' }, path: [] } })], slotOfRole: { Y: 6 } });
    const o = compiled(bound[0]!).decide(15, viewOf(world({ self: [3, 4], seen: { 6: [3, 8] } }), 15));
    expect(o.intent.target).toEqual({ px: 3 - K.trailOffset, py: 8 });
  });

  it('a flipped play mirrors: lateral positions change sign and left and right swap', () => {
    const b = bindAssignments({ assignments: [play], slotOfRole: { Y: 6 }, qbSlot: 0, mirror: true }).bound[0]!;
    expect(b.behavior.path.map((p) => p.py)).toEqual([-6, 3]);
    expect(b.preSnap.align.py).toBe(-7);
    expect(b.preSnap.motion[0]!.py).toBe(-2);
    expect(b.behavior.params).toEqual({ man: 'slot:6', playside: 'right', zonePy: -6, qb: 'slot:0' });
    expect(b.keys).toEqual(['slot:6', 'slot:0', '#2:right', 'final#3:left', '#1']);
    expect(b.rules[0]!.then[0]).toEqual(act('carry', { target: '#2:right', toDepth: 12 }));
    expect(b.rules[1]!.when).toEqual(test('rushersVsBlockers', { side: 'right' }));
    expect(b.rules[1]!.then[0]).toEqual(act('slide', { dir: 'left' }));
    expect(b.rules[1]!.then[1]).toEqual(act('dropTo', { px: 8, py: -5 }));
    // "mine" and "away" are relative to the player and do not swap; relative offsets do mirror.
    expect(b.rules[2]!.when).toEqual(test('receiversToSide', { side: 'mine', cmp: 'ge', n: 3 }));
    expect(b.rules[2]!.then[0]).toEqual(act('convertRoute', { to: 'sit', px: 2, py: -1.5, relative: true }));
    // Mirroring twice gives the play back.
    const twice = bindAssignments({ assignments: [bindAssignments({ assignments: [play], slotOfRole: {}, mirror: true }).bound[0]!], slotOfRole: {}, mirror: true }).bound[0]!;
    expect({ ...twice, keys: play.keys, behavior: { ...twice.behavior, params: play.behavior.params }, rules: play.rules }).toEqual(play);
  });

  it('landmarks become lateral positions on this field; an unknown landmark keeps the drawn value', () => {
    const landmarkPy = (name: string): number | null => (name === 'curl' ? 9.5 : name === 'hash' ? -3.1 : null);
    const b = bindAssignments({ assignments: [play], slotOfRole: { Y: 6 }, landmarkPy }).bound[0]!;
    expect(b.behavior.path[0]).toEqual({ px: 10, py: 9.5, kind: 'settle', landmark: 'curl' });
    expect(b.behavior.path[1]!.py).toBe(-3);
    expect(b.rules[1]!.then[2]).toEqual(act('dropTo', { px: 8, py: -3.1, landmark: 'hash' }));
    expect(b.rules[1]!.then[1]).toEqual(act('dropTo', { px: 8, py: 5 }));
    const none = bindAssignments({ assignments: [play], slotOfRole: { Y: 6 }, landmarkPy: () => null }).bound[0]!;
    expect(none.behavior.path[0]!.py).toBe(6);
  });

  it('an unknown role is a warning and stays unbound, so the player treats it as not perceived', () => {
    const { bound, findings } = bindAssignments({ assignments: [play], slotOfRole: {} });
    expect(findings.map((f) => `${f.severity}:${f.code}:${f.role}`)).toContain('warning:bind.unknown_role:Sam');
    expect(bound[0]!.behavior.params['man']).toBe('role:Y');
    const o = compiled(bound[0]!).decide(15, viewOf(world({ self: [5, 4], seen: { 6: [3, 8] } }), 15));
    expect(o.intent.target).toEqual({ px: 5, py: 4 });
  });

  it('a role the play forgot gets the position default and a content warning (J4.1.1 edge case)', () => {
    const fallback = (role: string) => assignment({ role, behavior: { type: 'pursue', params: {}, path: [] }, keys: ['qb'] });
    const { bound, findings } = bindAssignments({ assignments: [play], slotOfRole: { Y: 6 }, qbSlot: 0, roles: ['Sam', 'Will'], fallback });
    expect(findings.map((f) => `${f.severity}:${f.code}:${f.role}`)).toEqual(['warning:bind.role_without_assignment:Will']);
    expect(bound.map((b) => b.role)).toEqual(['Sam', 'Will']);
    expect(bound[1]!.keys).toEqual(['slot:0']);
    const without = bindAssignments({ assignments: [play], slotOfRole: { Y: 6 }, roles: ['Sam', 'Will'] });
    expect(without.bound.length).toBe(1);
    expect(without.findings.length).toBe(1);
  });
});

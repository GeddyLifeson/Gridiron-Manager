// I4.6.1 / G7.7.2 a menu look by role bound to a formation's team slots, then read on the defense's shown
// picture. FIXTURE spread punt formation and alignments; the thresholds are the menu's design values.
import { describe, expect, it } from 'vitest';
import type { Assignment } from '@gm/schema';
import { bindFakeLook, lookShown, type FakeLookTerm, type FakeRole, type LookCondition } from '../../src/tick-resolver/index.ts';
import { asg } from '../presnap/support.ts';

/** Gunners at 0 and 10, wings at 1 and 9, five inside, then the protector and the punter. */
const O: Assignment[] = [
  asg('GL', 'gunner', -0.4, 20, true), asg('WL', 'protectKick', -1, 4.5, false), asg('T', 'protectKick', -0.4, 2.8, true), asg('G', 'protectKick', -0.4, 1.4, true),
  asg('LS', 'snapper', -0.4, 0, true), asg('G', 'protectKick', -0.4, -1.4, true), asg('T', 'protectKick', -0.4, -2.8, true),
  asg('PP', 'protectKick', -6, 1, false), asg('P', 'kicker', -14, 0, false), asg('WR', 'protectKick', -1, -4.5, false), asg('GR', 'gunner', -0.4, -20, true),
];
const ROLE: Record<string, FakeRole> = { GL: 'gunner', GR: 'gunner', WL: 'wing', WR: 'wing' };
const roleOf = (s: number): FakeRole | null => ROLE[O[s]!.role] ?? null;
const bind = (t: FakeLookTerm[]): LookCondition[] => bindFakeLook(t, O, roleOf);
/** Six rushers inside the wings, two jammers on each gunner, one returner deep. */
const base = (): Assignment[] => [
  ...[-3.5, -2.1, -0.7, 0.7, 2.1, 3.5].map((py, i) => asg(`R${i}`, 'rushKick', 1, py, true)),
  asg('J1', 'jammer', 1, 19, true), asg('J2', 'jammer', 1.5, 21, true), asg('J3', 'jammer', 1, -19, true), asg('J4', 'jammer', 1.5, -21, true),
  asg('PR', 'returner', 45, 0, false),
];
const read = (t: FakeLookTerm[], D: Assignment[]): boolean => lookShown(bind(t), O, D, []);
const UNC: FakeLookTerm[] = [{ kind: 'uncovered', who: ['gunner'], lateralYd: 2, depthYd: 7 }];

describe('a menu look bound to the formation', () => {
  it('uncovered names every man of the role: one uncovered gunner is enough', () => {
    expect(read(UNC, base())).toBe(false);
    const D = base(); D[8] = asg('J3', 'returner', 30, -19, false); D[9] = asg('J4', 'returner', 32, -21, false);
    expect(read(UNC, D)).toBe(true);
  });
  it('an open edge is measured outside the wing on his own side', () => {
    const edge: FakeLookTerm[] = [{ kind: 'edgeOpen', outsideOf: 'wing', marginYd: 1, depthYd: 5 }];
    const tight = (): Assignment[] => base().map((a, i) => (i >= 6 && i <= 9 ? asg(`J${i}`, 'returner', 30 + i, 0, false) : a));
    expect(read(edge, tight())).toBe(true);
    const D = tight(); D[0] = asg('E', 'rushKick', 1, -6, true); D[5] = asg('E', 'rushKick', 1, 6, true);
    expect(read(edge, D)).toBe(false);
    D[5] = asg('E', 'rushKick', 1, 4.8, true);
    expect(read(edge, D)).toBe(true);
  });
  it('outnumbered counts the overloaded side', () => {
    const gate = O.map((a, i) => (i >= 1 && i <= 3 ? asg(a.role, 'protectKick', -0.4, 10 + i * 1.4, true) : a));
    const conds = bindFakeLook([{ kind: 'outnumbered', gapYd: 3, depthYd: 7 }], gate, roleOf);
    expect(conds).toEqual([{ kind: 'sideAtMost', side: 1, beyondPy: 3, count: 3, depthYd: 7 }]);
    const D = base(); D[7] = asg('J2', 'returner', 30, 21, false);
    expect(lookShown(conds, gate, D, [])).toBe(true);
    // The gate is four men wide (three linemen and the gunner); four defenders there match it.
    D[3] = asg('R3', 'rushKick', 1, 10.5, true); D[4] = asg('R4', 'rushKick', 1, 12, true); D[5] = asg('R5', 'rushKick', 1, 13.5, true);
    expect(lookShown(conds, gate, D, [])).toBe(false);
  });
  it('a role the formation lacks cannot be bound', () => {
    expect(() => bind([{ kind: 'uncovered', who: ['slot'], lateralYd: 2, depthYd: 7 }])).toThrow(/no slot/);
  });
});

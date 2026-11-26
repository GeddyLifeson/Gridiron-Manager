// F5 and J5.4.2 step 3: the protection binding. Fixture picture: five linemen a yard apart, a back in the gun,
// a four-down front with three linebackers at 4.5 yd. py grows to the offense's left.
import { describe, expect, it } from 'vitest';
import { bindProtection, unaccounted, NO_MAN, NOT_IN_PROTECTION, type BlockerSpot, type ProtectionCall, type Threat } from '../../src/protection/index.ts';

const S = { edgeGapYd: 3, boxHalfWidthYd: 5, boxDepthYd: 7 };
const LT = 0, LG = 1, C = 2, RG = 3, RT = 4, RB = 6, TE = 9;
const LINE: BlockerSpot[] = [{ teamSlot: LT, px: -0.4, py: 2 }, { teamSlot: LG, px: -0.4, py: 1 }, { teamSlot: C, px: -0.4, py: 0 }, { teamSlot: RG, px: -0.4, py: -1 }, { teamSlot: RT, px: -0.4, py: -2 }];
const BACK_RIGHT: BlockerSpot = { teamSlot: RB, px: -5, py: -2.2 };
const END: BlockerSpot = { teamSlot: TE, px: -0.4, py: -3 };
// World slots: 11 LDE (offense's right), 12 LDT, 13 RDT, 14 RDE, 15 Mike, 16 Will (offense's right), 17 Sam (left), 20 safety.
const LDE = 11, LDT = 12, RDT = 13, RDE = 14, MIKE = 15, WILL = 16, SAM = 17, SS = 20;
const front = (coming: readonly number[], over: Partial<Record<number, Partial<Threat>>> = {}): Threat[] => {
  const base: Threat[] = [
    { slot: LDE, px: 1, py: -2.7, line: true, comes: true }, { slot: LDT, px: 1, py: -0.5, line: true, comes: true },
    { slot: RDT, px: 1, py: 1.5, line: true, comes: true }, { slot: RDE, px: 1, py: 2.7, line: true, comes: true },
    { slot: MIKE, px: 4.5, py: 0, line: false, comes: false }, { slot: WILL, px: 4.5, py: -3, line: false, comes: false },
    { slot: SAM, px: 4.5, py: 3, line: false, comes: false }, { slot: SS, px: 12, py: -5, line: false, comes: false },
  ];
  return base.map((t) => ({ ...t, comes: t.line ? t.comes : coming.includes(t.slot), ...(over[t.slot] ?? {}) }));
};
const call = (type: ProtectionCall['type'], extras: ProtectionCall['extras'], slide: ProtectionCall['slide'] = null): ProtectionCall => ({ id: 'test', type, slide, line: [LT, LG, C, RG, RT], extras });
const rushers = (ts: readonly Threat[], who: readonly number[]) => ts.filter((t) => who.includes(t.slot)).map((t) => ({ slot: t.slot, py: t.py }));

describe('F5.3.1 big on big', () => {
  it('linemen take the down linemen in order and the uncovered one has the Mike', () => {
    const b = bindProtection(call('man', [{ teamSlot: RB, job: 'scan' }]), [...LINE, BACK_RIGHT], front([]), S);
    expect([b.man[LT], b.man[LG], b.man[RG], b.man[RT]]).toEqual([RDE, RDT, LDT, LDE]);
    expect(b.man[C]).toBe(MIKE);
    expect(b.mike).toBe(MIKE);
    expect(b.man[5]).toBe(NOT_IN_PROTECTION);
    expect(b.man[RB]).toBe(NO_MAN);
    expect(b.hot).toEqual([]);
  });
  it('acceptance: a linebacker blitzing on the back\'s side resolves to the back; from a five-man version he is hot', () => {
    const t = front([WILL]);
    const six = bindProtection(call('man', [{ teamSlot: RB, job: 'scan' }]), [...LINE, BACK_RIGHT], t, S);
    // The recognized blitzer is redeclared the Mike and the line takes him; nobody is left over.
    expect(six.mike).toBe(WILL);
    expect(unaccounted(six, rushers(t, [LDE, LDT, RDT, RDE, WILL]))).toEqual([]);
    const two = front([WILL, SAM]);
    const six2 = bindProtection(call('man', [{ teamSlot: RB, job: 'scan' }]), [...LINE, BACK_RIGHT], two, S);
    expect(six2.scan[RB]![0]).toBe(SAM);
    expect(unaccounted(six2, rushers(two, [LDE, LDT, RDT, RDE, WILL, SAM]))).toEqual([]);
    const five = bindProtection(call('man', []), LINE, two, S);
    expect(five.hot).toHaveLength(1);
    expect(unaccounted(five, rushers(two, [LDE, LDT, RDT, RDE, WILL, SAM]))).toHaveLength(1);
  });
  it('F5.5.1 dual read: with both of the back\'s men coming he has the inside one and the outside one is hot', () => {
    const t = front([MIKE, WILL, SAM]);
    const b = bindProtection(call('man', [{ teamSlot: RB, job: 'scan' }]), [...LINE, BACK_RIGHT], t, S);
    expect(b.mike).toBe(MIKE);
    expect(b.scan[RB]!.slice(0, 2)).toEqual([WILL, SAM]);
    expect(b.hot).toHaveLength(1);
  });
});

describe('F5.2.1 a wrong declaration', () => {
  it('acceptance: bound against the shown picture the real blitzer is free; the correct picture blocks him', () => {
    // A safety walks down late and comes off the offense's right with the Mike dropping. Five-man protection.
    const truth = front([], { [SS]: { px: 4, py: -4.5, comes: true } });
    const shown = front([]);
    const real = rushers(truth, [LDE, LDT, RDT, RDE, SS]);
    const wrong = bindProtection(call('man', []), LINE, shown, S);
    expect(wrong.man[C]).toBe(MIKE);
    expect(unaccounted(wrong, real)).toEqual([SS]);
    expect(wrong.expected).not.toContain(SS);
    const right = bindProtection(call('man', []), LINE, truth, S);
    expect(unaccounted(right, real)).toEqual([]);
    expect(right.man[C]).toBe(SS);
  });
});

describe('F5.4 slides', () => {
  it('half slide: the man side is big on big to the first uncovered lineman, the rest slide away from the back', () => {
    const b = bindProtection(call('half_slide', [{ teamSlot: RB, job: 'scan' }], 'away_from_back'), [...LINE, BACK_RIGHT], front([]), S);
    expect(b.slideDir).toBe(1);
    expect([b.man[RT], b.man[RG]]).toEqual([LDE, LDT]);
    expect([b.zone[RT], b.zone[RG]]).toEqual([null, null]);
    expect(b.zone[C]).toEqual([0, 1]);
    expect(b.zone[LG]).toEqual([1, 2]);
    expect(b.zone[LT]).toEqual([2, 5]);
    expect([b.man[C], b.man[LG], b.man[LT]]).toEqual([NO_MAN, RDT, RDE]);
    // The back works the man side, inside to outside.
    expect(b.scan[RB]).toEqual([MIKE, WILL]);
  });
  it('half slide: with every lineman covered nobody slides (bear look)', () => {
    const bear: Threat[] = [2, 1, 0, -1, -2].map((py, i) => ({ slot: 11 + i, px: 1, py, line: true, comes: true }));
    const b = bindProtection(call('half_slide', [], 'left'), LINE, bear, S);
    expect(b.zone.every((z) => z === null)).toBe(true);
    expect([b.man[LT], b.man[LG], b.man[C], b.man[RG], b.man[RT]]).toEqual([11, 12, 13, 14, 15]);
  });
  it('full slide: every lineman has a gap and the back has the edge the line slid away from', () => {
    const b = bindProtection(call('full_slide', [{ teamSlot: RB, job: 'edge' }], 'away_from_back'), [...LINE, BACK_RIGHT], front([]), S);
    expect(b.slideDir).toBe(1);
    expect(b.zone.filter((z) => z !== null)).toHaveLength(5);
    expect(b.man[RB]).toBe(LDE);
    expect(b.hot).toEqual([]);
    // Two off the open edge: one is hot (F5.4.1 edge case).
    const t = front([WILL]);
    const two = bindProtection(call('full_slide', [{ teamSlot: RB, job: 'edge' }], 'away_from_back'), [...LINE, BACK_RIGHT], t, S);
    expect(two.hot).toHaveLength(1);
  });
  it('F5.4.3 acceptance: a five-man protection against six always lists one hot rusher', () => {
    for (const lb of [MIKE, WILL, SAM]) {
      for (const other of [MIKE, WILL, SAM]) {
        if (other === lb) continue;
        const b = bindProtection(call('half_slide', [], 'threat'), LINE, front([lb, other]), S);
        expect(b.hot).toHaveLength(1);
      }
    }
  });
  it('seven-man: the tight end has the end man on his side and nobody is hot against six', () => {
    const t = front([WILL, SAM]);
    const b = bindProtection(call('man', [{ teamSlot: RB, job: 'scan' }, { teamSlot: TE, job: 'edge' }]), [...LINE, BACK_RIGHT, END], t, S);
    expect(b.hot).toEqual([]);
    expect(unaccounted(b, rushers(t, [LDE, LDT, RDT, RDE, WILL, SAM]))).toEqual([]);
  });
});

describe('F5.1.1 acceptance', () => {
  it('unblocked rushers equal rushers minus blockers when rushers exceed blockers', () => {
    const t = front([MIKE, WILL, SAM]);
    const all = rushers(t, [LDE, LDT, RDT, RDE, MIKE, WILL, SAM]);
    for (const [c, bl, n] of [
      [call('man', []), LINE, 2], [call('man', [{ teamSlot: RB, job: 'scan' }]), [...LINE, BACK_RIGHT], 1],
      [call('half_slide', [{ teamSlot: RB, job: 'scan' }], 'away_from_back'), [...LINE, BACK_RIGHT], 1],
    ] as const) expect(unaccounted(bindProtection(c as ProtectionCall, bl, t, S), all)).toHaveLength(n);
  });
});

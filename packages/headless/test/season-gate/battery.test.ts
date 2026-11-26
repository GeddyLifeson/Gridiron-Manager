// G-87 decision-response battery runner (Q3.1, Q3.3). Arms here are SYNTHETIC number sources, so the
// tests cover the paired form, the assertions and the blocking rules, not football.
import { describe, expect, it } from 'vitest';
import { seedFromHex, stream } from '@gm/engine-core';
import {
  ADMITTED_BINDINGS, BATTERY_ITEMS, BINDING_NEEDS, assertionHolds, formatBatteryReport, itemProblems, pairSeedHex, pairedDifference, realGameArm,
  runBattery, runItem, yardsPerScrimmagePlay, type Arm, type BatteryItem, type ItemBinding,
} from '../../src/season-gate/index.ts';

const SEED = '00c0ffee12345678';
const RS = ['pro_2026', 'college_2026'];
const item = (id: string): BatteryItem => BATTERY_ITEMS.find((i) => i.id === id)!;
/** SYNTHETIC arm: a shared noise term per seed plus a shift. The shared term cancels in the paired difference. */
const arm = (label: string, shift: number, ownNoise = 0, onlyRules?: string): Arm => ({
  label,
  run: (seedHex, ruleSetId) => {
    const shared = stream(seedFromHex(seedHex), 'synthetic.shared', []).normal();
    const own = ownNoise === 0 ? 0 : stream(seedFromHex(seedHex), `synthetic.${label}`, []).normal() * ownNoise;
    return shared + own + (onlyRules === undefined || onlyRules === ruleSetId ? shift : -shift);
  },
});
const bind = (itemId: string, arms: Arm[], over: Partial<ItemBinding> = {}): ItemBinding => ({ itemId, arms, pairs: 60, measure: 'synthetic units', ...over });

describe('G-87 battery items (Q3.1.2, Q3.2)', () => {
  it('carries the 36 bible items, each with a basis, a basis status and a kind', () => {
    expect(itemProblems()).toEqual([]);
    expect(BATTERY_ITEMS).toHaveLength(36);
    expect(Object.fromEntries(['Q3.2.1', 'Q3.2.2', 'Q3.2.3', 'Q3.2.4', 'Q3.2.5', 'Q3.2.6'].map((l) => [l, BATTERY_ITEMS.filter((i) => i.leaf === l).length]))).toEqual({ 'Q3.2.1': 9, 'Q3.2.2': 5, 'Q3.2.3': 6, 'Q3.2.4': 6, 'Q3.2.5': 6, 'Q3.2.6': 4 });
    // No coach reviewer exists yet (Q5.6.1), so no convention-based item is marked reviewed.
    expect(BATTERY_ITEMS.filter((i) => i.coachReviewed)).toEqual([]);
    expect(item('DP-1').state).toBe('pending_measurement');
    for (const leaf of new Set(BATTERY_ITEMS.map((i) => i.leaf))) expect(BINDING_NEEDS[leaf]).toBeTruthy();
    expect(itemProblems([{ ...item('BX-2'), kind: 'band' }])).toEqual(['BX-2: a convention-based item may only assert a sign or an ordering (Q3.1.2)']);
  });
});

describe('G-87 paired-policy form (Q3.1.1)', () => {
  it('reports a difference whose interval includes zero when the two policies are identical (acceptance)', () => {
    const r = runItem(item('PA-1'), bind('PA-1', [arm('a', 0), arm('b', 0)]), 'pro_2026', SEED);
    expect(r.state).toBe('run');
    expect(r.differences[0]!.mean).toBe(0);
    expect(r.differences[0]!.low).toBeLessThanOrEqual(0);
    expect(r.differences[0]!.high).toBeGreaterThanOrEqual(0);
    // A sign item does not pass on identical policies.
    expect(r.pass).toBe(false);
  });

  it('holds the same on real games: identical parameter sets on the same seed give the same number', () => {
    const a = realGameArm({ label: 'a', measure: yardsPerScrimmagePlay });
    const b = realGameArm({ label: 'b', paramOverrides: {}, measure: yardsPerScrimmagePlay });
    const seed = pairSeedHex(SEED, 'PA-1', 0);
    const va = a.run(seed, 'pro_2026');
    expect(va).not.toBeNull();
    expect(b.run(seed, 'pro_2026')).toBe(va);
    // A resolver parameter, not a chart one: the real-game facade does not hand chart overrides to the chart caller yet (CR-G87-5).
    // The real game runs on the tick resolver, so the parameter is a tick one: tacklers reach farther.
    const shifted = realGameArm({ label: 'c', paramOverrides: { 'carrier.tackle.contactGapYd': 0.4 }, measure: yardsPerScrimmagePlay });
    expect(shifted.run(seed, 'pro_2026')).not.toBe(va);
  }, 60_000);

  it('runs both arms on the same seeds, derived from the item and the pair only', () => {
    const seen: string[][] = [[], []];
    const spy = (k: number): Arm => ({ label: `s${k}`, run: (s) => { seen[k]!.push(s); return k; } });
    runItem(item('PA-1'), bind('PA-1', [spy(0), spy(1)], { pairs: 40 }), 'pro_2026', SEED);
    expect(seen[0]).toEqual(seen[1]);
    expect(seen[0]).toEqual(Array.from({ length: 40 }, (_, p) => pairSeedHex(SEED, 'PA-1', p)));
    expect(new Set(seen[0]).size).toBe(40);
    expect(pairSeedHex(SEED, 'PA-2', 0)).not.toBe(pairSeedHex(SEED, 'PA-1', 0));
  });

  it('passes a sign item only when the whole interval is above zero', () => {
    expect(runItem(item('PA-1'), bind('PA-1', [arm('pa', 0.5, 0.3), arm('dropback', 0, 0.3)]), 'pro_2026', SEED).pass).toBe(true);
    expect(runItem(item('PA-1'), bind('PA-1', [arm('pa', 0, 0.3), arm('dropback', 0.5, 0.3)]), 'pro_2026', SEED).pass).toBe(false);
    // A true effect far smaller than the noise: the interval straddles zero and the item fails rather than passing by luck.
    const noisy = runItem(item('PA-1'), bind('PA-1', [arm('pa', 0.001, 1), arm('dropback', 0, 1)]), 'pro_2026', SEED);
    expect(noisy.differences[0]!.low).toBeLessThan(0);
    expect(noisy.pass).toBe(false);
  });

  it('passes an ordering item only when every step holds', () => {
    const good = runItem(item('BX-1'), bind('BX-1', [arm('six', 1, 0.2), arm('seven', 0.5, 0.2), arm('eight', 0, 0.2)]), 'pro_2026', SEED);
    expect(good.differences.map((d) => `${d.armA}>${d.armB}`)).toEqual(['six>seven', 'seven>eight']);
    expect(good.pass).toBe(true);
    expect(runItem(item('BX-1'), bind('BX-1', [arm('six', 1, 0.2), arm('seven', 0, 0.2), arm('eight', 0.5, 0.2)]), 'pro_2026', SEED).pass).toBe(false);
  });

  it('passes a band item only when the whole interval is inside the range', () => {
    const band = { low: -0.1, high: 0.1 };
    expect(runItem(item('RU-2'), bind('RU-2', [arm('six', 0.02, 0.05), arm('four', 0, 0.05)], { band }), 'pro_2026', SEED).pass).toBe(true);
    expect(runItem(item('RU-2'), bind('RU-2', [arm('six', 0.5, 0.05), arm('four', 0, 0.05)], { band }), 'pro_2026', SEED).pass).toBe(false);
    expect(assertionHolds('band', [pairedDifference('a', 'b', [0.09, 0.1, 0.11])], band)).toBe(false);
    expect(() => runItem(item('RU-2'), bind('RU-2', [arm('six', 0), arm('four', 0)]), 'pro_2026', SEED)).toThrow(/needs a range/);
  });

  it('does not judge an item on too few pairs, an unbound item or an item that is not active', () => {
    const few = runItem(item('PA-1'), bind('PA-1', [arm('a', 1), arm('b', 0)], { pairs: 5 }), 'pro_2026', SEED);
    expect([few.state, few.pass]).toEqual(['too_few_pairs', null]);
    const gaps = runItem(item('PA-1'), bind('PA-1', [{ label: 'a', run: () => null }, arm('b', 0)]), 'pro_2026', SEED);
    expect(gaps.state).toBe('too_few_pairs');
    expect(runItem(item('PA-1'), undefined, 'pro_2026', SEED).state).toBe('not_bound');
    expect(runItem(item('DP-1'), bind('DP-1', [arm('a', 1), arm('b', 0)]), 'pro_2026', SEED).state).toBe('not_active');
    expect(() => runItem(item('PA-1'), bind('PA-1', [arm('a', 1), arm('b', 0), arm('c', 0)]), 'pro_2026', SEED)).toThrow(/cannot run with 3 arms/);
  });
});

describe('G-87 battery report (Q3.3.1)', () => {
  const run = (bindings: ItemBinding[], over: Partial<Parameters<typeof runBattery>[0]> = {}) => runBattery({ parameterSetId: 'test-set', masterSeedHex: SEED, ruleSets: RS, bindings, ...over });

  it('is INCOMPLETE with the shipped bindings: no item is bound, so none passes', () => {
    const rep = run([...ADMITTED_BINDINGS]);
    expect(rep.verdict).toBe('incomplete');
    expect(rep.counts).toEqual({ items: 36, passed: 0, blocking: 0, waived: 0, notRun: 35, notActive: 1 });
    const text = formatBatteryReport(rep);
    expect(text).toContain('Verdict: INCOMPLETE');
    expect(text.split('\n').filter((l) => /\| NOT RUN$/.test(l))).toHaveLength(70);
    expect(formatBatteryReport(run([...ADMITTED_BINDINGS]))).toBe(text);
  });

  it('blocks on a failed data-based item of status 2 of 3 or better, waiver or not', () => {
    const rep = run([bind('SC-1', [arm('screen', 0, 0.2), arm('dropback', 0.5, 0.2)])], { waivers: [{ itemId: 'SC-1', reason: 'we like screens', sentToCoachReview: true }] });
    expect(rep.rows.find((r) => r.item.id === 'SC-1')!.verdict).toBe('fail_blocking');
    expect(rep.verdict).toBe('blocked');
  });

  it('lets a failed convention-based or 1 of 3 item through only with a written reason and coach review', () => {
    const failing = [bind('QK-1', [arm('quick', 0, 0.2), arm('slow', 0.5, 0.2)]), bind('BX-1', [arm('six', 0, 0.2), arm('seven', 0.5, 0.2), arm('eight', 1, 0.2)])];
    expect(run(failing).counts.blocking).toBe(2);
    expect(run(failing, { waivers: [{ itemId: 'QK-1', reason: '  ', sentToCoachReview: true }, { itemId: 'BX-1', reason: 'engine box count is charted differently', sentToCoachReview: false }] }).counts.blocking).toBe(2);
    const waived = run(failing, { waivers: [{ itemId: 'QK-1', reason: 'quick game value is flat against five in this build', sentToCoachReview: true }, { itemId: 'BX-1', reason: 'engine box count is charted differently', sentToCoachReview: true }] });
    expect(waived.counts).toMatchObject({ blocking: 0, waived: 2 });
    // Waived failures do not block, but the items that never ran still keep the battery from passing.
    expect(waived.verdict).toBe('incomplete');
    expect(formatBatteryReport(waived)).toContain('QK-1 overall: FAIL (waived with a written reason, sent to coach review). Reason on record: quick game value is flat against five in this build');
  });

  it('fails an item that passes under one rule set and fails under the other', () => {
    const rep = run([bind('PR-2', [arm('extra blocker', 0.5, 0.2, 'pro_2026'), arm('five out', 0, 0.2)])]);
    const row = rep.rows.find((r) => r.item.id === 'PR-2')!;
    expect(row.results.map((r) => r.pass)).toEqual([true, false]);
    expect(row.verdict).toBe('fail_blocking');
  });

  it('passes only when every active item ran and passed under every rule set it names', () => {
    const items = [item('PA-1'), item('QK-1'), item('DP-1')];
    const all = [bind('PA-1', [arm('pa', 0.5, 0.2), arm('dropback', 0, 0.2)]), bind('QK-1', [arm('quick', 0.5, 0.2), arm('slow', 0, 0.2)])];
    const rep = run(all, { items });
    expect(rep.verdict).toBe('pass');
    expect(rep.rows.map((r) => r.verdict)).toEqual(['pass', 'pass', 'not_active']);
    expect(rep.rows[1]!.marks).toEqual(['provisional', 'convention-based', 'not reviewed']);
    expect(run(all.slice(0, 1), { items }).verdict).toBe('incomplete');
    expect(run([...all, bind('ZZ-9', [arm('a', 1), arm('b', 0)])], { items }).problems).toEqual(['binding for unknown item ZZ-9']);
    expect(run(all, { items, leaves: ['Q3.2.5'] }).rows).toEqual([]);
  });
});

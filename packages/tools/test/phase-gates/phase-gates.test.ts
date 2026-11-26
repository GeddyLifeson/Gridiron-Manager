// Phase gates 2 to 5 (R1.2.3 to R1.2.6): every numbered gate item has a runner, level-tagged checks report both
// rule sets, and a gate whose facts are short of three sources is never PASS.
import { describe, it, expect } from 'vitest';
import { battery, factsAtThree } from '../../src/phase-gates/checks.ts';
import { GATE_ITEMS } from '../../src/phase-gates/gates.ts';

const ITEMS_PER_PHASE: Record<number, number> = { 2: 4, 3: 6, 4: 5, 5: 6 }; // the bible's numbered gate items

describe('phase gate runner', () => {
  it('binds every numbered item of phases 2 to 5', () => {
    for (const [phase, n] of Object.entries(ITEMS_PER_PHASE)) {
      expect(GATE_ITEMS.filter((g) => g.phase === Number(phase)).map((g) => g.item)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
  });

  it('runs every battery leaf at pro and college', () => {
    const ctx = { quick: true, ruleSets: ['pro_2026', 'college_2026'] };
    for (const leaves of [['Q3.2.1', 'Q3.2.2'], ['Q3.2.3'], ['Q3.2.4'], ['Q3.2.5'], ['Q3.2.6']]) {
      const r = battery(leaves, ctx);
      expect(Object.keys(r.levels ?? {}).sort()).toEqual(['college_2026', 'pro_2026']);
      expect(r.evidence).toContain('every one tagged pro and college');
      expect(r.status).not.toBe('PASS'); // no binding is admitted yet: an item that did not run cannot pass
    }
  });

  it('never passes the fourth-down rows unless every row computes Verified', () => {
    const r = factsAtThree('measured-rate.json', /fourth|4th/i, 'fourth down');
    const allVerified = r.rows.length > 0 && r.rows.every(() => r.status === 'PASS');
    expect(r.status === 'PASS').toBe(allVerified);
    expect(r.levels?.['pro']).toBeDefined();
    expect(r.levels?.['college']).toBeDefined();
  });
});

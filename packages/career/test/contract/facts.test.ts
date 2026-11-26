// Q6 for the contract module: rows parse, stored status is the computed status, every basis cell resolves.
import { describe, expect, it } from 'vitest';
import { FactFile, ParamFile, computeStatus, scanForbiddenJson } from '@gm/schema';
import factsJson from '../../src/contract/facts.json' with { type: 'json' };
import defaultsJson from '../../src/contract/defaults.json' with { type: 'json' };
import { CONTRACT_FACTS, PARAMS, allCells, contractFact, contractFactProvisional, CONTRACT_TIERS, defaultsBlock, payBand } from '../../src/contract/index.ts';

describe('Q6 contract fact rows and defaults', () => {
  it('rows parse and every stored status equals the computed status (Q6.1.2)', () => {
    FactFile.parse(factsJson);
    for (const r of CONTRACT_FACTS) expect(r.status, r.id).toBe(computeStatus(r));
    expect(new Set(CONTRACT_FACTS.map((r) => r.id)).size).toBe(CONTRACT_FACTS.length);
  });
  it('every cell names a basis; fact cells cite at least one row and every cited row exists', () => {
    const cells = allCells();
    expect(cells.length).toBeGreaterThan(70);
    for (const c of cells) {
      expect(['fact', 'bible', 'assumption'], c.path).toContain(c.basis);
      if (c.basis === 'fact') expect(c.facts.length, c.path).toBeGreaterThan(0);
      for (const id of c.facts) expect(() => contractFact(id), `${c.path} -> ${id}`).not.toThrow();
    }
  });
  it('only the professional guarantee and offset rows are Verified; everything else prints PROVISIONAL', () => {
    const verified = CONTRACT_FACTS.filter((r) => !contractFactProvisional(r.id)).map((r) => r.id);
    expect(verified).toEqual(['F-contract-0001', 'F-contract-0002']);
  });
  it('each tier has a head coach and an assistant block, and bands rise with the rung', () => {
    for (const t of CONTRACT_TIERS) {
      defaultsBlock(t, 'head_coach'); defaultsBlock(t, 'assistant');
      const rungs = [1, 3, 5, 7, 9].map((r) => payBand(t, r).medianCents);
      for (let i = 1; i < rungs.length; i++) expect(rungs[i]!).toBeGreaterThan(rungs[i - 1]!);
    }
  });
  it('no forbidden keys and PARAMS validates', () => {
    expect(scanForbiddenJson('facts.json', factsJson)).toEqual([]);
    expect(scanForbiddenJson('defaults.json', defaultsJson)).toEqual([]);
    ParamFile.parse(PARAMS);
  });
});

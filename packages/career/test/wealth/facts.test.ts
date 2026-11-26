// Q6 for the wealth module: rows parse, stored status equals computed status, every table id resolves.
import { describe, expect, it } from 'vitest';
import { FactFile, computeStatus, scanForbiddenJson, ParamFile } from '@gm/schema';
import factsJson from '../../src/wealth/facts.json' with { type: 'json' };
import tablesJson from '../../src/wealth/tables.json' with { type: 'json' };
import { WEALTH_FACTS, fact, isProvisional, PARAMS, loadStateProfiles, stateProfileWarnings } from '../../src/wealth/index.ts';

function ids(x: unknown): string[] {
  if (typeof x === 'string') return x.startsWith('F-') ? [x] : [];
  if (Array.isArray(x)) return x.flatMap(ids);
  if (x && typeof x === 'object') return Object.values(x).flatMap(ids);
  return [];
}

describe('Q6 wealth fact rows', () => {
  it('parse as a fact file and every stored status is the computed status (Q6.1.2)', () => {
    FactFile.parse(factsJson);
    for (const r of WEALTH_FACTS) expect(r.status, r.id).toBe(computeStatus(r));
  });
  it('ids are unique and every id in tables.json resolves', () => {
    expect(new Set(WEALTH_FACTS.map((r) => r.id)).size).toBe(WEALTH_FACTS.length);
    for (const id of ids(tablesJson)) expect(() => fact(id)).not.toThrow();
  });
  it('federal and payroll tax rows used by the engine are Verified except the single Medicare threshold', () => {
    const fed = ids(tablesJson.federal).concat(ids(tablesJson.payroll), ids(tablesJson.retirement));
    const provisional = fed.filter(isProvisional);
    expect(provisional).toEqual(['F-wealth-0011']);
  });
  it('state rows short of Verified print PROVISIONAL and the conflicted row cannot ship (E6.2.2 acceptance 3)', () => {
    const w = stateProfileWarnings(loadStateProfiles());
    expect(w.some((x) => x.startsWith('GA:') && x.includes('cannot ship'))).toBe(true);
    expect(w.some((x) => x.startsWith('TX:') && x.includes('PROVISIONAL'))).toBe(true);
  });
  it('no forbidden keys in the data and PARAMS validates', () => {
    expect(scanForbiddenJson('facts.json', factsJson)).toEqual([]);
    expect(scanForbiddenJson('tables.json', tablesJson)).toEqual([]);
    ParamFile.parse(PARAMS);
  });
});

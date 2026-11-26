import { describe, expect, it } from 'vitest';
import { ATTRIBUTE_IDS, ParamFile } from '@gm/schema';
import { DEV_CLASS, DEV_CLASSES, PARAMS, TABLES, tableProblems, CURVE_GROUP, EXIT_GROUP, POSITION_FAMILIES, WORKED, p } from '../../src/development/index.ts';

describe('G-20 parameters and tables', () => {
  it('params.json is a valid ParamFile with a basis and leaf on every row', () => {
    const parsed = ParamFile.parse(JSON.parse(JSON.stringify(PARAMS)));
    for (const row of parsed.params) {
      expect(row.leaf, row.name).toMatch(/^[A-Z]\d+(\.\d+)*$/);
      expect(row.value, row.name).toBeGreaterThanOrEqual(row.min);
      expect(row.value, row.name).toBeLessThanOrEqual(row.max);
      expect(row.constrainedBy.length, row.name).toBeGreaterThan(0);
    }
  });
  it('tables.json has no structural problem and every table names its basis', () => {
    expect(tableProblems(TABLES)).toEqual([]);
    expect(tableProblems({ ...TABLES, curves: { ...TABLES.curves, groups: { QB: [0] } } }).length).toBeGreaterThan(0);
  });
  it('every attribute has a class with a rate (D7.1.2 acceptance)', () => {
    for (const a of ATTRIBUTE_IDS) {
      expect(DEV_CLASSES).toContain(DEV_CLASS[a]);
      expect(PARAMS.params.some((r) => r.name === p(`classRate.${DEV_CLASS[a]}`))).toBe(true);
    }
  });
  it('every position family has a curve, an exit column and worked attributes', () => {
    for (const f of POSITION_FAMILIES) {
      expect(TABLES.curves.groups[CURVE_GROUP[f]]).toBeDefined();
      expect(TABLES.exitRates.groups[EXIT_GROUP[f]]).toBeDefined();
      expect(WORKED[f].length).toBeGreaterThan(0);
      for (const a of WORKED[f]) expect(ATTRIBUTE_IDS).toContain(a);
    }
  });
  it('the D8.2.1 curve table is the fitted one: yearly bands, one row per measured group, never rising', () => {
    expect(TABLES.curves.bandStarts).toEqual(Array.from({ length: 18 }, (_, i) => 23 + i));
    expect(Object.keys(TABLES.curves.groups).sort()).toEqual(['DB', 'DL', 'EDGE', 'K', 'LB', 'OL', 'P', 'QB', 'RB', 'TE', 'WR']);
    for (const row of Object.values(TABLES.curves.groups)) for (let i = 1; i < row.length; i++) expect(row[i]!).toBeLessThanOrEqual(row[i - 1]!);
  });
});

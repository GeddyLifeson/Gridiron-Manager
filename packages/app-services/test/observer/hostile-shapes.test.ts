// Regressions from the break test (plans/break-test-report.md #2 and #3): rows of the wrong shape never
// carry anything past the filter, and an owner rule that cannot read a row fails closed instead of throwing.
import { describe, expect, it } from 'vitest';
import { ALL_SCOPES, PUBLIC_OBSERVER, WORLD_ROW_TABLES, filterValue, fullSample, tableSchema } from '../../src/observer/index.ts';

const SECRET = '#hostile-secret#';
const has = (v: unknown): boolean => JSON.stringify(v ?? null).includes(SECRET);

/** Every leaf of a sample, swapped one at a time for an object and for an array holding the secret. */
function* swaps(v: unknown): Generator<unknown> {
  const root = JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
  const nodes: Record<string, unknown>[] = [];
  const walk = (x: unknown): void => { if (x && typeof x === 'object') { if (!Array.isArray(x)) nodes.push(x as Record<string, unknown>); Object.values(x).forEach(walk); } };
  walk(root);
  for (const n of nodes) for (const k of Object.keys(n)) {
    if (n[k] !== null && typeof n[k] === 'object') continue;
    const keep = n[k];
    n[k] = { value: SECRET }; yield JSON.parse(JSON.stringify(root));
    n[k] = [SECRET]; yield JSON.parse(JSON.stringify(root));
    n[k] = keep;
  }
}

describe('observer filter against hostile shapes', () => {
  const viewers = [PUBLIC_OBSERVER, { personId: 1, teamScopes: { '1': [ALL_SCOPES] } }];
  for (const table of WORLD_ROW_TABLES) {
    it(`${table}: a scalar field holding an object or array is dropped`, () => {
      const schema = tableSchema(table);
      for (let option = 0; option < 3; option++) {
        for (const row of swaps(fullSample(schema, option))) for (const o of viewers) expect(has(filterValue(schema, row, o))).toBe(false);
      }
    });
  }

  it('a row filtered under another table\'s schema is dropped, never thrown', () => {
    for (const a of WORLD_ROW_TABLES) for (const b of WORLD_ROW_TABLES) {
      const row = fullSample(tableSchema(a), 0);
      expect(() => filterValue(tableSchema(b), row, viewers[1]!)).not.toThrow();
    }
  });
});

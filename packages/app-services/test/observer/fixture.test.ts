import { describe, expect, it } from 'vitest';
import { WORLD_TABLES } from '@gm/schema';
import { tableSchema, scrambleTruth, WORLD_ROW_TABLES } from '../../src/observer/index.ts';
import { fixtureTables } from './fixture-world.ts';

type Parser = { safeParse(v: unknown): { success: boolean; error?: { message: string } } };

describe('the test world is a valid world', () => {
  it('names the same tables as the world contract', () => {
    expect([...WORLD_ROW_TABLES].sort()).toEqual(WORLD_TABLES.map((t) => t.table).sort());
  });
  for (const [table, rows] of Object.entries(fixtureTables())) {
    it(`${table}: every row parses, and still parses after its hidden values are changed`, () => {
      const schema = tableSchema(table) as unknown as Parser;
      for (const row of rows) {
        const r = schema.safeParse(row);
        expect(r.success, r.error?.message).toBe(true);
        const s = schema.safeParse(scrambleTruth(tableSchema(table), row).value);
        expect(s.success, s.error?.message).toBe(true);
      }
    });
  }
});

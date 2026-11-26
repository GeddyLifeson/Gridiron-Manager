// G-16 acceptance "each figure cites a fact row" (Q6.2.1): every fixture value that names a fact row must
// equal that row's value. The rows come from G-10 (PR 22: facts/cap.json, facts/league.json). Until those
// files are on main the row check is skipped.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FactFile, computeStatus } from '@gm/schema';
import { FIXTURE_VALUES } from './fixtures.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const FILES = ['facts/cap.json', 'facts/league.json'].map((f) => join(ROOT, f));
const present = FILES.every((f) => existsSync(f));

describe('cap figures cite fact rows', () => {
  it.skipIf(!present)('every cited row exists, holds the same value, and its stored status is the computed one', () => {
    const rows = new Map(FILES.flatMap((f) => FactFile.parse(JSON.parse(readFileSync(f, 'utf8'))).rows).map((r) => [r.id, r]));
    for (const v of FIXTURE_VALUES) {
      if (v.factId === null) continue;
      const row = rows.get(v.factId);
      expect(row, `${v.key} -> ${v.factId}`).toBeDefined();
      expect(row!.value, `${v.key} -> ${v.factId}`).toBe(v.value);
      expect(row!.status, v.factId).toBe(computeStatus(row!));
    }
  });

  it('every fixture value names a fact row', () => {
    expect(FIXTURE_VALUES.filter((v) => v.factId === null).map((v) => v.key)).toEqual([]);
  });
});

// G-41 tests: every T12 row is present with its true status, and nothing college was copied from a pro value.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeStatus } from '@gm/schema';
import { loadFacts } from '@gm/tools';
import { checkTargets } from '../../src/calibration/index.ts';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..');
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const base = read('content/calibration/targets.college_2026.json');
const extra = read('content/calibration/college/extra-targets.json');
const coverage: { rows: { leaf: string; label: string; targetIds: string[]; pro: string | null }[] } = read('content/calibration/college/coverage.json');
const facts = loadFacts(ROOT);
const merged = { ...base, targets: [...base.targets, ...extra.targets] };
const loaded = checkTargets(merged, facts);
const byId = new Map<string, any>(merged.targets.map((t: any) => [t.id, t]));
const factById = new Map(facts.map((f) => [f.id, f]));

describe('college targets (G-41, T12)', () => {
  it('the merged file passes the WP-13 target checks', () => {
    expect(loaded.problems).toEqual([]);
  });

  it('every T12 table row maps to at least one target', () => {
    expect(coverage.rows.length).toBe(77);
    for (const r of coverage.rows) {
      expect(r.targetIds.length, `${r.leaf} ${r.label}`).toBeGreaterThan(0);
      for (const id of r.targetIds) expect(byId.has(id), `${r.leaf} ${r.label} -> ${id}`).toBe(true);
    }
  });

  it('every T12 leaf with rows is covered, and target leaves match the table leaf', () => {
    for (const r of coverage.rows) for (const id of r.targetIds) expect(byId.get(id).leaf).toBe(r.leaf);
    expect(new Set(coverage.rows.map((r) => r.leaf))).toEqual(new Set(['T12.1.1', 'T12.2.1', 'T12.2.2', 'T12.3.1', 'T12.4.1', 'T12.5.1', 'T12.6.1', 'T12.7.1']));
  });

  it('only a Verified college target is certify, and status is computed from sources', () => {
    for (const t of merged.targets) {
      if (t.tier === 'certify') expect(factById.get(t.factId!)?.status, t.id).toBe('Verified');
      if (t.factId) {
        const f = factById.get(t.factId)!;
        expect(f, t.id).toBeDefined();
        expect(f.status, t.id).toBe(computeStatus(f));
        expect(f.level, t.id).toBe('college');
      }
    }
  });

  it('open rows have no number and no fact row', () => {
    for (const t of merged.targets.filter((x: any) => x.id.startsWith('open.'))) {
      expect(t.value).toEqual([]);
      expect(t.factId).toBeNull();
      expect(t.tier).toBe('watch');
    }
  });

  it('no college value equals the pro value printed beside it', () => {
    for (const r of coverage.rows) {
      const pro = r.pro && Number.parseFloat(r.pro.replace('%', ''));
      if (!pro || r.targetIds.length !== 1) continue;
      const t = byId.get(r.targetIds[0]!);
      if (typeof t.value !== 'number') continue;
      const asShown = r.pro!.includes('%') ? t.value * 100 : t.value;
      expect(Math.abs(asShown - pro) > 1e-9, `${t.id} equals pro ${r.pro}`).toBe(true);
    }
  });

  it('the three G-41 rows carry a college fact whose single source is read, not model knowledge', () => {
    for (const t of extra.targets) {
      const f = factById.get(t.factId)!;
      expect(f.sources.every((s) => s.howRead !== 'model knowledge')).toBe(true);
      expect(f.status).toBe('1 of 3');
    }
  });
});

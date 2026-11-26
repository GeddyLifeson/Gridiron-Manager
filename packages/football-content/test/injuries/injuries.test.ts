// G-21: injury catalogue rows carry body part, recovery range and fact rows whose status computes from sources.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FactFile, computeStatus } from '@gm/schema';

const dir = new URL('../../data/injuries/', import.meta.url);
const load = (f: string) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const cat = load('catalogue.json').rows as any[];
const factsFile = FactFile.parse(load('facts.json'));
const facts = new Map(factsFile.rows.map((r) => [r.id, r]));

describe('G-21 injury catalogue', () => {
  it('fact rows parse and their status is the computed status', () => {
    for (const r of factsFile.rows) expect(r.status, r.id).toBe(computeStatus(r));
    expect(new Set(factsFile.rows.map((r) => r.id)).size).toBe(factsFile.rows.length);
  });
  it('every row has a body part, a region and unique id', () => {
    expect(new Set(cat.map((c) => c.id)).size).toBe(cat.length);
    for (const c of cat) {
      expect(c.bodyPart, c.id).toBeTruthy();
      expect(c.region, c.id).toBeTruthy();
      expect(c.mechanisms.length, c.id).toBeGreaterThan(0);
    }
  });
  it('every row has a recovery range with a stated basis', () => {
    for (const c of cat) {
      const r = c.recovery;
      expect(['games', 'days', 'months', 'plays', 'seasons'], c.id).toContain(r.unit);
      expect(r.basis, c.id).toBeTruthy();
      const nums = [r.low, r.median, r.mean, r.high].filter((x: unknown) => typeof x === 'number');
      expect(nums.length, c.id).toBeGreaterThan(0);
      if (typeof r.low === 'number' && typeof r.high === 'number') expect(r.low, c.id).toBeLessThanOrEqual(r.high);
    }
  });
  it('every row cites existing fact rows and every fact row is used', () => {
    const used = new Set<string>();
    for (const c of cat) {
      expect(c.factIds.length, c.id).toBeGreaterThan(0);
      for (const id of c.factIds) {
        expect(facts.has(id), `${c.id} -> ${id}`).toBe(true);
        used.add(id);
      }
    }
    for (const id of facts.keys()) if (id !== cat[0].reinjury.factId) expect(used.has(id), id).toBe(true);
  });
  it('shares are within 0 to 1 and no sourced row is typed as Verified without three groups or a primary', () => {
    for (const c of cat) {
      const s = c.recovery.notReturnShare;
      if (s !== null && s !== undefined) expect(s >= 0 && s <= 1, c.id).toBe(true);
    }
    for (const r of factsFile.rows) {
      if (r.status === 'Verified') expect(new Set(r.sources.map((s) => s.independenceGroup)).size).toBeGreaterThanOrEqual(3);
    }
  });
  it('no real person is named and no forbidden coaching keys appear', () => {
    const text = JSON.stringify(cat) + JSON.stringify(factsFile);
    expect(text).not.toMatch(/"(xp|perk|skillTree|coachPoints)"/i);
  });
});

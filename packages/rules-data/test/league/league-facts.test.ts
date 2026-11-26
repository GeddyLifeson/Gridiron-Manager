// G-10: league, cap, college and injury fact rows and the league rule-value files (Q6, P4.7.1).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { FactFile, RuleKeyDef, RuleSetFile, computeStatus, ruleStatusShippable, type FactRow } from '@gm/schema';
import { validateRuleSetFile } from '../../src/index.ts';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../../../${p}`, import.meta.url), 'utf8'));
const FILES = ['league', 'cap', 'college', 'injury'];
const rows: FactRow[] = FILES.flatMap((f) => FactFile.parse(read(`facts/${f}.json`)).rows);
const byId = new Map(rows.map((r) => [r.id, r]));

// Same normalisation as facts/g10-build/core.py: drop a hyphen at a line end before a lowercase letter (unless a digit precedes), collapse white space.
function norm(raw: string): string {
  const s = raw.replace(/­/g, '').replace(/(?<=[^\d\s])-\n[ \t]*(?=[a-z])/g, '');
  return s.replace(/\s+/g, ' ').trim();
}
const TEXTS: Record<string, string[]> = {
  'cba_2020.txt': [process.env.GM_NFL_CBA_TXT ?? '', '/mnt/project-files/nfl-rules/cba_2020.txt'],
  'nfl-operations--draft-rules.txt': ['/mnt/project-files/research/glossary/sources/nfl-operations--draft-rules.txt'],
  'nflpa--offseason-rules.txt': ['/mnt/project-files/research/glossary/sources/nflpa--offseason-rules.txt'],
  'ncaa--age-based-eligibility.txt': ['/mnt/project-files/research/glossary/sources/ncaa--age-based-eligibility.txt'],
  'nfl-health-safety--concussion-protocol.txt': ['/mnt/project-files/research/glossary/sources/nfl-health-safety--concussion-protocol.txt'],
  'nbcsports--concussion-protocol-explained.txt': ['/mnt/project-files/research/glossary/sources/nbcsports--concussion-protocol-explained.txt'],
  'clevelandclinic--high-ankle-sprain.txt': ['/mnt/project-files/research/glossary/sources/clevelandclinic--high-ankle-sprain.txt'],
  'aaos-orthoinfo--turf-toe.txt': ['/mnt/project-files/research/glossary/sources/aaos-orthoinfo--turf-toe.txt'],
  'webmd--nfl-injury-report-explained.txt': ['/mnt/project-files/research/glossary/sources/webmd--nfl-injury-report-explained.txt'],
};

describe('G-10 fact rows', () => {
  it('has unique ids and a stored status equal to the computed status', () => {
    expect(byId.size).toBe(rows.length);
    for (const r of rows) expect(computeStatus(r), r.id).toBe(r.status);
  });
  it('every row has at least one source and every source value matches the row value', () => {
    for (const r of rows) {
      expect(r.sources.length, r.id).toBeGreaterThan(0);
      for (const s of r.sources) if (s.value !== undefined && r.value !== undefined) expect(s.value, r.id).toBe(r.value);
    }
  });
  it('re-finds every quote in the local text copy when it is present', () => {
    let checked = 0, skipped = 0;
    for (const r of rows) for (const s of r.sources) {
      const m = /text copy ([\w.-]+)/.exec(s.locator);
      if (!m || !s.quote) continue;
      const path = (TEXTS[m[1]!] ?? []).find((p) => p && existsSync(p));
      if (!path) { skipped++; continue; }
      checked++;
      expect(norm(readFileSync(path, 'utf8')).includes(norm(s.quote)), `${r.id}: ${s.quote}`).toBe(true);
    }
    console.log(`G-10 quotes re-found: ${checked}, text copies not present: ${skipped}`);
  });
  it('prints the provisional list (Q6.3.1): rows short of Verified', () => {
    const prov = rows.filter((r) => r.status !== 'Verified');
    console.log(`G-10 PROVISIONAL rows: ${prov.length} of ${rows.length}`);
    expect(rows.length).toBeGreaterThan(150);
  });
});

describe('G-10 league rule-value files', () => {
  for (const lvl of ['pro', 'college'] as const) {
    const dict = (read(`packages/rules-data/data/league/keys_${lvl}.json`).keys as unknown[]).map((k) => RuleKeyDef.parse(k));
    const file = RuleSetFile.parse(read(`packages/rules-data/data/league/${lvl}league_2026.json`));
    it(`${lvl}: every key is defined once and typed (validateRuleSetFile)`, () => {
      expect(validateRuleSetFile(file, dict, [file])).toEqual([]);
    });
    it(`${lvl}: every value cites a register row with the same value and level`, () => {
      for (const v of file.values) {
        const row = byId.get(v.factId);
        expect(row, v.key).toBeDefined();
        expect(row!.value, v.key).toBe(v.value);
        expect(['both', lvl], v.key).toContain(row!.level);
        expect(['rule', 'league-rule'], v.key).toContain(row!.domain);
      }
    });
    it(`${lvl}: values short of Rulebook only carry a PROVISIONAL note`, () => {
      for (const v of file.values) {
        const row = byId.get(v.factId)!;
        if (!ruleStatusShippable(row.status)) expect(v.note, v.key).toMatch(/PROVISIONAL/);
      }
    });
  }
});

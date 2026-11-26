// Schedule (G-13) and staff-limit (G-25, G-29, G-38) fact rows and rule-value files (Q6, P4.7.1).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FactFile, RuleKeyDef, RuleSetFile, computeStatus, ruleStatusShippable } from '@gm/schema';
import { validateRuleSetFile } from '../../src/index.ts';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../../../${p}`, import.meta.url), 'utf8'));
const rows = FactFile.parse(read('facts/schedule-staff.json')).rows;
const firing = FactFile.parse(read('facts/coach-firing-timing.json')).rows;
const byId = new Map(rows.map((r) => [r.id, r]));

describe('schedule and staff fact rows', () => {
  it('has unique ids, a stored status equal to the computed one, and matching source values', () => {
    expect(byId.size).toBe(rows.length);
    for (const r of rows) {
      expect(computeStatus(r), r.id).toBe(r.status);
      for (const s of r.sources) if (s.value !== undefined && r.value !== undefined) expect(s.value, r.id).toBe(r.value);
    }
  });
});

describe('coach firing timing rows', () => {
  it('has stored statuses equal to computed ones', () => {
    expect(firing.length).toBeGreaterThan(0);
    for (const r of firing) expect(computeStatus(r), r.id).toBe(r.status);
  });
});

describe('schedule and staff rule-value files', () => {
  for (const lvl of ['pro', 'college'] as const) {
    const dict = (read(`packages/rules-data/data/league/keys_${lvl}_schedule_staff.json`).keys as unknown[]).map((k) => RuleKeyDef.parse(k));
    const file = RuleSetFile.parse(read(`packages/rules-data/data/league/${lvl}league_schedule_staff_2026.json`));
    it(`${lvl}: keys are defined once and typed`, () => {
      expect(validateRuleSetFile(file, dict, [file])).toEqual([]);
    });
    it(`${lvl}: every value cites a row with the same value, and short rows carry PROVISIONAL`, () => {
      for (const v of file.values) {
        const row = byId.get(v.factId);
        expect(row, v.key).toBeDefined();
        expect(row!.value, v.key).toBe(v.value);
        expect(['both', lvl], v.key).toContain(row!.level);
        if (!ruleStatusShippable(row!.status)) expect(v.note, v.key).toMatch(/PROVISIONAL/);
      }
    });
  }
});

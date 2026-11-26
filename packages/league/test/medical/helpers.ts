// Fixtures for the medical tests. Rule values are FIXTURES copied from the bible leaves (D11.3.1,
// D11.4.2, D11.5.1, H5.2.1, C5.4.1); the real values arrive from G-10 with fact rows (requested keys).
import { readFileSync } from 'node:fs';
import { stream, seedFromNumber } from '@gm/engine-core';
import type { RuleSet } from '@gm/schema';
import { catalogueFrom, medicalRules, type CatalogueRow, type InjuryEvent, type MedicalStaff, type StreamFor } from '../../src/medical/index.ts';

export function ruleSet(values: Record<string, number | boolean | string>, id = 'fixture'): RuleSet {
  const get = (k: string) => {
    if (!(k in values)) throw new Error(`no rule ${k}`);
    return values[k]!;
  };
  return { id, level: 'pro', seasonYear: 2026, num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string, keys: () => Object.keys(values) };
}

export const PRO_VALUES = {
  'medical.independent_authority': true,
  'medical.concussion_protocol': 'league_five_step',
  'medical.concussion_consultant_confirms': true,
  'medical.injury_report_rule': 'weekly_practice_and_status',
  'medical.report_practice_days': 3,
  'roster.ir_min_games': 4,
};
export const COLLEGE_VALUES = {
  'medical.independent_authority': true,
  'medical.concussion_protocol': 'league_five_step',
  'medical.concussion_consultant_confirms': false,
  'medical.injury_report_rule': 'none',
  'medical.report_practice_days': 3,
};
export const PRO_RS = ruleSet(PRO_VALUES, 'pro_fixture');
export const COLLEGE_RS = ruleSet(COLLEGE_VALUES, 'college_fixture');
export const PRO = medicalRules(PRO_RS);
export const COLLEGE = medicalRules(COLLEGE_RS);

const root = new URL('../../../../', import.meta.url);
export const readJson = (rel: string) => JSON.parse(readFileSync(new URL(rel, root), 'utf8'));
export const CATALOGUE_ROWS = readJson('packages/football-content/data/injuries/catalogue.json').rows as CatalogueRow[];
export const CATALOGUE = catalogueFrom(CATALOGUE_ROWS);

export function streams(seed: number, name = 'medical'): StreamFor {
  return (scope) => stream(seedFromNumber(seed), name, scope as (string | number)[]);
}

export function staff(over: Partial<MedicalStaff> = {}): MedicalStaff {
  return { physicianId: 900, trainerId: 901, consultantIds: [902, 903], diagnosticAccuracy: 0.5, caution: 0.5, ...over };
}

let nextId = 1;
export function injury(typeId: string, over: Partial<InjuryEvent> = {}): InjuryEvent {
  return { injuryId: nextId++, personId: 100, teamId: 1, typeId, grade: null, day: 1000, mechanism: 'contact', fromPlayingThrough: false, hideable: false, ...over };
}

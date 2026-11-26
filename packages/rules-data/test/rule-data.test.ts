// Rule data tests (WP-01): Q6.2.1 (every rule value cites a shippable fact row), Q1.2.1 (files match their schemas
// and the key dictionary), the committed files equal the build output, and the foul catalogue (B8.1.2, B13.12).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FactFile, RuleKeyDef, RuleSetFile, computeStatus, ruleStatusShippable, FOUL_FIELDS, foulKey } from '@gm/schema';
import { KEY_DICTIONARY, RULE_SET_FILES, resolveRuleSet, validateRuleSetFile } from '@gm/rules-data';
import { FOUL_IDS, checkFoulCatalogue, foulCatalogue, foulRow } from '../src/catalogue/index.ts';
import { build, expandFouls, type AuthFoulsFile, type AuthKeysFile } from './tools/build.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DATA = join(ROOT, 'packages/rules-data/data');
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const facts = FactFile.parse(read(join(ROOT, 'facts/rule.json'))).rows;
const factById = new Map(facts.map((r) => [r.id, r]));

describe('Q1.2.1 rule-set files and dictionary', () => {
  it('both 2026 files validate against the dictionary with no error', () => {
    for (const f of RULE_SET_FILES) expect(validateRuleSetFile(f)).toEqual([]);
  });
  it('every dictionary key is set in both files', () => {
    for (const id of ['pro_2026', 'college_2026']) {
      const rs = resolveRuleSet(id);
      expect(rs.keys()).toEqual(KEY_DICTIONARY.map((d) => d.key).sort());
    }
  });
  it('key names follow B13.1.2 (lower case dotted groups)', () => {
    for (const d of KEY_DICTIONARY) expect(d.key).toMatch(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,2}$/);
  });
});

describe('Q6.2.1 every rule value cites a shippable fact row', () => {
  it('each value of each level links to a row that names it', () => {
    for (const file of RULE_SET_FILES) {
      for (const v of file.values) {
        const row = factById.get(v.factId ?? '');
        expect(row, `${file.ruleset_id}:${v.key}`).toBeDefined();
        expect(row!.usedBy).toContain(`${file.ruleset_id}:${v.key}`);
        expect(row!.value).toEqual(v.value);
        expect(row!.level).toBe(file.level);
      }
    }
  });
  it('status is computed from the sources and is Rulebook only or better', () => {
    for (const row of facts) {
      expect(computeStatus(row), row.id).toBe(row.status);
      expect(ruleStatusShippable(row.status), row.id).toBe(true);
    }
  });
  it('every source carries a quote or an absence reading, and every row is used', () => {
    const used = new Set(RULE_SET_FILES.flatMap((f) => f.values.map((v) => v.factId)));
    for (const row of facts) {
      expect(used.has(row.id), `${row.id} is not used`).toBe(true);
      for (const s of row.sources) expect(Boolean(s.quote) || s.locator.includes('Read for absence') || s.locator.includes('Figure read as an image'), row.id).toBe(true);
    }
  });
});

describe('committed files equal the build output', () => {
  it('rebuilding from the authoring files changes nothing', () => {
    const keys: AuthKeysFile = read(join(DATA, 'authoring/keys.json'));
    const fouls: AuthFoulsFile = read(join(DATA, 'authoring/fouls.json'));
    const dictionary = (read(join(DATA, 'keys.json')).keys as unknown[]).map((k) => RuleKeyDef.parse(k));
    const files = { pro: RuleSetFile.parse(read(join(DATA, 'pro_2026.json'))), college: RuleSetFile.parse(read(join(DATA, 'college_2026.json'))) };
    const out = build({ keys: [...keys.entries, ...expandFouls(fouls)], dateRead: keys.dateRead, dictionary, files, facts });
    expect(out.problems).toEqual([]);
    expect(out.dictionary).toEqual(dictionary);
    expect(out.files.pro).toEqual(files.pro);
    expect(out.files.college).toEqual(files.college);
    expect(out.facts).toEqual(facts);
  });
});

describe('foul catalogue (B8.1.2, B13.12)', () => {
  const pro = resolveRuleSet('pro_2026');
  const college = resolveRuleSet('college_2026');

  it('the manifest check finds every field of every foul', () => {
    expect(checkFoulCatalogue()).toEqual([]);
    expect(FOUL_IDS.length).toBe(90);
    for (const id of FOUL_IDS) for (const f of FOUL_FIELDS) expect(KEY_DICTIONARY.some((d) => d.key === foulKey(id, f))).toBe(true);
  });

  it('the manifest check reports a missing field and a wrong type', () => {
    const dict = KEY_DICTIONARY.filter((d) => d.key !== 'foul.opi.yards').map((d) => (d.key === 'foul.opi.afd' ? { ...d, type: 'number' as const } : d));
    expect(checkFoulCatalogue(dict)).toEqual(['foul opi: missing key foul.opi.yards', 'foul opi: afd is number, expected boolean']);
  });

  it('loads one typed row per foul at each level', () => {
    for (const rs of [pro, college]) {
      const rows = foulCatalogue(rs);
      expect(rows.map((r) => r.id)).toEqual([...FOUL_IDS]);
      for (const r of rows) {
        expect(r.yards).toBeGreaterThanOrEqual(0);
        if (!r.exists) expect([r.yards, r.afd, r.lod, r.foulClass, r.dq]).toEqual([0, false, false, 'other', 'none']);
      }
    }
  });

  // Each case is the penalty statement of the cited rule (both rule book texts, 2026).
  const cases: [string, 'pro' | 'college', Partial<ReturnType<typeof foulRow>>][] = [
    ['false_start', 'pro', { yards: 5, deadBall: true, runoffEligible: true }],            // 7-4-2
    ['offside', 'pro', { yards: 5, afd: false }],                                           // 7-4-5, 14-1-2 Item 5 exception
    ['offensive_holding', 'pro', { yards: 10, afd: false }],                                // 12-1-3
    ['def_holding', 'pro', { yards: 5, afd: true }],                                        // 12-1-6
    ['def_holding', 'college', { yards: 10, afd: true }],                                   // 9-3-4
    ['dpi', 'pro', { yards: 0, spotFoul: true, afd: true }],                                // 8-5
    ['opi', 'college', { yards: 10, afd: false }],                                          // 7-3-8
    ['intentional_grounding', 'pro', { yards: 10, lod: true, runoffEligible: true }],       // 8-2-1, 4-7-1
    ['intentional_grounding', 'college', { yards: 0, lod: true, spotFoul: true }],          // 7-3-2
    ['illegal_touching_pass', 'pro', { yards: 5, lod: false }],                             // 8-1-8
    ['illegal_touching_pass', 'college', { yards: 5, lod: true }],                          // 7-3-11
    ['running_into_kicker', 'pro', { yards: 5, afd: false, foulClass: 'other' }],           // 12-2-12
    ['roughing_passer', 'pro', { yards: 15, afd: true, foulClass: 'personal', dq: 'if_flagrant' }], // 12-2-11
    ['helmet_weapon', 'pro', { dq: 'automatic' }],                                          // 12-2-17
    ['hip_drop', 'college', { exists: false }],
    ['targeting', 'pro', { exists: false }],
    ['targeting', 'college', { exists: true, yards: 15, afd: true, dq: 'automatic', foulClass: 'personal' }], // 9-1-3, 9-1-4
    ['illegal_contact', 'pro', { exists: true, yards: 5, afd: true }],                      // 8-4-3 (read by WP-12)
    ['illegal_contact', 'college', { exists: false }],
    ['invalid_fair_catch_signal', 'college', { exists: false }],                            // Appendix note
    ['assisting_runner', 'college', { yards: 5 }],                                          // 9-3-2
    ['unsportsmanlike', 'college', { yards: 15, foulClass: 'unsportsmanlike', afd: true }], // 9-2-1
  ];
  it.each(cases)('%s (%s) matches its penalty statement', (id, level, want) => {
    expect(foulRow(level === 'pro' ? pro : college, id)).toMatchObject(want);
  });
});

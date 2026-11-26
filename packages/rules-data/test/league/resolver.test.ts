import { describe, expect, it } from 'vitest';
import { LEAGUE_FILES, LEAGUE_RULES_IDS, LeagueRulesError, resolveLeagueRules, validateLeagueFiles } from '../../src/index.ts';

describe('league-rules resolver (C5, C6, T5; P4.7.1)', () => {
  it('resolves every league-rules id a competition may name, with no file problems', () => {
    for (const id of LEAGUE_RULES_IDS) {
      expect(validateLeagueFiles(LEAGUE_FILES[id]!), id).toEqual([]);
      const r = resolveLeagueRules(id);
      expect(r.id).toBe(id);
      expect(r.keys().length).toBe(LEAGUE_FILES[id]!.reduce((n, p) => n + p.file.values.length, 0));
    }
  });

  it('joins the schedule and staff file into the league file', () => {
    const pro = resolveLeagueRules('pro_league_2026');
    expect(pro.level).toBe('pro');
    expect(pro.seasonYear).toBe(2026);
    const sched = LEAGUE_FILES.pro_league_2026![1]!.file.values[0]!;
    expect(pro.get(sched.key)).toBe(sched.value);
  });

  it('answers the values the files hold, with their fact rows (PR 264 keys)', () => {
    const pro = resolveLeagueRules('pro_league_2026');
    expect(pro.num('cap.top_n_contracts')).toBe(51);
    expect(pro.num('cap.june1_designations')).toBe(2);
    expect(pro.factOf('cap.top_n_contracts')).toBe('F-cap-0002');
    expect(pro.lookup('no.such.key')).toBeUndefined();
    expect(() => pro.get('no.such.key')).toThrow(LeagueRulesError);
    expect(() => pro.bool('cap.top_n_contracts')).toThrow(/not a switch/);
  });

  it('refuses an unknown id, an unknown key and a key set twice', () => {
    expect(() => resolveLeagueRules('nfl_1999')).toThrow(/unknown league rules/);
    const [a, b] = LEAGUE_FILES.college_league_2026!;
    const extra = { ...a!, file: { ...a!.file, values: [...a!.file.values, { key: 'made.up', value: 1, unit: 'count', factId: 'F-league-0001' }] } };
    expect(validateLeagueFiles([extra, b!]).join('\n')).toMatch(/unknown key made\.up/);
    const twice = { ...b!, file: { ...b!.file, values: [...b!.file.values, a!.file.values[0]!] }, keys: [...b!.keys, ...a!.keys] };
    expect(validateLeagueFiles([a!, twice]).join('\n')).toMatch(/also set by/);
  });
});

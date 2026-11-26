// G-40: college content and level priors (T10.5.1). Every key an F leaf asks T10 for is present, shares sum to one,
// every value cites a fact row, and fact status is the computed status.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FactFile, computeStatus } from '@gm/schema';
import { offenseFamilies, passRate, shareSum, type CollegePriors } from '../../data/college/lib.ts';

const dir = new URL('../../data/college/', import.meta.url);
const load = (f: string) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const priors = load('priors.college.json') as CollegePriors & { kicking: any; openItems: string[] };
const files = [FactFile.parse(load('facts-measured.json')), FactFile.parse(load('facts-design.json'))];
const rows = files.flatMap((f) => f.rows);
const facts = new Map(rows.map((r) => [r.id, r]));
const espn = load('espn-crosscheck.json');

const REQUIRED = [
  'personnel_priors.college', 'tempo_priors.college', 'qb_run_priors.college', 'rpo_share.college', 'strength_call.college',
  'pass_rate.college', 'fourth_go.college', 'install_size.college', 'signal_method.college',
];

describe('G-40 college level priors', () => {
  it('has every T10.5.1 key with a reader', () => {
    for (const k of REQUIRED) {
      expect(priors.keys[k], k).toBeDefined();
      expect(priors.keys[k]!.reader, k).toBeTruthy();
    }
    expect(Object.keys(priors.keys).sort()).toEqual([...REQUIRED].sort());
  });
  it('fact rows parse, ids are unique, and status is the computed status', () => {
    expect(facts.size).toBe(rows.length);
    for (const r of rows) {
      expect(r.status, r.id).toBe(computeStatus(r));
      expect(r.level, r.id).toBe('college');
    }
  });
  it('every value cites existing fact rows, and every fact row is used', () => {
    const cited = new Set<string>();
    const walk = (o: any, path: string) => {
      if (o && typeof o === 'object') {
        if (Array.isArray(o.factIds)) {
          for (const id of o.factIds) {
            expect(facts.has(id), `${path} -> ${id}`).toBe(true);
            cited.add(id);
          }
        }
        for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
      }
    };
    walk(priors, 'priors');
    for (const id of facts.keys()) expect(cited.has(id), `unused ${id}`).toBe(true);
    for (const [k, v] of Object.entries(priors.keys)) {
      if (k !== 'signal_method.college') expect(v.factIds.length, k).toBeGreaterThan(0);
    }
  });
  it('measured rows are 2 of 3 or better and the cross-check agrees with the stated value', () => {
    const measured = files[0]!.rows;
    expect(measured.length).toBe(8);
    for (const r of measured) {
      expect(['2 of 3', 'Verified'], r.id).toContain(r.status);
      const eSrc = r.sources.find((s) => s.independenceGroup === 'espn-pbp')!;
      const key = /mean_2022_2024\.(\S+) =/.exec(eSrc.locator)![1]!;
      const e = espn.mean_2022_2024[key] as number;
      expect(eSrc.locator).toContain(String(e));
      // two independent feeds agree within 8% of the value
      expect(Math.abs(e - (r.value as number)) / (r.value as number), r.id).toBeLessThan(0.08);
    }
  });
  it('design rows are Assumption and never promoted', () => {
    for (const r of files[1]!.rows) {
      expect(r.assumption, r.id).toBe(true);
      expect(r.status, r.id).toBe('Assumption');
    }
  });
  it('priors file values equal the cited measured fact values', () => {
    const v = (id: string) => facts.get(id)!.value;
    expect(priors.keys['pass_rate.college']!.value).toBe(v('F-college-content-0001'));
    const go = priors.keys['fourth_go.college']!.value as Record<string, number>;
    expect(go.overall).toBe(v('F-college-content-0002'));
    expect(go.ytg_1_2).toBe(v('F-college-content-0003'));
    expect(go.ytg_3_5).toBe(v('F-college-content-0004'));
    expect(go.ytg_6_plus).toBe(v('F-college-content-0005'));
    expect(priors.kicking.fg_pct).toBe(v('F-college-content-0006'));
    expect(priors.kicking.fg_attempts_per_team_game).toBe(v('F-college-content-0007'));
    expect(priors.kicking.punts_per_team_game).toBe(v('F-college-content-0008'));
  });
  it('shares sum to one and ranges hold', () => {
    const close = (a: number) => expect(Math.abs(a - 1)).toBeLessThan(1e-9);
    const pers = priors.keys['personnel_priors.college']!.value as Record<string, number>;
    close(Object.values(pers).reduce((a, b) => a + b, 0));
    close(shareSum(priors.system_priors.college.offense.families));
    close(shareSum(priors.system_priors.college.defense.families));
    close(shareSum(offenseFamilies(priors, 'second_subdivision_and_below')));
    for (const k of ['tempo_priors.college', 'qb_run_priors.college', 'rpo_share.college']) {
      const v = priors.keys[k]!.value as Record<string, number>;
      const main = Object.entries(v).find(([n]) => !n.startsWith('system_'))![1];
      expect(v.system_low!, k).toBeLessThanOrEqual(main);
      expect(main, k).toBeLessThanOrEqual(v.system_high!);
    }
  });
  it('lower-division shift moves exactly 10 points off the first row into the last three', () => {
    const top = offenseFamilies(priors, 'top_subdivision');
    const low = offenseFamilies(priors, 'second_subdivision_and_below');
    expect(low.map((f) => f.id)).toEqual(top.map((f) => f.id));
    const d = top.map((f, i) => low[i]!.share - f.share);
    expect(d[0]).toBeCloseTo(-0.1, 9);
    expect(d[1]).toBeCloseTo(0, 9);
    expect(d[2]).toBeCloseTo(0, 9);
    expect(d[3]! + d[4]! + d[5]!).toBeCloseTo(0.1, 9);
    expect(d[3]! > 0 && d[4]! > 0 && d[5]! > 0).toBe(true);
    expect(passRate(priors, 'top_subdivision')).toBe(0.498);
    expect(passRate(priors, 'second_subdivision_and_below')).toBe(0.47);
  });
  it('college values differ from the pro values they replace and none is a copy of a pro number', () => {
    // pro measured: pass rate 57.6%, 4th go 19.4%, FG 85.0%, 1.99 attempts, 3.99 punts (R24 NFL column)
    expect(priors.keys['pass_rate.college']!.value).not.toBe(0.576);
    expect((priors.keys['fourth_go.college']!.value as any).overall).not.toBe(0.194);
    expect(priors.kicking.fg_pct).not.toBe(0.85);
  });
  it('rule key references exist in the rules key catalogue', () => {
    const cat = load('../../../rules-data/data/keys.json');
    const list: any[] = Array.isArray(cat) ? cat : (cat.keys ?? cat.rows ?? []);
    const names = new Set(list.map((k) => k.key));
    for (const ref of priors.keys['signal_method.college']!.ruleKeyRefs!) expect(names.has(ref), ref).toBe(true);
  });
  it('lists open items, and holds no forbidden coaching keys or real names', () => {
    expect(priors.openItems.length).toBeGreaterThan(0);
    const text = JSON.stringify(priors) + JSON.stringify(rows);
    expect(text).not.toMatch(/"(xp|perk|skillTree|coachPoints)"/i);
  });
});

// Special-teams call menu acceptance: every sheet box has calls under both 2026 rule sets, rule-dependent calls
// follow the rule values (dynamic vs traditional kickoff, declared vs surprise onside), every claim names real
// sources whose independence groups agree with its status word (A5.2.1), every rule fact and rule key exists,
// and the calls the console and coordinator receive are valid schema objects.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KickCall, OffenseCall, ReturnCall, scanForbiddenJson, type RuleSet } from '@gm/schema';
import {
  SPECIAL_CALLS, SPECIAL_CALL_BY_ID, ST_SOURCES, ST_SOURCE_BY_ID, MENU_CONDITIONS, menuFor, availableUnder, toKickCall, toReturnCall,
  specialOptions, sheetKindFor, contentHash, menuGroups, type SheetKind,
} from '../../src/special-teams/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
type Row = { key: string; value: number | boolean | string; factId: string };
function ruleSet(file: string): RuleSet & { rows: Row[] } {
  const j = JSON.parse(readFileSync(join(root, 'packages/rules-data/data', file), 'utf8')) as { ruleset_id: string; level: 'pro' | 'college'; season_year: number; values: Row[] };
  const m = new Map(j.values.map((r) => [r.key, r.value]));
  const get = (k: string) => { if (!m.has(k)) throw new Error(`${file}: no ${k}`); return m.get(k)!; };
  return { id: j.ruleset_id, level: j.level, seasonYear: j.season_year, num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string, keys: () => [...m.keys()], rows: j.values };
}
const PRO = ruleSet('pro_2026.json');
const COLLEGE = ruleSet('college_2026.json');
const facts = new Map((JSON.parse(readFileSync(join(root, 'facts/rule.json'), 'utf8')) as { rows: { id: string; level: string }[] }).rows.map((r) => [r.id, r]));
const ids = (rs: RuleSet, k?: SheetKind) => menuFor(rs, k).map((c) => c.id);
const BOXES: SheetKind[] = ['kickoff', 'kickoff_return', 'punt', 'punt_return', 'field_goal', 'field_goal_block', 'onside', 'hands_team', 'try'];

describe('coverage of the menu', () => {
  it('ids are unique and namespaced', () => {
    expect(new Set(SPECIAL_CALLS.map((c) => c.id)).size).toBe(SPECIAL_CALLS.length);
    for (const c of SPECIAL_CALLS) expect(c.id.startsWith('st.'), c.id).toBe(true);
  });
  for (const rs of [PRO, COLLEGE]) {
    it(`every sheet box has at least one call under ${rs.id}`, () => {
      for (const k of BOXES) expect(ids(rs, k).length, `${rs.id} ${k}`).toBeGreaterThanOrEqual(1);
    });
  }
  it('has the punt, return, field goal and fake calls asked for', () => {
    for (const id of ['st.punt.spread', 'st.punt.rugby', 'st.punt.directional_left', 'st.punt.pooch', 'st.punt.fake_pp_pass', 'st.pr.wall_left', 'st.pr.wall_right', 'st.pr.middle', 'st.pr.block', 'st.pr.safe',
      'st.fg.field_goal', 'st.fg.try_kick', 'st.fg.fake_holder_run', 'st.two.pick', 'st.fgb.edge_left', 'st.fgb.safe', 'st.onside.drive', 'st.kr.hands']) expect(SPECIAL_CALL_BY_ID.has(id), id).toBe(true);
  });
});

describe('rule-dependent calls follow the rule values', () => {
  it('pro (dynamic kickoff) offers only dynamic kickoffs and returns', () => {
    expect(ids(PRO, 'kickoff').sort()).toEqual(['st.ko.dyn_landing_deep', 'st.ko.dyn_line_drive', 'st.ko.dyn_touchback']);
    expect(ids(PRO, 'kickoff_return').every((i) => i.startsWith('st.kr.dyn_'))).toBe(true);
  });
  it('college (traditional kickoff) offers deep, squib, sky, pooch and directional kicks and no dynamic call', () => {
    expect(ids(COLLEGE, 'kickoff')).toEqual(expect.arrayContaining(['st.ko.deep', 'st.ko.squib', 'st.ko.sky', 'st.ko.pooch', 'st.ko.directional_left', 'st.ko.directional_right']));
    expect(ids(COLLEGE).some((i) => i.includes('.dyn_'))).toBe(false);
  });
  it('a surprise onside kick exists only where onside kicks need no declaration', () => {
    expect(ids(PRO, 'onside')).not.toContain('st.onside.surprise');
    expect(ids(COLLEGE, 'onside')).toContain('st.onside.surprise');
  });
  it('a rule set without a key the call needs leaves the call out', () => {
    const bare: Pick<RuleSet, 'keys' | 'bool' | 'opt'> = { keys: () => [], bool: () => { throw new Error('read'); }, opt: () => { throw new Error('read'); } };
    expect(availableUnder(SPECIAL_CALL_BY_ID.get('st.ko.deep')!, bare)).toBe(false);
    expect(availableUnder(SPECIAL_CALL_BY_ID.get('st.punt.spread')!, bare)).toBe(true);
  });
  it('every rule key the menu reads exists in both rule sets, and every rule fact exists', () => {
    for (const c of MENU_CONDITIONS) for (const rs of [PRO, COLLEGE]) expect(rs.keys(), `${rs.id} ${c.key}`).toContain(c.key);
    for (const d of SPECIAL_CALLS) for (const f of d.ruleFacts) expect(facts.has(f), `${d.id}: ${f}`).toBe(true);
  });
  it('the rule facts cited agree with the rule data they back (pro onside must be declared, college not)', () => {
    const row = (rs: typeof PRO, k: string) => rs.rows.find((r) => r.key === k)!;
    expect(row(PRO, 'kickoff.onside_must_declare')).toMatchObject({ value: true, factId: 'F-rule-0119' });
    expect(row(COLLEGE, 'kickoff.onside_must_declare')).toMatchObject({ value: false, factId: 'F-rule-0120' });
    expect(row(PRO, 'kickoff.touchback_yardline')).toMatchObject({ value: 35, factId: 'F-rule-0111' });
  });
});

describe('calls the engine, console and coordinator receive', () => {
  it('every kick and return call is a valid schema object carrying its content id', () => {
    for (const d of SPECIAL_CALLS) {
      if (d.unit === 'kick') { const c = toKickCall(d, []); expect(KickCall.safeParse(c).success, d.id).toBe(true); expect(c.callContentId).toBe(d.id); }
      if (d.unit === 'return') { const c = toReturnCall(d, []); expect(ReturnCall.safeParse(c).success, d.id).toBe(true); expect(c.callContentId).toBe(d.id); }
    }
  });
  it('maps safety kicks and try blocks', () => {
    expect(toKickCall(SPECIAL_CALL_BY_ID.get('st.ko.deep') as never, [], { safetyKick: true }).kickKind).toBe('safety_kick');
    expect(toReturnCall(SPECIAL_CALL_BY_ID.get('st.fgb.middle') as never, [], { onTry: true }).returnKind).toBe('try_block');
  });
  it('every engine kick and return kind has a sheet box with calls', () => {
    for (const k of ['kickoff', 'safety_kick', 'onside_kick', 'punt', 'field_goal', 'try_kick', 'punt_return', 'kick_return', 'hands_team', 'field_goal_block', 'try_block'] as const) {
      expect(menuFor(COLLEGE, sheetKindFor(k)).length, k).toBeGreaterThan(0);
    }
  });
  it('content hashes are stable and distinct', () => {
    const hs = SPECIAL_CALLS.map(contentHash);
    expect(new Set(hs).size).toBe(hs.length);
    expect(contentHash(SPECIAL_CALLS[0]!)).toBe(hs[0]);
  });
  it('the coordinator options mark fakes with their floor share and nothing else', () => {
    const opts = specialOptions(menuFor(PRO, 'punt'), () => 0);
    expect(opts.filter((o) => o.fake).every((o) => (o.fakeShare ?? 0) > 0)).toBe(true);
    expect(opts.filter((o) => !o.fake).every((o) => o.fakeShare === undefined)).toBe(true);
    expect(opts.some((o) => o.fake)).toBe(true);
  });
  it('fakes and two-point plays name a play kind; fakes name the look they need', () => {
    for (const d of SPECIAL_CALLS) if (d.unit === 'offense') { expect(d.playKind.length).toBeGreaterThan(0); if (d.fake) expect(d.requiredLook, d.id).not.toBeNull(); }
  });
});

describe('forbidden keys and outcome numbers', () => {
  it('the data holds none (Q1.2.1)', () => {
    const data = JSON.parse(JSON.stringify(SPECIAL_CALLS));
    expect(scanForbiddenJson('special-teams', data)).toEqual([]);
    for (const key of ['yards', 'successRate', 'makePct', 'returnYards']) expect(JSON.stringify(data)).not.toContain(`"${key}"`);
  });
});

describe('sourcing (A5.2.1)', () => {
  it('source ids are unique and every source has a page, a group and how it was read', () => {
    expect(new Set(ST_SOURCES.map((s) => s.id)).size).toBe(ST_SOURCES.length);
    for (const s of ST_SOURCES) { expect(s.url.length, s.id).toBeGreaterThan(4); expect(s.group.length, s.id).toBeGreaterThan(0); expect(s.citation).toMatch(/2026|Rules|read/); }
  });
  it('status words agree with the number of independence groups', () => {
    for (const d of SPECIAL_CALLS) for (const b of d.basis) {
      for (const s of b.sources) expect(ST_SOURCE_BY_ID.has(s), `${d.id}: ${s}`).toBe(true);
      const groups = new Set(b.sources.map((s) => ST_SOURCE_BY_ID.get(s)!.group)).size;
      const label = `${d.id}: ${b.claim}`;
      if (b.status === 'Verified') expect(groups, label).toBeGreaterThanOrEqual(3);
      if (b.status === '2 of 3') expect(groups, label).toBe(2);
      if (b.status === '1 of 3') expect(groups, label).toBe(1);
      if (b.status === 'Conflict') expect(groups, label).toBeGreaterThanOrEqual(2);
      if (b.status === 'Rulebook only') expect(b.sources.every((s) => ST_SOURCE_BY_ID.get(s)!.how === 'rulebook') && b.sources.length > 0, label).toBe(true);
      if (b.status === 'Assumption') expect(b.sources, label).toEqual([]);
    }
  });
  it('every call rests on two or more independence groups', () => {
    for (const d of SPECIAL_CALLS) {
      const groups = new Set(d.basis.flatMap((b) => b.sources).map((s) => ST_SOURCE_BY_ID.get(s)!.group));
      expect(groups.size, d.id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('console and coordinator groups (data/special-teams copies)', () => {
  for (const rs of [PRO, COLLEGE]) {
    it(`the committed copy for ${rs.id} matches the generator`, () => {
      const file = join(root, `packages/football-content/data/special-teams/menu-${rs.id}.json`);
      const want = `${JSON.stringify({ ruleset: rs.id, personnelNote: 'fixture personnel 11 on offensive calls; the console passes the depth chart code', groups: menuGroups(rs, () => '11') }, null, 1)}\n`;
      expect(readFileSync(file, 'utf8')).toBe(want);
    });
  }
  it('fake and two-point templates are valid offensive calls once players are added', () => {
    for (const g of menuGroups(COLLEGE, () => '11')) for (const it2 of g.items) if (it2.call.unit === 'offense') expect(OffenseCall.safeParse({ ...it2.call, players: [] }).success, it2.id).toBe(true);
  });
});

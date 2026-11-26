import { describe, expect, it } from 'vitest';
import { RULE_KEYS, PARAMS, rosterRules } from '../../src/roster/index.ts';
import { COLLEGE, PRO, fixtureRuleSet, proFixture, league, tx, ok } from './helpers.ts';

describe('every limit is read by key (G-15 acceptance)', () => {
  const manifest = new Set(RULE_KEYS.map((k) => k.key));

  it('reads only keys in its manifest, at both levels', () => {
    for (const r of [PRO, COLLEGE]) for (const k of r.keysRead) expect(manifest.has(k), k).toBe(true);
  });

  it('every manifest key is read by at least one level, so no key is dead', () => {
    const read = new Set([...PRO.keysRead, ...COLLEGE.keysRead]);
    for (const k of manifest) expect(read.has(k), k).toBe(true);
  });

  it('manifest rows name an owner leaf in C5, T5 or H6 and the roster module as reader', () => {
    for (const k of RULE_KEYS) {
      expect(k.ownerLeaf).toMatch(/^(C5|T5|H6)\./);
      expect(k.readBy).toContain('league.roster');
    }
    expect(new Set(RULE_KEYS.map((k) => k.key)).size).toBe(RULE_KEYS.length);
  });

  it('features follow the keys present, never the level', () => {
    expect(PRO.practiceSquad).not.toBeNull();
    expect(COLLEGE.practiceSquad).toBeNull();
    expect(COLLEGE.waivers).toBeNull();
    expect(COLLEGE.seasonLimit).toBe(105);
    expect(PRO.seasonLimit).toBe(53);
  });

  it('changing a key value changes the rule: a 52-man limit refuses the 53rd', () => {
    const r52 = rosterRules(fixtureRuleSet(proFixture as never, { 'roster.offseason_limit': 52 }));
    const s = league({ clubs: 1, perClub: 52, rules: r52 });
    const res = tx(s, { type: 'sign_free_agent', clubId: 1, personId: 900001 }, r52);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.rule).toBe('C5.1.1');
    ok(tx(s, { type: 'sign_free_agent', clubId: 1, personId: 900001 }, PRO));
  });

  it('every tuning parameter has a basis and a leaf', () => {
    for (const p of PARAMS.params) {
      expect(['bible', 'assumption']).toContain(p.basis);
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
    }
  });
});

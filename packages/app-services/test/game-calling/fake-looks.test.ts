// I4.6.1 / G7.7.2 every fake on the special-teams menu carries a look the engine can check: the menu's terms
// (football-content data copies) bind to a FIXTURE punt and field goal formation with engine-core
// `bindFakeLook` and read on a FIXTURE defensive picture. The two packages declare the term shape apart
// (P1.2.1), so this test is what keeps the menu's terms readable by the engine.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Assignment } from '@gm/schema';
import { tickResolver } from '@gm/engine-core';

type MenuTerm = tickResolver.FakeLookTerm;
const KEYS: Record<MenuTerm['kind'], readonly string[]> = {
  uncovered: ['kind', 'who', 'lateralYd', 'depthYd'], edgeOpen: ['kind', 'outsideOf', 'marginYd', 'depthYd'],
  outnumbered: ['kind', 'gapYd', 'depthYd'], boxAtMost: ['kind', 'count', 'halfWidthYd', 'depthYd'],
};
const ROLES: readonly tickResolver.FakeRole[] = ['wing', 'end', 'gunner', 'slot'];

interface Item { id: string; fake: boolean; requiredLook: string | null; look: MenuTerm[] | null }
const items = (ruleset: string): Item[] =>
  (JSON.parse(readFileSync(new URL(`../../../football-content/data/special-teams/menu-${ruleset}.json`, import.meta.url), 'utf8')) as { groups: { items: Item[] }[] }).groups.flatMap((g) => g.items);

const at = (role: string, px: number, py: number): Assignment => ({
  role, preSnap: { align: { px, py }, onLine: px > -0.6, stance: 'two_point', motion: null },
  behavior: { type: 'protectKick', params: {}, path: [] }, gaze: 'key',
} as unknown as Assignment);
/** FIXTURE spread punt: gunners, wings, slot-less; and a field goal unit with ends and wings. */
const PUNT = [at('GL', -0.4, 20), at('WL', -1, 4.5), at('T', -0.4, 2.8), at('G', -0.4, 1.4), at('LS', -0.4, 0), at('G', -0.4, -1.4), at('T', -0.4, -2.8), at('PP', -6, 1), at('P', -14, 0), at('WR', -1, -4.5), at('GR', -0.4, -20)];
const FG = [at('WL', -1, 5.2), at('EL', -0.4, 4), at('T', -0.4, 2.6), at('G', -0.4, 1.3), at('LS', -0.4, 0), at('G', -0.4, -1.3), at('T', -0.4, -2.6), at('ER', -0.4, -4), at('H', -7.5, 0.4), at('K', -9.5, -1.5), at('WR', -1, -5.2)];
const ROLE: Record<string, tickResolver.FakeRole> = { GL: 'gunner', GR: 'gunner', WL: 'wing', WR: 'wing', EL: 'end', ER: 'end' };
/** Ten across inside 2.25 yd and a returner: the edges are open, every outside man is uncovered. */
const SOFT = [...Array.from({ length: 10 }, (_, i) => at(`R${i}`, 1, (i - 4.5) * 0.5)), at('PR', 45, 0)];
/** Defenders on every outside man and the edges. */
const HARD = [at('J', 1, 20), at('J', 1, -20), at('E', 1, 6.5), at('E', 1, -6.5), at('C', 1, 4.3), at('C', 1, -4.3), at('R', 1, 1), at('R', 1, -1), at('L', 4, 12), at('L', 4, -12), at('PR', 45, 0)];

describe('every menu fake has a look the engine checks', () => {
  it('every menu term has exactly the fields the engine reads, and names only roles the engine knows', () => {
    for (const f of items('pro_2026').filter((i) => i.fake)) for (const t of f.look!) {
      expect(Object.keys(t).sort(), f.id).toEqual([...KEYS[t.kind]].sort());
      if (t.kind === 'uncovered') for (const r of t.who) expect(ROLES, f.id).toContain(r);
      if (t.kind === 'edgeOpen') expect(ROLES, f.id).toContain(t.outsideOf);
    }
  });
  for (const rs of ['pro_2026', 'college_2026']) {
    it(`${rs}: every fake binds to its formation and the look reads differently against a soft and a hard picture`, () => {
      const fakes = items(rs).filter((i) => i.fake);
      expect(fakes.length).toBeGreaterThan(0);
      for (const f of fakes) {
        expect(f.look, f.id).not.toBeNull();
        if (f.id === 'st.fg.swinging_gate') continue; // its own wide alignment, checked below
        const O = f.id.startsWith('st.punt.') ? PUNT : FG;
        const conds = tickResolver.bindFakeLook(f.look!, O, (s) => ROLE[O[s]!.role] ?? null);
        expect(tickResolver.lookShown(conds, O, SOFT, []), `${f.id} soft`).toBe(true);
        expect(tickResolver.lookShown(conds, O, HARD, []), `${f.id} hard`).toBe(false);
      }
    });
  }
  it('the swinging gate reads unmatched when the defense stays home', () => {
    const gate = items('pro_2026').find((i) => i.id === 'st.fg.swinging_gate')!;
    const O = FG.map((a, i) => (i <= 3 ? at(a.role, a.preSnap.align.px, 12 + i * 1.5) : a));
    const conds = tickResolver.bindFakeLook(gate.look!, O, (s) => ROLE[O[s]!.role] ?? null);
    expect(tickResolver.lookShown(conds, O, SOFT, [])).toBe(true);
    const matched = SOFT.map((a, i) => (i < 4 ? at(a.role, 1, 12 + i * 1.5) : a));
    expect(tickResolver.lookShown(conds, O, matched, [])).toBe(false);
  });
});

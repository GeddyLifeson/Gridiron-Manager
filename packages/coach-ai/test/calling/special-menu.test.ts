// K4.6.1 on the real special-teams call menu (football-content data copies of menuGroups, both 2026 rule sets):
// the coordinator's mix takes every box's calls as options, a fake he rates as gaining gets its floor share,
// a fake he rates as losing keeps only the floor, and the chosen id is a call of that box.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stream, seedFromNumber, DMATH } from '@gm/engine-core';
import { callSpecialTeams, specialTeamsMix, type SpecialOption } from '../../src/calling/index.ts';

interface Item { readonly id: string; readonly fake: boolean; readonly fakeShare: number | null }
const groups = (ruleset: string) =>
  (JSON.parse(readFileSync(new URL(`../../../football-content/data/special-teams/menu-${ruleset}.json`, import.meta.url), 'utf8')) as { groups: { kind: string; items: Item[] }[] }).groups;
const options = (items: readonly Item[], gain: (i: Item) => number): SpecialOption[] =>
  items.map((i) => (i.fake ? { callId: i.id, estimatedGain: gain(i), fake: true, fakeShare: i.fakeShare ?? 0 } : { callId: i.id, estimatedGain: gain(i), fake: false }));
const SEED = seedFromNumber(20261126);

for (const ruleset of ['pro_2026', 'college_2026']) {
  describe(`special-teams mix over the menu (${ruleset})`, () => {
    it('picks a call of the box for every kicking unit', () => {
      for (const g of groups(ruleset)) {
        const r = callSpecialTeams(options(g.items, () => 0), stream(SEED, 'coachAI', [1, g.kind.length, 0, 1]), DMATH);
        expect(g.items.map((i) => i.id), g.kind).toContain(r.callId);
        expect(r.mix.reduce((a, x) => a + x, 0)).toBeCloseTo(1, 9);
      }
    });
    it('a fake keeps its floor share only while the coordinator rates it as gaining', () => {
      const punt = groups(ruleset).find((g) => g.kind === 'punt')!;
      const fakeAt = punt.items.findIndex((i) => i.fake);
      const up = specialTeamsMix(options(punt.items, (i) => (i.fake ? 0.02 : 0)), DMATH);
      const down = specialTeamsMix(options(punt.items, (i) => (i.fake ? -0.02 : 0)), DMATH);
      expect(up[fakeAt]!).toBeGreaterThan(down[fakeAt]!);
      expect(down[fakeAt]!).toBeGreaterThan(0);
    });
  });
}

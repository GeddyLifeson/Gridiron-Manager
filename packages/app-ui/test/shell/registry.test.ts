// O1.1.1, O1.1.2, O1.1.3: hubs, registry validation and routes.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { HUBS, HUB_IDS, SCREENS, validateRegistry, resolve, buildPath, href, routeParams, screensInHub, hasParams, type ScreenRecord } from '../../src/shell/index.ts';

const BIBLE = process.env.GM_BIBLE_DIR ?? '/mnt/project-files/bible';

describe('hubs (O1.1.1)', () => {
  it('ten hubs with keys 1 to 9 then 0, in the table order', () => {
    expect(HUBS.map((h) => h.key)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
    expect(HUB_IDS).toEqual(['office', 'team', 'football', 'week', 'game', 'film', 'people', 'league', 'coach', 'school']);
  });
  it('every screen belongs to exactly one hub, and every hub has a screen that opens with no parameters', () => {
    for (const s of SCREENS) expect(HUB_IDS.filter((h) => h === s.hub)).toHaveLength(1);
    for (const h of HUB_IDS) expect(screensInHub(h).some((s) => !hasParams(s)), h).toBe(true);
  });
  it('the draft, cap and free agency screens are registered in the first release', () => {
    for (const id of ['team.draft', 'team.cap', 'team.free_agency']) expect(SCREENS.find((s) => s.id === id)?.version).toBe('v1');
  });
});

describe('registry (O1.1.2)', () => {
  it('the shipped registry validates', () => { expect(validateRegistry(SCREENS)).toEqual([]); });
  it('every bible id names a real leaf, section or area (when the bible folder is reachable)', () => {
    if (!existsSync(join(BIBLE, 'INDEX.md'))) return; // the PC has no /mnt; the id pattern check above still runs
    const ids = new Set<string>();
    for (const area of readdirSync(BIBLE).filter((d) => /^[A-Z]-/.test(d) && statSync(join(BIBLE, d)).isDirectory())) {
      ids.add(area[0]!);
      for (const f of readdirSync(join(BIBLE, area)).filter((x) => x.endsWith('.md'))) {
        const m = /^([A-Z]\d+)/.exec(f);
        if (m) ids.add(m[1]!);
        for (const h of readFileSync(join(BIBLE, area, f), 'utf8').matchAll(/^#{2,3} ([A-Z]\d+(?:\.\d+){0,2}) /gm)) ids.add(h[1]!);
      }
    }
    expect(ids.size).toBeGreaterThan(500);
    expect(validateRegistry(SCREENS, ids)).toEqual([]);
  });
  const twin = (patch: Partial<ScreenRecord>): ScreenRecord[] => [...SCREENS, { ...SCREENS[0]!, id: 'office.twin', hotkey: 'z', route: '/office/twin', ...patch }];
  it('catches a duplicated route (acceptance 2)', () => {
    expect(validateRegistry(twin({ route: '/office/today' })).map((p) => p.message).join()).toMatch(/duplicates office.today/);
  });
  it('catches a duplicated id and a duplicated hub-and-hotkey pair', () => {
    expect(validateRegistry(twin({ id: 'office.today' })).some((p) => /duplicate id/.test(p.message))).toBe(true);
    expect(validateRegistry(twin({ hotkey: 't' })).some((p) => /already used by office.today/.test(p.message))).toBe(true);
  });
  it('catches a bible id that is not in the index', () => {
    expect(validateRegistry(SCREENS, new Set(['O1.2.1'])).length).toBeGreaterThan(0);
    expect(validateRegistry(twin({ bible: ['not-a-leaf'] })).some((p) => /not a leaf/.test(p.message))).toBe(true);
  });
  it('removing a record removes it everywhere with no code change (acceptance 1)', () => {
    const fewer = SCREENS.filter((s) => s.id !== 'week.travel');
    expect(validateRegistry(fewer)).toEqual([]);
    expect(resolve('/week/travel', fewer)).toBeNull();
  });
});

describe('routes (O1.1.3)', () => {
  it('every registered route resolves back to its screen with sample ids, view options kept', () => {
    for (const s of SCREENS) {
      const params = Object.fromEntries(routeParams(s).map((p) => [p, `${p}-42`]));
      const full = buildPath(s, params, { sort: 'pos', tab: 'grades' });
      const loc = resolve(full)!;
      expect(loc.screenId, full).toBe(s.id);
      expect(loc.params).toEqual(params);
      expect(loc.view).toEqual({ sort: 'pos', tab: 'grades' });
      expect(href(loc)).toBe(full);
    }
  });
  it('an unknown address resolves to nothing', () => { expect(resolve('/team/nowhere')).toBeNull(); });
  it('parameters are encoded and decoded', () => {
    const s = SCREENS.find((x) => x.id === 'team.player')!;
    expect(resolve(buildPath(s, { playerId: 'p/1 x' }))!.params.playerId).toBe('p/1 x');
  });
});

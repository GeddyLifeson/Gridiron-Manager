// Route table (integrator): every route the table can build sits on a screens.json id, and each source wires
// exactly the screens its package owns. Sources are stubs: factories only read them at render time.
import { describe, it, expect } from 'vitest';
import { SCREENS } from '../../src/shell/index.ts';
import { buildRoutes, type RouteSources } from '../../src/routes.ts';

const stub = (): never => new Proxy(() => null, { get: () => stub() }) as never;
const ALL: Required<RouteSources> = {
  rosterMoves: stub(), gameFrame: stub(), scouting: stub(), analytics: { load: stub() }, week: { getModel: stub() },
  film: stub(), career: stub(), assignments: { load: stub() }, school: { load: stub() }, gameCalling: stub(),
  defenseDesigner: { load: stub() }, playDesigner: stub(),
  settings: { host: stub() }, playerDesigner: stub(), editors: stub(), gameplan: stub(), practice: { getModel: stub() }, home: stub(), people: stub(), legends: { load: stub() }, cap: stub(), depthChart: stub(), draftRoom: stub(), freeAgency: stub(),
};

describe('route table', () => {
  const ids = new Set(SCREENS.map((s) => s.id));
  it('every route id is a registered screen', () => {
    const keys = Object.keys(buildRoutes(ALL));
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter((k) => !ids.has(k))).toEqual([]);
  });
  it('no source means no route (placeholder)', () => {
    expect(buildRoutes({})).toEqual({});
  });
  it('wires the named screens', () => {
    const t = buildRoutes(ALL);
    for (const id of ['team.roster_moves', 'film.statistics', 'week.schedule', 'office.today', 'school.lessons', 'school.drills',
      'game.console', 'football.defense_designer', 'football.play_designer', 'coach.career', 'film.viewer', 'game.pregame', 'school.settings', 'people.player_designer', 'school.mods', 'football.game_plan', 'football.call_sheet', 'week.practice', 'league.legends', 'office.inbox', 'office.calendar', 'team.cap', 'team.depth_chart', 'team.draft', 'team.free_agency']) {
      expect(t[id], id).toBeDefined();
    }
  });
});

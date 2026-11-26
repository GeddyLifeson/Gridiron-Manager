// The career hub's route sources: the six coach screens and the Office list mount through buildRoutes and render
// what the host serves; a save with no user mounts none of them (the shell shows placeholders). The host here is a
// stand-in made of the app-services empty views plus one Office row; app-services tests the host on a real save.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { careerScreens } from '@gm/app-services';
import { buildRoutes, ASSIGNMENTS_SCREEN_ID } from '../../src/routes.ts';
import { careerSources, screenPath } from '../../src/app-root/sources/career.ts';
import { CAREER_SCREEN_IDS } from '../../src/screens/career/index.ts';
import { screenById } from '../../src/shell/registry.ts';
import type { ScreenProps } from '../../src/shell/index.ts';

const E = careerScreens.EMPTY_VIEWS;
const R: readonly string[] = [];
function stand(personId: number | null): careerScreens.CareerHost {
  return {
    personId,
    career: () => E.career(R, 'Sam Doyle'), jobMarket: () => E.jobMarket(R), contract: () => E.contract(R), record: () => E.record(R),
    finance: () => E.finance(R), life: () => E.life(R),
    assignments: () => (personId === null ? null : {
      rights: R, jobTitle: 'Quality control coach (offense)', bossName: 'Ada Price', freeHours: 12,
      rows: [{ dutyId: 'film.tags', title: 'Tag film', leaf: 'H2', assignedBy: 'boss', due: null, hoursEst: 4, state: 'assigned', status: 'open', screenId: 'coach.record', command: null }],
    }),
  };
}

const props = (id: string, nav: string[] = []): ScreenProps => ({
  screen: screenById(id)!, location: { path: screenById(id)!.route, params: {}, view: {} } as unknown as ScreenProps['location'],
  readOnly: false, navigate: (to) => { nav.push(to); }, setView: () => {},
});

describe('career hub sources (item 2d)', () => {
  const host = stand(1);
  const routes = buildRoutes(careerSources(host));

  it('mounts the six coach screens and the Office list', () => {
    for (const id of CAREER_SCREEN_IDS) expect(routes[id], id).toBeDefined();
    expect(routes[ASSIGNMENTS_SCREEN_ID]).toBeDefined();
  });
  it('each screen renders the save\'s coach', () => {
    const html = renderToStaticMarkup(createElement(() => routes['coach.career']!.render(props('coach.career')) as never));
    expect(html).toContain('Sam Doyle');
    expect(renderToStaticMarkup(createElement(() => routes[ASSIGNMENTS_SCREEN_ID]!.render(props(ASSIGNMENTS_SCREEN_ID)) as never))).toContain('Tag film');
    for (const id of CAREER_SCREEN_IDS) expect(() => renderToStaticMarkup(createElement(() => routes[id]!.render(props(id)) as never))).not.toThrow();
    expect(() => renderToStaticMarkup(createElement(() => routes[ASSIGNMENTS_SCREEN_ID]!.render(props(ASSIGNMENTS_SCREEN_ID)) as never))).not.toThrow();
  });
  it('opening a duty goes to its screen\'s path', () => {
    const nav: string[] = [];
    const s = careerSources(host);
    const row = host.assignments()!.rows.find((r) => screenPath(r.screenId) !== null)!;
    s.assignments!.onOpen!(props(ASSIGNMENTS_SCREEN_ID, nav), row.screenId);
    expect(nav).toEqual([screenPath(row.screenId)]);
  });
  it('a save with no user mounts no career screen', () => {
    expect(careerSources(stand(null))).toEqual({});
  });
});

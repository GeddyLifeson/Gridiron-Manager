import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ladder, positions } from '@gm/career';
import { HUB_IDS, SCREENS, Shell, screensInHub, resolve, type ScreenRecord } from '../../../src/shell/index.ts';
import { AssignmentList, CAREER_SCREEN_IDS, CareerScreen, JobMarketScreen, LifeScreen, RecordScreen, FinanceScreen, RUNG_DEFAULTS, careerRoutes, hubDefault, type RungBand } from '../../../src/screens/career/index.ts';
import { crawl, type Seat, type RouteOpener } from '../../harness/index.ts';
import { assignmentsView, careerView, financeView, jobMarketView, lifeView, loaders, recordView, SELF } from './fixtures.ts';

const views = ladder.ladderSeats(positions.CATALOGUE.jobs);
const realSeats: Seat[] = views.map((s) => ({ id: `${s.jobId}@${s.level}`, rung: s.rung!, level: s.level, listed: new Set(Object.keys(s.states)), rights: new Set(s.rights) }));
const permsOf = new Map<string, Record<string, ladder.ScreenState>>(views.map((s) => [`${s.jobId}@${s.level}`, { ...s.states }]));

const opener = (routes = careerRoutes(loaders())): RouteOpener => (path, seat) => {
  const loc = resolve(path, SCREENS);
  if (loc && !seat.listed.has(loc.screenId)) return null;
  return renderToStaticMarkup(createElement(Shell, { initialPath: path, routes, screens: SCREENS, permissions: permsOf.get(seat.id), context: { teamName: 'Rivertown', record: '3-1', phaseId: null, phaseLabel: 'Regular season', hoursLeft: 40 } }));
};
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

describe('G-85 real seats in the route crawl (Q1.5.3, O7.1.1)', () => {
  it('every core screen id is a registry screen and every registry screen has an access row', () => {
    const reg = new Set(SCREENS.map((s) => s.id));
    expect(Object.keys(ladder.SCREEN_TABLE.access).sort()).toEqual([...reg].sort());
    for (const list of Object.values(ladder.SCREEN_TABLE.dutyScreens)) for (const id of list) if (id !== '*') expect(reg.has(id), id).toBe(true);
  });

  it('crawls every ladder seat with S3 rights: listed routes open with their badge, others are refused, no control lacks a right', () => {
    const r = crawl({ seats: realSeats, open: opener() });
    expect(r.problems).toEqual([]);
    expect(r.opened).toBe(realSeats.reduce((n, s) => n + s.listed.size, 0));
    expect(r.refused).toBe(realSeats.length * SCREENS.length - r.opened);
    for (const id of CAREER_SCREEN_IDS) expect(r.stubs).not.toContain(id);
  });

  it('the badge in the header is the core state', () => {
    const seat = realSeats.find((s) => s.id === 'job:college.graduate_assistant@college')!;
    const page = opener()('/film/tagging', seat)!;
    expect(page).toContain('class="gm-perm">Assigned<');
  });

  it("every seat's duty list is reachable on screen through the assignment list (R1.2.9 gate item 3)", () => {
    for (const v of views) for (const week of ['game', 'offseason'] as const) {
      const rows = ladder.assignmentRows({ view: v, week, requests: new Set(v.duties.map((d) => d.duty.id)) });
      const markup = html(createElement(AssignmentList, { view: assignmentsView(rows, v.rights) }));
      for (const r of rows) {
        expect(markup, `${v.jobId} ${r.dutyId}`).toContain(`data-duty="${r.dutyId}"`);
        expect(v.states[r.screenId], `${v.jobId} ${r.dutyId} -> ${r.screenId}`).toBeDefined();
        if (r.command) expect(markup).toContain(`data-command="${r.command}"`);
      }
    }
    const listed = new Set(views.flatMap((v) => [...ladder.assignmentRows({ view: v, week: 'game', requests: new Set(v.duties.map((d) => d.duty.id)) }), ...ladder.assignmentRows({ view: v, week: 'offseason' })].map((r) => r.dutyId)));
    expect([...listed].sort()).toEqual(ladder.DUTIES.duties.map((d) => d.id).sort());
  });
});

describe('G-85 rung default routes (O7.2.2)', () => {
  it('each band opens ten valid routes for every seat in it', () => {
    for (const v of views) {
      const band = v.band as RungBand;
      expect(Object.keys(RUNG_DEFAULTS[band]).sort()).toEqual([...HUB_IDS].sort());
      const opened = HUB_IDS.map((hub) => hubDefault(band, hub, v.states, screensInHub(hub).map((s: ScreenRecord) => s.id)));
      expect(opened.every((id) => id !== null), v.jobId).toBe(true);
      for (const id of opened) expect(SCREENS.find((s) => s.id === id)!.hub).toBeDefined();
    }
    const pc = views.find((v) => v.jobId === 'job:college.position_coach.wr')!;
    expect(hubDefault('4-5', 'team', pc.states, screensInHub('team').map((s) => s.id))).toBe('team.depth_chart');
  });
});

describe('G-85 coach screens (O4.6, O7.6.1)', () => {
  it('a control is absent when the seat lacks its right', () => {
    expect(html(createElement(JobMarketScreen, { view: jobMarketView([]) }))).not.toContain('data-command');
    expect(html(createElement(JobMarketScreen, { view: jobMarketView() }))).toContain('data-command="market.apply"');
  });

  it('the ladder marks the current rung, and the career page has no skill element (O4.6.1)', () => {
    const m = html(createElement(CareerScreen, { view: careerView(), tab: 'career', onTab: () => {} }));
    expect(m).toContain('aria-current="true"');
    expect(m).not.toMatch(/\bskills?\b|\bxp\b|\blevel \d|progress|radar/i);
    for (const tab of ['history', 'tree', 'reputation'] as const) expect(html(createElement(CareerScreen, { view: careerView(), tab, onTab: () => {} }))).not.toContain('undefined');
  });

  it('hot seat signs show as facts, never as a hot seat label (E4.4.1); year-out choices only without a job', () => {
    const m = html(createElement(JobMarketScreen, { view: jobMarketView() }));
    expect(m).toContain('owner attends');
    expect(m).not.toMatch(/hot seat/i);
    expect(m).not.toContain('data-command="market.year_out"');
    expect(html(createElement(JobMarketScreen, { view: jobMarketView(SELF, true) }))).toContain('data-command="market.year_out"');
  });

  it('the record total equals the season rows, and an empty family reads no record', () => {
    const m = html(createElement(RecordScreen, { view: recordView() }));
    expect(m).toMatch(/data-total="career">.*14-10/);
    expect(m).toContain('No record');
  });

  it('finance shows every projection as a range; life lists every active effect', () => {
    expect(html(createElement(FinanceScreen, { view: financeView() }))).toMatch(/\$10,000 to \$60,000/);
    expect(html(createElement(LifeScreen, { view: lifeView() }))).toContain('data-effect="tired_takes_in_less"');
  });

  it('a scripted career moves through four rungs and two levels on these screens alone (O7.6.1 acceptance, by route)', () => {
    const path = ['job:college.graduate_assistant@college', 'job:college.quality_control.offense@college', 'job:pro.position_coach.qb@pro', 'job:pro.coordinator.offense@pro', 'job:pro.head_coach@pro'];
    const open = opener();
    for (const id of path) {
      const seat = realSeats.find((s) => s.id === id)!;
      const page = open('/coach/job-market', seat)!;
      expect(page, id).toContain('data-command="market.apply"');
      expect(page).toContain('data-command="market.answer_offer"');
    }
    expect(new Set(path.map((p) => p.split('@')[1])).size).toBe(2);
  });
});

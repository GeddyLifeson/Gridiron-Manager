// Week schedule screen renders from the week view model (H1.1.1 acceptance 3: every block opens its
// owner screen). The model shape matches league `week.scheduleView`; app-ui reads only app-services'
// public entry, so the test builds the model by hand.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeekSchedule, weekScheduleRoute, type WeekScheduleView } from '../../src/screens/week/index.ts';

const block = (id: string, type: string, owner: string, start: string, extra: Partial<WeekScheduleView['days'][number]['blocks'][number]> = {}) => ({
  id, type, owner, start, minutes: 60, attendees: ['team'], leader: 'head_coach', location: 'facility', session: null,
  unplanned: false, done: false, padded: false, ...extra,
});
const model: WeekScheduleView = {
  weekId: 'w1', shape: 'normal', home: true, coachHours: 61.5,
  days: [
    { date: '2026-09-07', label: 'G-6', kind: 'recovery', blocks: [block('b1', 'meeting', 'H4', '08:00'), block('b2', 'media', 'H7', '12:00', { session: 'day_after' })] },
    { date: '2026-09-08', label: 'G-5', kind: 'off', blocks: [] },
    { date: '2026-09-09', label: 'G-4', kind: 'p1', blocks: [block('b3', 'practice', 'H3', '13:00', { unplanned: true, done: true })] },
  ],
  hard: [{ plain: 'Second padded practice this week', penalty: 'Fine', leaf: 'H1.1.2' }],
  soft: ['Long day'],
  documents: [{ id: 'w1:players_packet', type: 'players_packet', state: 'draft', late: true }],
};

describe('week schedule screen', () => {
  const html = renderToStaticMarkup(createElement(WeekSchedule, { model }));
  it('shows one column per day and every block as a button tagged with its owner', () => {
    expect(html.match(/role="gridcell"/g)?.length).toBe(3);
    expect(html.match(/class="gm-week-block"/g)?.length).toBe(3);
    for (const id of ['b1', 'b2', 'b3']) expect(html).toContain(`data-block="${id}"`);
    expect(html).toContain('data-owner="H3"');
    expect(html).toContain('day after');
  });
  it('shows the limits panel and the documents', () => {
    expect(html).toContain('Second padded practice this week');
    expect(html).toContain('Long day');
    expect(html).toContain('players packet');
  });
  it('the route entry renders the screen only when a model exists', () => {
    expect(weekScheduleRoute(() => model).render({} as never)).not.toBeNull();
    expect(weekScheduleRoute(() => null).render({} as never)).toBeNull();
  });
});

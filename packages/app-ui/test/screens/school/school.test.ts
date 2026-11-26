// School screen (G-94): each tab renders from teaching data; text ids resolve; prerequisites are shown and
// never block; ungradable lessons and thinly sourced terms are flagged.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SCREENS } from '../../../src/shell/index.ts';
import { SchoolScreen, schoolTextIds, st, parseTab, SCHOOL_SCREEN_IDS, type SchoolData, type SchoolTab } from '../../../src/screens/school/index.ts';

const data: SchoolData = {
  map: {
    passed: 1, mastered: 0, total: 2,
    courses: [{ id: 'run', order: 4, title: 'The run game', state: 'in_progress', lessons: [
      { id: 'run.gaps_techniques', title: 'Gaps and techniques', minutes: 12, level: 'both', state: 'passed', prerequisites: [], gradable: true, flaggedTerms: [], otherLevel: false },
      { id: 'run.inside_zone', title: 'Inside zone', minutes: 12, level: 'both', state: 'not_started', prerequisites: ['run.gaps_techniques'], gradable: false, flaggedTerms: [{ id: 'term.inside-zone', status: '2 of 3' }], otherLevel: false },
    ] }],
  },
  drills: { callSpeed: [{ session: 1, median: 9.5, worst: 21 }], recognition: { byFamily: [{ key: 'cover4', n: 5, correct: 2, share: 0.4 }], mostMissed: 'cover4' }, protection: [], clock: [] },
  development: { patterns: [], offers: [{ duty: 'duty:S3.3.1', lessons: ['defense.shells'], drills: ['recognition'] }] },
  current: { bucket: 'fourth_down:short', decisionType: 'fourth_down', games: 6, decisions: 8, chosen: { punt: 6, go: 2 }, modelFavoured: { go: 8 }, costPerGame: 0.02, lesson: 'situations.fourth_down', drill: null },
};
const html = (tab: SchoolTab) => renderToStaticMarkup(createElement(SchoolScreen, { tab, data, onTab: () => {} }));

describe('school screen', () => {
  it('fills registered screens', () => {
    const ids = new Set(SCREENS.map((s) => s.id));
    for (const id of Object.values(SCHOOL_SCREEN_IDS)) expect(ids.has(id)).toBe(true);
  });
  it('lessons tab shows states, prerequisites as text, the no-pack note and flagged terms', () => {
    const h = html('lessons');
    expect(h).toContain('Builds on: run.gaps_techniques');
    expect(h).toContain(st('school.no_pack'));
    expect(h).toContain('term.inside-zone (2 of 3)');
    expect(h).toContain('1 of 2 lessons passed');
    expect(h).not.toContain('disabled');
  });
  it('drills and development tabs', () => {
    expect(html('drills')).toContain('The look that fools you most: cover4');
    const d = html('development');
    expect(d).toContain('last 6 games you made 8 fourth down decisions');
    expect(d).toContain('2.0 win-probability points');
    expect(d).toContain('duty:S3.3.1: defense.shells');
  });
  it('every text id used resolves and tabs parse', () => {
    for (const t of ['lessons', 'drills', 'development'] as const) expect(html(t)).not.toMatch(/school\.[a-z_.]+/);
    expect(schoolTextIds().length).toBeGreaterThan(20);
    expect(parseTab('nope')).toBe('lessons');
  });
});

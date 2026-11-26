// Practice planner screen (G-65): renders the grid, sidebar, limits and participation from the read model,
// flags a provisional college limit, and hides the padded budget when the rule set has none.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PracticePlanner, practicePlannerRoute, type PracticePlannerView } from '../../src/screens/practice/index.ts';

const model: PracticePlannerView = {
  practiceId: 'p1', pads: 'shells',
  periods: [
    { number: 1, minutes: 10, type: 'warmup', plain: 'Stretch', tempo: 'walk', groups: ['offense', 'defense'], leader: 'coordinator', reps: 0, load: 0, scripted: false },
    { number: 2, minutes: 15, type: 'team_scout', plain: 'Team against scout look', tempo: 'thud', groups: ['offense'], leader: 'you', reps: 18, load: 2, scripted: false },
  ],
  minutes: { planned: 25, block: 120, transitions: 0, remaining: 95 },
  expectedReps: 18,
  coverage: { zero: 3, one: 2, more: 9 },
  paddedLeft: null,
  hours: { dayLimitMinutes: 240, usedToday: 205, status: 'Verified', provisional: true },
  findings: [{ hard: false, plain: 'period 2 has no script', penalty: '', leaf: 'H3.2.1' }],
  participation: [{ personId: 'QB0', label: 'limited', reason: 'injury' }],
};

describe('practice planner screen', () => {
  const html = renderToStaticMarkup(createElement(PracticePlanner, { model }));
  it('shows every period as a keyboard-reachable row', () => {
    expect(html.match(/data-period=/g)?.length).toBe(2);
    expect(html).toContain('team scout');
    expect(html).toContain('no script');
  });
  it('shows minutes left, expected reps, coverage, hours with the provisional flag, and no padded budget', () => {
    expect(html).toContain('95 left');
    expect(html).toContain('Expected team reps: 18');
    expect(html).toContain('3 plays with no reps');
    expect(html).toContain('205 of 240 minutes');
    expect(html).toContain('provisional value');
    expect(html).not.toContain('Padded practices left');
  });
  it('shows the padded budget when there is one, and the participation labels', () => {
    const h2 = renderToStaticMarkup(createElement(PracticePlanner, { model: { ...model, paddedLeft: 4, hours: null } }));
    expect(h2).toContain('Padded practices left: 4');
    expect(h2).toContain('QB0: Limited (injury)');
  });
  it('route entry renders nothing without a model', () => {
    const r = practicePlannerRoute(() => null);
    expect(r.render({} as never)).toBeNull();
  });
});

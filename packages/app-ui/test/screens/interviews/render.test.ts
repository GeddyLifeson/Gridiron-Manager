// coach.interview and people.hiring screens, fed by the app-services interviewRoom read model.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { interviewRoom } from '@gm/app-services';
import { HIRING_SCREEN_ID, HiringScreen, INTERVIEW_SCREEN_ID, InterviewScreen, interviewRoutes, ivTextIds, type HireSource, type SitSource } from '../../../src/screens/interviews/index.ts';
import { buildRoutes } from '../../../src/routes.ts';
import { SCREENS } from '../../../src/shell/registry.ts';
import SHELL_TEXT from '../../../src/shell/text.json';

const opening = { title: 'Linebackers coach', team: 'Bayport', date: 'Mon 12 Feb', group: 'position' as const };
const slate = ['q.discipline.late'];

function sit(state: interviewRoom.SitState = interviewRoom.NEW_SIT, outcome: 'offered' | null = null) {
  const acts: interviewRoom.SitAction[] = [];
  const src: SitSource = { view: () => interviewRoom.buildSitView({ opening, panel: ['Earl Mason'], slate, grades: { teach_install: 0.8 }, state, outcome }), act: (a) => { acts.push(a); } };
  return { src, acts };
}

describe('coach.interview screen', () => {
  it('draws the panel, the no-right-answer questions and the graded work', () => {
    const html = renderToStaticMarkup(createElement(InterviewScreen, { source: sit().src }));
    expect(html).toContain('Interview: Linebackers coach, Bayport');
    expect(html).toContain('Earl Mason (leads)');
    expect(html).toContain('There is no right answer here');
    expect(html).toContain('graded on whether you get it right');
    expect(html).toContain('data-question="q.discipline.late"');
    expect(html).toContain('Graded: excellent');
    expect(html).toContain('data-tool="film.grades"');
    expect(html).toMatch(/<button type="button" disabled="">Finish the interview/);
    expect(html).not.toMatch(/craft|\d\.\d/);
  });
  it('locks once he has an outcome', () => {
    const html = renderToStaticMarkup(createElement(InterviewScreen, { source: sit({ answers: { 'q.discipline.late': null }, submitted: true }, 'offered').src }));
    expect(html).toContain('They offered you the job.');
    expect(html).not.toContain('Finish the interview');
    expect(html).toContain('You declined to answer.');
  });
});

describe('people.hiring screen', () => {
  const cands: interviewRoom.CandidateInput[] = [{ personId: 7, name: 'Dale Kirk', record: '6 seasons', referrals: [{ name: 'Earl Mason', regard: -0.4, tieToYou: 30 }], answers: { 'q.discipline.late': 'fine' }, grades: { teach_install: 0.2, grade_snaps: 0.6 } }];
  const q = interviewRoom.buildHireView({ opening, slate, candidates: cands, state: interviewRoom.NEW_HIRE, delegateTo: 'Ray Ortiz', answer: null });
  const src: HireSource = { view: () => q, act: () => {} };
  it('shows record, referee words, answers with his own marks, graded work and offer buttons', () => {
    const html = renderToStaticMarkup(createElement(HiringScreen, { source: src }));
    expect(html).toContain('Earl Mason: warns you off him (someone you know)');
    expect(html).toContain('No right answers. Mark each one');
    expect(html).toContain('With me');
    expect(html).toContain('Graded: poor');
    expect(html).toContain('Offer him the job');
    expect(html).toContain('Leave this search to Ray Ortiz');
    expect(html).not.toMatch(/fit|craft|regard/i);
  });
  it('read-only shows no buttons', () => {
    const html = renderToStaticMarkup(createElement(HiringScreen, { source: src, readOnly: true }));
    expect(html).not.toContain('<button');
  });
});

describe('routes and registry', () => {
  it('both screens are registry rows with help text and are bound by the route table', () => {
    for (const id of [INTERVIEW_SCREEN_ID, HIRING_SCREEN_ID]) {
      expect(SCREENS.some((s) => s.id === id)).toBe(true);
      expect((SHELL_TEXT as { strings: Record<string, string> }).strings[`help.screen.${id}`]).toBeTruthy();
    }
    expect(Object.keys(interviewRoutes({ sit: sit().src }))).toEqual([INTERVIEW_SCREEN_ID]);
    const t = buildRoutes({ interviews: { sit: sit().src, hire: { view: () => null, act: () => {} } } } as Parameters<typeof buildRoutes>[0]);
    expect(t[INTERVIEW_SCREEN_ID]).toBeDefined();
    expect(t[HIRING_SCREEN_ID]).toBeDefined();
    for (const tool of Object.values(interviewRoom.TASK_TOOL)) expect(SCREENS.some((s) => s.id === tool && !s.route.includes(':'))).toBe(true);
    expect(ivTextIds().length).toBeGreaterThan(10);
  });
});

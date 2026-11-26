// G-62 screens render inside the shell for their registry ids, keyboard-reachable controls are real buttons,
// and every text id the screens use exists (O6.6.1).
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Shell, SCREENS, resolve, type ScreenProps } from '../../../src/shell/index.ts';
import { gameFrameRoutes, missingText, type GameFrameSource, type PregameView } from '../../../src/screens/game-frame/index.ts';

const pre: PregameView = {
  minutesToKickoff: 95, budgetLeft: 88, kickoffDelayMin: 0, nextDeadline: 90, tossOptionLost: [],
  tasks: [
    { id: 'inactives', deadline: 90, costMin: 2, owner: 'user', state: 'open', locked: false, actionable: true },
    { id: 'captains', deadline: 90, costMin: 1, owner: 'dc', state: 'open', locked: false, actionable: true },
    { id: 'talk', deadline: 20, costMin: 3, owner: 'user', state: 'open', locked: false, actionable: false },
  ],
};
const source: GameFrameSource = {
  pregame: () => pre,
  halftime: () => ({ workingMin: 7, staffMin: 3, playerMin: 4, staffLeft: 2, playerLeft: 4, attending: 'defense', items: [{ kind: 'send_back', unit: 'offense', detail: null }], uptake: [{ adjustmentId: 'a', playerId: 'DB1', word: 'shaky' }] }),
  postgame: () => ({ gameId: 'g1', handshake: { own: 'normal', other: 'cold', mediaNotice: true }, talk: { tone: 'level', points: [], fit: 'good' }, gameBalls: [{ receiver: 'OL3', reason: 'pancakes' }], injuries: [{ playerId: 'RB1', bodyPart: 'ankle', firstRead: 'day_to_day', inProtocol: false, finishedGame: true }], media: { held: false, questions: 0, answers: [] }, dayAfter: 'off', officeReplies: [{ playId: 'q3-12', reply: 'incorrect' }] }),
  send: () => {},
};
// The shell shows game-hub screens only in game-day mode, which opens on the console; the route entries are
// rendered directly with the props the shell passes.
const html = (path: string, s: GameFrameSource = source, readOnly = false) => {
  const location = resolve(path, SCREENS)!;
  const screen = SCREENS.find((x) => x.id === location.screenId)!;
  const props: ScreenProps = { screen, location, readOnly, navigate: () => {}, setView: () => {} };
  return renderToStaticMarkup(createElement('div', null, gameFrameRoutes(s)[screen.id]!.render(props)));
};

describe('game-frame screens', () => {
  it('pregame: countdown, budget, tasks in order, buttons only where a task can be done', () => {
    const out = html('/game/pregame');
    for (const s of ['95 minutes to kickoff', '88 minutes of your attention left', 'Inactive list', 'Game captains', 'Pregame talk', 'T-90', 'Advance to next deadline']) expect(out).toContain(s);
    expect(out.match(/>Do it<\/button>/g)?.length).toBe(2);
  });
  it('halftime: budgets, the side the user sits with, and the uptake words', () => {
    const out = html('/game/halftime');
    for (const s of ['7 working minutes', 'Staff phase: 2 of 3 minutes left', 'You are with the defense staff', 'DB1: shaky']) expect(out).toContain(s);
  });
  it('postgame: handshake notice, fit line, balls, injuries, skipped media alert, day after, office replies', () => {
    const out = html('/game/postgame');
    for (const s of ['Media noticed it.', 'The room took it well.', 'OL3: pancakes', 'RB1, ankle: day to day', 'media policy violation', 'players off', 'call was incorrect']) expect(out).toContain(s);
  });
  it('read-only seat: no action buttons', () => {
    expect(html('/game/pregame', source, true)).not.toContain('<button');
  });
  it('the shell takes the route entries for the three registry ids', () => {
    const routes = gameFrameRoutes(source);
    expect(Object.keys(routes).sort()).toEqual(['game.halftime', 'game.postgame', 'game.pregame']);
    for (const id of Object.keys(routes)) expect(SCREENS.some((x) => x.id === id)).toBe(true);
    expect(renderToStaticMarkup(createElement(Shell, { initialPath: '/game/pregame', routes }))).toContain('data-screen="game.pregame"');
  });
  it('no game: each screen says so', () => {
    const none: GameFrameSource = { pregame: () => null, halftime: () => null, postgame: () => null, send: () => {} };
    for (const p of ['/game/pregame', '/game/halftime', '/game/postgame']) expect(html(p, none)).toContain('No game today');
  });
  it('every text id used in the screen source exists', () => {
    const src = readFileSync(join(import.meta.dirname, '../../../src/screens/game-frame/GameFrame.tsx'), 'utf8');
    const ids = [...src.matchAll(/gt\('([a-z][\w.]*)'/g)].map((m) => m[1]!);
    expect(missingText(ids)).toEqual([]);
    const dynamic = ['conditions', 'workouts', 'inactives', 'emergency_qb', 'radio', 'captains', 'depth_card', 'kicking_lines', 'opponent_watch', 'decision_book', 'instructions', 'crew_alert', 'challenge_designee', 'sheet_edits', 'talk', 'toss'].map((t) => `gf.task.${t}`);
    expect(missingText([...dynamic, 'gf.state.open', 'gf.state.done', 'gf.state.delegated', 'gf.state.missed', 'gf.word.solid', 'gf.word.risky', 'gf.word.not_told', 'gf.day.normal', 'gf.day.short', 'gf.reply.correct', 'gf.reply.no_comment', 'gf.post.fit.neutral', 'gf.post.fit.poor', 'gf.unit.offense', 'gf.unit.special'])).toEqual([]);
  });
});

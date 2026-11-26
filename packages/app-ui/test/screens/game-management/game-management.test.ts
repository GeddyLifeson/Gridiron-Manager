// Game management panel (G-61): the bar, controls, clock strip, booth line and tabs draw the read model;
// keys follow the live map (remapped keys work and show); guarded keys need a hold (O2.5.3); the route
// fills the console screen inside the shell.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell, SCREENS, DEFAULT_KEYMAP, applyOverrides } from '../../../src/shell/index.ts';
import {
  GameManagementPanel, gameManagementRoute, gt, gmTextIds, mmss, parseTab, PROMPT_BINDINGS, panelContexts, keyFor, intentFor, release,
  GAME_MANAGEMENT_SCREEN_ID, CHANNELS, type GameManagementData, type GameManagementView, type GmTab,
} from '../../../src/screens/game-management/index.ts';

const view: GameManagementView = {
  gameId: 'g1', seat: 'head_coach',
  bar: {
    id: 'd4', kind: 'fourth_down', mode: 'decide',
    options: [
      { id: 'go', labelId: 'x.go', key: '1', result: null, guarded: true },
      { id: 'field_goal', labelId: 'x.fg', key: '2', result: null, guarded: false },
      { id: 'punt', labelId: 'x.punt', key: '3', result: null, guarded: false },
    ],
    secondsLeft: 27.4, onExpiry: { optionId: 'punt', by: 'default' },
    chart: { option: 'go', coachsCall: true, mark: 'thin' },
    advisor: { optionId: 'go', marginWp: 0.021, breakEven: 0.48, estimate: 0.58, close: false }, advisorDueInS: null,
    fgRangeYardsToGoal: 38, noticeOnly: false, queued: 0, holdS: 0.4,
  },
  timeout: { enabled: true, reasonKey: null, count: 2, guarded: false },
  challenge: { enabled: false, reasonKey: 'replay.refused.booth_only', count: 2, guarded: true, aspects: [], windowS: null, byTimeout: false },
  clock: { clockTenths: 1000, playClockTenths: 274, status: 'stopped', startsOn: 'snap', timeoutsOwn: 2, timeoutsOpp: 1, panel: { leader: 'opp', kneels: 3, burnS: 120, trailingTimeouts: 2, burnAgainstTimeoutsS: 44, kneelEndsGame: false } },
  sideline: {
    channel: 'offense',
    line: { id: 'm1', channel: 'offense', kind: 'note', speakerRole: 'OC booth', speakerName: 'A. Booth', text: 'Cover 3 buzz, they rotated late to the field', ageInPlays: 1, read: false, clipped: 'Cover 3 buzz, they rotated late to the field' },
    list: [{ id: 'm1', channel: 'offense', kind: 'note', speakerRole: 'OC booth', speakerName: 'A. Booth', text: 'Cover 3 buzz, they rotated late to the field', ageInPlays: 1, read: false }],
    headlines: [{ channel: 'defense', count: 2 }],
    infoDelayS: 4,
  },
  injuries: [{ playerId: 101, name: 'P. One', position: 'RG', bodyPart: 'ankle', word: 'questionable', revised: true, replacedBy: 'P. Two' }],
};
const data: GameManagementData = { teamId: 3, live: true, view };
const bindings = [...DEFAULT_KEYMAP.bindings, ...PROMPT_BINDINGS];
const ctx = panelContexts(view, 'console.offense');
const keyOf = (a: string) => keyFor(a, ctx, bindings);
const esc = (s: string) => s.replace(/'/g, '&#x27;');
const html = (tab: GmTab = 'messages', d: GameManagementData = data) => renderToStaticMarkup(createElement(GameManagementPanel, { data: d, tab, onTab: () => {}, keyOf }));

describe('panel rendering', () => {
  it('waits when no game is live', () => {
    expect(html('messages', { teamId: 3, live: false })).toContain(gt('gm.waiting'));
  });

  it('decision bar: options with keys, timer, the user’s chart, kick range, the analyst line and what happens at zero', () => {
    const out = html();
    expect(out).toContain('data-kind="fourth_down"');
    expect(out).toContain('data-seconds="27.4"');
    expect(out).toContain(esc(gt('gm.bar.chart', { option: 'Go for it', call: gt('gm.bar.chart.call'), mark: gt('gm.bar.chart.mark', { mark: 'thin' }) })));
    expect(out).toContain('Staff kick range today: from the their 38 in.');
    expect(out).toContain('Analyst: Go for it. +2.1 win probability. Need 48% to break even, we estimate 58%.');
    expect(out).toContain('At zero: Punt.');
    expect(out).toContain('<kbd>1</kbd> Go for it');
    expect(out).toContain('data-guarded="true"');
  });

  it('controls show counts and are dimmed with the engine’s reason', () => {
    const out = html();
    expect(out).toMatch(/data-control="timeout"[^>]*>/);
    expect(out).toContain('<kbd>T</kbd> Timeout · 2 left');
    expect(out).toMatch(/data-control="challenge" disabled=""/);
    expect(out).toContain('replay.refused.booth_only');
  });

  it('clock strip and the arithmetic panel', () => {
    const out = html();
    expect(out).toContain('Game clock 1:40');
    expect(out).toContain('Stopped, starts on the snap');
    expect(out).toContain('They can burn 2:00 with 3 kneel-downs. We have 2 timeouts: they can burn 0:44.');
    expect(mmss(59.1)).toBe('1:00');
  });

  it('booth line, other channels as headlines, the tiredness cost, and the tabs', () => {
    const out = html();
    expect(out).toContain('OC booth: Cover 3 buzz, they rotated late to the field · last play');
    expect(out).toContain('defense: 2 notes');
    expect(out).toContain(esc(gt('gm.booth.delay', { s: 4 })));
    const inj = html('injuries');
    expect(inj).toContain('questionable to return (revised)');
    expect(inj).toContain('P. Two');
  });

  it('every text id the panel uses exists', () => {
    const ids = new Set(gmTextIds());
    for (const k of ['penalty', 'runoff', 'challenge', 'fourth_down', 'try', 'kickoff', 'coin_toss', 'overtime_toss', 'kneel']) expect(ids.has(`gm.bar.title.${k}`)).toBe(true);
    for (const c of CHANNELS) expect(ids.has(`gm.channel.${c}`)).toBe(true);
    for (const w of ['being_evaluated', 'questionable', 'doubtful', 'out', 'concussion_protocol', 'cleared']) expect(ids.has(`gm.injury.${w}`)).toBe(true);
    expect(parseTab('x')).toBe('messages');
    expect(parseTab('injuries')).toBe('injuries');
  });
});

describe('keys and guards (O2.4.1, O2.5.2, O2.5.3)', () => {
  it('digit keys pick bar options; T calls a timeout; B opens the list', () => {
    const go = intentFor('Digit1', view, ctx, bindings)!;
    expect(go).toMatchObject({ kind: 'command', guarded: true, command: { type: 'gm.decide', optionId: 'go', decidedBy: 'user', shown: { chartOption: 'go', advisorOption: 'go' } } });
    expect(intentFor('KeyT', view, ctx, bindings)).toMatchObject({ kind: 'command', command: { type: 'gm.timeout' } });
    expect(intentFor('KeyC', view, ctx, bindings)).toBeNull(); // challenge not legal now
    expect(intentFor('KeyB', view, ctx, bindings)).toEqual({ kind: 'tab', tab: 'messages' });
  });

  it('a single tap of a guarded key sends nothing; a held key does; unguarded keys go at once', () => {
    const go = intentFor('Digit1', view, ctx, bindings)!;
    expect(release({ intent: go, downAtMs: 0 }, 100, 0.4)).toBeNull();
    expect(release({ intent: go, downAtMs: 0 }, 400, 0.4)).toMatchObject({ optionId: 'go' });
    const punt = intentFor('Digit3', view, ctx, bindings)!;
    expect(release({ intent: punt, downAtMs: 0 }, 1, 0.4)).toMatchObject({ optionId: 'punt' });
  });

  it('after remapping, the new key works and is the one shown', () => {
    const { bindings: remapped, problems } = applyOverrides({ 'console.offense|call.timeout': ['KeyQ'] }, bindings);
    expect(problems).toEqual([]);
    expect(keyFor('call.timeout', ctx, remapped)).toBe('Q');
    expect(intentFor('KeyQ', view, ctx, remapped)).toMatchObject({ command: { type: 'gm.timeout' } });
    expect(intentFor('KeyT', view, ctx, remapped)).toBeNull();
  });

  it('a recommending advisor sends recommendations; a coordinator asks for timeouts', () => {
    const adv: GameManagementView = { ...view, seat: 'advisor', bar: { ...view.bar!, mode: 'recommend' }, timeout: null, challenge: null };
    expect(intentFor('Digit2', adv, panelContexts(adv, 'console.offense'), bindings)).toMatchObject({ command: { type: 'gm.recommend', optionId: 'field_goal' } });
    const oc: GameManagementView = { ...view, seat: 'coordinator', bar: null, timeout: null, challenge: null };
    expect(intentFor('KeyT', oc, panelContexts(oc, 'console.offense'), bindings)).toMatchObject({ command: { type: 'gm.timeout_request' } });
  });
});

describe('route entry', () => {
  it('fills the registered console screen in the shell, with the tab from the view options', () => {
    const screen = SCREENS.find((s) => s.id === GAME_MANAGEMENT_SCREEN_ID)!;
    expect(screen.bible).toContain('O2.4.1');
    const routes = { [GAME_MANAGEMENT_SCREEN_ID]: gameManagementRoute(() => data, keyOf) };
    const out = renderToStaticMarkup(createElement(Shell, { initialPath: `${screen.route}?tab=injuries`, routes }));
    expect(out).toContain('questionable to return');
  });
});

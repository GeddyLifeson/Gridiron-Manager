// Game management read model and commands (G-61). Every I5 decision kind prompts with its real-time limit
// and its expiry rule; legality and options are the engine's; sideline information reaches the coach only
// after the speaker's latency plus his own tiredness delay, and only from the channel he is on.
import { describe, it, expect } from 'vitest';
import { ReadModelRegistry, buildReadModel, crawlReadModels, crawlPassed, observerFor, PUBLIC_OBSERVER, tablesOf } from '../../../src/observer/index.ts';
import {
  buildGameManagementView, buildDecisionBar, buildClock, buildSideline, buildInjuries, kneelBurn, gameManagementReadModels, GAME_MANAGEMENT_MODEL,
  RULE_ORDER, PARAMS, type GameManagementInputs, type LiveGameInput, type PendingDecision, type SidelineMessage, type DecisionKind,
} from '../../../src/read-models/game-management/index.ts';
import { refusal, expiryCommand, isGameManagementCommand, type GameManagementCommand } from '../../../src/commands/game-management/index.ts';
import { fixtureTables, HOME, AWAY, USER, AWAY_COACH } from '../../observer/fixture-world.ts';
import { GameManagementData } from '@gm/schema';

const live = (o: Partial<LiveGameInput> = {}): LiveGameInput => ({
  gameId: 'g1', ownSide: 0, period: 2, overtime: false, halfEndPeriods: [2, 4], clockTenths: 6000, playClockTenths: 300, playClockFullS: 40,
  clockRunning: false, nextStart: 'snap', twoMinuteWarningAhead: false, twoMinuteWarningS: 120, downsPerSeries: 4, timeoutsLeft: [3, 3],
  score: [10, 7], possession: 0, down: 4, distanceYd: 2, yardsToGoalYd: 35, fieldLengthYd: 100, gameSecondsLeft: 2400, realTimeS: 1000, playIndex: 40, ...o,
});

const opt = (id: string, extra: Record<string, unknown> = {}) => ({ id, labelId: `game_management.option.${id}`, ...extra });
const fourth: PendingDecision = { id: 'd4', kind: 'fourth_down', options: [opt('go'), opt('field_goal'), opt('punt')], openedAtS: 995 };

const inputs = (o: Partial<GameManagementInputs> = {}): GameManagementInputs => ({
  live: live(),
  controls: {
    timeout: { allowed: true, refusedKey: null, pending: false },
    challenge: { allowed: true, refusedKey: null, left: 2, aspects: ['spot', 'catch'], windowS: 12, byTimeout: false },
  },
  pending: [fourth],
  standing: {},
  chart: {
    cells: [
      { yardsToGoalYd: 35, distanceYd: 2, approved: 'go', coachsCall: false, mark: 'fair' },
      { yardsToGoalYd: 35, distanceYd: 5, approved: 'field_goal', coachsCall: true, mark: 'thin' },
      { yardsToGoalYd: 70, distanceYd: 2, approved: 'punt', coachsCall: false, mark: 'solid' },
    ],
    twoPoint: [{ scoreDiffBeforeTry: 3, gameSecondsLeft: 2400, choice: 'kick', coachsCall: false }, { scoreDiffBeforeTry: -2, gameSecondsLeft: 300, choice: 'two', coachsCall: false }],
  },
  staff: { fgRangeYardsToGoal: 38, advisor: null },
  messages: [],
  injuries: [],
  coach: { seat: 'head_coach', channel: 'offense', infoDelayS: 0, guards: 'on', certified: false, read: [] },
  ...o,
});

describe('decision bar (I5.1.1, O2.4.2 to O2.4.4)', () => {
  it('every decision kind prompts, with the engine options in key order', () => {
    for (const kind of RULE_ORDER) {
      const bar = buildDecisionBar(inputs({ pending: [{ id: `x-${kind}`, kind, options: [opt('a'), opt('b')], openedAtS: 1000 }] }))!;
      expect(bar.kind).toBe(kind);
      expect(bar.options.map((o) => [o.id, o.key])).toEqual([['a', '1'], ['b', '2']]);
    }
  });

  it('two at once: the penalty choice comes first, the fourth down waits (I5.1.1 edge case)', () => {
    const pen: PendingDecision = { id: 'p', kind: 'penalty', options: [opt('accept', { conservative: true }), opt('decline', { declines: true })], openedAtS: 998 };
    const bar = buildDecisionBar(inputs({ pending: [fourth, pen] }))!;
    expect(bar.kind).toBe('penalty');
    expect(bar.queued).toBe(1);
  });

  it('time limits are real time: play clock for fourth down and tries, 10 s for penalties, the window for a challenge', () => {
    expect(buildDecisionBar(inputs())!.secondsLeft).toBe(30);
    const pen: PendingDecision = { id: 'p', kind: 'penalty', options: [opt('accept')], openedAtS: 996 };
    expect(buildDecisionBar(inputs({ pending: [pen] }))!.secondsLeft).toBe(6);
    expect(buildDecisionBar(inputs({ pending: [{ ...pen, openedAtS: 900 }] }))!.secondsLeft).toBe(0);
    const ch: PendingDecision = { id: 'c', kind: 'challenge', options: [opt('challenge:spot'), opt('let_go')], openedAtS: 999 };
    expect(buildDecisionBar(inputs({ pending: [ch] }))!.secondsLeft).toBe(12);
  });

  it('expiry: the standing instruction, else the conservative default (punt or kick, kick the try, accept, no challenge)', () => {
    expect(buildDecisionBar(inputs())!.onExpiry).toEqual({ optionId: 'field_goal', by: 'default' });
    expect(buildDecisionBar(inputs({ live: live({ yardsToGoalYd: 60 }) }))!.onExpiry).toEqual({ optionId: 'punt', by: 'default' });
    expect(buildDecisionBar(inputs({ standing: { fourth_down: 'go' } }))!.onExpiry).toEqual({ optionId: 'go', by: 'standing_rule' });
    expect(buildDecisionBar(inputs({ standing: { fourth_down: 'fake' } }))!.onExpiry.by).toBe('default');
    const tr: PendingDecision = { id: 't', kind: 'try', options: [opt('two'), opt('kick')], openedAtS: 1000 };
    expect(buildDecisionBar(inputs({ pending: [tr] }))!.onExpiry.optionId).toBe('kick');
    const pen: PendingDecision = { id: 'p', kind: 'penalty', options: [opt('decline'), opt('accept', { conservative: true })], openedAtS: 1000 };
    expect(buildDecisionBar(inputs({ pending: [pen] }))!.onExpiry.optionId).toBe('accept');
    const ch: PendingDecision = { id: 'c', kind: 'challenge', options: [opt('challenge:spot'), opt('let_go')], openedAtS: 1000 };
    expect(buildDecisionBar(inputs({ pending: [ch] }))!.onExpiry.optionId).toBe('let_go');
    const kn: PendingDecision = { id: 'k', kind: 'kneel', options: [opt('kneel'), opt('decline')], openedAtS: 1000 };
    expect(buildDecisionBar(inputs({ pending: [kn] }))!.onExpiry.optionId).toBe('decline'); // never automatic (O2.4.4)
  });

  it('shows the user’s own chart cell and the staff kick range, never a model value without an analyst', () => {
    const bar = buildDecisionBar(inputs())!;
    expect(bar.chart).toEqual({ option: 'go', coachsCall: false, mark: 'fair' });
    expect(bar.fgRangeYardsToGoal).toBe(38);
    expect(bar.advisor).toBeNull();
    expect(bar.advisorDueInS).toBeNull();
    expect(buildDecisionBar(inputs({ live: live({ distanceYd: 6 }) }))!.chart!.option).toBe('field_goal');
    expect(buildDecisionBar(inputs({ chart: null }))!.chart).toBeNull();
    const tr: PendingDecision = { id: 't', kind: 'try', options: [opt('kick'), opt('two')], openedAtS: 1000 };
    expect(buildDecisionBar(inputs({ pending: [tr] }))!.chart).toEqual({ option: 'kick', coachsCall: false, mark: null });
  });

  it('the analyst line arrives after his delay, and later still for a tired coach (I5.1.2, E7.4.2)', () => {
    const advisor = { decisionId: 'd4', optionId: 'go', marginWp: 0.021, breakEven: 0.48, estimate: 0.58, close: false, delayS: 3 };
    const rested = buildDecisionBar(inputs({ staff: { fgRangeYardsToGoal: 38, advisor } }))!; // opened 995, now 1000
    expect(rested.advisor!.optionId).toBe('go');
    const tired = buildDecisionBar(inputs({ staff: { fgRangeYardsToGoal: 38, advisor }, coach: { ...inputs().coach, infoDelayS: 4 } }))!;
    expect(tired.advisor).toBeNull();
    expect(tired.advisorDueInS).toBe(2);
  });

  it('guards: rare irreversible keys hold to confirm; none under 3 s of play clock; certified uses the full list (O2.5.3)', () => {
    const own = buildDecisionBar(inputs({ live: live({ yardsToGoalYd: 70 }) }))!;
    expect(own.options.find((o) => o.id === 'go')!.guarded).toBe(true);
    expect(own.options.find((o) => o.id === 'punt')!.guarded).toBe(false);
    expect(buildDecisionBar(inputs())!.options.find((o) => o.id === 'go')!.guarded).toBe(false); // opponent territory
    expect(buildDecisionBar(inputs({ live: live({ yardsToGoalYd: 70, playClockTenths: 25 }) }))!.options.every((o) => !o.guarded)).toBe(true);
    const pen: PendingDecision = { id: 'p', kind: 'penalty', options: [opt('accept'), opt('decline', { declines: true })], openedAtS: 1000 };
    expect(buildDecisionBar(inputs({ pending: [pen] }))!.options.map((o) => o.guarded)).toEqual([false, true]);
    const offCoach = { ...inputs().coach, guards: 'off' as const };
    expect(buildDecisionBar(inputs({ pending: [pen], coach: offCoach }))!.options.some((o) => o.guarded)).toBe(false);
    expect(buildDecisionBar(inputs({ pending: [pen], coach: { ...offCoach, certified: true } }))!.options[1]!.guarded).toBe(true);
    expect(buildDecisionBar(inputs())!.holdS).toBe(0.4);
  });

  it('by rung: the advisor recommends on the same clock, a coordinator gets no bar (I5.1.1)', () => {
    expect(buildDecisionBar(inputs({ coach: { ...inputs().coach, seat: 'advisor' } }))!.mode).toBe('recommend');
    expect(buildDecisionBar(inputs({ coach: { ...inputs().coach, seat: 'coordinator' } }))).toBeNull();
    const v = buildGameManagementView(inputs({ coach: { ...inputs().coach, seat: 'coordinator' } }));
    expect(v.timeout).toBeNull();
    expect(v.challenge).toBeNull();
  });
});

describe('timeout and challenge controls (O2.4.1)', () => {
  it('40 game states: each control is enabled exactly when the engine says the action is legal', () => {
    let n = 0;
    for (const tAllowed of [true, false]) for (const pending of [true, false]) for (const cAllowed of [true, false]) for (const aspects of [[], ['spot']]) for (const clockTenths of [6000, 900, 300]) {
      if (n >= 40) break;
      n++;
      const v = buildGameManagementView(inputs({
        live: live({ clockTenths }),
        controls: {
          timeout: { allowed: tAllowed, refusedKey: tAllowed ? null : 'clock.refused.no_timeouts', pending },
          challenge: { allowed: cAllowed, refusedKey: cAllowed ? null : 'replay.refused.booth_only', left: 1, aspects, windowS: null, byTimeout: false },
        },
      }));
      expect(v.timeout!.enabled).toBe(tAllowed && !pending);
      expect(v.challenge!.enabled).toBe(cAllowed && aspects.length > 0);
      if (!tAllowed && !pending) expect(v.timeout!.reasonKey).toBe('clock.refused.no_timeouts');
      if (!cAllowed) expect(v.challenge!.reasonKey).toBe('replay.refused.booth_only');
      expect(v.timeout!.guarded).toBe(clockTenths <= 1200);
    }
    expect(n).toBe(40);
  });
});

describe('clock state and arithmetic panel (I5.4.1)', () => {
  it('status and next start come from the engine', () => {
    expect(buildClock(live()).startsOn).toBe('snap');
    expect(buildClock(live({ nextStart: 'ready' })).startsOn).toBe('ready');
    expect(buildClock(live({ clockRunning: true, nextStart: null })).status).toBe('running');
    expect(buildClock(live()).panel).toBeNull(); // 10:00 left: outside the last five minutes
  });

  it('burn: kneels use the play clock less the snap delay plus the kneel; each stop removes the longest gap', () => {
    const l = live({ clockRunning: true, nextStart: null, playClockTenths: 400 });
    expect(kneelBurn(l, 3, 0)).toEqual({ burnS: 3 * 2 + 3 * 38, burnAgainstS: 3 * 2 + 3 * 38 });
    expect(kneelBurn(l, 3, 2).burnAgainstS).toBe(6 + 38);
    expect(kneelBurn(live({ playClockTenths: 250 }), 3, 0).burnS).toBe(6 + 0 + 2 * 38); // stopped, starts on the snap
    expect(kneelBurn(l, 3, 9).burnAgainstS).toBe(6);
  });

  it('panel in the last five minutes for the leader with the ball; kneel ends the game only when the arithmetic says so', () => {
    const late = live({ period: 4, clockTenths: 1000, clockRunning: true, nextStart: null, playClockTenths: 400, down: 1, timeoutsLeft: [3, 0] });
    const p = buildClock(late).panel!;
    expect(p.leader).toBe('own');
    expect(p.kneels).toBe(4);
    expect(p.burnAgainstTimeoutsS).toBe(8 + 4 * 38);
    expect(p.kneelEndsGame).toBe(true);
    expect(buildClock({ ...late, timeoutsLeft: [3, 3] }).panel!.kneelEndsGame).toBe(false);
    expect(buildClock({ ...late, period: 2 }).panel!.kneelEndsGame).toBe(false); // end of half, not of game
    expect(buildClock({ ...late, possession: 1 }).panel).toBeNull();
    expect(buildClock({ ...late, score: [7, 7] }).panel).toBeNull();
    const warn = buildClock({ ...late, clockTenths: 2400, twoMinuteWarningAhead: true, timeoutsLeft: [3, 1] }).panel!;
    expect(warn.burnAgainstTimeoutsS).toBe(8 + 2 * 38); // one timeout plus the warning
  });
});

const msg = (id: string, o: Partial<SidelineMessage> = {}): SidelineMessage => ({
  id, channel: 'offense', kind: 'note', speakerRole: 'OC booth', speakerName: 'A. Booth', priority: 1, text: `note ${id}`, aboutPlay: 38, producedAtS: 990, latencyS: 5, ...o,
});

describe('sideline information flow (I7.2.1, I7.5.1, O2.1.3)', () => {
  const coach = inputs().coach;

  it('a note arrives after the speaker’s latency; a tired coach gets it later', () => {
    const m = [msg('a', { producedAtS: 992, latencyS: 5 })];
    expect(buildSideline(live(), m, coach).line!.id).toBe('a');
    expect(buildSideline(live(), m, { ...coach, infoDelayS: 4 }).line).toBeNull();
    expect(buildSideline(live({ realTimeS: 1001 }), m, { ...coach, infoDelayS: 4 }).line!.id).toBe('a');
    expect(buildSideline(live(), m, { ...coach, infoDelayS: 4 }).infoDelayS).toBe(4);
  });

  it('full text only from his channel and the bench; other channels are headline counts', () => {
    const m = [msg('o'), msg('d1', { channel: 'defense' }), msg('d2', { channel: 'defense' }), msg('t', { channel: 'sideline', kind: 'medical' }), msg('s', { channel: 'special_teams' })];
    const v = buildSideline(live(), m, coach);
    expect(v.list.map((x) => x.id).sort()).toEqual(['o', 't']);
    expect(v.headlines).toEqual([{ channel: 'defense', count: 2 }, { channel: 'special_teams', count: 1 }]);
    const def = buildSideline(live(), m, { ...coach, channel: 'defense' });
    expect(def.list.map((x) => x.id).sort()).toEqual(['d1', 'd2', 't']);
  });

  it('one line: higher priority replaces lower, read messages leave the line, ages count plays', () => {
    const m = [msg('low', { priority: 1, producedAtS: 994 }), msg('high', { priority: 5, producedAtS: 980, aboutPlay: 37 })];
    const v = buildSideline(live(), m, coach);
    expect(v.line!.id).toBe('high');
    expect(v.line!.ageInPlays).toBe(3);
    expect(v.list.find((x) => x.id === 'low')!.read).toBe(false);
    expect(buildSideline(live(), m, { ...coach, read: ['high'] }).line!.id).toBe('low');
  });

  it('the line is one line of at most 60 characters; the list keeps the full text and the last ten', () => {
    const long = 'x'.repeat(90);
    const v = buildSideline(live(), [msg('l', { text: long })], coach);
    expect(v.line!.clipped.length).toBe(60);
    expect(v.list[0]!.text).toBe(long);
    const many = Array.from({ length: 15 }, (_, i) => msg(`m${i}`, { producedAtS: 900 + i }));
    const l = buildSideline(live(), many, coach).list;
    expect(l.length).toBe(10);
    expect(l[0]!.id).toBe('m14');
  });

  it('injury list: the trainer’s latest word that has reached the coach; a revision replaces the first read (I7.2.3)', () => {
    const r = { playerId: 101, name: 'P. One', position: 'RG', bodyPart: 'ankle', word: 'being_evaluated' as const, revision: 0, producedAtS: 900, latencyS: 10, replacedBy: 'P. Two' };
    const rows = buildInjuries(live(), [r, { ...r, word: 'out', revision: 1, producedAtS: 990, latencyS: 20 }], coach);
    expect(rows).toEqual([{ playerId: 101, name: 'P. One', position: 'RG', bodyPart: 'ankle', word: 'being_evaluated', revised: false, replacedBy: 'P. Two' }]);
    const later = buildInjuries(live({ realTimeS: 1100 }), [r, { ...r, word: 'out', revision: 1, producedAtS: 990, latencyS: 20 }], coach);
    expect(later[0]!.word).toBe('out');
    expect(later[0]!.revised).toBe(true);
  });
});

describe('commands', () => {
  const view = buildGameManagementView(inputs());

  it('refusals mirror the view; T twice does not call two timeouts', () => {
    const t: GameManagementCommand = { type: 'gm.timeout', gameId: 'g1' };
    expect(isGameManagementCommand(t)).toBe(true);
    expect(refusal(t, view)).toBeNull();
    const pendingView = buildGameManagementView(inputs({ controls: { ...inputs().controls, timeout: { allowed: true, refusedKey: null, pending: true } } }));
    expect(refusal(t, pendingView)).toBe('game_management.timeout.pending');
    expect(refusal({ ...t, gameId: 'g2' }, view)).toBe('game_management.refused.other_game');
    expect(refusal({ type: 'gm.challenge', gameId: 'g1', aspect: 'spot' }, view)).toBeNull();
    expect(refusal({ type: 'gm.challenge', gameId: 'g1', aspect: 'forward_progress' }, view)).toBe('game_management.refused.not_reviewable');
    const decide: GameManagementCommand = { type: 'gm.decide', gameId: 'g1', decisionId: 'd4', kind: 'fourth_down', optionId: 'go', decidedBy: 'user', shown: { chartOption: 'go', advisorOption: null } };
    expect(refusal(decide, view)).toBeNull();
    expect(refusal({ ...decide, optionId: 'fake' }, view)).toBe('game_management.refused.not_an_option');
    expect(refusal({ type: 'gm.recommend', gameId: 'g1', decisionId: 'd4', optionId: 'go' }, view)).toBe('game_management.refused.not_your_seat');
    expect(refusal({ type: 'gm.timeout_request', gameId: 'g1' }, view)).toBe('game_management.refused.not_your_seat');
  });

  it('the timer at zero sends the expiry decision and logs who decided (I5.1.1, O2.4.2)', () => {
    expect(expiryCommand(view)).toBeNull();
    const zero = buildGameManagementView(inputs({ live: live({ playClockTenths: 0 }), standing: { fourth_down: 'punt' } }));
    expect(expiryCommand(zero)).toMatchObject({ type: 'gm.decide', optionId: 'punt', decidedBy: 'standing_rule', shown: { chartOption: 'go' } });
  });
});

describe('read model registration', () => {
  const world = tablesOf(fixtureTables());
  const sources = { inputs: (_w: unknown, teamId: number) => (teamId === HOME ? inputs() : null) };
  const registry = () => {
    const r = new ReadModelRegistry();
    for (const s of gameManagementReadModels(GameManagementData, sources)) r.register(s);
    return r;
  };

  it('builds for the observer’s own team only', () => {
    const me = observerFor(world, USER);
    const own = buildReadModel(registry(), world, me, GAME_MANAGEMENT_MODEL, { teamId: HOME }).model.data as { live: boolean };
    expect(own.live).toBe(true);
    expect(buildReadModel(registry(), world, me, GAME_MANAGEMENT_MODEL, { teamId: AWAY }).model.data).toEqual({ teamId: AWAY, live: false });
    expect(buildReadModel(registry(), world, PUBLIC_OBSERVER, GAME_MANAGEMENT_MODEL, { teamId: HOME }).model.data).toEqual({ teamId: HOME, live: false });
  });

  it('Q1.4.2 crawl: no truth reaches the model for the user, the other coach or the public', () => {
    const report = crawlReadModels({
      registry, source: world,
      observers: [{ name: 'user', observer: observerFor(world, USER) }, { name: 'away', observer: observerFor(world, AWAY_COACH) }, { name: 'public', observer: PUBLIC_OBSERVER }],
      params: () => [{ teamId: HOME }, { teamId: AWAY }],
    });
    expect(report.errors).toEqual([]);
    expect(crawlPassed(report)).toBe(true);
  });

  it('every parameter names its leaf and basis', () => {
    for (const p of PARAMS.params) expect(p.leaf && p.basis).toBeTruthy();
    const kinds: DecisionKind[] = [...RULE_ORDER];
    expect(new Set(kinds).size).toBe(9);
  });
});

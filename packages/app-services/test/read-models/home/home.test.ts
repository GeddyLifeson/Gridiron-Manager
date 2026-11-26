// G-72 acceptance for the office screen (O1.2.1 today view, O1.2.2 inbox, O1.2.3 advancing time), through
// the observer filter (G-27) and the Q1.4.2 crawler.
import { describe, expect, it } from 'vitest';
import {
  ReadModelRegistry, buildReadModel, crawlReadModels, crawlPassed, observerFor, tablesOf, ObservedWorld, PUBLIC_OBSERVER,
} from '../../../src/observer/index.ts';
import { buildHomeView, homeSpec, HOME_MODEL, type DayPlan, type HomeView } from '../../../src/read-models/home/index.ts';
import { advance, answerItem, markRead } from '../../../src/commands/home/index.ts';
import { fixtureTables, AWAY, USER, ASSISTANT, AWAY_COACH, OWNER } from '../../observer/fixture-world.ts';
import { HomeData } from '../people/data-schema.ts';

const day = (dayIndex: number) => ({ seasonYear: 2030, dayIndex });

/** Four inbox items for the user: a note, two should items and a must item. */
function tables(): Record<string, unknown[]> {
  const t = fixtureTables();
  const base = (t.inbox as Record<string, unknown>[])[0]!;
  const item = (id: number, over: Record<string, unknown>) => ({ ...base, id, ownerPersonId: USER, ...over });
  t.inbox = [
    ...(t.inbox as Record<string, unknown>[]),
    item(11, { kind: 'roster', senderPersonId: ASSISTANT, requiredCommand: 'AnswerRoster', defaultCommand: 'KeepRoster', deadline: day(3), received: day(0) }),
    item(12, { kind: 'owner', senderPersonId: OWNER, requiredCommand: 'AnswerOwner', defaultCommand: null, deadline: day(2), received: day(0) }),
    item(13, { kind: 'media', senderPersonId: null, requiredCommand: 'AnswerMedia', defaultCommand: 'NoComment', deadline: day(1), received: day(0) }),
    item(14, { kind: 'roster', state: 'done', requiredCommand: 'AnswerRoster', defaultCommand: null, deadline: day(1) }),
    item(15, { kind: 'scouting', requiredCommand: null, defaultCommand: null, received: day(0) }),
  ];
  return t;
}

const plan = (over: Partial<DayPlan> = {}): DayPlan => ({
  now: { date: day(0), minute: 7 * 60 },
  phaseKey: 'phase.regular_season', dayLabelKey: 'day.wednesday_install',
  nextGame: { date: day(4), opponentTeamId: AWAY, kickoffMinute: 13 * 60 },
  blocks: [
    { blockId: 'b2', labelKey: 'block.practice', date: day(0), startMinute: 13 * 60, minutes: 150, runBy: 'coach', screenId: 'week.practice' },
    { blockId: 'b1', labelKey: 'block.staff_meeting', date: day(0), startMinute: 8 * 60, minutes: 60, runBy: 'coach' },
    { blockId: 'b3', labelKey: 'block.special_teams_meeting', date: day(0), startMinute: 10 * 60, minutes: 45, runBy: ASSISTANT, delegateNoteKey: 'record.st_meetings_ok' },
    { blockId: 'b4', labelKey: 'block.film', date: day(1), startMinute: 9 * 60, minutes: 120, runBy: ASSISTANT },
    { blockId: 'b5', labelKey: 'block.day_off', date: day(2), startMinute: 0, minutes: 0, runBy: ASSISTANT, requiredByRule: true },
  ],
  budgetMinutes: 80 * 60, spentMinutes: 23 * 60 + 17, energyKey: 'energy.fresh', nextEvent: null, endOfDayMinute: 22 * 60,
  ...over,
});

const view = (p: DayPlan = plan(), t = tables()): HomeView => {
  const src = tablesOf(t);
  return buildHomeView(new ObservedWorld(src, observerFor(src, USER)), USER, p);
};

describe('today view (O1.2.1)', () => {
  it('shows the day\'s blocks in order with hour cost or the delegate and his record note', () => {
    const v = view();
    expect(v.today.blocks.map((b) => b.blockId)).toEqual(['b1', 'b3', 'b2']);
    expect(v.today.blocks[0]).toMatchObject({ runBy: 'coach', coachMinutes: 60, delegateName: null });
    expect(v.today.blocks[1]).toMatchObject({ runBy: 'delegate', coachMinutes: null, delegateId: ASSISTANT, delegateName: `Coach${ASSISTANT} Last${ASSISTANT}`, delegateNoteKey: 'record.st_meetings_ok' });
    expect(v.today).toMatchObject({ mode: 'normal', daysToGame: 4, opponent: { teamId: AWAY, name: `Town ${AWAY}` }, dayLabelKey: 'day.wednesday_install' });
  });
  it('hours left equals the budget minus spent hours to the minute (acceptance 2)', () => {
    expect(view().today.minutesLeftThisWeek).toBe(80 * 60 - (23 * 60 + 17));
  });
  it('on game day only the pre-game timeline shows; an empty offseason day shows the next event', () => {
    const g = view(plan({ nextGame: { date: day(0), opponentTeamId: AWAY, kickoffMinute: 12 * 60 } }));
    expect(g.today.mode).toBe('game_day');
    expect(g.today.blocks.map((b) => b.blockId)).toEqual(['b1', 'b3']);
    const e = view(plan({ blocks: [], nextGame: null, nextEvent: { date: day(30), labelKey: 'event.combine' } }));
    expect(e.today).toMatchObject({ mode: 'empty', nextEvent: { date: day(30), labelKey: 'event.combine' }, daysToGame: null, opponent: null });
  });
});

describe('inbox and decision queue (O1.2.2)', () => {
  it('orders must by deadline, then should by deadline, then notes; answered items and other owners\' items are absent', () => {
    const v = view();
    expect(v.inbox.map((i) => [i.itemId, i.weight])).toEqual([[12, 'must'], [13, 'should'], [11, 'should'], [15, 'note'], [1, 'note']]);
  });
  it('every named sender is a real entity with a card', () => {
    const v = view();
    expect(v.inbox.find((i) => i.itemId === 12)!.senderName).toBe(`P${OWNER} L${OWNER}`);
    expect(v.inbox.find((i) => i.itemId === 11)!.senderName).toBe(`Coach${ASSISTANT} Last${ASSISTANT}`);
  });
  it('kinds delegated by standing rule do not appear; hour costs and conflicts are shown', () => {
    const v = view(plan({ delegatedKinds: ['media'], answerMinutes: { '12': 30 }, conflicts: { '11': [12] } }));
    expect(v.inbox.map((i) => i.itemId)).not.toContain(13);
    expect(v.inbox.find((i) => i.itemId === 12)!.answerMinutes).toBe(30);
    expect(v.inbox.find((i) => i.itemId === 11)!.conflictsWith).toEqual([12]);
  });
  it('answers go to the owning system\'s command; a note needs no answer', () => {
    const v = view();
    expect(answerItem(v, 12, 'agree')).toEqual({ ok: true, type: 'AnswerOwner', payload: { itemId: 12, choice: 'agree' } });
    expect(answerItem(v, 15, 'x').ok).toBe(false);
    expect(markRead(v, 15).ok).toBe(true);
  });
});

describe('advancing time (O1.2.3)', () => {
  it('time cannot advance past a must item\'s deadline until it is answered (O1.2.2 acceptance 1)', () => {
    const v = view();
    const game = v.advance.find((o) => o.target === 'game_day')!;
    expect(game.blockedBy).toEqual([12]);
    expect(advance(v, 'game_day').ok).toBe(false);
    expect(advance(v, 'end_of_day')).toEqual({ ok: true, type: 'AdvanceTime', payload: { to: { date: day(0), minute: 22 * 60 }, target: 'end_of_day' } });
    const t = tables();
    (t.inbox as { id: number; state: string }[]).find((i) => i.id === 12)!.state = 'done';
    expect(advance(view(plan(), t), 'game_day').ok).toBe(true);
  });
  it('the preview lists what runs without him and under whose control', () => {
    const v = view();
    const game = v.advance.find((o) => o.target === 'game_day')!;
    expect(game.runsWithout.map((r) => r.blockId)).toEqual(['b3', 'b4', 'b5']);
    expect(game.runsWithout[0]!.byName).toBe(`Coach${ASSISTANT} Last${ASSISTANT}`);
    expect(v.advance.find((o) => o.target === 'next_block')!.to).toEqual({ date: day(0), minute: 8 * 60 });
    expect(v.advance.find((o) => o.target === 'next_must')!.to).toEqual({ date: day(2), minute: 0 });
  });
});

describe('office read model through the filter (Q1.4.2)', () => {
  const registryFor = () => new ReadModelRegistry().register(homeSpec(HomeData, (personId) => (personId === USER ? plan() : null)));
  it('registers and builds for the coach; another person\'s inbox never reaches him', () => {
    const world = tablesOf(tables());
    const b = buildReadModel<HomeView | null>(registryFor(), world, observerFor(world, USER), HOME_MODEL, { personId: USER });
    expect(b.model.data!.inbox.length).toBe(5);
    const other = buildReadModel<HomeView | null>(registryFor(), world, observerFor(world, AWAY_COACH), HOME_MODEL, { personId: USER });
    expect(other.model.data?.inbox ?? []).toEqual([]);
  });
  it('passes the crawler for every seat', () => {
    const world = tablesOf(tables());
    const observers = [USER, ASSISTANT, AWAY_COACH, 101].map((id) => ({ name: `person ${id}`, observer: observerFor(world, id) })).concat([{ name: 'public', observer: PUBLIC_OBSERVER }]);
    const r = crawlReadModels({ registry: registryFor, source: world, observers, params: () => [{ personId: USER }, { personId: AWAY_COACH }] });
    expect(r.errors).toEqual([]);
    expect(r.schemaHits).toEqual([]);
    expect(r.sentinelHits).toEqual([]);
    expect(r.divergences).toEqual([]);
    expect(crawlPassed(r)).toBe(true);
  });
});

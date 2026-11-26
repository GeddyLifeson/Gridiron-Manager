import { describe, expect, it } from 'vitest';
import { stream } from '@gm/engine-core';
import { calendar, news as league } from '@gm/league';
import type { EventTypeDef, RelationshipEdge, WorldEvent } from '@gm/schema';
import { NAMES, loop, setup, testSchedule, testGamePort, trimmed } from '../fixtures.ts';
import * as news from '../../src/news/index.ts';

const base = { harmClass: 'none' as const, importedAllowed: true, minTier: 3 as const, consumers: ['world.news'], compactable: false };
const TYPES: readonly EventTypeDef[] = [
  { ...base, id: 'test_public', family: 'world', payloadSchema: {}, witnessRule: 'public', lineTemplate: 'event.test_public' },
  { ...base, id: 'test_room', family: 'relationship', payloadSchema: {}, witnessRule: 'people', lineTemplate: 'event.test_room' },
  { ...base, id: 'test_quiet', family: 'relationship', payloadSchema: {}, witnessRule: 'none', lineTemplate: 'event.test_quiet' },
  { ...base, id: 'test_seat', family: 'career', payloadSchema: { seatId: 'number' }, witnessRule: 'public', lineTemplate: 'event.test_seat' },
  { ...base, id: 'test_move', family: 'roster', payloadSchema: {}, witnessRule: 'public', lineTemplate: 'event.test_move' },
];

/** Notability by payload-free rule for the tests: a `test_public` row about team 1 is national news. */
const notabilityOf = (e: WorldEvent): number | null => (e.type === 'test_public' ? (e.where.teamId === 1 ? 70 : 30) : null);

function build(notability = true) {
  return loop.createWorld({ setup: setup({}), content: trimmed(), names: NAMES, eventTypes: TYPES, notabilityOf: notability ? notabilityOf : undefined });
}

function emit(w: loop.LiveWorld, type: string, over: Partial<{ teamId: number; competitionId: number; personIds: number[]; actors: number[]; payload: Record<string, number> }> = {}): WorldEvent {
  const witnesses = type === 'test_room' ? { kind: 'people' as const, personIds: over.personIds ?? [] } : type === 'test_quiet' ? { kind: 'none' as const } : { kind: 'public' as const };
  const r = w.log.emit({
    type, date: w.date, teamId: over.teamId ?? null, competitionId: over.competitionId ?? null, witnesses, tier: 3, source: 'sim',
    actors: (over.actors ?? []).map((personId) => ({ personId, role: 'subject' })), payload: over.payload ?? {},
  });
  if (!r.ok) throw new Error(r.reason);
  return r.event;
}

const newsOnly = (b: news.NewsBinding = {}) => loop.systemsFrom({ news: news.newsStep(b) }, 'test: not bound');
const week = (w: loop.LiveWorld, sys: loop.WorldSystems) => loop.runWeek(w, sys, { order: ['news'] });

function person(w: loop.LiveWorld, i: number): number {
  return [...w.people.keys()].sort((a, b) => a - b)[i]!;
}

function setFacets(w: loop.LiveWorld, id: number, candor: number, discipline: number): void {
  const p = w.people.get(id)!;
  w.people.set(id, { ...p, traitBlock: { ...p.traitBlock, facets: { ...p.traitBlock.facets, candor, discipline } } });
}

function edge(a: number, b: number, strength: number, sign: RelationshipEdge['sign'] = 'warm'): RelationshipEdge {
  return { a, b, bTeamId: null, kind: 'teammate', strength, sign, since: { seasonYear: 2000, dayIndex: 0 }, lastContact: { seasonYear: 2000, dayIndex: 0 }, basisEventIds: [] } as RelationshipEdge;
}

describe('news items from the week\'s rows (C10.3.1, G-44 acceptance)', () => {
  it('reads every row once, makes items from public rows at or above the floor, and every item traces to a public row', () => {
    const w = build();
    const sys = newsOnly();
    emit(w, 'test_public', { teamId: 1 });
    emit(w, 'test_public', { teamId: 2 });
    emit(w, 'test_room', { personIds: [person(w, 0)] });
    week(w, sys);
    const st = news.newsOf(w);
    expect(st.cursor).toBe(w.log.nextId);
    expect(st.items.length).toBe(2);
    expect(league.newsTraceProblems(st.items, w.log.rows())).toEqual([]);
    const rowsBefore = w.log.nextId;
    week(w, sys);
    // Nothing new: nothing read twice.
    expect(news.newsOf(w).items.length).toBe(2);
    expect(news.newsOf(w).cursor).toBe(rowsBefore);
    const t = news.newsOf(w).tallies.at(-1)!;
    expect(t.events).toBe(w.log.size);
    expect(t.public).toBe(w.log.rows().filter((e) => e.witnesses.kind === 'public').length);
  });

  it('counts a public row at the national line as heard at the other level (X12.2.1 rule 1)', () => {
    const w = build();
    const national = emit(w, 'test_public', { teamId: 1, competitionId: 1 });
    const local = emit(w, 'test_public', { teamId: 2, competitionId: 1 });
    week(w, newsOnly());
    expect(news.newsOf(w).tallies.at(-1)!.national).toBe(1);
    expect(news.heardPublic(national, 1)).toBe('official');
    expect(news.heardPublic(national, 2)).toBe('media');
    expect(news.heardPublic(local, 2)).toBeNull();
    expect(news.heardPublic(local, 1)).toBe('official');
  });

  it('makes no item below the floor, except a head coach or coordinator change (C10.3.1 rule 1)', () => {
    const w = build(false);
    const head = [...w.jobs.values()].find((j) => j.positionId === news.HEAD_COACH)!;
    const other = [...w.jobs.values()].find((j) => j.positionId !== news.HEAD_COACH && !j.positionId.endsWith('_coordinator'))!;
    emit(w, 'test_public', { teamId: 1 });
    const hc = emit(w, 'test_seat', { teamId: head.teamId ?? undefined, payload: { seatId: head.id } });
    emit(w, 'test_seat', { teamId: other.teamId ?? undefined, payload: { seatId: other.id } });
    week(w, newsOnly());
    const st = news.newsOf(w);
    expect(st.items.map((i) => i.sourceEventIds[0])).toEqual([hc.id]);
    expect(st.tallies.at(-1)!.always).toBe(1);
    expect(st.tallies.at(-1)!.belowFloor).toBe(w.log.rows().filter((e) => e.witnesses.kind === 'public').length - 1);
  });

  it('puts public roster rows on the wire (C10.1.1)', () => {
    const w = build();
    emit(w, 'test_move', { teamId: 1 });
    emit(w, 'test_move', { teamId: 2 });
    week(w, newsOnly());
    expect(news.newsOf(w).tallies.at(-1)!.wire).toBe(w.log.rows().filter((e) => e.type === 'test_move' || TYPES.find((t) => t.id === e.type)?.family === 'roster').length);
  });
});

describe('rows that are not public travel only along warm edges (X12.2.1 rules 2 to 4, acceptance)', () => {
  function chain() {
    const w = build();
    const [a, b, c, d] = [0, 1, 2, 3].map((i) => person(w, i)) as [number, number, number, number];
    // Candor 100 and discipline 0 with strength 100 make the pass chance 1, so the chain is certain.
    for (const p of [a, b, c, d]) setFacets(w, p, 100, 0);
    return { w, a, b, c, d };
  }

  it('reaches nobody with no edges: the user with no edges hears public news only', () => {
    const { w, a } = chain();
    emit(w, 'test_room', { personIds: [a] });
    week(w, newsOnly());
    const t = news.newsOf(w).tallies.at(-1)!;
    expect(t.private).toBe(1);
    expect(t.witnessed).toBe(1);
    expect(t.travelled).toBe(0);
    expect(news.newsOf(w).deliveries).toEqual([]);
  });

  it('reaches along a chain of warm edges one hop a week, never sooner, and never across a cold edge', () => {
    const { w, a, b, c, d } = chain();
    const edges = [edge(a, b, 100), edge(b, c, 100), edge(c, d, 100, 'cold')];
    const e = emit(w, 'test_room', { personIds: [a] });
    week(w, newsOnly({ edges: () => edges }));
    const ds = news.newsOf(w).deliveries;
    const day = calendar.fromWorldDate(e.when.date);
    const hop = league.param('hopDelayDays');
    expect(ds.map((x) => [x.to, x.viaPersonId, x.hops, x.day])).toEqual([[b, a, 1, day + hop], [c, b, 2, day + 2 * hop]]);
    expect(news.deliveriesTo(w, d)).toEqual([]);
    expect(league.unsourcedDeliveries(ds)).toEqual([]);
  });

  it('never moves a row with no witness', () => {
    const { w, a, b } = chain();
    emit(w, 'test_quiet', { actors: [a] });
    week(w, newsOnly({ edges: () => [edge(a, b, 100)] }));
    expect(news.newsOf(w).deliveries).toEqual([]);
    expect(news.newsOf(w).tallies.at(-1)!.witnessed).toBe(0);
  });

  it('gives the same deliveries as spreading over every edge in the world', () => {
    const { w, a, b, c, d } = chain();
    const far = [4, 5, 6, 7, 8].map((i) => person(w, i));
    const edges = [edge(a, b, 60), edge(b, c, 80), edge(c, d, 90), edge(far[0]!, far[1]!, 100), edge(far[2]!, far[3]!, 100)];
    const e = emit(w, 'test_room', { personIds: [a] });
    week(w, newsOnly({ edges: () => edges }));
    // Same stream as the step: the loop keys it by step, season and the week the pass ran in.
    const st = (week: number) => stream(w.seed, news.STREAM_SPREAD, ['news', w.date.seasonYear, week]);
    const facets: league.PasserFacets = (id) => ({ candor: w.people.get(id)!.traitBlock.facets.candor!, discipline: w.people.get(id)!.traitBlock.facets.discipline! });
    const all = league.spreadNonPublic(e, calendar.fromWorldDate(e.when.date), [a], edges, facets, st(w.week - 1));
    expect(news.newsOf(w).deliveries).toEqual(all);
  });
});

describe('the news state over seasons', () => {
  it('keeps items for the kept seasons only, and a tally for every season', () => {
    const w = build();
    const sys = newsOnly();
    const first = w.date.seasonYear;
    emit(w, 'test_public', { teamId: 1 });
    week(w, sys);
    for (let k = 1; k <= news.param('keepSeasons') + 1; k++) {
      w.date = { seasonYear: first + k, dayIndex: 0 };
      emit(w, 'test_public', { teamId: 1 });
      week(w, sys);
    }
    const st = news.newsOf(w);
    expect(st.items.every((i) => i.date.seasonYear >= w.date.seasonYear - news.param('keepSeasons'))).toBe(true);
    expect(st.items.length).toBe(news.param('keepSeasons') + 1);
    expect(st.tallies.map((t) => t.seasonYear)).toEqual(Array.from({ length: news.param('keepSeasons') + 2 }, (_, i) => first + i));
    expect(st.nextItemId).toBe(news.param('keepSeasons') + 3);
  });

  it('runs in a full season with the other steps, deterministically, and changes the world hash', () => {
    const runOnce = () => {
      const w = loop.createWorld({ setup: setup({}), content: trimmed(), names: NAMES });
      const sys = loop.systemsFrom({ games: loop.gamesStep(testSchedule, testGamePort()), leaving: loop.leavingStep(), news: news.newsStep() }, 'test: not bound');
      loop.runHistory(w, sys, { seasons: 2, schedule: testSchedule });
      return w;
    };
    const x = runOnce();
    const y = runOnce();
    expect(loop.worldHash(x)).toBe(loop.worldHash(y));
    const st = news.newsOf(x);
    expect(st.cursor).toBeGreaterThan(1);
    expect(st.tallies.length).toBeGreaterThanOrEqual(2);
    expect(st.tallies.reduce((n, t) => n + t.events, 0)).toBe(st.cursor - 1);
    expect(league.newsTraceProblems(st.items, x.log.rows())).toEqual([]);
  });
});

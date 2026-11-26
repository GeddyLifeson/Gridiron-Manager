// Legends read models (G-84): registration passes the truth scan, every model builds against its schema
// from a world through the observer filter, room-only events never reach a viewer outside the room, and
// public history is open from the first day of a new career (X3.6.2).
import { describe, it, expect } from 'vitest';
import { ReadModelRegistry, buildReadModel, PUBLIC_OBSERVER, tablesOf, type Observer } from '../../../src/observer/index.ts';
import { legendsReadModels, LEGENDS_MODELS, SearchIndex, type LegendsSources, type PageModel, type Chronicle } from '../../../src/read-models/legends/index.ts';
import { tenSeasons, calendar, line, TYPE_DEFS, COMP, FIRST, headOf, ev } from './fixture.ts';
import { LEGENDS_SCHEMAS } from '@gm/schema';

const w = tenSeasons();
// History-run rows: a season before the career with a title and a room-only meeting (X3.6.2 acceptance).
const historyTitle = ev('title_won', FIRST - 1, 205, { teamId: 6, subjects: [{ kind: 'team', id: 6 }], notability: 95 });
const historyRoom = ev('staff_meeting', FIRST - 1, 120, { teamId: 6, actors: [{ personId: headOf(6), role: 'chair' }], witnesses: { kind: 'room', teamId: 6, roomKey: 'staff' }, notability: 99 });
historyTitle.source = 'history_run';
historyRoom.source = 'history_run';
const events = [...w.rows, historyTitle, historyRoom];
const source = tablesOf({ events, eventTypes: TYPE_DEFS });

const index = new SearchIndex();
index.upsert({ kind: 'person', id: headOf(1), first: 'Dale', last: 'Whitcombe', birthYear: 1975, roles: ['head_coach'], levels: ['pro'], teams: [1], lastTeamId: 1, jobs: [], labels: [], honors: [], treeRoots: [], firstSeason: FIRST, lastSeason: FIRST + 9, notability: 50 });

let leaks: { eventId: number }[] = [];
const sources: LegendsSources = {
  calendar,
  tierOf: () => 1,
  labelsOf: () => [],
  reaches: () => leaks.map((l) => ({ eventId: l.eventId, seasonYear: FIRST, dayIndex: 150, sourcePersonId: 77, rumor: true })),
  eventById: (id) => events.find((e) => e.id === id),
  historyRun: (_c, y) => y < FIRST,
  seasons: () => ({ first: FIRST - 1, last: FIRST + 9 }),
  isRival: (_w, a, b) => (a === 1 && b === 2) || (a === 2 && b === 1),
  gameLines: () => [line(301, 1, FIRST, 1, { pass_yards: 410, pass_attempts: 30 }), line(302, 2, FIRST, 2, { pass_yards: 380, pass_attempts: 40 })],
  priorMarks: (cat) => (cat === 'pass_yards' ? [{ holderId: 900, value: 50_000, teamId: 0, seasonYear: 1990 }] : []),
  searchIndex: () => index,
};

const registry = () => {
  const r = new ReadModelRegistry();
  for (const s of legendsReadModels(LEGENDS_SCHEMAS, sources)) r.register(s);
  return r;
};
const roomObserver: Observer = { personId: headOf(2), teamScopes: { '2': ['team', 'room:staff'] } };

describe('legends read models', () => {
  it('register without truth fields and build every model against its schema', () => {
    const r = registry();
    expect(r.names()).toEqual(Object.values(LEGENDS_MODELS).sort());
    const build = (name: string, params: Record<string, string | number | boolean>) => buildReadModel(r, source, PUBLIC_OBSERVER, name, params).model.data;
    expect((build(LEGENDS_MODELS.page, { kind: 'team', id: 1 }) as PageModel).empty).toBe(false);
    expect((build(LEGENDS_MODELS.chronicle, { competitionId: COMP, seasonYear: FIRST }) as Chronicle).sections.length).toBeGreaterThan(0);
    expect(build(LEGENDS_MODELS.era, { competitionId: COMP })).toMatchObject({ competitionId: COMP });
    expect(build(LEGENDS_MODELS.tree, { rootId: headOf(1) })).toMatchObject({ rootId: headOf(1) });
    expect(build(LEGENDS_MODELS.rivalry, { teamA: 1, teamB: 2 })).toMatchObject({ exists: true });
    expect(build(LEGENDS_MODELS.rivalry, { teamA: 3, teamB: 4 })).toEqual({ teamA: 3, teamB: 4, exists: false, page: null });
    const rec = build(LEGENDS_MODELS.records, {}) as { lists: { categoryId: string; scope: string; allTime: { holderId: number }[]; thisWorld: { holderId: number }[] }[] };
    const career = rec.lists.find((l) => l.categoryId === 'pass_yards' && l.scope === 'career')!;
    expect(career.allTime[0]!.holderId).toBe(900);
    expect(career.thisWorld.map((x) => x.holderId)).toEqual([301, 302]);
    expect((build(LEGENDS_MODELS.search, { text: 'whitcomb' }) as { rows: { id: number }[] }).rows.map((x) => x.id)).toEqual([headOf(1)]);
  });

  it('a room-only event appears only for a viewer in the room, and after a leak reaches another viewer, marked Reported', () => {
    const r = registry();
    const room = w.rows.find((e) => e.type === 'staff_meeting' && e.when.date.seasonYear === FIRST)!;
    const ids = (o: Observer) => {
      const p = buildReadModel<PageModel>(r, source, o, LEGENDS_MODELS.page, { kind: 'team', id: 2 }).model.data;
      return p.seasons.flatMap((s) => [...s.notable, ...s.lines]);
    };
    expect(ids(PUBLIC_OBSERVER).some((l) => l.eventId === room.id)).toBe(false);
    expect(ids(roomObserver).find((l) => l.eventId === room.id)!.mark).toEqual({ via: 'witnessed' });
    leaks = [{ eventId: room.id }];
    try {
      expect(ids(PUBLIC_OBSERVER).find((l) => l.eventId === room.id)!.mark).toMatchObject({ via: 'told', reported: true, sourcePersonId: 77 });
    } finally { leaks = []; }
  });

  it('X3.6.2: a new career opens the champion of every history-run season; a history-run room event stays hidden', () => {
    const r = registry();
    const c = buildReadModel<Chronicle>(r, source, PUBLIC_OBSERVER, LEGENDS_MODELS.chronicle, { competitionId: COMP, seasonYear: FIRST - 1 }).model.data;
    expect(c.seasonLevelOnly).toBe(true);
    expect(c.sections.flatMap((s) => s.entries.map((e) => e.eventId))).toContain(historyTitle.id);
    for (const kind of ['team', 'person'] as const) {
      const id = kind === 'team' ? 6 : headOf(6);
      const p = buildReadModel<PageModel>(r, source, PUBLIC_OBSERVER, LEGENDS_MODELS.page, { kind, id }).model.data;
      expect(p.seasons.flatMap((s) => [...s.notable, ...s.lines]).some((l) => l.eventId === historyRoom.id)).toBe(false);
    }
  });
});

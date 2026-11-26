// Statistics, notability and labels in the off-screen world (X3.4.1, X4.1.1, X4.2.2, X2.2.2). The games are
// the TEST DOUBLE port: what is checked is the bookkeeping, not football results.
import { describe, expect, it } from 'vitest';
import { awards } from '@gm/league';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';
import * as records from '../../src/records/index.ts';

const content = trimmed();
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);

function build(seasons: number, opts: { tier?: 1 | 2 | 3; withHall?: boolean; favour?: number } = {}) {
  const binding: turnover.TurnoverBinding = { content, rule, policy: turnover.gmPolicy() };
  const w = loop.createWorld({
    setup: setup({ firstSeasonYear: 2026 - seasons, historySeasons: seasons }), content, names: NAMES,
    eventTypes: [...turnover.TURNOVER_EVENT_TYPES, ...records.RECORDS_EVENT_TYPES], notabilityOf: records.worldNotability(),
  });
  if (opts.tier) for (const t of w.teams) w.tiers.set(t.id, opts.tier);
  const pro = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').length;
  const sys = loop.systemsFrom({
    games: loop.gamesStep(testSchedule, testGamePort(opts.favour ?? null)), leaving: loop.leavingStep(),
    cohorts: loop.cohortStep({
      scale: () => ({ topCollegeTeams: w.teams.length - pro, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: 0, retiredWouldBeCoaches: 0 }),
      names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool'],
    }),
    development: turnover.developmentStep(binding), moves: turnover.rosterMovesStep(binding),
    statistics: records.statisticsStep({ schedule: testSchedule }), notability: records.notabilityStep(), labels: records.labelsStep(),
    ...(opts.withHall ? { hall: loop.hallStep({ halls: loop.defaultHalls({ pro: 'pro', college: 'college' }, 0.5).map((h) => ({ ...h, opensAfterSeasons: 2 })), honours: records.honoursOf }) } : {}),
  }, 'records test: not bound');
  return { w, sys };
}

function run(seasons: number, opts: Parameters<typeof build>[1] = {}) {
  const { w, sys } = build(seasons, opts);
  loop.runHistory(w, sys, { seasons, schedule: testSchedule });
  return w;
}

describe('record book (X3.4.1)', () => {
  const w = run(6);
  const rows = w.log.rows();
  const sets = rows.filter((e) => e.type === awards.HONOUR.record);
  const state = records.recordsOf(w);

  it('logs one finished season per team per season, with its record', () => {
    const fin = rows.filter((e) => e.type === records.TEAM_SEASON);
    const perSeason = new Map<number, number>();
    for (const e of fin) perSeason.set(Number(e.payload['season']), (perSeason.get(Number(e.payload['season'])) ?? 0) + 1);
    expect([...perSeason.keys()]).toHaveLength(6);
    for (const n of perSeason.values()) expect(n).toBe(w.teams.length);
    for (const e of fin) expect(Number(e.payload['wins']) + Number(e.payload['losses']) + Number(e.payload['ties'])).toBe(Number(e.payload['games']));
  });

  it('every record row beats the mark before it, and the book holds the current mark first', () => {
    const byBook = new Map<string, number>();
    for (const e of sets) {
      const id = String(e.payload['recordId']);
      const key = `${id}|${e.competitionId}|${id.endsWith('.team') ? e.where.teamId : ''}|${e.actors.find((a) => a.role === 'holder')?.personId ?? ''}`;
      const value = Number(e.payload['value']);
      expect(value).toBeGreaterThan(Number(e.payload['previous']));
      if (!id.startsWith('coach_')) { const prev = byBook.get(key); if (prev !== undefined) expect(value).toBeGreaterThan(prev); byBook.set(key, value); }
    }
    expect(sets.length).toBeGreaterThan(0);
    for (const list of Object.values(state.books)) {
      expect(list.length).toBeGreaterThan(0);
      for (let i = 1; i < list.length; i++) expect(list[i - 1]!.value).toBeGreaterThanOrEqual(list[i]!.value);
      expect(list.length).toBeLessThanOrEqual(records.param('book.listLength') + list.filter((e) => e.value === list[list.length - 1]!.value).length);
    }
  });

  it('a league record later than the first season is rarer than in the first (books start empty)', () => {
    const first = sets.filter((e) => e.when.date.seasonYear === w.seasons[0]!.seasonYear && !String(e.payload['recordId']).endsWith('.team')).length;
    const last = sets.filter((e) => e.when.date.seasonYear === w.seasons[w.seasons.length - 1]!.seasonYear && !String(e.payload['recordId']).endsWith('.team')).length;
    expect(last).toBeLessThan(first);
  });

  it('a coach career line is the sum of his finished seasons', () => {
    const fin = rows.filter((e) => e.type === records.TEAM_SEASON);
    const wins = new Map<number, number>();
    for (const e of fin) for (const a of e.actors) if (a.role === 'head_coach') wins.set(a.personId, (wins.get(a.personId) ?? 0) + Number(e.payload['wins']));
    for (const [coach, n] of wins) {
      const lines = Object.values(state.coaches[coach] ?? {});
      expect(lines.reduce((s, l) => s + l.wins, 0)).toBe(n);
    }
  });

  it('a season is finalized once, and the same seed gives the same books and log', () => {
    const again = run(6);
    expect(loop.worldHash(again)).toBe(loop.worldHash(w));
    expect(state.finalized).toBe(w.seasons[w.seasons.length - 1]!.seasonYear);
  });

  it('the book keeps ties at the cut (X3.4.1 rule 4)', () => {
    const s = records.emptyRecords();
    const n = records.param('book.listLength');
    for (let i = 0; i < n; i++) records.enter(s, 'k', { holder: i + 1, value: 10 - (i === n - 1 ? 1 : 0), season: 2000, gameId: i, teamId: 1 });
    records.enter(s, 'k', { holder: 99, value: 9, season: 2001, gameId: 99, teamId: 1 });
    expect(s.books['k']!.length).toBe(n + 1);
    expect(records.enter(s, 'k', { holder: 100, value: 10, season: 2002, gameId: 100, teamId: 1 })).toBeUndefined();
    expect(records.enter(s, 'k', { holder: 101, value: 11, season: 2002, gameId: 101, teamId: 1 })).toBe(10);
  });
});

describe('notability (X4.1.1, X4.2.2)', () => {
  const w = run(5, { withHall: true });
  const rows = w.log.rows();

  it('scores at emit: a league record outscores a franchise record, a title carries title stakes', () => {
    const set = rows.filter((e) => e.type === awards.HONOUR.record);
    const lvl = set.find((e) => !String(e.payload['recordId']).endsWith('.team'))!;
    const team = set.find((e) => String(e.payload['recordId']).endsWith('.team'))!;
    expect(lvl.notability).toBe(awards.scoreEvent(awards.HONOUR.record, 'honors', { record: 'level' }));
    expect(team.notability).toBe(awards.scoreEvent(awards.HONOUR.record, 'honors', { record: 'team' }));
    expect(lvl.notability!).toBeGreaterThan(team.notability!);
    const title = rows.find((e) => e.type === loop.TITLE_WON)!;
    expect(title.notability).toBe(awards.scoreEvent(loop.TITLE_WON, w.log.registry.get(loop.TITLE_WON)!.family, { stakes: ['title'] }));
    for (const e of rows) expect(e.notability).not.toBeNull();
  });

  it('rebuilding the index from the log reproduces it (X4.2.2 acceptance)', () => {
    const stored = records.notabilityOf(w);
    const rebuilt = records.rebuildRollups(rows);
    const norm = (s: records.NotabilityState) => Object.fromEntries(Object.entries(s.people).map(([k, p]) => [k, { ...p, seasons: [...p.seasons].sort() }]));
    // Rows logged after the last weekly pass (the season point) are read at the next pass.
    const upTo = records.rebuildRollups(rows.filter((e) => e.id < stored.cursor));
    expect(norm(upTo)).toEqual(norm(stored));
    expect(Object.keys(rebuilt.people).length).toBeGreaterThanOrEqual(Object.keys(stored.people).length);
  });

  it('feeds coach honours to the hall: record counters equal the coach\'s logged records', () => {
    const s = records.notabilityOf(w);
    const counted = new Map<number, number>();
    for (const e of rows) if (e.type === awards.HONOUR.record && e.id < s.cursor) for (const a of e.actors) counted.set(a.personId, (counted.get(a.personId) ?? 0) + 1);
    expect(counted.size).toBeGreaterThan(0);
    for (const [id, n] of counted) expect(records.honoursOf(w, id)[awards.COUNTER.record]).toBe(n);
  });
});

describe('labels (X2.2.2)', () => {
  it('tier 3 teams (the history run): nothing is computed weekly, every label stays computable on demand', () => {
    const w = run(8);
    expect(w.log.rows().filter((e) => e.type === records.LABEL_FORMED || e.type === records.LABEL_FADED)).toHaveLength(0);
    const coach = w.log.ofType(records.TEAM_SEASON).find((e) => e.actors.length > 0)!.actors[0]!.personId;
    const res = records.labelsOn(w, coach);
    expect(res.map((r) => r.labelId)).toEqual(records.LABEL_DEFS.map((d) => d.id));
    for (const r of res) expect(r.rawSample > 0).toBe(records.LABEL_DEFS.find((d) => d.id === r.labelId)!.subjectBy === 'actor');
    const team = records.labelsOn(w, 1, records.LABEL_DEFS.filter((d) => d.subjectBy === 'team'));
    expect(team[0]!.rawSample).toBe(8);
  });

  it('tier 1 teams: a team that wins every season earns the label; held state follows the log and the on-demand reading', () => {
    const w = run(12, { tier: 1, favour: 1 });
    const s = records.labelsStateOf(w);
    const changes = w.log.rows().filter((e) => e.type === records.LABEL_FORMED || e.type === records.LABEL_FADED);
    const held = new Set<string>();
    for (const e of changes) {
      const key = `${e.payload['definition']}:${e.subjects[0]!.id}`;
      if (e.type === records.LABEL_FORMED) { expect(held.has(key)).toBe(false); held.add(key); } else { expect(held.has(key)).toBe(true); held.delete(key); }
    }
    expect([...held].sort()).toEqual(Object.keys(s.held).sort());
    expect(held.has('program_wins_more_than_it_loses:1')).toBe(true);
    // The held set agrees with an on-demand reading of every subject that holds one.
    for (const key of held) {
      const [def, id] = [key.slice(0, key.lastIndexOf(':')), Number(key.slice(key.lastIndexOf(':') + 1))];
      expect(records.labelsOn(w, id, records.LABEL_DEFS.filter((d) => d.id === def))[0]!.state).toBe('held');
    }
  });

  it('label queries read only rows (no truth fields) and pass the label lint', async () => {
    const { labels } = await import('@gm/models');
    const types = new Set<string>([records.TEAM_SEASON]);
    for (const d of records.LABEL_DEFS) expect(labels.labelDefProblems(d, types)).toEqual([]);
    const bad = { ...records.LABEL_DEFS[0]!, positive: { types: [records.LABEL_FORMED] } };
    expect(() => records.labelsStep({ defs: [bad] })).toThrow(/MA-80/);
  });
});

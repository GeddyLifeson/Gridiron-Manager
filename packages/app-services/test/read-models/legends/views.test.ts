// Legends views (G-84, bible X3): the acceptance checks of X3.1 to X3.4 over a generated 10-season world.
import { describe, it, expect } from 'vitest';
import { history } from '@gm/league';
import { FactFile, computeStatus } from '@gm/schema';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const factsJson: unknown = JSON.parse(readFileSync(join(import.meta.dirname, '../../../../..', 'facts', 'legends.json'), 'utf8'));
import {
  buildPage, pageLinks, visibleEvents, buildChronicle, eraBlocks, teamSeasonRows, coachingTree, staffSeasonsFrom, rivalryPage, seriesGames,
  recordList, rankRows, RECORD_CATEGORIES, PAGE_CONTENT, lastTitleFrom, scoreOf,
  type PageContext, type TypeInfo, type StaffSeason, type VisibleEvent,
} from '../../../src/read-models/legends/index.ts';
import { tenSeasons, calendar, ev, game, line, headOf, TYPE_DEFS, TEAMS, FIRST, COMP, resetIds } from './fixture.ts';

const types = new Map<string, TypeInfo>(TYPE_DEFS.map((t) => [t.id, { family: t.family, lineTemplate: t.lineTemplate }]));
const ctx = (over: Partial<PageContext> = {}): PageContext => ({ types, keepLine: 60, tier: 1, labels: [], ...over });
const pub = (rows: readonly ReturnType<typeof ev>[]): VisibleEvent[] => visibleEvents(rows.filter((e) => e.witnesses.kind === 'public'), [], () => undefined);

describe('X3.1.1 pages', () => {
  const w = tenSeasons();
  const vis = pub(w.rows);

  it('every line on a page maps to one event id, and the Notable block holds lines at or above the keep line', () => {
    const p = buildPage({ kind: 'team', id: 1 }, vis, ctx());
    const ids = new Set(w.rows.map((e) => e.id));
    const all = p.seasons.flatMap((s) => [...s.notable, ...s.lines]);
    expect(all.length).toBeGreaterThan(0);
    for (const l of all) expect(ids.has(l.eventId)).toBe(true);
    expect(new Set(all.map((l) => l.eventId)).size).toBe(all.length);
    for (const s of p.seasons) {
      for (const l of s.notable) expect(l.notability!).toBeGreaterThanOrEqual(60);
      for (const l of s.lines) expect(l.notability === null || l.notability < 60).toBe(true);
    }
    expect(p.years).toEqual({ first: FIRST, last: FIRST + 9 });
  });

  it('a crawl of every link in the 10-season world finds no dead link', () => {
    const people = new Set(w.rows.flatMap((e) => e.actors.map((a) => a.personId)));
    const games = new Set(w.rows.flatMap((e) => e.subjects.filter((s) => s.kind === 'game').map((s) => s.id)));
    const exists = (k: { kind: string; id: number }) =>
      k.kind === 'person' ? people.has(k.id) : k.kind === 'team' ? TEAMS.includes(k.id) : k.kind === 'game' ? games.has(k.id) : k.kind === 'competition_season' ? k.id === COMP : k.kind === 'record' ? k.id === 1 : false;
    const queue: { kind: string; id: number }[] = [{ kind: 'team', id: 1 }];
    const seen = new Set<string>();
    let dead = 0;
    while (queue.length) {
      const q = queue.shift()!;
      const key = `${q.kind}:${q.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!exists(q)) { dead++; continue; }
      const page = buildPage({ kind: q.kind as never, id: q.id, ...(q.kind === 'competition_season' ? { seasonYear: FIRST } : {}) }, vis, ctx());
      expect(page.empty && q.kind !== 'competition_season').toBe(false);
      for (const l of pageLinks(page)) queue.push(l);
    }
    expect(dead).toBe(0);
    expect(seen.size).toBeGreaterThan(TEAMS.length);
  });

  it('pages are queries: building twice gives the same page (no cache changes what is shown)', () => {
    expect(JSON.stringify(buildPage({ kind: 'person', id: headOf(1) }, vis, ctx()))).toBe(JSON.stringify(buildPage({ kind: 'person', id: headOf(1) }, vis, ctx())));
  });

  it('a person with no events shows header only (No record yet); a tier 3 subject shows season summaries only', () => {
    const none = buildPage({ kind: 'person', id: 9999 }, vis, ctx());
    expect(none.empty).toBe(true);
    expect(none.years).toBeNull();
    expect(none.tabs).toEqual([]);
    const summary = ev(history.HISTORY_SUMMARY_TYPE, FIRST, 300, { actors: [{ personId: headOf(4), role: 'subject' }] });
    const p = buildPage({ kind: 'person', id: headOf(4) }, pub([...w.rows, summary]), ctx({ tier: 3 }));
    expect(p.summariesOnly).toBe(true);
    expect(p.seasons.flatMap((s) => [...s.notable, ...s.lines]).map((l) => l.eventId)).toEqual([summary.id]);
  });

  it('a vacated result shows both lines; empty tabs are hidden; labels are the only judgment words', () => {
    const g = w.rows.find((e) => e.type === 'game_result' && (e.payload['homeTeamId'] === 5))!;
    const vac = ev('result_vacated', FIRST + 1, 300, { teamId: 5, causeId: g.id, subjects: [{ kind: 'team', id: 5 }] });
    const p = buildPage({ kind: 'team', id: 5 }, pub([...w.rows, vac]), ctx({ labels: ['label.steady'] }));
    const lines = p.seasons.flatMap((s) => [...s.notable, ...s.lines]);
    expect(lines.find((l) => l.eventId === g.id)!.reversed).toBe(true);
    expect(lines.some((l) => l.eventId === vac.id)).toBe(true);
    expect(p.tabs.map((t) => t.id)).not.toContain('culture');
    expect(p.tabs.map((t) => t.id)).toContain('seasons');
    expect(p.labels).toEqual(['label.steady']);
  });

  it('page content files hold no authored prose about a person', () => {
    const text = JSON.stringify(PAGE_CONTENT);
    expect(text).not.toMatch(/\b(he|she|his|her|great|legend|elite|bust)\b/i);
  });
});

describe('X3.1.3 public record against what the viewer knows', () => {
  const w = tenSeasons(2);
  const room = w.rows.find((e) => e.type === 'staff_meeting')!;
  it('a room-only event on a team the viewer never worked for is absent; a scripted leak shows it with its source', () => {
    const seen = w.rows.filter((e) => e.witnesses.kind === 'public');
    const before = visibleEvents(seen, [], (id) => w.rows.find((e) => e.id === id));
    expect(before.some((v) => v.event.id === room.id)).toBe(false);
    const rumor = visibleEvents(seen, [{ eventId: room.id, seasonYear: FIRST, dayIndex: 130, sourcePersonId: 77, rumor: true }], (id) => w.rows.find((e) => e.id === id));
    const r = rumor.find((v) => v.event.id === room.id)!;
    expect(r.mark).toEqual({ via: 'told', sourcePersonId: 77, seasonYear: FIRST, dayIndex: 130, reported: true });
    const confirmed = visibleEvents(seen, [
      { eventId: room.id, seasonYear: FIRST, dayIndex: 130, sourcePersonId: 77, rumor: true },
      { eventId: room.id, seasonYear: FIRST, dayIndex: 140, sourcePersonId: null, rumor: false },
    ], (id) => w.rows.find((e) => e.id === id));
    expect(confirmed.find((v) => v.event.id === room.id)!.mark).toMatchObject({ via: 'told', reported: false, sourcePersonId: null });
  });
});

describe('X3.2.1 season chronicle', () => {
  const w = tenSeasons();
  const pubRows = w.rows.filter((e) => e.witnesses.kind === 'public');
  it('the champion, every head coach change and every record set appear in the chronicle', () => {
    for (let y = FIRST; y < FIRST + 10; y++) {
      const c = buildChronicle(pubRows, COMP, y, { threshold: 50, calendar, lastTitleBefore: lastTitleFrom(pubRows) });
      const ids = new Set(c.sections.flatMap((s) => s.entries.map((e) => e.eventId)));
      expect(ids.has(w.champions.get(y)!)).toBe(true);
      for (const id of w.records) if (w.rows.find((e) => e.id === id)!.when.date.seasonYear === y) expect(ids.has(id)).toBe(true);
      for (const id of w.headCoachChanges) if (w.rows.find((e) => e.id === id)!.when.date.seasonYear === y) expect(ids.has(id)).toBe(true);
      expect(c.summary).not.toBeNull();
    }
  });

  it('caps a week at 12 entries, the rest behind More this week; order is by score; sections run preseason to offseason', () => {
    const dense = Array.from({ length: 20 }, (_, i) => game(FIRST, 101, 1 + (i % 4), 5 + (i % 4), 14, 10, { notability: 30 + i }));
    const c = buildChronicle([...pubRows, ...dense], COMP, FIRST, { threshold: 0, calendar });
    const weeks = c.sections.filter((s) => s.section === 'week');
    expect(weeks.some((s) => s.more.length > 0)).toBe(true);
    for (const s of weeks) {
      expect(s.entries.filter((e) => !e.guaranteed).length).toBeLessThanOrEqual(12);
      const scores = s.entries.map((e) => e.notability ?? -1);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    }
    const order = c.sections.map((s) => s.section);
    expect(order.indexOf('preseason')).toBeLessThan(order.indexOf('week'));
    expect(order.lastIndexOf('week')).toBeLessThan(order.indexOf('postseason'));
  });

  it('a summary is built from templates: first title, then first since a year', () => {
    const last = lastTitleFrom(pubRows);
    expect(buildChronicle(pubRows, COMP, FIRST, { threshold: 50, calendar, lastTitleBefore: last }).summary).toEqual({ textKey: 'legends.chronicle.summary.first_title', params: { team: 1 } });
    expect(buildChronicle(pubRows, COMP, FIRST + 3, { threshold: 50, calendar, lastTitleBefore: last }).summary).toEqual({ textKey: 'legends.chronicle.summary.first_since', params: { team: 1, year: FIRST } });
  });

  it('a history-run season shows season-level entries only', () => {
    const c = buildChronicle(pubRows, COMP, FIRST, { threshold: 0, calendar, historyRun: true });
    expect(c.seasonLevelOnly).toBe(true);
    const types = new Set(c.sections.flatMap((s) => [...s.entries, ...s.more].map((e) => e.type)));
    expect(types.has('game_result')).toBe(false);
    expect(types.has('title_won')).toBe(true);
  });
});

describe('X3.2.2 era and decade views', () => {
  it('decade totals equal the sum of season rows; the dynasty flag sits on its block only; a partial block is marked', () => {
    const w = tenSeasons(10);
    // An eleventh season makes a partial second block.
    const extra = [game(FIRST + 10, 120, 1, 2, 21, 7), ev('title_won', FIRST + 10, 205, { teamId: 4 })];
    const rows = [...w.rows, ...extra];
    const input = { rows, firstSeason: FIRST, lastSeason: FIRST + 10 };
    const blocks = eraBlocks(input);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.partial).toBe(false);
    expect(blocks[1]!.partial).toBe(true);
    const seasons = teamSeasonRows(input);
    for (const b of blocks) for (const t of b.teams) {
      const mine = seasons.filter((s) => s.teamId === t.teamId && s.seasonYear >= b.firstSeason && s.seasonYear <= b.lastSeason);
      expect(t.wins).toBe(mine.reduce((n, s) => n + s.wins, 0));
      expect(t.losses).toBe(mine.reduce((n, s) => n + s.losses, 0));
      expect(t.titles).toBe(mine.reduce((n, s) => n + s.titles, 0));
    }
    const team1 = blocks[0]!.teams.find((t) => t.teamId === 1)!;
    expect(team1.titles).toBe(4);
    expect(team1.dynasty).toBe(true);
    expect(blocks[1]!.teams.find((t) => t.teamId === 1)!.dynasty).toBe(false);
    expect(blocks[0]!.teams.find((t) => t.teamId === 5)!.dynasty).toBe(false);
    expect(blocks[0]!.teams.find((t) => t.teamId === 5)!.seasonsSinceTitle).toBeNull();
    expect(blocks[1]!.teams.find((t) => t.teamId === 4)!.seasonsSinceTitle).toBe(0);
  });

  it('a team with exactly 3 titles in one block is flagged on that block and no other; rates weight seasons by team games', () => {
    resetIds();
    const rows = [2030, 2031, 2032].map((y) => ev('title_won', y, 205, { teamId: 9 })).concat([ev('title_won', 2041, 205, { teamId: 9 })]);
    const blocks = eraBlocks({
      rows, firstSeason: 2030, lastSeason: 2045,
      rates: [
        { seasonYear: 2030, teamGames: 10, pointsPerTeamGame: 20, passShare: 0.5, yardsPerPlay: 5, turnoversPerTeamGame: 1, penaltiesPerTeamGame: 6 },
        { seasonYear: 2031, teamGames: 30, pointsPerTeamGame: 24, passShare: 0.6, yardsPerPlay: 6, turnoversPerTeamGame: 2, penaltiesPerTeamGame: 7 },
      ],
      ruleMarkers: [{ seasonYear: 2041, ruleSetId: 'pro_2041' }],
    });
    expect(blocks[0]!.teams.find((t) => t.teamId === 9)!.dynasty).toBe(true);
    expect(blocks[1]!.teams.find((t) => t.teamId === 9)!.dynasty).toBe(false);
    expect(blocks[0]!.rates!.pointsPerTeamGame).toBeCloseTo(23, 10);
    expect(blocks[1]!.ruleMarkers).toEqual([{ seasonYear: 2041, ruleSetId: 'pro_2041' }]);
  });
});

describe('X3.3.1 coaching trees', () => {
  // Root R (1) is head coach of team 10 in 2030-2033. A (2) and B (3) are assistants there; A becomes head
  // coach of team 11 in 2035 and C (4) assists A, then C becomes head coach of team 12 in 2040. B becomes
  // head coach of team 13 in 2036. D (5) assists R for one season only and never becomes a head coach.
  resetIds();
  const hire = (p: number, team: number, y: number, role: string, side = 'none') => ev('coach_hired', y, 5, { teamId: team, actors: [{ personId: p, role: 'coach' }], payload: { role, level: 'pro', side } });
  const leave = (p: number, team: number, y: number) => ev('coach_resigned', y, 3, { teamId: team, actors: [{ personId: p, role: 'coach' }] });
  const rows = [
    hire(1, 10, 2030, 'head_coach'), hire(2, 10, 2030, 'offensive_coordinator', 'offense'), hire(3, 10, 2030, 'defensive_coordinator', 'defense'), hire(5, 10, 2033, 'line_coach', 'offense'),
    leave(2, 10, 2034), leave(3, 10, 2034), leave(5, 10, 2034), leave(1, 10, 2034),
    hire(2, 11, 2035, 'head_coach'), hire(4, 11, 2035, 'quarterbacks_coach', 'offense'), leave(4, 11, 2039),
    hire(4, 12, 2040, 'head_coach'), hire(3, 13, 2036, 'head_coach'),
    // A also worked under another head coach (6) on team 14 in 2029: A appears in both trees.
    hire(6, 14, 2029, 'head_coach'), hire(2, 14, 2029, 'line_coach', 'offense'), leave(2, 14, 2030),
  ];
  const staff = staffSeasonsFrom(rows, 2041);

  it('two former assistants became head coaches, one of whom produced another: depth 2, 3 head coaches produced', () => {
    const t = coachingTree(1, staff);
    expect(t.depth).toBe(2);
    expect(t.headCoachesProduced).toBe(3);
    expect(t.producedByLevel).toEqual({ pro: 3 });
    expect(t.branches.map((b) => b.personId)).toEqual([2, 3, 5]);
    const a = t.branches.find((b) => b.personId === 2)!;
    expect(a.becameHeadCoach).toBe(true);
    expect(a.children.map((c) => c.personId)).toEqual([4]);
    expect(a.laterChairs.some((c) => c.role === 'head_coach' && c.teamId === 11)).toBe(true);
    expect(t.branches.find((b) => b.personId === 5)!.becameHeadCoach).toBe(false);
    expect(a.expanded).toBe(true);
  });

  it('every tree node traces to hire events and season rows on a shared staff', () => {
    const t = coachingTree(1, staff);
    const hires = new Set(rows.filter((e) => e.type === 'coach_hired').map((e) => e.id));
    const walk = (nodes: typeof t.branches, head: number) => {
      for (const n of nodes) {
        for (const u of n.underParent) {
          for (const id of u.hireEventIds) expect(hires.has(id)).toBe(true);
          for (let y = u.firstSeason; y <= u.lastSeason; y++) {
            const mine = staff.filter((s: StaffSeason) => s.seasonYear === y && s.teamId === u.teamId);
            expect(mine.some((s) => s.personId === head && s.role === 'head_coach')).toBe(true);
            expect(mine.some((s) => s.personId === n.personId)).toBe(true);
          }
        }
        walk(n.children, n.personId);
      }
    };
    walk(t.branches, 1);
  });

  it('a coach who worked under several head coaches appears in each tree; filters narrow by side and years', () => {
    expect(coachingTree(6, staff).branches.map((b) => b.personId)).toEqual([2]);
    expect(coachingTree(1, staff, { side: 'defense' }).branches.map((b) => b.personId)).toEqual([3]);
    expect(coachingTree(1, staff, { fromSeason: 2033, toSeason: 2033 }).branches.map((b) => b.personId)).toEqual([2, 3, 5]);
    expect(coachingTree(1, staff, { level: 'college' }).branches).toEqual([]);
  });
});

describe('X3.3.2 rivalry pages', () => {
  resetIds();
  const scores: [number, number][] = [[21, 7], [14, 17], [10, 3], [24, 0], [20, 13], [7, 7], [3, 31], [28, 14]];
  const rows = scores.map(([a, b], i) => game(2030 + i, 150, i % 2 === 0 ? 1 : 2, i % 2 === 0 ? 2 : 1, i % 2 === 0 ? a : b, i % 2 === 0 ? b : a, { notability: 10 * (i + 1) }));
  it('series totals equal the count of game events; longest streak equals the longest run in the events', () => {
    const p = rivalryPage(rows, 1, 2, { headCoachOf: (t) => 100 + t, trophyKey: 'trophy.generated.1' });
    expect(p.winsA + p.winsB + p.ties).toBe(seriesGames(rows, 1, 2).length);
    expect([p.winsA, p.winsB, p.ties]).toEqual([5, 2, 1]);
    // Team 1 results in order: W L W W W T L W -> longest run 3 by team 1.
    expect(p.longest).toEqual({ teamId: 1, games: 3 });
    expect(p.current).toEqual({ teamId: 1, games: 1 });
    expect(p.largestA!.margin).toBe(24);
    expect(p.largestB!.margin).toBe(28);
    expect(p.topGameEventIds).toHaveLength(5);
    expect(p.topGameEventIds[0]).toBe(rows[7]!.id);
    expect(p.first!.seasonYear).toBe(2030);
    expect(p.last!.seasonYear).toBe(2037);
    expect(p.coaches).toEqual([{ personId: 101, teamId: 1, wins: 5, losses: 2, ties: 1 }, { personId: 102, teamId: 2, wins: 2, losses: 5, ties: 1 }]);
    expect(p.byVenue.reduce((n, v) => n + v.meetings, 0)).toBe(8);
    expect(p.trophyKey).toBe('trophy.generated.1');
  });

  it('a vacated result leaves the series', () => {
    const vac = ev('result_vacated', 2040, 1, { causeId: rows[0]!.id });
    expect(rivalryPage([...rows, vac], 1, 2).winsA).toBe(4);
    expect(scoreOf(vac)).toBeNull();
  });
});

describe('X3.4.1 record book', () => {
  const ypp = RECORD_CATEGORIES.find((c) => c.id === 'yards_per_pass')!;
  const yards = RECORD_CATEGORIES.find((c) => c.id === 'pass_yards')!;
  // A 17-game team season for team 1 and team 2. Player 1 throws 13 per team game with the best rate;
  // player 2 throws 14 per team game with a lower rate.
  const season = (attemptsPerGame: number, yardsPerAttempt: number, personId: number, teamId: number, base: number) =>
    Array.from({ length: 17 }, (_, g) => line(personId, teamId, 2030, base + g, { pass_attempts: attemptsPerGame, pass_yards: attemptsPerGame * yardsPerAttempt, pass_completions: attemptsPerGame }));

  it('a quarterback at 13 attempts per team game is off the season rate list; the same player at 14 is on it', () => {
    const at13 = recordList(ypp, 'season', [...season(13, 12, 1, 1, 0), ...season(30, 7, 2, 2, 100)]);
    expect(at13.minimum).toMatchObject({ per: 'pass_attempts', value: 14, perTeamGame: true });
    expect(at13.thisWorld.map((r) => r.holderId)).toEqual([2]);
    const at14 = recordList(ypp, 'season', [...season(14, 12, 1, 1, 0), ...season(30, 7, 2, 2, 100)]);
    expect(at14.thisWorld.map((r) => r.holderId)).toEqual([1, 2]);
  });

  it('counting records need no minimum; ties share a rank; vacated marks leave the ranking but stay in a footnote', () => {
    const lines = [line(1, 1, 2030, 1, { pass_yards: 400 }), line(2, 2, 2031, 2, { pass_yards: 400 }), line(3, 3, 2030, 3, { pass_yards: 450 }), line(4, 4, 2030, 4, { pass_yards: 100 })];
    const l = recordList(yards, 'game', lines, { vacatedGameIds: new Set([3]) });
    expect(l.minimum).toBeNull();
    expect(l.thisWorld.map((r) => [r.holderId, r.rank])).toEqual([[1, 1], [2, 1], [4, 3]]);
    expect(l.vacated.map((r) => r.holderId)).toEqual([3]);
  });

  it('a scripted season that breaks a record updates both tabs; imported careers show only on the all-time tab', () => {
    const before = [line(1, 1, 2030, 1, { pass_yards: 3000 })];
    const after = [...before, line(2, 2, 2031, 2, { pass_yards: 4000 })];
    const prior = [{ holderId: 900, value: 3500, teamId: 0, seasonYear: 1990 }];
    const b = recordList(yards, 'career', before, { prior });
    const a = recordList(yards, 'career', after, { prior });
    expect(b.thisWorld[0]!.holderId).toBe(1);
    expect(a.thisWorld[0]!.holderId).toBe(2);
    expect(a.thisWorld.some((r) => r.imported)).toBe(false);
    expect(a.allTime.map((r) => r.holderId)).toEqual([2, 900, 1]);
    expect(b.allTime.map((r) => r.holderId)).toEqual([900, 1]);
  });

  it('rankRows caps at the list size with ties sharing the last rank', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ holderId: i, value: i < 11 ? 10 : 5, teamId: 1, seasonYear: 2030, gameId: null, imported: false }));
    const r = rankRows(rows, 10);
    expect(r).toHaveLength(11);
    expect(new Set(r.map((x) => x.rank))).toEqual(new Set([1]));
  });

  it('qualifier values match their fact rows; status is computed from sources and prints PROVISIONAL short of three', () => {
    const rows = FactFile.parse(factsJson).rows;
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    for (const c of RECORD_CATEGORIES) for (const q of [c.seasonMinimum, c.careerMinimum]) if (q) expect(byId.get(q.factId)!.value).toBe(q.value);
    expect(computeStatus(byId.get('F-legends-0001')!)).toBe('1 of 3');
    expect(computeStatus(byId.get('F-legends-0006')!)).toBe('2 of 3');
    expect(computeStatus(byId.get('F-legends-0011')!)).toBe('Assumption');
    for (const r of rows) {
      expect(r.status).toBe(computeStatus(r));
      expect(computeStatus(r)).not.toBe('Verified');
    }
  });
});

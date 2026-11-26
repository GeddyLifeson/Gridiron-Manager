// The history run's schedule: a rotation that works for any number of teams, then a seeded knockout.
import { describe, expect, it } from 'vitest';
import { NAMES, generation, loop, setup, testGamePort, testSystems, trimmed } from '../fixtures.ts';

describe('circle rotation', () => {
  it('meets every other team once in n - 1 rounds, even or odd', () => {
    for (const n of [2, 3, 4, 7, 8, 21]) {
      const ids = Array.from({ length: n }, (_, i) => i + 1);
      const rounds = n % 2 === 0 ? n - 1 : n;
      const seen = new Map<string, number>();
      for (let r = 0; r < rounds; r++) {
        const busy = new Set<number>();
        for (const [h, a] of loop.circleRound(ids, r)) {
          expect(busy.has(h) || busy.has(a)).toBe(false);
          busy.add(h); busy.add(a);
          const k = `${Math.min(h, a)}:${Math.max(h, a)}`;
          seen.set(k, (seen.get(k) ?? 0) + 1);
        }
      }
      expect(seen.size).toBe((n * (n - 1)) / 2);
      for (const v of seen.values()) expect(v).toBe(1);
    }
  });
  it('rounds for a field', () => {
    expect([1, 2, 3, 4, 7, 12, 14].map(loop.roundsFor)).toEqual([0, 1, 2, 2, 3, 4, 4]);
  });
});

describe('history schedule over a changing league', () => {
  const content = trimmed(8, 6);
  const sched = loop.historySchedule({ regularGames: (c) => (c.level === 'pro' ? 17 : 12), postseasonField: (c) => (c.level === 'pro' ? 6 : undefined) });
  const make = () => {
    const w = loop.createWorld({ setup: setup({ firstSeasonYear: 1919, historySeasons: 12 }), content, names: NAMES, foundingCurves: generation.defaultFoundingCurves(), lostClubs: { fraction: 1 } });
    const sys = testSystems({ games: loop.gamesStep(sched, testGamePort()), lifecycle: loop.lifecycleStep({ content, names: NAMES, built: w }) });
    return { w, sys };
  };

  it('plays only teams that exist, the right number of games, and crowns one champion per competition', () => {
    const { w, sys } = make();
    for (let i = 0; i < 12; i++) {
      const weeks = sched.weeksInSeason(w);
      const year = w.date.seasonYear;
      const games: loop.ScheduledGame[] = [];
      while (w.week < weeks) { games.push(...sched.gamesOn(w, w.week)); loop.runWeek(w, sys, { source: 'history_run' }); }
      const ids = new Set(games.map((g) => g.gameId));
      expect(ids.size).toBe(games.length);
      for (const c of w.competitions) {
        const active = loop.activeTeamIds(w, c.teamIds);
        const mine = games.filter((g) => g.competitionId === c.id);
        if (active.length < 2) { expect(mine).toEqual([]); continue; }
        for (const g of mine) { expect(active).toContain(g.homeTeamId); expect(active).toContain(g.awayTeamId); }
        const regular = c.level === 'pro' ? 17 : 12;
        for (const id of active) {
          const n = mine.filter((g) => g.kind === 'regular' && (g.homeTeamId === id || g.awayTeamId === id)).length;
          expect(n).toBeLessThanOrEqual(regular);
          expect(n).toBeGreaterThanOrEqual(active.length % 2 === 0 ? regular : Math.floor((regular * (active.length - 1)) / active.length));
        }
        expect(mine.filter((g) => g.title).length).toBe(1);
      }
      const s = loop.runSeasonPoint(w, sys, { source: 'history_run' });
      expect(s.seasonYear).toBe(year);
      for (const c of w.competitions) if (loop.activeTeamIds(w, c.teamIds, year).length >= 2) expect(s.champions[c.id]).toBeDefined();
      // Each title is logged once, with the champion as the event's team (the legends pages read it).
      const titles = w.log.rows().filter((e) => e.type === loop.TITLE_WON && e.when.date.seasonYear === year);
      expect(titles.map((e) => [e.competitionId, e.where.teamId]).sort()).toEqual(Object.entries(s.champions).map(([c, t]) => [Number(c), t]).sort());
    }
  });

  it('the same world gives the same games', () => {
    const a = make(), b = make();
    loop.runHistory(a.w, a.sys, { seasons: 4, schedule: sched });
    loop.runHistory(b.w, b.sys, { seasons: 4, schedule: sched });
    expect(loop.worldHash(a.w)).toBe(loop.worldHash(b.w));
  });
});

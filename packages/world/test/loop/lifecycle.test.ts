// The history from football's start (Marlon 2026-11-26): any length up to the full span since 1869,
// today's rules throughout, and teams founded and folded inside the past.
import { describe, expect, it } from 'vitest';
import { computeStatus, FactRow } from '@gm/schema';
import facts from '../../src/generation/facts.json' with { type: 'json' };
import { generation, loop, NAMES, setup, testSchedule, testSystems, trimmed } from '../fixtures.ts';

describe('history length back to football\'s start', () => {
  it('the start year is a Verified fact row', () => {
    const row = FactRow.parse(facts.rows[0]);
    expect(row.value).toBe(1869);
    expect(computeStatus(row)).toBe('Verified');
    expect(generation.footballStartYear()).toBe(1869);
  });
  it('offers any length from 0 to the full span, the full span last', () => {
    expect(generation.fullHistorySeasons(2026)).toBe(157);
    expect(generation.historyPresetsFor(2026)).toEqual([0, 10, 30, 60, 157]);
    expect(generation.historyPresetsFor(1880)).toEqual([0, 10, 11]);
    expect(generation.historyChoiceProblems(2026, 5)).toEqual([]);
    expect(generation.historyChoiceProblems(2026, 157)).toEqual([]);
    expect(generation.historyChoiceProblems(2026, 158)[0]).toMatch(/1869/);
    expect(generation.firstSeasonFor(2026, 157)).toBe(1869);
  });
  it('refuses a past before 1869 and any era progression: the rules have always been the rules', () => {
    expect(() => setup({ firstSeasonYear: 1868, historySeasons: 10 })).toThrow(/1869/);
    expect(() => setup({ eraProgression: true })).toThrow(/today's rules/);
    expect(() => setup({ firstSeasonYear: 1869, historySeasons: 157 })).not.toThrow();
  });
});

describe('teams founded and folded in the past', () => {
  it('checks curves and draws founding years from them', () => {
    expect(loop.curveProblems([[1900, 0.5], [1910, 1]])).toEqual([]);
    expect(loop.curveProblems([[1900, 0.5], [1890, 1]]).length).toBe(1);
    expect(loop.curveProblems([[1900, 0.5]])[0]).toMatch(/last share/);
    expect(loop.foundingYear([[1900, 0.5], [1910, 1]], 0.2)).toBe(1900);
    expect(loop.foundingYear([[1900, 0.5], [1910, 1]], 0.7)).toBe(1910);
  });

  const curves = { pro: [[1900, 0.25], [1904, 0.5], [1908, 1]] as const };
  const make = () => {
    const w = loop.createWorld({ setup: setup({ firstSeasonYear: 1898, historySeasons: 12 }), content: trimmed(), names: NAMES, foundingCurves: curves });
    const sys = testSystems({ lifecycle: loop.lifecycleStep({ content: trimmed(), names: NAMES, built: w }) });
    return { w, sys };
  };

  it('founds later teams in their own year with people of the right age, and never schedules a team that does not exist', () => {
    const { w, sys } = make();
    const pro = w.competitions.find((c) => c.level === 'pro')!;
    const later = pro.teamIds.filter((id) => w.teamSpans.get(id)!.founded > 1898);
    expect(later.length).toBeGreaterThan(0);
    for (const id of later) expect(w.rosters.has(id)).toBe(false);
    const report = loop.runHistory(w, sys, { seasons: 12, schedule: testSchedule });
    expect(report.seasonsRun).toBe(12);
    for (const id of pro.teamIds) {
      const span = w.teamSpans.get(id)!;
      expect(span.founded).toBeLessThanOrEqual(1910);
      expect(w.rosters.get(id)!.length).toBeGreaterThan(0);
    }
    const founded = w.log.rows().filter((e) => e.type === loop.TEAM_FOUNDED);
    expect(founded.length).toBe(later.length);
    for (const e of founded) expect(e.when.date.seasonYear).toBe(w.teamSpans.get(e.subjects[0]!.id)!.founded);
    // The founding staff of a later team took their chairs in its founding year, not on day one.
    const firstLater = later[0]!;
    const seats = [...w.jobs.values()].filter((j) => j.teamId === firstLater && j.holderSince !== null);
    expect(seats.some((j) => j.holderSince!.seasonYear === w.teamSpans.get(firstLater)!.founded)).toBe(true);
    // Staff seasons only for teams that existed that season.
    for (const s of w.staffSeasons) expect(loop.isActive(w, s.teamId, s.seasonYear)).toBe(true);
    expect(loop.validateHistory(w).failures.filter((f) => /no players|no champion/.test(f))).toEqual([]);
  });

  it('the same seed gives the same founding years and the same world', () => {
    const a = make(), b = make();
    loop.runHistory(a.w, a.sys, { seasons: 12, schedule: testSchedule });
    loop.runHistory(b.w, b.sys, { seasons: 12, schedule: testSchedule });
    expect(loop.worldHash(a.w)).toBe(loop.worldHash(b.w));
  });

  it('a folding team plays no more, releases its people to the pools and is logged', () => {
    const { w, sys } = make();
    loop.runHistory(w, sys, { seasons: 11, schedule: testSchedule });
    const pro = w.competitions.find((c) => c.level === 'pro')!;
    const gone = pro.teamIds[0]!;
    const players = [...w.rosters.get(gone)!];
    w.teamSpans.set(gone, { ...w.teamSpans.get(gone)!, folded: w.date.seasonYear });
    loop.runSeason(w, sys, testSchedule, { source: 'history_run' });
    expect(w.rosters.has(gone)).toBe(false);
    expect([...w.jobs.values()].some((j) => j.teamId === gone)).toBe(false);
    expect(w.pools.get('free_agents')).toEqual(expect.arrayContaining(players));
    expect(w.log.rows().filter((e) => e.type === loop.TEAM_FOLDED).length).toBe(1);
    expect(loop.validateHistory(w).failures.filter((f) => f.includes(`team ${gone}`))).toEqual([]);
  });

  it('a game naming a team that does not exist is refused', () => {
    const { w } = make();
    const pro = w.competitions.find((c) => c.level === 'pro')!;
    const later = pro.teamIds.find((id) => w.teamSpans.get(id)!.founded > 1898)!;
    const bad: loop.SchedulePort = { weeksInSeason: () => 1, gamesOn: () => [{ gameId: 1, competitionId: pro.id, homeTeamId: later, awayTeamId: pro.teamIds.find((i) => i !== later)!, kind: 'regular', title: false }] };
    expect(() => loop.runSeason(w, loop.systemsFrom({ games: loop.gamesStep(bad, () => ({ homePoints: 1, awayPoints: 0, passPlays: 1, runPlays: 1 })) }), bad)).toThrow(/does not exist/);
  });
});

describe('the real founding curves', () => {
  it('every curve is well formed, starts no earlier than 1869 and carries a status word', () => {
    for (const [key, row] of Object.entries(generation.foundingCurveRows())) {
      expect(loop.curveProblems(row.points), key).toEqual([]);
      expect(row.points[0]![0]).toBeGreaterThanOrEqual(1869);
      expect(['Verified', '2 of 3', '1 of 3', 'Conflict', 'Assumption']).toContain(row.status);
    }
    expect(generation.foundingCurveRows().pro!.status).toBe('Verified');
  });
  it('a full-span world from 1869 opens with few teams and every present-day team exists by the career start', () => {
    const w = loop.createWorld({ setup: setup({ firstSeasonYear: 1869, historySeasons: 157 }), content: trimmed(), names: NAMES, foundingCurves: generation.defaultFoundingCurves() });
    const dayOne = [...w.teamSpans.values()].filter((s) => s.founded <= 1869).length;
    expect(dayOne).toBeLessThan(w.teams.length);
    expect(w.rosters.size).toBe(dayOne);
    for (const s of w.teamSpans.values()) expect(s.founded).toBeLessThanOrEqual(2026);
    const pro = w.competitions.find((c) => c.level === 'pro')!;
    for (const id of pro.teamIds) expect(w.teamSpans.get(id)!.founded).toBeGreaterThanOrEqual(1920);
  });
});

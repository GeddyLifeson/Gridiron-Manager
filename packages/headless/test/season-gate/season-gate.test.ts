// G-87 season gate harnesses. Seasons here run on the FAKE port (fake-port.ts): the tests cover the
// harness (real schedules and league files, seeds, workers, reports), not football outcomes.
import { describe, expect, it } from 'vitest';
import { season as seasons } from '@gm/world';
import { loadTargets } from '../../src/calibration/index.ts';
import {
  REPO_ROOT, SEASON_MEASURES, buildSeason, buildSeasonReport, formatPhaseSixGate, formatSeasonReport, loadPort, runOneSeason,
  runPhaseSixGate, runSeasons, seasonSeedHex, waitingFor, PARAMS, type SeasonOutcome, type SeasonRunSpec,
} from '../../src/season-gate/index.ts';
import { fakePortRef } from './fake-port.ts';

const SEED = '00c0ffee12345678';
const spec = (ruleSetId: string, over: Partial<SeasonRunSpec> = {}): SeasonRunSpec => ({ ruleSetId, seasonYear: 2026, seasons: 2, masterSeedHex: SEED, port: fakePortRef(), ...over });
const info = (provisionalInputs: readonly string[] = []) => ({ build: 'test', paramsVersion: 'test', masterSeedHex: SEED, seasonsAsked: 2, teamModel: 'FAKE', provisionalInputs });

describe('G-87 season specs from the shipped files', () => {
  it('builds the pro season: 32 clubs, 17 games each, every league rule the bracket reads', () => {
    const b = buildSeason('pro_2026', { season: 2026, seedHex: SEED });
    expect(seasons.seasonProblems(b.spec)).toEqual([]);
    expect(b.spec.teams).toHaveLength(32);
    expect(new Set(b.spec.teams.map((t) => t.conferenceId)).size).toBe(2);
    expect(new Set(b.spec.teams.map((t) => t.divisionId)).size).toBe(8);
    const games = new Map<number, number>();
    for (const f of b.spec.fixtures) for (const t of [f.home, f.away]) games.set(t, (games.get(t) ?? 0) + 1);
    expect([...new Set(games.values())]).toEqual([17]);
    expect(b.spec.fixtures.every((f) => f.dayIndex !== null)).toBe(true);
    // The one provisional input: the last week's kickoff times, which the schedule leaves open for the flex step.
    const open = b.spec.fixtures.filter((f) => f.kickoffMinute === null);
    expect([...new Set(open.map((f) => f.week))]).toEqual([18]);
    expect(b.provisional).toHaveLength(1);
    expect(b.provisional[0]).toMatch(/^kickoff minute 720 for 16 games of week 18/);
  });

  it('builds the college season and names every input no shipped file carries', () => {
    const b = buildSeason('college_2026', { season: 2026, seedHex: SEED });
    expect(seasons.seasonProblems(b.spec)).toEqual([]);
    expect(b.spec.teams).toHaveLength(138);
    const inside = new Set(b.spec.teams.map((t) => t.id));
    const games = new Map<number, number>();
    for (const f of b.spec.fixtures) for (const t of [f.home, f.away]) if (inside.has(t)) games.set(t, (games.get(t) ?? 0) + 1);
    expect([...new Set(games.values())]).toEqual([12]);
    // Guests from outside the competition appear in fixtures and never in the team list.
    expect(b.spec.fixtures.some((f) => !inside.has(f.home) || !inside.has(f.away))).toBe(true);
    expect(b.powerTeamIds.length).toBeGreaterThan(0);
    // PR 216 filled four of the five league keys in collegeleague_2026.json; the fifth is still provisional.
    for (const key of ['ranking.lower_division_wins_credited']) {
      expect(b.provisional.some((p) => p.includes(key))).toBe(true);
    }
    for (const key of ['standings.tie_win_value', 'playoff.reseed', 'cfp.at_large_pool_rank', 'ranking.schedule_standard_games']) {
      expect(b.provisional.some((p) => p.includes(`league rule ${key} `))).toBe(false);
    }
    expect(b.provisional.some((p) => p.startsWith('conference title games'))).toBe(true);
    expect(b.provisional.some((p) => p.startsWith('bowls'))).toBe(true);
  });

  it('refuses a rule set it has no builder for and a seat team that is not in the competition', () => {
    expect(() => buildSeason('pro_1999', { season: 1999, seedHex: SEED })).toThrow(/no season builder/);
    expect(() => buildSeason('pro_2026', { season: 2026, seedHex: SEED, seatTeamKey: 'club.nowhere' })).toThrow(/not in the competition/);
  });
});

describe('G-87 many seasons (Q1.7.2 season level, J13.3.2)', () => {
  it('plays both competitions to a champion with a delegating head coach at the seat', async () => {
    for (const ruleSetId of ['pro_2026', 'college_2026']) {
      const seat = buildSeason(ruleSetId, { season: 2026, seedHex: SEED }).spec.teams[3]!.key;
      const o = runOneSeason(spec(ruleSetId, { seatTeamKey: seat }), 0, await loadPort(fakePortRef(), ruleSetId));
      expect(o.error).toBeNull();
      expect(o.line!.champion).not.toBeNull();
      expect(o.line!.seatWeeks).toBeGreaterThanOrEqual(13);
      expect(o.line!.postseasonGames).toBeGreaterThanOrEqual(11);
    }
  }, 120_000);

  it('gives the same outcomes on one worker and on three, and continues a stopped run', async () => {
    const s = spec('pro_2026', { seasons: 3 });
    const one = await runSeasons(s, { workers: 1 });
    const three = await runSeasons(s, { workers: 3 });
    expect(three).toEqual(one);
    expect(one.map((o) => o.seedHex)).toEqual([0, 1, 2].map((i) => seasonSeedHex(SEED, i)));
    expect(new Set(one.map((o) => o.line!.seasonHash)).size).toBe(3);
    const seen: number[] = [];
    const resumed = await runSeasons(s, { done: [one[1]!], onSeason: (o) => seen.push(o.index) });
    expect(seen).toEqual([0, 2]);
    expect(resumed).toEqual(one);
  }, 180_000);

  it('keeps a season that stops as a failed outcome naming the game, and the report then fails', async () => {
    const outcomes = await runSeasons(spec('pro_2026', { port: fakePortRef({ failAtGame: 40 }) }));
    expect(outcomes.every((o) => !o.ok && o.line === null && o.gamesPlayed === 39)).toBe(true);
    expect(outcomes[0]!.error).toMatch(/^game 40 \(week \d+, regular, seed [0-9a-f]{16}\): FAKE failure/);
    const rep = buildSeasonReport(loadTargets(REPO_ROOT, 'pro_2026'), outcomes, info(), { tieWinValue: 0.5 });
    expect(rep.gate).toBe('fail');
    expect(rep.gateReasons[0]).toBe('2 of 2 seasons stopped before the final game');
    expect(formatSeasonReport(rep)).toContain('Seasons that stopped (first five):');
  }, 60_000);
});

describe('G-87 season-level report (Q1.7.2, J15.10.1)', () => {
  let college: SeasonOutcome[];
  it('measures the college season rows it has a measure for and says what the others wait for', async () => {
    college = await runSeasons(spec('college_2026', { port: fakePortRef({ strongBelow: 40 }) }));
    const provisional = buildSeason('college_2026', { season: 2026, seedHex: SEED }).provisional;
    const rep = buildSeasonReport(loadTargets(REPO_ROOT, 'college_2026'), college, info(provisional), { tieWinValue: 0.5 });
    expect(rep.loaderProblems).toEqual([]);
    expect(rep.seasonsCompleted).toBe(2);
    const measured = rep.rows.filter((r) => r.state === 'measured').map((r) => r.id).sort();
    expect(measured).toEqual(Object.keys(SEASON_MEASURES).sort());
    for (const r of rep.rows.filter((x) => x.state === 'not_measurable')) expect(r.waitingFor).toBeTruthy();
    // 138 teams over 2 seasons.
    expect(rep.rows.find((r) => r.id === 'spread.teamWinPctSd')!.simEvents).toBe(276);
    // Every row is provisional (no Verified college season target), so the level cannot be certified.
    expect(rep.rows.every((r) => r.provisional)).toBe(true);
    expect(rep.gate).not.toBe('pass');
    const text = formatSeasonReport(rep);
    expect(text).toContain('PROVISIONAL inputs in use');
    expect(text).toContain('Not measurable yet, and what each row waits for:');
    expect(text).toContain('pass_touchdowns: seasons that set a new run record, share');
    expect(formatSeasonReport(buildSeasonReport(loadTargets(REPO_ROOT, 'college_2026'), college, info(provisional), { tieWinValue: 0.5 }))).toBe(text);
  }, 180_000);

  it('counts wins inside the competition only, as the target definitions say', () => {
    const line = college[0]!.line!;
    const withGuest = line.teams.find((t) => t.gamesOutside > 0)!;
    expect(withGuest.gamesInside + withGuest.gamesOutside).toBe(12);
    expect(withGuest.winsInside).toBeLessThanOrEqual(withGuest.wins);
    const share = SEASON_MEASURES['schedule.conferenceGameShare']!([line], { tieWinValue: 0.5 })!;
    expect(share.events).toBe(line.insideGames);
    expect(share.value).toBe(line.insideConferenceGames / line.insideGames);
    expect(SEASON_MEASURES['tier.topSubBeatsLower']!([line], { tieWinValue: 0.5 })!.events).toBe(line.guestGames);
    expect(SEASON_MEASURES['tier.powerBeatsOther']!([{ ...line, crossTierGames: 0 }], { tieWinValue: 0.5 })).toBeNull();
  });

  it('marks pro season rows that have no measure here as not measurable, never as passed', async () => {
    const rep = buildSeasonReport(loadTargets(REPO_ROOT, 'pro_2026'), await runSeasons(spec('pro_2026', { seasons: 1 })), info(), { tieWinValue: 0.5 });
    expect(rep.rows.length).toBeGreaterThan(0);
    expect(rep.rows.every((r) => r.pass === null)).toBe(true);
    expect(rep.rows.every((r) => r.state === 'not_measurable' || r.state === 'missing_source')).toBe(true);
    expect(waitingFor('injury.outEpisodesPerTeamSeason')).toMatch(/medical/);
    expect(waitingFor('something.else')).toMatch(/no season measure/);
    expect(rep.gateReasons).toContain('1 of 2 seasons were run');
  }, 60_000);

  it('names the bible leaf for every harness constant', () => {
    for (const p of PARAMS.params) { expect(p.leaf).toMatch(/^Q\d/); expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max); }
  });
});

describe('G-87 phase 6 gate page (R1.2.7)', () => {
  it('lists all five gate items and holds while anything is unproven', async () => {
    const g = await runPhaseSixGate({ build: 'test', masterSeedHex: SEED, seasonYear: 2026, ruleSets: ['pro_2026', 'college_2026'], port: fakePortRef(), seasons: 1, teamModel: 'FAKE' });
    expect(g.items.map((i) => i.number)).toEqual([1, 2, 3, 4, 5]);
    expect(g.verdict).toBe('hold');
    // Item 1: both seasons reach the final game, but each used provisional inputs, so the item holds.
    expect(g.items[0]!.state).toBe('hold');
    expect(g.items[0]!.detail[0]).toMatch(/^pro_2026: 272 regular and 13 postseason games.*HOLD: 1 provisional inputs in use/);
    expect(g.items[0]!.detail[1]).toMatch(/^college_2026: .*HOLD: \d+ provisional inputs in use/);
    // Item 2: the season hash repeats, but one season is not the 1,000 the bible asks for.
    expect(g.items[1]!.state).toBe('fail');
    expect(g.items[1]!.detail.filter((d) => /twice on this platform/.test(d))).toHaveLength(2);
    expect(g.items[1]!.detail[0]).toMatch(/1 of 1000 seasons were run/);
    // Item 3: nothing is bound yet, so nothing passes.
    expect(g.items[2]!.state).toBe('hold');
    expect(g.battery.rows.map((r) => r.item.id)).toEqual(['IN-1', 'IN-2', 'TD-1', 'TD-2', 'DG-1', 'FT-1']);
    expect(g.items[3]!.state).toBe('not_run_here');
    expect(g.items[4]!.state).toBe('not_run_here');
    const text = formatPhaseSixGate(g);
    expect(text).toContain('Verdict: HOLD');
    expect(text).toContain('5. P6.1.1 world-week budget met: NOT RUN HERE');
  }, 240_000);

  it('fails item 1 for a level whose season stops, and says where', async () => {
    const g = await runPhaseSixGate({ build: 'test', masterSeedHex: SEED, seasonYear: 2026, ruleSets: ['pro_2026'], port: fakePortRef({ failAtGame: 7 }), seasons: 1, teamModel: 'FAKE' });
    expect(g.items[0]!.state).toBe('fail');
    expect(g.items[0]!.detail[0]).toMatch(/stopped after 6 games at game 7/);
  }, 60_000);
});

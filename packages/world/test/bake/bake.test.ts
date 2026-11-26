// The master history bake: extractor, format, loader, the shipped file, and the rule that a player's own
// history or rerun never changes baked data (Marlon 2026-11-26).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as bake from '../../src/bake/index.ts';
import { loop, miniWorld, testSchedule, testSystems } from '../fixtures.ts';

type Files = bake.RunFiles;

/** A hand-made master-run folder: `n` seasons ending in 2025, timing exactly 3 ms a game plus 50 ms a season. */
function folder(n = 20, over: Partial<Files['run']> = {}): Files {
  const first = 2026 - n;
  const progress = Array.from({ length: n }, (_, i) => {
    const games = 100 + 10 * i;
    return {
      season: first + i, ms: 3 * games + 50, games, points: games * 44, passPlays: 600, runPlays: 400,
      teamsActive: 10 + i, people: 1000 + 10 * i, hallMembers: Math.max(0, i - 5),
      // Competition 1: team 7 wins every third title, otherwise the season's own team. Competition 2: always team 9.
      champions: { 1: i % 3 === 0 ? 7 : 100 + i, 2: 9 },
    };
  });
  return {
    run: {
      formatVersion: 1, kind: bake.MASTER_RUN_KIND, seedHex: '0000000000001869', size: 'full', firstSeasonYear: first, seasons: n,
      games: 'real', status: 'finished', seasonsRun: n, totalSeconds: 1, worldCode: 'CODE', worldHash: 'abc', unbound: [],
      validation: { pass: true, failures: [] }, ...over,
    },
    progress,
    teams: [
      { id: 1, competitionId: 1, founded: first, folded: null },
      { id: 2, competitionId: 1, founded: first + 3, folded: first + 9 },
      { id: 3, competitionId: 1, founded: first + 12, folded: null },
    ],
    hall: {
      members: [
        { hallId: 'pro', kind: 'player', ballotSeason: first + 5, charter: true },
        { hallId: 'pro', kind: 'coach', ballotSeason: first + 5, charter: true },
        { hallId: 'pro', kind: 'player', ballotSeason: first + 6, charter: false },
      ],
      ballots: [
        { hallId: 'pro', ballotSeason: first + 5, elected: 2 },
        { hallId: 'pro', ballotSeason: first + 6, elected: 1 },
        { hallId: 'pro', ballotSeason: first + 7, elected: 3 },
      ],
    },
    tenures: { completedHeadCoachTenures: [1, 2, 2, 3, 4, 5, 8, 10, 12, 20] },
  };
}

describe('extractor', () => {
  it('computes the sections from a run folder', () => {
    const r = bake.extractRun(folder(20));
    expect(r.seasons).toHaveLength(20);
    expect(r.seasons[0]).toMatchObject({ seasonYear: 2006, games: 100, pointsPerTeamGame: 22, passRate: 0.6, teamsActive: 10 });
    expect(r.timing.msPerGame).toBeCloseTo(3, 6);
    expect(r.timing.seasonMs).toBeCloseTo(50, 6);
    expect(r.tenures).toMatchObject({ count: 10, p50: 4, p90: 12, max: 20, mean: 6.7 });
    expect(r.hall).toMatchObject({ members: 3, players: 2, coaches: 1, charter: 2, firstBallotSeason: 2011 });
    expect(r.hall.classSize).toMatchObject({ count: 2, max: 3 });
    expect(r.teams).toMatchObject({ total: 3, folded: 1, foundedByDecade: { 2000: 1, 2010: 1 }, foldedByDecade: { 2010: 1 } });
    expect(r.teams.foldedLifespan?.p50).toBe(6);
  });
  it('parity counts complete decades only for the bounds', () => {
    const r = bake.extractRun(folder(20));
    // Seasons 2006-2025: decade 2010 is complete (10 seasons), 2000 and 2020 are partial.
    const c1 = r.parity.decades.find((d) => d.competitionId === 1 && d.decadeStart === 2010)!;
    expect(c1.seasons).toBe(10);
    // 2010-2019 is i = 4..13: team 7 wins at i = 6, 9, 12; the other 7 seasons each have their own champion.
    expect(c1).toMatchObject({ distinctChampions: 8, topShare: 0.3 });
    expect(r.parity.minDistinctChampions).toBe(1); // competition 2: one team every season
    expect(r.parity.maxTopShare).toBe(1);
  });
  it('refuses dry runs unless asked, and then marks them provisional', () => {
    const dry = folder(5, { kind: 'DRY RUN WITH THE TEST DOUBLE GAME PORT: NOT FOR BAKING', games: 'test' });
    expect(() => bake.extractRun(dry)).toThrow(/dry run/);
    const r = bake.extractRun(dry, { allowDry: true });
    expect(r.provisional).toBe(true);
    expect(r.provisionalReasons.join(' ')).toMatch(/test-double/);
  });
  it('refuses unknown formats and broken season rows; a killed run (still "running") bakes as provisional', () => {
    expect(() => bake.extractRun(folder(5, { formatVersion: 2 }))).toThrow(/formatVersion 2/);
    const killed = bake.extractRun(folder(157, { status: 'running', worldHash: undefined }));
    expect(killed.provisionalReasons.join(' ')).toMatch(/status is running after 157 seasons.*no final world hash/);
    const gap = folder(5);
    expect(() => bake.extractRun({ ...gap, progress: [gap.progress[0]!, gap.progress[2]!] , run: { ...gap.run, seasonsRun: 2 } })).toThrow(/does not follow/);
  });
  it('a short or failing run is provisional; a full finished real run is not', () => {
    const short = bake.extractRun(folder(20));
    expect(short.provisional).toBe(true);
    expect(short.provisionalReasons.join(' ')).toMatch(/20 of the 157 seasons/);
    const full = bake.extractRun(folder(157));
    expect(full.provisionalReasons).toEqual([]);
    expect(bake.extractRun(folder(157, { validation: { pass: false, failures: ['dull'] } })).provisionalReasons.join(' ')).toMatch(/validator failed: dull/);
    expect(bake.extractRun(folder(157, { unbound: ['moves', { step: 'news', reason: 'not bound' }] })).provisionalReasons.join(' ')).toMatch(/not bound: moves, news/);
  });
  it('is deterministic: the same run gives the same digest whatever the key order', () => {
    const a = bake.extractBake([folder(20)]);
    const f = folder(20);
    const reordered = { tenures: f.tenures, hall: f.hall, teams: f.teams, progress: f.progress, run: Object.fromEntries(Object.entries(f.run).reverse()) } as Files;
    expect(bake.extractBake([reordered]).digest).toBe(a.digest);
    expect(bake.extractBake([folder(21)]).digest).not.toBe(a.digest);
  });
  it('bakes one run per size and is provisional without a master-size run', () => {
    const small = folder(20, { size: 'small' });
    expect(() => bake.extractBake([small, small])).toThrow(/two runs for size small/);
    const b = bake.extractBake([folder(157), small]);
    expect(Object.keys(b.runs).sort()).toEqual(['full', 'small']);
    expect(b.provisional).toBe(false);
    expect(bake.extractBake([small]).provisional).toBe(true);
  });
});

describe('loader', () => {
  const json = (): any => JSON.parse(JSON.stringify(bake.extractBake([folder(157), folder(20, { size: 'small' })])));
  it('loads a good bake and deep-freezes it', () => {
    const b = bake.loadBakedHistory(json());
    expect(Object.isFrozen(b)).toBe(true);
    expect(Object.isFrozen(b.runs.full!.seasons[0])).toBe(true);
    expect(() => { (b.runs.full!.seasons[0] as any).games = 1; }).toThrow();
  });
  it('refuses a changed number, an unknown version, or a missing piece', () => {
    const j = json(); j.runs.full.seasons[3].games += 1;
    expect(() => bake.loadBakedHistory(j)).toThrow(/digest/);
    const v = json(); v.formatVersion = 2;
    expect(() => bake.loadBakedHistory(v)).toThrow(/formatVersion 2/);
    const m = json(); delete m.runs;
    expect(() => bake.loadBakedHistory(m)).toThrow(/no runs/);
  });
  it('estimates history time from the last seasons of the run, scaled by the machine', () => {
    const b = bake.loadBakedHistory(json());
    // The last season of the full run has 100 + 10 * 156 = 1,660 games: 3 * 1660 + 50 = 5,030 ms.
    expect(bake.estimateHistorySeconds(b, { seasons: 1, size: 'full' })).toEqual({ seconds: 5, provisional: false, basis: 'measured' });
    expect(bake.estimateHistorySeconds(b, { seasons: 1, size: 'full', benchmarkRatio: 2 })!.seconds).toBe(10.1);
    expect(bake.estimateHistorySeconds(b, { seasons: 0, size: 'full' })!.seconds).toBe(0);
    expect(bake.estimateHistorySeconds(b, { seasons: 5, size: 'small' })!.provisional).toBe(true);
    expect(bake.estimateHistorySeconds(b, { seasons: 5, size: 'standard' })!.basis).toBe('other-size');
    expect(() => bake.estimateHistorySeconds(b, { seasons: -1, size: 'full' })).toThrow();
  });
  it('shapeAt reads the season that many back from the career start, clamped to the run', () => {
    const b = bake.loadBakedHistory(json());
    expect(shape(b, 1)).toMatchObject({ seasonYear: 2025, teamsActive: 166 });
    expect(shape(b, 30)).toMatchObject({ seasonYear: 1996 });
    expect(shape(b, 500)).toMatchObject({ seasonYear: 1869 });
    expect(bake.shapeAt(b, 5, 'standard')).toBeNull();
    expect(bake.parityBounds(b)).toMatchObject({ minDistinctChampions: 1, maxTopShare: 1, provisional: false });
  });
  const shape = (b: bake.BakedHistory, back: number) => bake.shapeAt(b, back);
});

describe('the shipped bake', () => {
  const file = new URL('../../src/bake/data/master-history.json', import.meta.url);
  it('loads, matches its digest, and says whether it is provisional', () => {
    const b = bake.bakedHistory();
    expect(b.digest).toBe(JSON.parse(readFileSync(file, 'utf8')).digest);
    expect(bake.bakeDigest(b)).toBe(b.digest);
    expect(typeof b.provisional).toBe('boolean');
    expect(bake.bakedHistory()).toBe(b);
  });
  it('a player history and its reruns never change baked data (acceptance)', () => {
    const before = readFileSync(file);
    const b = bake.bakedHistory();
    const snapshot = JSON.stringify(b);
    // Three drafts of a player's own history (rerun 0, 1, 2) and a plain run, all through the real loop.
    for (let rerun = 0; rerun < 3; rerun++) {
      const draft = loop.draftHistory('00000000000000a7', rerun, (seedHex, step) => ({
        world: miniWorld({ seedHex, historySeasons: 6 }, step), systems: testSystems(), plan: { seasons: 6, schedule: testSchedule },
      }));
      expect(draft.built.world.seasons).toHaveLength(6);
    }
    loop.runHistory(miniWorld({ historySeasons: 4 }), testSystems(), { seasons: 4, schedule: testSchedule });
    expect(bake.bakedHistory()).toBe(b);
    expect(JSON.stringify(bake.bakedHistory())).toBe(snapshot);
    expect(bake.bakeDigest(bake.bakedHistory())).toBe(b.digest);
    expect(readFileSync(file).equals(before)).toBe(true);
    expect(Object.isFrozen(b.runs)).toBe(true);
  });
  it('only the bake module reads the shipped file and only the bake tool calls the extractor', () => {
    const root = new URL('../../../', import.meta.url).pathname;
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (n === 'node_modules' || n === 'data') continue;
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.tsx?$/.test(n) || p.includes(`${join('world', 'src', 'bake')}`) || p.includes(join('world', 'test', 'bake'))) continue;
        const text = readFileSync(p, 'utf8');
        if (/master-history\.json/.test(text) || /bake\/extract/.test(text)) offenders.push(p.slice(root.length));
      }
    };
    for (const pkg of readdirSync(root)) if (statSync(join(root, pkg, 'src'), { throwIfNoEntry: false })?.isDirectory()) walk(join(root, pkg, 'src'));
    expect(offenders).toEqual([]);
  });
});

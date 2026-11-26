// Save size at season 30 against P5.4.1 (G-83 acceptance). Three parts:
//  1. the leaf's own planning arithmetic, reproduced;
//  2. a 30-season run of a real save through the archive step, proving the retention windows hold
//     (play rows stop growing; only the forever categories grow);
//  3. the size of real play rows and game inputs from the phase 1 engine game, measured, and the
//     season-30 projection rebuilt from those measurements.
// The full measurement at the default world size is G-88's 30-season run (Q1.6.1); this is the
// measured starting point the leaf's open question asks for ("measured row and blob sizes").
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { realGame } from '@gm/headless';
import { runSeasonArchive } from '../../src/retention/archive.ts';
import { PLANNING, SIZE_TARGETS } from '../../src/retention/params.ts';
import { measureSave, planningModel, projectSize, type SizeModel } from '../../src/retention/size.ts';
import { SaveFile } from '../../src/save/save-file.ts';
import { CHAIN_GENESIS, bytesHash, chainNext, stateHash } from '@gm/engine-core';
import { memoryDb } from '../save/helpers.ts';
import { VERSIONS, closeCmd, cmd, leagueSave, userGameIds, type LeagueShape } from './world.ts';

const MB = 1_000_000;
const report = (label: string, v: unknown) => process.stderr.write(`[G-83 size] ${label}: ${JSON.stringify(v)}\n`);

describe('P5.4.1 planning arithmetic', () => {
  const m = planningModel();
  it('reproduces the leaf: 189,000 play rows and 113 MB a season, 226 MB for two seasons, 44 MB of game inputs', () => {
    expect(PLANNING.gamesPerSeason * PLANNING.playsPerGame).toBe(188_700);
    expect(Math.round(m.playRowsPerSeason / MB)).toBe(113);
    const s30 = projectSize(m, 'standard', 30);
    expect(Math.round(s30.parts.playRows / MB)).toBe(226);
    expect(Math.round(s30.parts.gameInputs / MB)).toBe(44);
    expect(Math.round(s30.parts.userFilm / MB)).toBe(25);
    expect(Math.round(s30.parts.log / MB)).toBe(180);
  });
  it('meets the standard targets at season 1 and season 30 by its own figures', () => {
    const s1 = projectSize(m, 'standard', 1);
    const s30 = projectSize(m, 'standard', 30);
    report('planning standard', { season1MB: Math.round(s1.total / MB), season30MB: Math.round(s30.total / MB) });
    expect(s1.withinTarget).toBe(true);
    expect(s30.withinTarget).toBe(true);
    expect(s30.target).toBe(SIZE_TARGETS.standardSeason30);
  });
  it('shows why the leaf\'s 300 MB compact target was out of reach, and meets Marlon\'s 600 MB (2026-11-26)', () => {
    const c = projectSize(m, 'compact', 30);
    report('planning compact season 30', { totalMB: Math.round(c.total / MB), logMB: Math.round(c.parts.log / MB), summariesMB: Math.round(c.parts.summaries / MB), targetMB: SIZE_TARGETS.compactSeason30 / MB });
    // Log (180 MB) plus summaries (100 MB) plus live state (60 MB) alone pass the leaf's 300 MB.
    expect(c.parts.log + c.parts.summaries + c.parts.liveState).toBeGreaterThan(300 * MB);
    expect(SIZE_TARGETS.compactSeason30).toBe(600 * MB);
    // With the leaf's uncompressed 600 B play rows the projection is 617 MB; with play rows packed per
    // game, as measured below, compact meets 600 MB.
    expect(c.withinTarget).toBe(false);
  });
});

describe('30 seasons through the archive step', () => {
  it('keeps two seasons of other games\' play rows and every user play row, season after season', async () => {
    const shape: LeagueShape = { gamesPerSeason: 16, playsPerGame: 20, padBytes: 200 };
    const driver = await memoryDb();
    const save = await leagueSave(driver, 'standard', shape);
    const series: { season: number; plays: number; file: number; log: number; summaries: number }[] = [];
    for (let s = 1; s <= 30; s++) {
      const r = await save.issue(cmd(save, 'league.PlaySeason', { postseason: s % 5 === 0 }), { advancesTime: true, checkpoint: { kind: 'week', ...VERSIONS } });
      expect(r.ok).toBe(true);
      const a = await runSeasonArchive(save, { seasonYear: save.state().calendar.seasonYear, versions: VERSIONS, closeCommand: closeCmd(save, 'standard') });
      expect(a.failure).toBeNull();
      const w = save.state();
      const user = userGameIds(w);
      const cur = w.calendar.seasonYear;
      const seasonOf = new Map(w.games.map((g) => [g.id, g.seasonYear]));
      // Every non-user play row left is from the season just closed (the new season has no games yet).
      for (const p of w.plays) if (!user.has(p.gameId)) expect(seasonOf.get(p.gameId)!).toBeGreaterThanOrEqual(cur - 1);
      const size = await measureSave(driver);
      series.push({ season: s, plays: size.world.plays ?? 0, file: size.file, log: size.log + size.logArchive, summaries: size.world.seasonSummaries ?? 0 });
    }
    const allUserRows = save.state().games.filter((g) => g.teamIds.includes(1)).length * shape.playsPerGame;
    expect(save.state().plays.filter((p) => userGameIds(save.state()).has(p.gameId)).length).toBe(allUserRows);
    // Play-row bytes grow only by the user's games after the window fills.
    const s3 = series[2]!.plays;
    const s30 = series[29]!.plays;
    const userPerSeason = (s30 - s3) / 27;
    expect(userPerSeason).toBeLessThan(s3 / 2);
    report('30-season run (16 games x 20 plays a season)', { season3: series[2], season30: series[29] });
    for (const sn of await save.snapshots()) expect((await save.verifyByReplay(sn.id)).problems).toEqual([]);
  }, 240_000);
});

describe('measured row sizes from the phase 1 engine game', () => {
  it('measures real play rows and game inputs, stored and compressed, and projects season 30', async () => {
    // Reference resolver: the untuned tick engine plays about 155 pro plays a game (real: 124), which would
    // overstate the rows. Retake this on the tick path once the stat gate passes.
    const g = realGame.createRealGame('pro_2026', { resolver: 'reference' });
    const games = 3;
    let plays = 0; let rawPlayBytes = 0; let zPlayBytes = 0; let rawInput = 0; let zInput = 0;
    const records: unknown[] = [];
    for (let i = 0; i < games; i++) {
      const input = g.input(i, `0000000000000${(0xa10 + i).toString(16)}`);
      const r = g.simulate(input);
      plays += r.records.length;
      rawPlayBytes += r.records.reduce((a, p) => a + JSON.stringify(p).length, 0);
      zPlayBytes += deflateSync(JSON.stringify(r.records)).length;
      rawInput += JSON.stringify(input).length;
      zInput += deflateSync(JSON.stringify(input)).length;
      records.push(...r.records);
    }
    // Stored bytes per row as the save core lays them out (one state row per play, key and JSON).
    const driver = await memoryDb();
    const text = new TextEncoder();
    const deps = {
      apply: () => ({ ok: false as const, reason: 'read only' }), stateHash, bytesHash, eventsHash: (e: readonly unknown[]) => bytesHash(text.encode(JSON.stringify(e))), chainNext, genesis: CHAIN_GENESIS,
    };
    const header = { ...VERSIONS, masterSeed: '00000000000000e4', generatorOptions: {}, contentManifest: [], ruleSets: [], settings: { worldSize: 'small' as const, retentionProfile: 'standard' as const }, certified: false, calendar: { seasonYear: 2026, dayIndex: 0 }, userPersonId: null, userJob: null, summary: '', createdWith: 't', lastWrittenWith: 't' };
    const save = await SaveFile.create(driver, deps, { header, state: { plays: records }, versions: VERSIONS }, { packedTables: [] });
    const stored = (await measureSave(driver)).world.plays!;
    await save.close();
    // The same rows as format 3 stores them: one compressed blob per game.
    const packedDriver = await memoryDb();
    const packedSave = await SaveFile.create(packedDriver, deps, { header, state: { plays: records }, versions: VERSIONS });
    const packedSize = await measureSave(packedDriver);
    const packedStored = packedSize.world.plays!;
    const groups = (await packedDriver.all<{ n: number }>("SELECT COUNT(*) AS n FROM packed_rows WHERE tbl = 'plays'"))[0]!.n;
    expect(groups).toBe(games);
    expect(packedSize.packedRaw).toBeGreaterThan(stored * 0.9);
    expect(JSON.stringify((await SaveFile.open(packedDriver, deps)).state())).toBe(JSON.stringify({ plays: records }));
    await packedSave.close();

    const perGame = plays / games;
    const m = {
      playsPerGame: perGame,
      storedBytesPerPlay: stored / plays,
      rawBytesPerPlay: rawPlayBytes / plays,
      deflatedBytesPerPlay: zPlayBytes / plays,
      packedBytesPerPlay: packedStored / plays,
      rawInputBytes: rawInput / games,
      deflatedInputBytes: zInput / games,
    };
    report('measured', m);
    expect(perGame).toBeGreaterThan(100);

    const plan = planningModel();
    const withRows = (bytesPerPlay: number, inputBytes: number): SizeModel => ({
      ...plan,
      playRowsPerSeason: PLANNING.gamesPerSeason * perGame * bytesPerPlay,
      userGameShare: plan.userGameShare,
      gameInputsPerSeason: PLANNING.gamesPerSeason * inputBytes,
    });
    const asStored = withRows(m.storedBytesPerPlay, m.rawInputBytes);
    const compressed = withRows(m.packedBytesPerPlay, m.deflatedInputBytes);
    const out: Record<string, unknown> = {};
    for (const [name, model] of [['rows as stored today', asStored], ['rows packed per game (format 3, measured in the save)', compressed]] as const) {
      for (const [profile, season] of [['standard', 1], ['standard', 30], ['compact', 30]] as const) {
        const p = projectSize(model, profile, season);
        out[`${name} / ${profile} s${season}`] = { totalMB: Math.round(p.total / MB), playRowsMB: Math.round((p.parts.playRows + p.parts.userPlayRows) / MB), targetMB: p.target === null ? null : p.target / MB, within: p.withinTarget };
      }
    }
    report('season-30 projection from measured rows', out);
    // Compressed per game, the measured rows fit the standard targets.
    expect(projectSize(compressed, 'standard', 30).withinTarget).toBe(true);
    expect(projectSize(compressed, 'standard', 1).withinTarget).toBe(true);
    expect(projectSize(compressed, 'compact', 30).withinTarget).toBe(true);
    // The save's packed bytes match an independent deflate of the same rows within 5 %.
    expect(Math.abs(m.packedBytesPerPlay - m.deflatedBytesPerPlay) / m.deflatedBytesPerPlay).toBeLessThan(0.05);
  }, 240_000);
});

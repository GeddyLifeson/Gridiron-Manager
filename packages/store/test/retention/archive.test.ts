import { describe, expect, it } from 'vitest';
import { ARCHIVE_STAGES, CLOSE_SEASON_COMMAND, META_ARCHIVE_PROGRESS, runSeasonArchive, type ArchiveStage } from '../../src/retention/archive.ts';
import { bytesHash } from '@gm/engine-core';
import { readLog } from '../../src/log/archive.ts';
import { SaveFile } from '../../src/save/save-file.ts';
import { memoryDb, reopen } from '../save/helpers.ts';
import { VERSIONS, closeCmd, cmd, leagueDeps, leagueSave, type LeagueWorld } from './world.ts';

async function playedSave(seasons = 3) {
  const driver = await memoryDb();
  const save = await leagueSave(driver);
  for (let i = 0; i < seasons; i++) {
    const r = await save.issue(cmd(save, 'league.PlaySeason', { postseason: i === 1 }), { advancesTime: true, checkpoint: { kind: 'week', ...VERSIONS } });
    if (!r.ok) throw new Error(r.reason);
    if (i < seasons - 1) {
      const a = await runSeasonArchive(save, { seasonYear: save.state().calendar.seasonYear, versions: VERSIONS, closeCommand: closeCmd(save, 'standard') });
      if (!a.ok) throw new Error(a.failure ?? 'archive failed');
    }
  }
  return { driver, save };
}

/** Close commands in the whole log, archived seasons included. */
const closeRows = async (save: SaveFile<LeagueWorld>) => (await readLog(save.driver, bytesHash)).filter((r) => r.type === CLOSE_SEASON_COMMAND).length;

describe('season archive step (P5.4.2)', () => {
  it('runs the eight stages in order and summary totals equal totals recomputed from play rows before thinning', async () => {
    const { save } = await playedSave(3);
    const before = save.state();
    const y = before.calendar.seasonYear;
    const seasonGames = new Set(before.games.filter((g) => g.seasonYear === y).map((g) => g.id));
    const expected = new Map<number, number>();
    for (const p of before.plays) if (seasonGames.has(p.gameId)) expected.set(p.carrierId, (expected.get(p.carrierId) ?? 0) + p.yards);

    const r = await runSeasonArchive(save, { seasonYear: y, versions: VERSIONS, closeCommand: closeCmd(save, 'standard') });
    expect(r.failure).toBeNull();
    expect(r.ok).toBe(true);
    expect(r.stagesRun).toEqual([...ARCHIVE_STAGES]);
    const after = save.state();
    const summaries = after.seasonSummaries.filter((s) => s.seasonYear === y);
    expect(summaries.length).toBe(expected.size);
    for (const s of summaries) expect(s.yards, `person ${s.personId}`).toBe(expected.get(s.personId));
    expect(after.calendar.seasonYear).toBe(y + 1);
    // The season-start snapshot and its chain row (stage 8).
    const snaps = await save.snapshots();
    expect(snaps.at(-1)).toMatchObject({ kind: 'season', logSeq: save.lastSeq() });
    for (const s of snaps) expect((await save.verifyByReplay(s.id)).problems, `snapshot ${s.id}`).toEqual([]);
    expect(await save.verifyLive()).toEqual([]);
  });

  it('refuses to thin when derived statistics differ from the play rows (stage 1)', async () => {
    const { save } = await playedSave(2);
    await save.issue(cmd(save, 'league.CorruptStats', {}));
    const plays = save.state().plays.length;
    const r = await runSeasonArchive(save, { seasonYear: save.state().calendar.seasonYear, versions: VERSIONS, closeCommand: closeCmd(save, 'standard') });
    expect(r.ok).toBe(false);
    expect(r.failure).toMatch(/differ from the play rows/);
    expect(save.state().plays.length).toBe(plays);
    expect(r.stagesRun).toEqual([]);
  });

  it('refuses a close command that names another season', async () => {
    const { save } = await playedSave(1);
    const r = await runSeasonArchive(save, { seasonYear: 1999, versions: VERSIONS, closeCommand: closeCmd(save, 'standard') });
    expect(r).toMatchObject({ ok: false, failure: 'the close command must name the season it closes' });
  });

  const stops: ArchiveStage[] = ['delete', 'content', 'compact'];
  for (const stop of stops) {
    it(`resumes after a crash at stage "${stop}" and ends where an uninterrupted run ends`, async () => {
      const clean = await playedSave(3);
      const y = clean.save.state().calendar.seasonYear;
      const full = await runSeasonArchive(clean.save, { seasonYear: y, versions: VERSIONS, closeCommand: closeCmd(clean.save, 'standard') });
      expect(full.ok).toBe(true);

      const crashed = await playedSave(3);
      const close = closeCmd(crashed.save, 'standard');
      const part = await runSeasonArchive(crashed.save, { seasonYear: y, versions: VERSIONS, closeCommand: close, stopAfter: stop });
      expect(part.ok).toBe(false);
      // The process dies here; the file is opened again from its bytes.
      const driver = await reopen(crashed.driver);
      const save = await SaveFile.open(driver, leagueDeps());
      const resumed = await runSeasonArchive(save, { seasonYear: y, versions: VERSIONS, closeCommand: close });
      expect(resumed.ok).toBe(true);
      expect(resumed.stagesSkipped).toEqual(ARCHIVE_STAGES.slice(0, ARCHIVE_STAGES.indexOf(stop) + 1));
      expect(await closeRows(save)).toBe(await closeRows(clean.save));
      expect(leagueDeps().stateHash(save.state())).toBe(leagueDeps().stateHash(clean.save.state()));
      expect(save.chainHead()).toBe(clean.save.chainHead());
      const progress = JSON.parse((await driver.all<{ value: string }>('SELECT value FROM save_meta WHERE key = ?', [META_ARCHIVE_PROGRESS]))[0]!.value) as { done: string[] };
      expect(progress.done).toEqual([...ARCHIVE_STAGES]);
      // A third call does nothing.
      const again = await runSeasonArchive(save, { seasonYear: y, versions: VERSIONS, closeCommand: close });
      expect(again.stagesRun).toEqual([]);
      expect(save.chainHead()).toBe(clean.save.chainHead());
    });
  }

  it('removes unreferenced content copies and compresses closed seasons of the log', async () => {
    const { save, driver } = await playedSave(4);
    await driver.transaction([{ sql: "INSERT INTO content (hash, kind, body) VALUES ('orphan', 'playbook', '{}')" }]);
    const r = await runSeasonArchive(save, { seasonYear: save.state().calendar.seasonYear, versions: VERSIONS, closeCommand: closeCmd(save, 'standard') });
    expect(r.ok).toBe(true);
    expect(r.contentRemoved).toBe(1);
    const archived = await driver.all<{ season_year: number }>('SELECT season_year FROM command_log_archive ORDER BY first_seq');
    expect(archived.length).toBeGreaterThan(0);
    for (const s of await save.snapshots()) expect((await save.verifyByReplay(s.id)).problems).toEqual([]);
  });
});

// The live world in the .gmsave (P5): a career year written through WorldService survives the file being
// closed and reopened with the same world hash, plays on the same way, and a tampered save is refused.
import { readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { describe, it, expect } from 'vitest';
import initSqlJs from 'sql.js';
import { SqlJsDriver, type SqlDriver } from '@gm/store';
import { generation, loop, season as seasons, turnover } from '@gm/world';
import { WorldService, type Platform } from '../../src/index.ts';
import { CareerYear, LIVE_WORLD_BLOB_TABLE, LIVE_WORLD_TABLE } from '../../src/play/index.ts';
import { appWorldContent } from '../../src/newgame/content.ts';

const ROOT = resolvePath(import.meta.dirname, '../../../..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (...p: string[]): any => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
const CONTENT: seasons.LeagueContent = {
  proLeague: read('packages', 'football-content', 'data', 'world', 'pro-league.json'),
  college: read('packages', 'football-content', 'data', 'world', 'college.json'),
  proLeagueRules: read('packages', 'rules-data', 'data', 'league', 'proleague_2026.json'),
  collegeLeagueRules: read('packages', 'rules-data', 'data', 'league', 'collegeleague_2026.json'),
};

/** TEST DOUBLE for the world's own games (not a result model): home wins by a point, so the loop has rows. */
const doubleGames: loop.GamePort = () => ({ homePoints: 1, awayPoints: 0, passPlays: 0, runPlays: 0 });

class MemoryPlatform implements Platform {
  readonly kind = 'headless' as const;
  files = new Map<string, Uint8Array>();
  async openSave(name: string, create: boolean): Promise<SqlDriver> {
    const SQL = await initSqlJs();
    const f = this.files.get(name);
    if (create && f) throw new Error('exists');
    if (!create && !f) throw new Error('missing');
    return SqlJsDriver.open(SQL, f);
  }
  async flushSave(name: string, d: SqlDriver) { this.files.set(name, await d.exportBytes!()); }
  async listSaves() { return [...this.files].map(([name, b]) => ({ name, sizeBytes: b.length })); }
  async deleteSave(name: string) { this.files.delete(name); }
  async exportSave(name: string) { return this.files.get(name)!; }
  async importSave(name: string, b: Uint8Array) { this.files.set(name, b); }
  appVersion() { return 'test'; }
}

function freshWorld(): loop.LiveWorld {
  const app = appWorldContent();
  const setup = generation.createSetup({
    seedHex: '00000000c0ffee02', size: 'small', historySeasons: 1, packs: [], careerCurveDial: null, rulebookEra: 'era:2026',
    eraProgression: false, firstSeasonYear: 2026,
  });
  return loop.createWorld({ setup, content: app.content, names: app.names, eventTypes: turnover.TURNOVER_EVENT_TYPES });
}

describe('live world in the save file', () => {
  it('writes the career year into the .gmsave, reopens it with the same world hash, and plays on alike', async () => {
    const world = freshWorld();
    const seat = world.teams.find((t) => turnover.levelOfTeam(world, t.id) === 'pro')!.id;
    const y = CareerYear.start({ world, content: CONTENT, seatTeamId: seat, games: doubleGames });
    for (let i = 0; i < 2; i++) y.delegateWeek();

    const p = new MemoryPlatform();
    const svc = await WorldService.newCareer(p, { saveName: 'c', masterSeedHex: '00000000c0ffee02', startSeasonYear: 2026 });
    expect(await svc.liveWorldMeta()).toBeNull();
    expect(await svc.loadCareerYear({ content: CONTENT, games: doubleGames })).toBeNull();
    const meta = await svc.saveCareerYear(y);
    expect(meta.worldHash).toBe(y.view().worldHash);
    expect(meta.seasonYear).toBe(2026);
    await svc.close();

    // Reopen from the bytes alone; the command log still replays.
    const svc2 = await WorldService.load(p, 'c');
    expect((await svc2.verify()).ok).toBe(true);
    expect(await svc2.liveWorldMeta()).toEqual(meta);
    const back = (await svc2.loadCareerYear({ content: CONTENT, games: doubleGames }))!;
    expect(back.view().worldHash).toBe(y.view().worldHash);
    y.delegateWeek(); back.delegateWeek();
    expect(back.view().worldHash).toBe(y.view().worldHash);

    // Writing again replaces the copy.
    const meta2 = await svc2.saveCareerYear(back);
    expect(meta2.worldWeek).toBe(meta.worldWeek + 1);
    await svc2.close();

    // Version 2: world chunks are stored compressed, and they are much smaller than their JSON.
    const SQL = await initSqlJs();
    const db = new SQL.Database(p.files.get('c'));
    const plainWorld = db.exec(`SELECT COUNT(*) FROM ${LIVE_WORLD_TABLE} WHERE part LIKE 'world:%'`)[0]!.values[0]![0];
    expect(plainWorld).toBe(0);
    const [stored, raw] = db.exec(`SELECT SUM(length(blob)), SUM(raw_len) FROM ${LIVE_WORLD_BLOB_TABLE}`)[0]!.values[0]! as number[];
    expect(stored! * 3).toBeLessThan(raw!);

    // A version 1 save (every part plain JSON in one table) still opens with the same world.
    const v1 = new SQL.Database(p.files.get('c'));
    const rows = await (await p.openSave('c', false)).all<{ part: string }>(`SELECT part FROM ${LIVE_WORLD_BLOB_TABLE}`);
    const svc4 = await WorldService.load(p, 'c');
    const y4 = (await svc4.loadCareerYear({ content: CONTENT, games: doubleGames }))!;
    await svc4.close();
    const plain = new Map<string, string>();
    for (const r of rows) {
      const blob = v1.exec(`SELECT blob FROM ${LIVE_WORLD_BLOB_TABLE} WHERE part = ?`, [r.part])[0]!.values[0]![0] as Uint8Array;
      const { inflateRawSync } = await import('node:zlib');
      plain.set(r.part, inflateRawSync(blob).toString('utf8'));
    }
    v1.run(`DROP TABLE ${LIVE_WORLD_BLOB_TABLE}`);
    for (const [part, json] of plain) v1.run(`INSERT INTO ${LIVE_WORLD_TABLE} (part, json) VALUES (?, ?)`, [part, json]);
    const m1 = JSON.parse(String(v1.exec(`SELECT json FROM ${LIVE_WORLD_TABLE} WHERE part = 'meta'`)[0]!.values[0]![0]));
    v1.run(`UPDATE ${LIVE_WORLD_TABLE} SET json = ? WHERE part = 'meta'`, [JSON.stringify({ ...m1, version: 1 })]);
    p.files.set('v1', v1.export());
    const svc5 = await WorldService.load(p, 'v1');
    expect((await svc5.loadCareerYear({ content: CONTENT, games: doubleGames }))!.view().worldHash).toBe(y4.view().worldHash);
    await svc5.close();

    // A save whose world does not match its recorded hash is refused.
    const m = JSON.parse(String(db.exec(`SELECT json FROM ${LIVE_WORLD_TABLE} WHERE part = 'meta'`)[0]!.values[0]![0]));
    db.run(`UPDATE ${LIVE_WORLD_TABLE} SET json = ? WHERE part = 'meta'`, [JSON.stringify({ ...m, worldHash: 'not-the-hash' })]);
    p.files.set('c', db.export());
    const svc3 = await WorldService.load(p, 'c');
    await expect(svc3.loadCareerYear({ content: CONTENT, games: doubleGames })).rejects.toThrow(/hashes/);
    await svc3.close();
  }, 600_000);
});

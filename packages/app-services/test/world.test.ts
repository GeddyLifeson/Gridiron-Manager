import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { SqlJsDriver, type SqlDriver } from '@gm/store';
import { WorldService, type Platform } from '../src/index.ts';

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

describe('world service and save (P1.1.3, P5)', () => {
  it('creates an empty world with both rule sets and reloads it with a clean replay', async () => {
    const p = new MemoryPlatform();
    const svc = await WorldService.newCareer(p, { saveName: 's', masterSeedHex: '00000000000000aa', startSeasonYear: 2026 });
    expect((await svc.run('AdvanceDay', { days: 366 })).ok).toBe(true);
    const sum = svc.worldSummary().data;
    expect(sum.competitions.map((c) => c.ruleSetId)).toEqual(['college_2026', 'pro_2026']);
    expect(sum.calendar).toEqual({ seasonYear: 2027, dayIndex: 1 });
    await svc.close();
    const again = await WorldService.load(p, 's');
    expect(again.worldSummary().data.stateHash).toBe(sum.stateHash);
    expect((await again.verify()).ok).toBe(true);
  });
  it('a rejected command is not logged and returns a reason', async () => {
    const p = new MemoryPlatform();
    const svc = await WorldService.newCareer(p, { saveName: 's', masterSeedHex: '00000000000000aa', startSeasonYear: 2026 });
    const r = await svc.run('AdvanceDay', { days: 0 });
    expect(r.ok).toBe(false);
    const r2 = await svc.run('CreateWorld', { masterSeedHex: '00000000000000aa', startSeasonYear: 2026, competitions: [{ name: 'X', level: 'pro', ruleSetId: 'college_2026', leagueRulesId: 'pro_league_2026' }] });
    expect(r2.ok).toBe(false);
    expect((await svc.verify()).commands).toBe(1);
  });
  it('an outside edit to the world tables is detected at load (P5.3.2 acceptance)', async () => {
    const p = new MemoryPlatform();
    const svc = await WorldService.newCareer(p, { saveName: 's', masterSeedHex: '00000000000000aa', startSeasonYear: 2026 });
    await svc.close();
    const SQL = await initSqlJs();
    const db = new SQL.Database(p.files.get('s'));
    db.run("UPDATE world_state SET json = replace(json, '\"seasonYear\":2026', '\"seasonYear\":2030') WHERE key = 'world'");
    p.files.set('s', db.export());
    await expect(WorldService.load(p, 's')).rejects.toThrow(/integrity/);
  });
  it('a save from a newer format opens read-only for the header and is refused (P5.1.1 edge case)', async () => {
    const p = new MemoryPlatform();
    const svc = await WorldService.newCareer(p, { saveName: 's', masterSeedHex: '00000000000000aa', startSeasonYear: 2026 });
    await svc.close();
    const SQL = await initSqlJs();
    const db = new SQL.Database(p.files.get('s'));
    db.run('UPDATE header SET save_format_version = 99');
    p.files.set('s', db.export());
    await expect(WorldService.load(p, 's')).rejects.toThrow(/newer version/);
  });
  it('the save header holds no difficulty or pacing setting', async () => {
    const p = new MemoryPlatform();
    const svc = await WorldService.newCareer(p, { saveName: 's', masterSeedHex: '00000000000000aa', startSeasonYear: 2026 });
    expect(Object.keys(svc.saveHeader().settings).sort()).toEqual(['retentionProfile', 'worldSize']);
  });
});

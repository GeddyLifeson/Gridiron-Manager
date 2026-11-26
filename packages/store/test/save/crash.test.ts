// P5.8.1 acceptance: "A test that kills the process at 1,000 random points during a simulated season
// always reloads to a state whose hash matches a clean run to the same log position."
//
// Two tests. The first models the kill in-process, so it can afford 1,000 points on every run: the
// "disk" is the database image after the last committed transaction, and a kill throws away
// everything else. The second kills a real process that writes a real SQLite file in write-ahead
// mode (Node's built-in SQLite), fewer times by default; set GM_CRASH_KILLS to raise the count.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { stateHash } from '@gm/engine-core';
import { SaveFile } from '../../src/save/save-file.ts';
import { readSaveHeader } from '../../src/save/file-check.ts';
import type { SqlDriver, SqlStatement } from '../../src/driver.ts';
import type { SqlJsDriver } from '../../src/sqljs-driver.ts';
import { cleanRun, deps, memoryDb, newSave, resume, runStep, seasonScript, type CleanRun, type Step, type World } from './helpers.ts';
import { nodeSqlite, NodeSqliteDriver } from './node-sqlite-driver.ts';

const WEEKS = 17; // a regular season's worth of week boundaries for the stand-in world
let script: Step[];
let clean: CleanRun;
beforeAll(async () => {
  script = seasonScript(WEEKS);
  clean = await cleanRun(script);
});

class Killed extends Error {}

/** The process as the save sees it: a database that dies at a chosen transaction. */
class Machine implements SqlDriver {
  /** The file as storage holds it: bytes after the last committed transaction. */
  disk: Uint8Array | null = null;
  transactions = 0;
  killAt = -1;
  /** 'before': the transaction never starts. 'during': some statements ran. 'after': it committed, then the process died. */
  killHow: 'before' | 'during' | 'after' = 'before';
  killOffset = 0;
  private constructor(private db: SqlJsDriver) {}
  static async boot(disk: Uint8Array | null): Promise<Machine> {
    const m = new Machine(await memoryDb(disk ?? undefined));
    m.disk = disk;
    return m;
  }
  async exec(sql: string) { await this.db.exec(sql); this.disk = await this.db.exportBytes(); }
  all<T>(sql: string, params?: readonly (string | number | null | Uint8Array)[]) { return this.db.all<T>(sql, params); }
  async transaction(statements: readonly SqlStatement[]) {
    const n = this.transactions++;
    if (n === this.killAt) {
      if (this.killHow === 'before') throw new Killed();
      if (this.killHow === 'during') {
        // Statements reach the database, the commit never does: SQLite rolls the transaction back.
        const part = statements.slice(0, this.killOffset % (statements.length + 1));
        await this.db.transaction([...part, { sql: 'INSERT INTO no_such_table VALUES (1)' }]).catch(() => undefined);
        throw new Killed();
      }
      await this.db.transaction(statements);
      this.disk = await this.db.exportBytes();
      throw new Killed();
    }
    await this.db.transaction(statements);
    this.disk = await this.db.exportBytes();
  }
  close() { return this.db.close(); }
}

/** Small deterministic generator for the kill points, so a failure can be run again. */
function lcg(seed: number) {
  let x = seed >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x; };
}

describe('crash recovery (P5.8.1)', () => {
  it('1,000 kills at random points of a season each reload to the clean run at that log position', async () => {
    // Count the transactions of an unbroken run, so kill points cover the whole season.
    const probe = await Machine.boot(null);
    const first = await newSave(probe);
    for (const step of script) await runStep(first, step);
    const total = probe.transactions;
    expect(stateHash(first.state())).toBe(clean.hashAt.at(-1));
    expect(total).toBeGreaterThan(100);

    const rand = lcg(20261126);
    const hows = ['before', 'during', 'after'] as const;
    let kills = 0;
    let finished = 0;
    const seen = new Set<number>();
    while (kills < 1000) {
      // One season, killed again and again: each reload continues the same career.
      let machine = await Machine.boot(null);
      let save: SaveFile<World> | null = null;
      for (;;) {
        machine.killAt = machine.transactions + (rand() % 9);
        machine.killHow = hows[rand() % 3]!;
        machine.killOffset = rand();
        try {
          save ??= await newSave(machine);
          await resume(save, script, clean);
          finished++;
          break; // the season ended before the next kill
        } catch (e) {
          if (!(e instanceof Killed) && !(e instanceof Error && /Killed|could not be written/.test(e.message))) throw e;
        }
        kills++;
        const disk = machine.disk;
        machine = await Machine.boot(disk);
        // Killed while the career was being created: the file holds no career yet, so creation starts over.
        if (!disk || (await readSaveHeader(machine)).status === 'unreadable') { save = null; continue; }
        // Reload. No recovery step is needed or allowed here: the file must simply be whole.
        save = await SaveFile.open(machine, deps());
        const seq = save.lastSeq();
        seen.add(seq);
        expect(stateHash(save.state()), `kill ${kills} at log position ${seq}`).toBe(clean.hashAt[seq]);
        expect(save.digest()).toBe(clean.digestAt[seq]);
        if (kills % 50 === 0) expect((await save.verifyByReplay()).problems).toEqual([]);
        if (kills >= 1000) break;
      }
      if (save && kills < 1000) {
        expect(stateHash(save.state())).toBe(clean.hashAt.at(-1));
        expect(save.lastSeq()).toBe(clean.hashAt.length - 1);
      }
    }
    expect(kills).toBe(1000);
    expect(finished).toBeGreaterThan(0);
    expect(seen.size).toBeGreaterThan(clean.hashAt.length / 2); // the kills really were spread over the season
  });

  const sqlite = nodeSqlite();
  it.skipIf(!sqlite)('a real process killed while it writes a real file reloads to the clean run', async () => {
    const kills = Number(process.env.GM_CRASH_KILLS ?? 6);
    const dir = mkdtempSync(join(tmpdir(), 'gm-crash-'));
    const file = join(dir, 'career.gmsave');
    const child = fileURLToPath(new URL('./crash-child.ts', import.meta.url));
    const rand = lcg(7);
    const positions: number[] = [];
    try {
      for (let k = 0; k < kills; k++) {
        const proc = spawn(process.execPath, ['--import', 'tsx', child, file, String(WEEKS)], { stdio: ['ignore', 'pipe', 'pipe'] });
        let err = '';
        proc.stderr.on('data', (c: Buffer) => { err += c.toString(); });
        const exited = new Promise<number | null>((res) => proc.on('exit', (code) => res(code)));
        // Wait until the child is writing, then kill it without warning at a random moment.
        await new Promise<void>((res, rej) => {
          proc.stdout.on('data', (c: Buffer) => { if (c.toString().includes('writing')) res(); });
          void exited.then((code) => (code === 0 ? res() : rej(new Error(`child exited with ${code}: ${err}`))));
        });
        await new Promise((r) => setTimeout(r, rand() % 120));
        proc.kill('SIGKILL');
        await exited;

        const driver = new NodeSqliteDriver(sqlite!, file);
        const save = await SaveFile.open(driver, deps());
        const seq = save.lastSeq();
        positions.push(seq);
        expect(stateHash(save.state()), `kill ${k} at log position ${seq}`).toBe(clean.hashAt[seq]);
        expect((await save.verifyByReplay()).problems).toEqual([]);
        await save.close();
      }
      // The career advanced across the kills: each child continued the file the last one left.
      expect(positions.at(-1)!).toBeGreaterThan(0);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);
});

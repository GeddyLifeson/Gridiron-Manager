import { describe, expect, it } from 'vitest';
import { stateHash } from '@gm/engine-core';
import { SaveFile } from '../../src/save/save-file.ts';
import { readSaveHeader } from '../../src/save/file-check.ts';
import { SAVE_CORE_FORMAT_VERSION, SaveDamagedError, SaveVersionError } from '../../src/save/types.ts';
import { conformanceHeader, conformanceWorld, type ConformanceWorld } from '../../src/save/conformance.ts';
import type { SqlDriver, SqlStatement } from '../../src/driver.ts';
import { UNDOABLE, V, WEEK_PLAN, cleanRun, deps, input, memoryDb, newSave, reopen, runStep, seasonScript } from './helpers.ts';

const count = async (d: SqlDriver, table: string) => (await d.all<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table}`))[0]!.c;

describe('commit (P1.1.3, P5.2.1)', () => {
  it('a rejected command is not logged and changes nothing', async () => {
    const d = await memoryDb();
    const save = await newSave(d);
    const before = save.digest();
    const r = await save.issue(input(save, 'conf.AddPerson', { name: '' }));
    expect(r).toEqual({ ok: false, code: 'name_missing', reason: 'a person needs a name' });
    expect(await count(d, 'command_log')).toBe(0);
    expect(save.digest()).toBe(before);
    expect(save.lastSeq()).toBe(0);
  });

  it('command ids are the log sequence: monotonic from 1 with no gaps', async () => {
    const d = await memoryDb();
    const save = await newSave(d);
    for (let i = 0; i < 5; i++) {
      await save.issue(input(save, 'conf.Train', { id: -1, load: 1 })); // rejected, takes no id
      expect((await save.issue(input(save, 'conf.Note', { text: `${i}` }))).ok).toBe(true);
    }
    expect((await save.log()).map((r) => r.seq)).toEqual([1, 2, 3, 4, 5]);
    expect((await save.log()).map((r) => r.command.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('writes the command, its state change, the header and the chain row in one transaction', async () => {
    const inner = await memoryDb();
    const batches: number[] = [];
    const d: SqlDriver = { ...wrap(inner), transaction: async (s) => { batches.push(s.length); await inner.transaction(s); } };
    const save = await newSave(d);
    batches.length = 0;
    const r = await save.issue(input(save, 'conf.AdvanceWeek', {}), WEEK_PLAN);
    expect(r.ok).toBe(true);
    expect(batches.length).toBe(1);
    expect(await count(inner, 'command_log')).toBe(1);
    expect(await count(inner, 'hash_chain')).toBe(2);
    expect(await count(inner, 'snapshots')).toBe(2);
    const h = await readSaveHeader(inner);
    expect(h.status === 'ok' && h.header.calendar).toEqual({ seasonYear: 2026, dayIndex: 7 });
    expect(h.status === 'ok' && h.header.hashChainHead).toBe(save.chainHead());
  });

  it('a change to one person rewrites one row, not the world', async () => {
    const inner = await memoryDb();
    let last: readonly SqlStatement[] = [];
    const d: SqlDriver = { ...wrap(inner), transaction: async (s) => { last = s; await inner.transaction(s); } };
    const world = conformanceWorld();
    for (let i = 0; i < 500; i++) world.people.push({ id: 100 + i, name: `X${i}`, rating: 40, form: 0.5, tags: {} });
    const save = await newSave(d, {}, world);
    await save.issue(input(save, 'conf.Train', { id: 300, load: 1 }));
    const rowWrites = last.filter((s) => /state_rows/.test(s.sql));
    expect(rowWrites.length).toBe(1);
    expect(rowWrites[0]!.params![1]).toBe('300');
  });

  it('a failed write leaves memory unchanged, rejects the command and makes the save read-only (P5.8.1 disk full)', async () => {
    const inner = await memoryDb();
    let fail = false;
    const d: SqlDriver = { ...wrap(inner), transaction: async (s) => { if (fail) throw new Error('disk full'); await inner.transaction(s); } };
    const save = await newSave(d);
    await save.issue(input(save, 'conf.Note', { text: 'a' }));
    const digest = save.digest();
    fail = true;
    const r = await save.issue(input(save, 'conf.Note', { text: 'b' }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe('storage_write_failed');
    expect(save.digest()).toBe(digest);
    expect(save.state().notes).toEqual(['a']);
    expect(save.readOnly()).toMatch(/disk full/);
    fail = false;
    expect((await save.issue(input(save, 'conf.Note', { text: 'c' }))).ok).toBe(false);
    // The file itself is whole: it opens at the last command that was saved.
    const again = await SaveFile.open(await reopen(inner), deps());
    expect(again.lastSeq()).toBe(1);
    expect(again.digest()).toBe(digest);
  });

  it('a failed storage write after the transaction also rejects the command', async () => {
    const d = await memoryDb();
    let durable = await d.exportBytes();
    let full = false;
    const save = await newSave(d, { persist: async () => { if (full) throw new Error('quota exceeded'); durable = await d.exportBytes(); } });
    await save.issue(input(save, 'conf.Note', { text: 'a' }));
    full = true;
    const r = await save.issue(input(save, 'conf.Note', { text: 'b' }));
    expect(!r.ok && r.code).toBe('storage_write_failed');
    expect(save.state().notes).toEqual(['a']);
    const again = await SaveFile.open(await memoryDb(durable), deps());
    expect(again.state().notes).toEqual(['a']);
  });

  it('refuses state that is not plain data instead of saving it approximately', async () => {
    const d = await memoryDb();
    const bad = { ...deps(), apply: (w: ConformanceWorld) => ({ ok: true as const, state: { ...w, rng: Number.NaN }, events: [] }) };
    const save = await SaveFile.create(d, bad, { header: conformanceHeader(), state: conformanceWorld(), versions: V });
    await expect(save.issue(input(save, 'conf.Note', { text: 'x' }))).rejects.toThrow(/\$\.rng: non-finite number/);
    expect(await count(d, 'command_log')).toBe(0);
  });

  it('keeps content copies in the save and adopts new ones with the command (P5.1.2)', async () => {
    const d = await memoryDb();
    const save = await SaveFile.create(d, deps(), {
      header: conformanceHeader(), state: conformanceWorld(), versions: V,
      content: [{ id: 'ruleset:pro', kind: 'ruleset', hash: 'h1', body: { v: 1 } }],
    });
    expect(await save.content('ruleset:pro')).toEqual({ v: 1 });
    await save.issue(input(save, 'conf.Note', { text: 'adopt' }), { content: [{ id: 'ruleset:pro', kind: 'ruleset', hash: 'h2', body: { v: 2 } }] });
    const again = await SaveFile.open(await reopen(d), deps());
    expect(await again.content('ruleset:pro')).toEqual({ v: 2 });
    expect(await again.contentIds()).toEqual(['ruleset:pro']);
    await expect(again.content('none')).rejects.toThrow(/holds no content/);
  });
});

function wrap(inner: SqlDriver): SqlDriver {
  return { exec: (s) => inner.exec(s), transaction: (s) => inner.transaction(s), all: (s, p) => inner.all(s, p), exportBytes: () => inner.exportBytes!(), close: () => inner.close() };
}

describe('undo and redo (P5.2.2)', () => {
  it('after any undo, state equals the state before the undone command, by hash', async () => {
    const save = await newSave(await memoryDb(), { paranoid: true });
    const hashes = [stateHash(save.state())];
    const ids = save.state().people.map((p) => p.id);
    for (let i = 0; i < 6; i++) {
      const r = await save.issue(input(save, i % 2 ? 'conf.Note' : 'conf.SetDepth', i % 2 ? { text: `n${i}` } : { unit: `u${i % 3}`, ids: ids.slice(0, 1 + (i % 3)) }), UNDOABLE);
      expect(r.ok).toBe(true);
      hashes.push(stateHash(save.state()));
    }
    for (let i = 5; i >= 0; i--) {
      expect((await save.undo()).ok).toBe(true);
      expect(stateHash(save.state())).toBe(hashes[i]);
    }
    expect(save.canUndo()).toBe(false);
    expect((await save.undo()).ok).toBe(false);
    for (let i = 1; i <= 6; i++) {
      expect((await save.redo()).ok).toBe(true);
      expect(stateHash(save.state())).toBe(hashes[i]);
    }
    expect(save.canRedo()).toBe(false);
    // The log only ever grew: 6 commands, 6 inverse commands, 6 reissued commands.
    const log = await save.log();
    expect(log.length).toBe(18);
    expect(log.filter((r) => r.undoes !== null).length).toBe(6);
    expect(log.filter((r) => r.redoes !== null).length).toBe(6);
  });

  it('never crosses a time-advancing step or a command that cannot be taken back', async () => {
    const save = await newSave(await memoryDb());
    await save.issue(input(save, 'conf.Note', { text: 'tuesday' }), UNDOABLE);
    expect(save.canUndo()).toBe(true);
    await save.issue(input(save, 'conf.AdvanceWeek', {}), WEEK_PLAN);
    expect(save.canUndo()).toBe(false);
    expect((await save.undo()).ok).toBe(false);
    await save.issue(input(save, 'conf.Note', { text: 'planning' }), UNDOABLE);
    await save.issue(input(save, 'conf.Train', { id: 1, load: 1 })); // not undoable: another person has reacted
    expect(save.canUndo()).toBe(false);
  });

  it('a time-advancing command is never undoable, whatever the caller asks', async () => {
    const save = await newSave(await memoryDb());
    await save.issue(input(save, 'conf.Note', { text: 'x' }), { undoable: true, advancesTime: true });
    expect(save.canUndo()).toBe(false);
  });

  it('a new command after an undo clears redo', async () => {
    const save = await newSave(await memoryDb());
    await save.issue(input(save, 'conf.Note', { text: 'a' }), UNDOABLE);
    await save.undo();
    expect(save.canRedo()).toBe(true);
    await save.issue(input(save, 'conf.Note', { text: 'b' }), UNDOABLE);
    expect(save.canRedo()).toBe(false);
  });

  it('the undo window survives a reload', async () => {
    const d = await memoryDb();
    const save = await newSave(d);
    await save.issue(input(save, 'conf.AdvanceWeek', {}), WEEK_PLAN);
    const base = stateHash(save.state());
    await save.issue(input(save, 'conf.Note', { text: 'a' }), UNDOABLE);
    const afterA = stateHash(save.state());
    await save.issue(input(save, 'conf.Note', { text: 'b' }), UNDOABLE);
    await save.undo();
    const again = await SaveFile.open(await reopen(d), deps());
    expect(again.canUndo()).toBe(true);
    expect(again.canRedo()).toBe(true);
    expect((await again.undo()).ok).toBe(true);
    expect(stateHash(again.state())).toBe(base);
    expect((await again.redo()).ok).toBe(true);
    expect(stateHash(again.state())).toBe(afterA);
  });

  it('refuses an inverse that does not return the earlier state, and changes nothing', async () => {
    const d = await memoryDb();
    const wrong = { ...deps(), invert: () => ({ type: 'conf.Note', payload: { text: 'not an inverse' } }) };
    const save = await SaveFile.create(d, wrong, { header: conformanceHeader(), state: conformanceWorld(), versions: V });
    await save.issue(input(save, 'conf.Note', { text: 'a' }), UNDOABLE);
    const digest = save.digest();
    const r = await save.undo();
    expect(!r.ok && r.code).toBe('undo_state_mismatch');
    expect(save.digest()).toBe(digest);
    expect(await count(d, 'command_log')).toBe(1);
  });
});

describe('snapshots and the chain (P5.3)', () => {
  it('keeps the latest 3 week snapshots and the latest 3 season snapshots', async () => {
    const save = await newSave(await memoryDb());
    for (let i = 0; i < 7; i++) await save.issue(input(save, 'conf.AdvanceWeek', {}), WEEK_PLAN);
    for (let i = 0; i < 5; i++) await save.issue(input(save, 'conf.AdvanceWeek', {}), { ...WEEK_PLAN, snapshot: 'season' });
    const snaps = await save.snapshots();
    expect(snaps.filter((s) => s.kind === 'week').map((s) => s.logSeq)).toEqual([5, 6, 7]);
    expect(snaps.filter((s) => s.kind === 'season').map((s) => s.logSeq)).toEqual([10, 11, 12]);
    expect(snaps.filter((s) => s.kind === 'creation').length).toBe(1);
  });

  it('the full profile keeps every season snapshot', async () => {
    const d = await memoryDb();
    const header = { ...conformanceHeader(), settings: { worldSize: 'small' as const, retentionProfile: 'full' as const } };
    const save = await SaveFile.create(d, deps(), { header, state: conformanceWorld(), versions: V });
    for (let i = 0; i < 5; i++) await save.issue(input(save, 'conf.AdvanceWeek', {}), { ...WEEK_PLAN, snapshot: 'season' });
    expect((await save.snapshots()).filter((s) => s.kind === 'season').length).toBe(5);
  });

  it('restoring a week-boundary snapshot and replaying that week gives the live state hash', async () => {
    const save = await newSave(await memoryDb());
    for (const step of seasonScript(6)) await runStep(save, step);
    await save.issue(input(save, 'conf.Note', { text: 'mid-week' }), UNDOABLE);
    for (const s of await save.snapshots()) {
      const r = await save.verifyByReplay(s.id);
      expect(r.problems).toEqual([]);
      expect(r.stateHash).toBe(stateHash(save.state()));
      expect(r.commands).toBe(save.lastSeq() - s.logSeq);
    }
  });

  it('a held-back snapshot is written before the next time-advancing command, and matches its chain row', async () => {
    const d = await memoryDb();
    const save = await newSave(d);
    await save.issue(input(save, 'conf.AdvanceWeek', {}), { ...WEEK_PLAN, deferSnapshot: true });
    const weekHash = stateHash(save.state());
    expect((await save.snapshots()).length).toBe(1);
    await save.issue(input(save, 'conf.Note', { text: 'later' }));
    expect((await save.snapshots()).length).toBe(1);
    await save.issue(input(save, 'conf.AdvanceWeek', {}), { advancesTime: true });
    const snaps = await save.snapshots();
    expect(snaps.map((s) => [s.kind, s.logSeq])).toEqual([['creation', 0], ['week', 1]]);
    expect(snaps[1]!.stateHash).toBe(weekHash);
    expect((await save.verifyByReplay()).ok).toBe(true);
    const again = await SaveFile.open(await reopen(d), deps());
    expect(again.lastSeq()).toBe(3);
  });

  it('a checkpoint re-reads every row, so state edited in place does not outlive the week', async () => {
    const d = await memoryDb();
    // A faulty core: this command edits a person in place and hands back the same people array.
    const faulty = { ...deps(), apply: (w: ConformanceWorld, cmd: Parameters<ReturnType<typeof deps>['apply']>[1]) => {
      if (cmd.type !== 'conf.Sneak') return deps().apply(w, cmd);
      w.people[0]!.name = 'edited in place';
      return { ok: true as const, state: { ...w }, events: [] };
    } };
    const save = await SaveFile.create(d, faulty, { header: conformanceHeader(), state: conformanceWorld(), versions: V });
    await save.issue(input(save, 'conf.Sneak', {}));
    expect((await save.verifyLive()).length).toBe(1); // the tables missed it, as reference mode must
    await save.issue(input(save, 'conf.Note', { text: 'week boundary' }), { checkpoint: { kind: 'week', ...V } });
    expect(await save.verifyLive()).toEqual([]);
    const again = await SaveFile.open(await reopen(d), faulty);
    expect(again.state().people[0]!.name).toBe('edited in place');
    expect(stateHash(again.state())).toBe(stateHash(save.state()));
  });

  it('a snapshot without a checkpoint is refused', async () => {
    const save = await newSave(await memoryDb());
    await expect(save.issue(input(save, 'conf.AdvanceWeek', {}), { snapshot: 'week' })).rejects.toThrow(/needs a checkpoint/);
  });

  it('writes a pre-migration snapshot and a migration chain row with the hashes before and after', async () => {
    const d = await memoryDb();
    const save = await newSave(d);
    await save.issue(input(save, 'conf.Note', { text: 'a' }));
    const before = stateHash(save.state());
    await save.snapshotNow('pre_migration', V);
    await save.markMigration(2, 3, before, V);
    const chain = await d.all<{ kind: string; note: string | null; state_hash: string }>('SELECT kind, note, state_hash FROM hash_chain ORDER BY n');
    expect(chain.map((c) => c.kind)).toEqual(['creation', 'migration', 'migration']);
    expect(JSON.parse(chain[2]!.note!)).toEqual({ fromFormat: 2, toFormat: 3, stateHashBefore: before });
    expect((await save.snapshots()).at(-1)!.kind).toBe('pre_migration');
    expect((await SaveFile.open(await reopen(d), deps())).chainHead()).toBe(save.chainHead());
  });
});

describe('header (P5.1.1)', () => {
  it('reads from the header row alone, and certified never returns to true', async () => {
    const d = await memoryDb();
    const withFlip = { ...deps(), describe: () => ({ certified: true, summary: 's' }) };
    const save = await SaveFile.create(d, withFlip, { header: conformanceHeader(), state: conformanceWorld(), versions: V }, { appVersion: 'app 9' });
    expect(save.header().saveFormatVersion).toBe(SAVE_CORE_FORMAT_VERSION);
    await save.breakCertification('content override');
    await save.issue(input(save, 'conf.Note', { text: 'a' }));
    const h = await readSaveHeader(d);
    expect(h.status).toBe('ok');
    if (h.status === 'ok') {
      expect(h.header.certified).toBe(false);
      expect(h.header.certifiedBrokenReason).toBe('content override');
      expect(h.header.lastWrittenWith).toBe('app 9');
    }
  });

  it('a save from a newer version shows its header status and is not loaded', async () => {
    const d = await memoryDb();
    await newSave(d);
    await d.exec(`UPDATE header SET save_format_version = ${SAVE_CORE_FORMAT_VERSION + 1}`);
    const h = await readSaveHeader(d);
    expect(h.status).toBe('newer');
    await expect(SaveFile.open(d, deps())).rejects.toThrow(SaveVersionError);
    await expect(SaveFile.open(d, deps())).rejects.toThrow(/made with a newer version/);
  });

  it('an older format asks for migration, and a file that is not a save says so', async () => {
    const d = await memoryDb();
    await newSave(d);
    await d.exec('UPDATE header SET save_format_version = 1');
    await expect(SaveFile.open(d, deps())).rejects.toThrow(/must be migrated/);
    const empty = await memoryDb();
    expect((await readSaveHeader(empty)).status).toBe('unreadable');
    await expect(SaveFile.open(empty, deps())).rejects.toThrow(SaveDamagedError);
  });

  it('create refuses a file that already holds a career', async () => {
    const d = await memoryDb();
    await newSave(d);
    await expect(newSave(d)).rejects.toThrow(/already holds a career/);
  });
});

describe('log seasons (P5.2.1)', () => {
  it('archives a finished season and still replays and reads it', async () => {
    const d = await memoryDb();
    const script = seasonScript(56);
    const clean = await cleanRun(script);
    const save = await SaveFile.open(await memoryDb(clean.bytes), deps());
    const before = await save.log();
    await expect(save.compressLogSeason(2027)).rejects.toThrow(/not finished/);
    expect(await save.compressLogSeason(2026)).toBe(true);
    expect(await save.compressLogSeason(2026)).toBe(false);
    expect(await count(save.driver, 'command_log')).toBeLessThan(before.length);
    expect(await save.log()).toEqual(before);
    expect((await save.log(10, 12)).map((r) => r.seq)).toEqual([10, 11, 12]);
    const creation = (await save.snapshots()).find((s) => s.kind === 'creation')!;
    const r = await save.verifyByReplay(creation.id);
    expect(r.problems).toEqual([]);
    expect(r.commands).toBe(save.lastSeq());
    const again = await SaveFile.open(await reopen(save.driver), deps());
    expect(stateHash(again.state())).toBe(clean.hashAt.at(-1));
    await d.close();
  });
});

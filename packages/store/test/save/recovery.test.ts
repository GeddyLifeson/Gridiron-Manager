// P5.8.1 and P5.3.2: damage is found at load, and the file is repaired from a snapshot and the log.
import { beforeAll, describe, expect, it } from 'vitest';
import { stateHash } from '@gm/engine-core';
import { SaveFile } from '../../src/save/save-file.ts';
import { SaveDamagedError, type IntegrityReport } from '../../src/save/types.ts';
import type { SqlDriver } from '../../src/driver.ts';
import { UNDOABLE, cleanRun, deps, input, memoryDb, seasonScript, type CleanRun } from './helpers.ts';

const WEEKS = 9;
let clean: CleanRun;
let lastSeq = 0;
beforeAll(async () => {
  const script = seasonScript(WEEKS);
  clean = await cleanRun(script);
  // Two more planning commands after the last week boundary, so the file does not end on a checkpoint.
  const save = await SaveFile.open(await memoryDb(clean.bytes), deps());
  await save.issue(input(save, 'conf.Note', { text: 'after the boundary' }), UNDOABLE);
  await save.issue(input(save, 'conf.Train', { id: save.state().people[0]!.id, load: 2 }));
  clean.hashAt[save.lastSeq() - 1] = clean.hashAt[save.lastSeq() - 1] ?? '';
  clean.hashAt[save.lastSeq()] = stateHash(save.state());
  lastSeq = save.lastSeq();
  clean.bytes = await save.driver.exportBytes!();
  await save.close();
});

const fresh = () => memoryDb(clean.bytes);
async function damage(d: SqlDriver): Promise<IntegrityReport> {
  try { await SaveFile.open(d, deps()); } catch (e) {
    if (e instanceof SaveDamagedError) return e.report;
    throw e;
  }
  throw new Error('the damaged save opened');
}
const codes = (r: IntegrityReport) => r.problems.map((p) => p.code);

describe('damage is detected at the next load (P5.3.2 acceptance)', () => {
  it('an undamaged file opens', async () => {
    const save = await SaveFile.open(await fresh(), deps());
    expect(save.lastSeq()).toBe(lastSeq);
    expect((await SaveFile.inspect(save.driver, deps())).ok).toBe(true);
  });

  it('editing any world-state value with an outside tool', async () => {
    const d = await fresh();
    const rows = await d.all<{ tbl: string; key: string; json: string }>('SELECT tbl, key, json FROM state_rows ORDER BY tbl, key');
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) {
      const one = await fresh();
      const v = JSON.parse(row.json) as unknown;
      const edited = typeof v === 'number' ? v + 1 : typeof v === 'string' ? `${v}!` : Array.isArray(v) ? [...v, 1] : { ...(v as object), rating: 99.5, edited: true };
      await one.transaction([{ sql: 'UPDATE state_rows SET json = ? WHERE tbl = ? AND key = ?', params: [JSON.stringify(edited), row.tbl, row.key] }]);
      expect(codes(await damage(one)), `${row.tbl}/${row.key}`).toContain('state_differs_from_log');
      await one.close();
    }
  });

  it('deleting, adding or reordering world rows', async () => {
    for (const sql of [
      "DELETE FROM state_rows WHERE tbl = 'people' AND ord = 2",
      "INSERT INTO state_rows (tbl, key, ord, json) VALUES ('notes', '99', 99, '\"x\"')",
      "UPDATE state_rows SET ord = CASE ord WHEN 0 THEN 1 WHEN 1 THEN 0 ELSE ord END WHERE tbl = 'people'",
      "DELETE FROM state_fields WHERE name = 'notes'",
    ]) {
      const d = await fresh();
      await d.exec(sql);
      const c = codes(await damage(d));
      expect(c.includes('state_differs_from_log') || c.includes('state_unreadable'), sql).toBe(true);
    }
  });

  it('editing the log, the chain, the header or a snapshot row', async () => {
    const cases: [string, string][] = [
      [`UPDATE command_log SET digest_after = 'ffffffffffffffff' WHERE seq = ${lastSeq}`, 'state_differs_from_log'],
      ['DELETE FROM command_log WHERE seq = 5', 'log_gap'],
      [`DELETE FROM command_log WHERE seq = ${lastSeq}`, 'state_differs_from_log'],
      ["UPDATE hash_chain SET state_hash = '0123456789abcdef' WHERE n = 3", 'chain_links'],
      ['UPDATE hash_chain SET log_seq = log_seq + 1 WHERE n = 2', 'chain_links'],
      ['DELETE FROM hash_chain WHERE n = (SELECT MAX(n) FROM hash_chain)', 'chain_head'],
      ["UPDATE header SET json = replace(json, '\"hashChainHead\":\"', '\"hashChainHead\":\"0')", 'chain_head'],
      ["UPDATE header SET json = '{'", 'header_unreadable'],
      ["UPDATE snapshots SET state_hash = '0123456789abcdef' WHERE id = (SELECT MAX(id) FROM snapshots)", 'snapshot_not_in_chain'],
      ["UPDATE command_log SET state_hash = '0123456789abcdef' WHERE state_hash IS NOT NULL AND seq > 20", 'chain_broken'],
      [`UPDATE command_log SET command = 'not json' WHERE seq = ${lastSeq}`, 'log_unreadable'],
    ];
    for (const [sql, code] of cases) {
      const d = await fresh();
      await d.exec(sql);
      expect(codes(await damage(d)), sql).toContain(code);
    }
  });

  it('a file that stands on a checkpoint is also held to the chain state hash', async () => {
    const d = await memoryDb((await cleanRun(seasonScript(2))).bytes);
    // A consistent forgery of tables and log digest still fails the engine hash in the chain.
    const save = await SaveFile.open(d, deps());
    const forged = { ...save.state(), rng: 1 };
    const { replaceStateStatements } = await import('../../src/snapshot/state-tables.ts');
    const r = replaceStateStatements(deps().bytesHash, forged);
    await d.transaction([...r.statements, { sql: 'UPDATE command_log SET digest_after = ? WHERE seq = ?', params: [r.digest, save.lastSeq()] }]);
    expect(codes(await damage(d))).toContain('state_differs_from_chain');
  });
});

describe('recovery (P5.8.1)', () => {
  it('restores the latest week snapshot and replays the log after it', async () => {
    const d = await fresh();
    await d.exec("UPDATE state_rows SET json = '1' WHERE tbl = 'rng'");
    await d.exec("DELETE FROM state_rows WHERE tbl = 'people' AND ord > 1");
    await damage(d);
    const out = await SaveFile.recover(d, deps(), { mode: 'exact' });
    expect(out.recovered).toBe(true);
    expect(out.from!.kind).toBe('week');
    expect(out.lostCommands).toBe(0);
    expect(out.certificationBroken).toBe(false);
    const save = await SaveFile.open(d, deps());
    expect(save.lastSeq()).toBe(lastSeq);
    expect(stateHash(save.state())).toBe(clean.hashAt[lastSeq]);
    expect(save.header().certified).toBe(true);
    expect(save.canUndo()).toBe(false); // the last command was not undoable
  });

  it('falls back down the ladder when the newest snapshots are damaged', async () => {
    const d = await fresh();
    await d.exec("UPDATE state_rows SET json = '1' WHERE tbl = 'rng'");
    await d.exec("UPDATE snapshots SET blob = x'00010203' WHERE kind = 'week' AND id = (SELECT MAX(id) FROM snapshots WHERE kind = 'week')");
    const weeks = await d.all<{ id: number }>("SELECT id FROM snapshots WHERE kind = 'week' ORDER BY id DESC");
    await d.transaction([{ sql: "UPDATE snapshots SET digest = 'ffffffffffffffff' WHERE id = ?", params: [weeks[1]!.id] }]);
    const out = await SaveFile.recover(d, deps(), { mode: 'exact' });
    expect(out.recovered).toBe(true);
    expect(out.attempts.map((a) => a.failure === null)).toEqual([false, false, true]);
    expect(out.attempts[0]!.failure).toMatch(/damaged/);
    expect(out.from!.id).toBe(weeks[2]!.id);
    const save = await SaveFile.open(d, deps(), { databaseCheck: true });
    expect(stateHash(save.state())).toBe(clean.hashAt[lastSeq]);
  });

  it('uses the creation snapshot when every later one is gone, and rebuilds an unreadable header', async () => {
    const d = await fresh();
    await d.exec("DELETE FROM snapshots WHERE kind != 'creation'");
    await d.exec("UPDATE header SET json = '{'");
    const out = await SaveFile.recover(d, deps(), { mode: 'exact' });
    expect(out.recovered).toBe(true);
    expect(out.from!.kind).toBe('creation');
    const save = await SaveFile.open(d, deps());
    expect(stateHash(save.state())).toBe(clean.hashAt[lastSeq]);
    expect(save.header().calendar).toEqual(save.state().calendar);
    expect(save.header().masterSeed).toBe('00000000000000c0');
  });

  it('an exact recovery does nothing when the log itself no longer replays', async () => {
    const d = await fresh();
    const row = (await d.all<{ command: string }>(`SELECT command FROM command_log WHERE seq = ${lastSeq - 1}`))[0]!;
    const cmd = JSON.parse(row.command) as { payload: { text: string } };
    cmd.payload.text = 'rewritten history';
    await d.transaction([{ sql: 'UPDATE command_log SET command = ? WHERE seq = ?', params: [JSON.stringify(cmd), lastSeq - 1] }]);
    const before = await d.exportBytes();
    const out = await SaveFile.recover(d, deps(), { mode: 'exact' });
    expect(out.recovered).toBe(false);
    expect(out.attempts.length).toBeGreaterThan(1);
    expect(out.attempts.every((a) => a.reachedSeq === lastSeq - 2 && /differs on replay/.test(a.failure!))).toBe(true);
    expect(await d.exportBytes()).toEqual(before);

    // The user may then choose to lose the commands after the last good one. Certification ends.
    const cut = await SaveFile.recover(d, deps(), { mode: 'truncate', snapshotId: out.attempts[0]!.snapshot.id });
    expect(cut).toMatchObject({ recovered: true, reachedSeq: lastSeq - 2, lostCommands: 2, certificationBroken: true });
    const save = await SaveFile.open(d, deps());
    expect(save.lastSeq()).toBe(lastSeq - 2);
    expect(stateHash(save.state())).toBe(clean.hashAt[lastSeq - 2]);
    expect(save.header().certified).toBe(false);
    expect(save.header().certifiedBrokenReason).toMatch(/dropped 2 commands/);
    expect((await save.issue(input(save, 'conf.Note', { text: 'on we go' }))).ok).toBe(true);
    expect((await save.verifyByReplay()).ok).toBe(true);
  });

  it('a log that lost its tail recovers to where it ends and says certification is lost', async () => {
    const d = await fresh();
    await d.exec(`DELETE FROM command_log WHERE seq > ${lastSeq - 4}`);
    const out = await SaveFile.recover(d, deps(), { mode: 'exact' });
    expect(out.recovered).toBe(true);
    expect(out.certificationBroken).toBe(true);
    const save = await SaveFile.open(d, deps());
    expect(save.lastSeq()).toBe(lastSeq - 4);
    expect(stateHash(save.state())).toBe(clean.hashAt[lastSeq - 4]);
    expect(save.header().certified).toBe(false);
  });

  it('a command whose result events changed is not accepted as the same history', async () => {
    const d = await fresh();
    await d.exec("UPDATE command_log SET events_hash = 'ffffffffffffffff' WHERE seq = 3");
    const save = await SaveFile.open(d, deps()); // the quick load checks do not replay
    const creation = (await save.snapshots()).find((s) => s.kind === 'creation')!;
    const r = await save.verifyByReplay(creation.id);
    expect(r.ok).toBe(false);
    expect(r.reachedSeq).toBe(2);
    expect(r.problems.join()).toMatch(/events of command 3 differ on replay/);
  });

  it('a damaged hash chain is not repaired from inside the file', async () => {
    const d = await fresh();
    await d.exec("UPDATE hash_chain SET state_hash = '0123456789abcdef' WHERE n = 3");
    const out = await SaveFile.recover(d, deps(), { mode: 'exact' });
    expect(out.recovered).toBe(false);
    expect(out.blocked).toMatch(/backup copy/);
  });

  it('a crash during the repair leaves the file as it was', async () => {
    const inner = await fresh();
    await inner.exec("UPDATE state_rows SET json = '1' WHERE tbl = 'rng'");
    const before = await inner.exportBytes();
    const d: SqlDriver = { exec: (s) => inner.exec(s), all: (s, p) => inner.all(s, p), close: () => inner.close(), transaction: async () => { throw new Error('power loss'); } };
    await expect(SaveFile.recover(d, deps(), { mode: 'exact' })).rejects.toThrow(/power loss/);
    expect(await inner.exportBytes()).toEqual(before);
  });
});

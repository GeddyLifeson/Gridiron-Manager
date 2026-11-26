import { describe, expect, it } from 'vitest';
import { bytesHash } from '@gm/engine-core';
import type { CommandEnvelope } from '@gm/schema';
import { archiveSeasonStatements, listArchives, readLog } from '../../src/log/archive.ts';
import { LOG_DDL, LogError, fromRaw, logExtent, logInsert, readUndoWindow, toRaw, type LogRow } from '../../src/log/rows.ts';
import { EMPTY_WINDOW, undoWindow, type UndoRow } from '../../src/log/undo.ts';
import { RAW_CODEC, defaultCodec } from '../../src/snapshot/codec.ts';
import { memoryDb } from '../save/helpers.ts';

function row(seq: number, over: Partial<LogRow> = {}, seasonYear = 2026): LogRow {
  const command: CommandEnvelope = { id: seq, type: over.type ?? 'T', actor: { personId: 7, job: 'head_coach' }, worldTime: { seasonYear, dayIndex: seq }, payload: { n: seq, text: 'é\u0000"' }, schemaVersion: 1, playClockTick: seq };
  return { seq, type: 'T', seasonYear, command, eventsHash: `e${seq}`, digestAfter: `d${seq}`, stateHash: null, advancesTime: false, undoable: false, undoes: null, redoes: null, inverse: null, ...over };
}

describe('log rows (P5.2.1)', () => {
  it('round-trips every field, including the play-clock tick of a game-day command', async () => {
    const d = await memoryDb();
    await d.exec(LOG_DDL);
    const rows = [row(1), row(2, { stateHash: 'abc', advancesTime: true }), row(3, { undoable: true, inverse: { type: 'U', payload: { k: [1, null] } } }), row(4, { undoes: 3 }), row(5, { redoes: 3, undoable: true, inverse: { type: 'U', payload: null } })];
    await d.transaction(rows.map(logInsert));
    expect(await readLog(d, bytesHash)).toEqual(rows);
    expect(rows.map((r) => fromRaw(toRaw(r)))).toEqual(rows);
    expect(await logExtent(d)).toEqual({ count: 5, last: 5, contiguous: true });
    expect((await readUndoWindow(d)).map((r) => r.seq)).toEqual([3, 4, 5]);
  });

  it('is append-only by key: a sequence number cannot be written twice', async () => {
    const d = await memoryDb();
    await d.exec(LOG_DDL);
    await d.transaction([logInsert(row(1))]);
    await expect(d.transaction([logInsert(row(1))])).rejects.toThrow();
    expect((await readLog(d, bytesHash)).length).toBe(1);
  });

  it('reports gaps and rows that do not match the command stored in them', async () => {
    const d = await memoryDb();
    await d.exec(LOG_DDL);
    await d.transaction([1, 2, 4].map((n) => logInsert(row(n))));
    expect((await logExtent(d)).contiguous).toBe(false);
    await d.exec("UPDATE command_log SET type = 'Other' WHERE seq = 2");
    await expect(readLog(d, bytesHash)).rejects.toThrow(LogError);
    await expect(readLog(d, bytesHash)).rejects.toMatchObject({ seq: 2 });
  });
});

describe('undo window (P5.2.2)', () => {
  const u = (seq: number, o: Partial<UndoRow> = {}): UndoRow => ({ seq, advancesTime: false, undoable: true, undoes: null, redoes: null, inverse: { type: 'I', payload: null }, ...o });
  const plain = (seq: number) => u(seq, { undoable: false, inverse: null });
  it('lists undoable commands since the last time-advancing step, newest last', () => {
    expect(undoWindow([])).toEqual(EMPTY_WINDOW);
    expect(undoWindow([u(1), u(2), u(3, { advancesTime: true }), u(4), u(5)])).toEqual({ undo: [4, 5], redo: [] });
  });
  it('an undo moves a command to redo; a redo brings a new row back to undo', () => {
    const a = undoWindow([u(1), u(2), plain(3)]);
    expect(a).toEqual(EMPTY_WINDOW);
    const rows = [u(1), u(2), u(3, { undoes: 2, undoable: false, inverse: null })];
    expect(undoWindow(rows)).toEqual({ undo: [1], redo: [2] });
    expect(undoWindow([...rows, u(4, { redoes: 2 })])).toEqual({ undo: [1, 4], redo: [] });
    expect(undoWindow([...rows, u(4, { undoes: 1, undoable: false, inverse: null })])).toEqual({ undo: [], redo: [2, 1] });
    expect(undoWindow([...rows, u(4)])).toEqual({ undo: [1, 4], redo: [] });
  });
  it('offers nothing when the rows are not the ones it expects', () => {
    expect(undoWindow([u(1), u(2), u(3, { undoes: 1, undoable: false, inverse: null })])).toEqual(EMPTY_WINDOW);
    expect(undoWindow([u(1), u(2, { redoes: 1 })])).toEqual(EMPTY_WINDOW);
    expect(undoWindow([u(1, { inverse: null })])).toEqual(EMPTY_WINDOW);
  });
});

describe('archived seasons (P5.2.1)', () => {
  async function filled() {
    const d = await memoryDb();
    await d.exec(LOG_DDL);
    const rows: LogRow[] = [];
    for (let s = 1; s <= 30; s++) rows.push(row(s, { advancesTime: s % 5 === 0, stateHash: s % 5 === 0 ? `h${s}` : null }, s <= 12 ? 2026 : s <= 24 ? 2027 : 2028));
    await d.transaction(rows.map(logInsert));
    return { d, rows };
  }
  it('moves a season into one compressed blob and reads it back unchanged', async () => {
    for (const codec of [defaultCodec(), RAW_CODEC]) {
      const { d, rows } = await filled();
      await d.transaction((await archiveSeasonStatements(d, 2026, codec, bytesHash))!);
      await d.transaction((await archiveSeasonStatements(d, 2027, codec, bytesHash))!);
      expect(await archiveSeasonStatements(d, 2027, codec, bytesHash)).toBeNull();
      expect((await listArchives(d)).map((a) => [a.firstSeq, a.lastSeq, a.seasonYear, a.rowCount, a.codec])).toEqual([[1, 12, 2026, 12, codec.id], [13, 24, 2027, 12, codec.id]]);
      expect(await logExtent(d)).toEqual({ count: 30, last: 30, contiguous: true });
      expect(await readLog(d, bytesHash)).toEqual(rows);
      expect(await readLog(d, bytesHash, 11, 14)).toEqual(rows.slice(10, 14));
      expect(await readLog(d, bytesHash, 26)).toEqual(rows.slice(25));
    }
  });
  it('refuses a season that is still open or out of order', async () => {
    const { d } = await filled();
    await expect(archiveSeasonStatements(d, 2027, defaultCodec(), bytesHash)).rejects.toThrow(/not the oldest season/);
    await expect(archiveSeasonStatements(d, 2028, defaultCodec(), bytesHash)).rejects.toThrow(/not the oldest season|still open/);
    await d.transaction((await archiveSeasonStatements(d, 2026, defaultCodec(), bytesHash))!);
    await d.transaction((await archiveSeasonStatements(d, 2027, defaultCodec(), bytesHash))!);
    await expect(archiveSeasonStatements(d, 2028, defaultCodec(), bytesHash)).rejects.toThrow(/still open/);
  });
  it('names the first unreadable row of a damaged archive', async () => {
    const { d } = await filled();
    await d.transaction((await archiveSeasonStatements(d, 2026, defaultCodec(), bytesHash))!);
    await d.exec("UPDATE command_log_archive SET blob = x'0102'");
    await expect(readLog(d, bytesHash)).rejects.toMatchObject({ seq: 1 });
    expect((await readLog(d, bytesHash, 13)).length).toBe(18);
  });
});

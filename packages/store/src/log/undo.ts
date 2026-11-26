// Undo and redo (P5.2.2). "A real coach can redo a depth chart on Tuesday. He cannot take back a
// fourth-down call."
//
// Undo is a logged inverse command, so the log stays append-only. It is offered only for undoable
// commands issued since the last time-advancing step, newest first. A command that is not undoable
// (a game-day command, an offer made, a player told he is cut) closes the window behind it too:
// taking back an earlier command after it could not return the state that stood before that command,
// which is what the acceptance check demands.
import type { LogRow } from './rows.ts';

export type UndoRow = Pick<LogRow, 'seq' | 'advancesTime' | 'undoable' | 'undoes' | 'redoes' | 'inverse'>;

export interface UndoWindow {
  /** Commands that can be taken back, oldest first. Undo takes the last. */
  readonly undo: readonly number[];
  /** Commands that were taken back and can be issued again, oldest first. Redo takes the last. */
  readonly redo: readonly number[];
}

export const EMPTY_WINDOW: UndoWindow = { undo: [], redo: [] };

/** Folds one more log row into the window. */
export function pushRow(w: UndoWindow, row: UndoRow): UndoWindow {
  if (row.advancesTime) return EMPTY_WINDOW;
  if (row.undoes !== null) {
    if (w.undo.at(-1) !== row.undoes) return EMPTY_WINDOW; // not the row the window expected: offer nothing rather than guess
    return { undo: w.undo.slice(0, -1), redo: [...w.redo, row.undoes] };
  }
  if (row.redoes !== null) {
    if (w.redo.at(-1) !== row.redoes || !row.undoable || !row.inverse) return EMPTY_WINDOW;
    return { undo: [...w.undo, row.seq], redo: w.redo.slice(0, -1) };
  }
  if (row.undoable && row.inverse) return { undo: [...w.undo, row.seq], redo: [] };
  return EMPTY_WINDOW;
}

/** The window after a run of log rows, given in order. Rows before the last time-advancing row have no effect. */
export function undoWindow(rows: readonly UndoRow[]): UndoWindow {
  let w = EMPTY_WINDOW;
  for (const r of rows) w = pushRow(w, r);
  return w;
}

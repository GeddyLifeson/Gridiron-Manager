// Legends commands (G-84, bible X3). Reading the record changes no world state, so the browser has no
// world commands. Two things live here: the export command row (X3.6.1: allowed in certified mode at any
// time, because exporting changes no state) and the page history the back and forward keys walk (X3.1.1
// rule 5: 50 pages, starting value). The history is session state, never saved.
import type { CommandSpec } from '@gm/schema';
import { buildExport, param, type ExportInput, type ExportResult, type Link } from '../../read-models/legends/index.ts';

/** Payload schemas join these rows in @gm/schema's COMMANDS (app-services may not import zod; CR-G84-1). */
export const LEGENDS_COMMAND_TABLE: readonly Omit<CommandSpec, 'payload'>[] = [
  { type: 'LegendsExport', task: 'legends.export', undoable: false, allowedInCertified: true },
];

/** Runs the export. The shell writes the returned files into the folder the user chose (P2.3). */
export function exportHistory(input: ExportInput): ExportResult {
  return buildExport(input);
}

export interface HistoryEntry { readonly link: Link; readonly seasonYear?: number; readonly tab?: string }

/** Back and forward over opened pages, capped at `legends.nav.history`; opening a page drops the forward list. */
export class PageHistory {
  #items: HistoryEntry[] = [];
  #at = -1;

  open(e: HistoryEntry): void {
    this.#items = this.#items.slice(0, this.#at + 1);
    this.#items.push(e);
    const cap = param('legends.nav.history');
    if (this.#items.length > cap) this.#items = this.#items.slice(this.#items.length - cap);
    this.#at = this.#items.length - 1;
  }

  back(): HistoryEntry | null {
    if (this.#at <= 0) return null;
    this.#at--;
    return this.#items[this.#at]!;
  }

  forward(): HistoryEntry | null {
    if (this.#at >= this.#items.length - 1) return null;
    this.#at++;
    return this.#items[this.#at]!;
  }

  get current(): HistoryEntry | null { return this.#items[this.#at] ?? null; }
  get length(): number { return this.#items.length; }
}

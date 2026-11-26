// The parts of the Mods list (tools editors/folder.ts ModEntry) and the editor list (EDITORS) this
// screen shows, and the intents it sends back. Declared here because app-ui imports only the
// app-services entry point; the host maps tools' values onto these shapes, passing every pack string
// through `plainText` first (P7.2.1).
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const hasEdText = (id: string): boolean => Object.prototype.hasOwnProperty.call(STRINGS, id);
export const edTextIds = (): string[] => Object.keys(STRINGS);
/** The string for an id with `{slot}` filled; an unknown id shows itself so a gap is visible. */
export function et(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

// Defence in depth for text from packs: control and direction characters never reach the page.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g;
export const packText = (s: string): string => s.replace(CONTROL, '');

export type Severity = 'error' | 'flag' | 'warning' | 'info';
export interface UiProblem { severity: Severity; code: string; file: string; path: string; message: string }
export interface UiPack {
  origin: string; packId: string; name: string; version: string; author: string; kinds: readonly string[];
  signature: 'unsigned' | 'signature_not_checked'; selectable: boolean;
  problems: readonly UiProblem[]; ignored: readonly { file: string; reason: string }[]; neutralisedCount: number;
}
export interface UiEditor { id: string; title: string; certifiedAllowed: boolean }
export interface EditorsUi {
  /** Shown on desktop; null in the browser, which imports a file instead. */
  folder: string | null;
  canImport: boolean;
  certified: boolean;
  packs: readonly UiPack[];
  editors: readonly UiEditor[];
}

export type EditorsIntent =
  | { type: 'rescan' }
  | { type: 'import' }
  | { type: 'export_errors'; packId: string; origin: string }
  | { type: 'open_editor'; editorId: string };

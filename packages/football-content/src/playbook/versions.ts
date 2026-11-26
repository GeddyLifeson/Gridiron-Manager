// G3.4.2 versions, import, export, sharing, and G3.4.1 departing coaches and merges. Every edit makes a new
// version; history is never rewritten. Game versions are snapshotted at kickoff so film and self-scout show
// the play as it was called that day. An exported file carries no player names, team marks or results.
import type { Validator } from './types.ts';
import { addPlay, partIdsOf, withParts } from './library.ts';
import type { Part, PlayEntry, Playbook } from './types.ts';
import { checkWords, entryFor, norm, type WordList } from './words.ts';

export interface Version { readonly n: number; readonly stamp: number; readonly play: PlayEntry; readonly note: string }

/** Version history of every play, plus kickoff snapshots (game id to play id to version number). */
export interface History {
  readonly versions: ReadonlyMap<string, readonly Version[]>;
  readonly gameVersions: ReadonlyMap<string, ReadonlyMap<string, number>>;
}

export const emptyHistory = (): History => ({ versions: new Map(), gameVersions: new Map() });

/** Record a play's current form as a new version at time `stamp` (game day number or command index). */
export function recordVersion(h: History, play: PlayEntry, stamp: number, note = 'edit'): History {
  const list = h.versions.get(play.id) ?? [];
  const last = list[list.length - 1];
  if (last && last.stamp > stamp) throw new Error(`version stamps must not go back (${last.stamp} > ${stamp})`);
  const versions = new Map(h.versions);
  versions.set(play.id, [...list, { n: list.length + 1, stamp, play, note }]);
  return { ...h, versions };
}

export function currentVersion(h: History, playId: string): number { return h.versions.get(playId)?.length ?? 0; }

/** Restoring an old version makes a new version with that content (G3.4.2). */
export function restoreVersion(h: History, playId: string, n: number, stamp: number): { readonly history: History; readonly play: PlayEntry } {
  const v = h.versions.get(playId)?.[n - 1];
  if (!v) throw new Error(`play ${playId} has no version ${n}`);
  return { history: recordVersion(h, v.play, stamp, `restore of version ${n}`), play: v.play };
}

/** Snapshot the whole book at kickoff: the "game version" (G3.4.2 depth pass). */
export function snapshotGame(h: History, gameId: string, book: Playbook): History {
  const snap = new Map<string, number>();
  for (const id of [...book.plays.keys()].sort()) snap.set(id, currentVersion(h, id));
  const gameVersions = new Map(h.gameVersions);
  gameVersions.set(gameId, snap);
  return { ...h, gameVersions };
}

/** A play as it was in one game, for film and self-scout. */
export function playAsOfGame(h: History, gameId: string, playId: string): PlayEntry | null {
  const n = h.gameVersions.get(gameId)?.get(playId);
  if (!n) return null;
  return h.versions.get(playId)?.[n - 1]?.play ?? null;
}

/** Side-by-side compare of two versions: the fields that differ. */
export function compareVersions(h: History, playId: string, a: number, b: number): string[] {
  const va = h.versions.get(playId)?.[a - 1]?.play;
  const vb = h.versions.get(playId)?.[b - 1]?.play;
  if (!va || !vb) throw new Error(`missing version of ${playId}`);
  const keys = [...new Set([...Object.keys(va), ...Object.keys(vb)])].sort();
  return keys.filter((k) => JSON.stringify((va as unknown as Record<string, unknown>)[k]) !== JSON.stringify((vb as unknown as Record<string, unknown>)[k]));
}

/**
 * A departed staff member's view of the team book stops at his departure (G3.4.1, G3.4.2): every play at its
 * last version stamped on or before that time; plays added later are absent.
 */
export function viewAsOf(h: History, departure: number): Map<string, PlayEntry> {
  const out = new Map<string, PlayEntry>();
  for (const [id, list] of [...h.versions.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const v = [...list].reverse().find((x) => x.stamp <= departure);
    if (v) out.set(id, v.play);
  }
  return out;
}

// ---------------------------------------------------------------- export and import

export const EXPORT_FORMAT = 'gm.playbook/1';

/** The exported file: parts and plays only (no usage, results, names or marks). */
export interface ExportFile {
  readonly format: typeof EXPORT_FORMAT;
  readonly parts: readonly Part[];
  readonly plays: readonly PlayEntry[];
}

/** Export a play, a section or a whole book (G3.4.2). Retired plays travel only when asked. */
export function exportPlays(book: Playbook, playIds: readonly string[]): ExportFile {
  const plays = playIds.map((id) => { const p = book.plays.get(id); if (!p) throw new Error(`play ${id} not in the book`); return p; }).sort((a, b) => (a.id < b.id ? -1 : 1));
  const partIds = [...new Set(plays.flatMap(partIdsOf))].sort();
  const parts = partIds.map((id) => book.parts.get(id)!);
  return { format: EXPORT_FORMAT, parts, plays };
}

export function exportBook(book: Playbook): ExportFile {
  return exportPlays(book, [...book.plays.keys()]);
}

/** Canonical JSON for the file (sorted keys), so export then import reproduces every object exactly. */
export function toJson(f: ExportFile): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(sort(f));
}

export function fromJson(s: string): ExportFile {
  const f = JSON.parse(s) as ExportFile;
  if (f.format !== EXPORT_FORMAT) throw new Error(`unknown playbook file format ${String(f.format)}`);
  return f;
}

export interface ImportReport {
  readonly mergedByContent: readonly { readonly incoming: string; readonly existing: string }[];
  readonly renamedOnClash: readonly { readonly incoming: string; readonly as: string }[];
  readonly missingParts: readonly { readonly partId: string; readonly plays: readonly string[] }[];
  readonly failedValidation: readonly { readonly playId: string; readonly failures: readonly string[] }[];
  readonly wordCollisions: readonly { readonly incoming: string; readonly existing: string }[];
  readonly imported: readonly string[];
}

/**
 * Import (G3.4.2): parts map by content first and name second, so identical formations merge; an id clash
 * with different content is renamed. Imported plays arrive as draft with zero knowledge, are validated against
 * the save's rule set, and plays that fail stay draft with the failing rule shown (never imported as valid).
 */
export function importFile(book: Playbook, words: WordList, file: ExportFile, validate: Validator, idPrefix = 'imp'): { readonly book: Playbook; readonly words: WordList; readonly report: ImportReport } {
  const byContent = new Map<string, string>();
  for (const p of book.parts.values()) byContent.set(`${p.type}|${p.content}`, p.id);
  const idMap = new Map<string, string>();
  const mergedByContent: { incoming: string; existing: string }[] = [];
  const renamedOnClash: { incoming: string; as: string }[] = [];
  const newParts: Part[] = [];
  const fileParts = new Set(file.parts.map((p) => p.id));
  for (const p of file.parts) {
    const same = byContent.get(`${p.type}|${p.content}`);
    if (same) { idMap.set(p.id, same); mergedByContent.push({ incoming: p.id, existing: same }); continue; }
    let id = p.id;
    if (book.parts.has(id) || newParts.some((x) => x.id === id)) { let i = 1; while (book.parts.has(`${idPrefix}.${p.id}.${i}`)) i++; id = `${idPrefix}.${p.id}.${i}`; renamedOnClash.push({ incoming: p.id, as: id }); }
    idMap.set(p.id, id);
    newParts.push({ ...p, id });
  }
  let next = withParts(book, newParts);
  const entries = new Map(words.entries);
  for (const p of newParts) entries.set(p.id, entryFor(p, words.family));
  const nextWords: WordList = { ...words, entries };
  const newIds = new Set(newParts.map((p) => p.id));
  const wordCollisions = checkWords(nextWords).filter((w) => w.kind === 'duplicate' && (newIds.has(w.a) !== newIds.has(w.b))).map((w) => (newIds.has(w.a) ? { incoming: w.a, existing: w.b } : { incoming: w.b, existing: w.a }));
  const missing = new Map<string, string[]>();
  const failedValidation: { playId: string; failures: readonly string[] }[] = [];
  const imported: string[] = [];
  for (const play of file.plays) {
    const need = partIdsOf(play).filter((id) => !fileParts.has(id) && !book.parts.has(id));
    if (need.length) { for (const id of need) missing.set(id, [...(missing.get(id) ?? []), play.id]); continue; }
    const mapId = (id: string) => idMap.get(id) ?? id;
    const parts: Record<string, string> = {};
    for (const [slot, id] of Object.entries(play.parts)) if (id) parts[slot] = mapId(id);
    let id = play.id;
    if (next.plays.has(id)) { let i = 1; while (next.plays.has(`${idPrefix}.${play.id}.${i}`)) i++; id = `${idPrefix}.${play.id}.${i}`; }
    const draft: PlayEntry = { ...play, id, status: 'draft', parts, tags: play.tags.map(mapId), parentId: play.parentId };
    const r = validate(draft, next);
    if (!r.ok) failedValidation.push({ playId: id, failures: r.failures });
    next = addPlay(next, draft);
    imported.push(id);
  }
  return {
    book: next, words: nextWords,
    report: { mergedByContent, renamedOnClash, missingParts: [...missing.entries()].map(([partId, plays]) => ({ partId, plays })), failedValidation, wordCollisions, imported },
  };
}

/**
 * Merge sections from two books (G3.4.1): parts matched by content first and name second; where both books
 * name the same part differently, `pickWord` chooses the surviving word and the losing word is returned as a
 * rename to charge (G4.7.1).
 */
export function mergeBooks(base: { readonly book: Playbook; readonly words: WordList }, other: { readonly book: Playbook; readonly words: WordList }, playIds: readonly string[], pickWord: (a: string, b: string) => 'base' | 'other', validate: Validator): { readonly book: Playbook; readonly words: WordList; readonly renames: readonly { readonly partId: string; readonly from: string; readonly to: string }[]; readonly report: ImportReport } {
  const file = exportPlays(other.book, playIds);
  const { book, words, report } = importFile(base.book, base.words, file, validate, 'merge');
  const renames: { partId: string; from: string; to: string }[] = [];
  let entries = new Map(words.entries);
  for (const m of report.mergedByContent) {
    const a = base.words.entries.get(m.existing)?.word;
    const b = other.words.entries.get(m.incoming)?.word;
    if (!a || !b || norm(a) === norm(b)) continue;
    if (pickWord(a, b) === 'other') {
      const e = entries.get(m.existing)!;
      entries.set(m.existing, { ...e, word: b });
      renames.push({ partId: m.existing, from: a, to: b });
    } else {
      renames.push({ partId: m.existing, from: b, to: a });
    }
  }
  entries = new Map(entries);
  return { book, words: { ...words, entries }, renames, report };
}

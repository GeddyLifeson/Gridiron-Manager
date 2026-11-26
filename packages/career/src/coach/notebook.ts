// The coach's notebook (E11.1, E11.2, E11.4). Notes are the user's private text. Nothing reads
// `note.text` except display, search and export (E11.1.1 rule 5, acceptance 3): no AI, label,
// reputation rule or grade. Writing a note costs 0 in-game hours and never pauses the play clock;
// these functions are pure data operations with no clock of their own.
import { param } from './params.ts';
import { dayOrder, type WorldDay } from './philosophy.ts';

/** Typed subject ids a note can be attached to (E11.1.1 outputs). */
export type SubjectType = 'person' | 'team' | 'crew' | 'play' | 'formation' | 'concept' | 'game' | 'decision' | 'situation' | 'opening';
export const SUBJECT_TYPES: readonly SubjectType[] = ['person', 'team', 'crew', 'play', 'formation', 'concept', 'game', 'decision', 'situation', 'opening'];

export interface Subject {
  readonly type: SubjectType;
  /** World ids are numbers; content ids (plays, concepts, situation tags) are strings. */
  readonly id: number | string;
}

export const subjectKey = (s: Subject): string => `${s.type}:${String(s.id)}`;

/** E11.2.1 note kinds. */
export type NoteKind = 'general' | 'opponent' | 'official' | 'player' | 'staff' | 'self' | 'idea' | 'job';
export const NOTE_KINDS: readonly NoteKind[] = ['general', 'opponent', 'official', 'player', 'staff', 'self', 'idea', 'job'];

/** The job he held when he wrote it (E11.1.1 `author_job`). */
export interface AuthorJob {
  readonly jobCatalogueId: string;
  readonly teamId: number | null;
}

export interface Note {
  readonly id: number;
  readonly text: string;
  /** In-game date, and the real date the shell supplies (core code reads no clock). */
  readonly created: { readonly world: WorldDay; readonly real: string | null };
  readonly edited: { readonly world: WorldDay; readonly real: string | null } | null;
  readonly subjects: readonly Subject[];
  readonly tags: readonly string[];
  readonly kind: NoteKind;
  readonly pinned: boolean;
  readonly season: number;
  readonly authorJob: AuthorJob;
  /** Self-assessment notes carry the record measure they answer (E11.2.1 outputs, E9.2.2). */
  readonly subjectMeasure: string | null;
  /** A structured attachment: the philosophy and identity drafts are pinned Idea notes (E11.2.1 rule 3). */
  readonly attachment: { readonly type: 'philosophy_draft' | 'identity_draft'; readonly ref: number } | null;
  /** Carried from an earlier career in the same world (E11.4.1 "inherited file"). */
  readonly inheritedFrom: number | null;
}

export type PromptTrigger = 'game_end' | 'job_end' | 'season_end';

export interface Notebook {
  readonly ownerPersonId: number;
  readonly notes: readonly Note[];
  readonly nextId: number;
  /** Prompts can each be turned off in settings (E11.2.1). */
  readonly promptsOn: Readonly<Record<PromptTrigger, boolean>>;
}

export function emptyNotebook(ownerPersonId: number): Notebook {
  return { ownerPersonId, notes: [], nextId: 1, promptsOn: { game_end: true, job_end: true, season_end: true } };
}

export interface NewNote {
  readonly text: string;
  readonly subjects: readonly Subject[];
  readonly tags?: readonly string[];
  readonly kind?: NoteKind;
  readonly pinned?: boolean;
  readonly subjectMeasure?: string | null;
  readonly attachment?: Note['attachment'];
}

export type NoteResult = { readonly ok: true; readonly notebook: Notebook; readonly note: Note } | { readonly ok: false; readonly key: string };

function dedupeSubjects(subjects: readonly Subject[]): Subject[] {
  const seen = new Set<string>();
  return subjects.filter((s) => (seen.has(subjectKey(s)) ? false : (seen.add(subjectKey(s)), true)));
}

/**
 * Write a note. The screen passes its own subjects, so a note is attached without the user choosing
 * (E11.1.1 acceptance 1). Text over the length limit is refused, not cut.
 */
export function writeNote(nb: Notebook, input: NewNote, at: { world: WorldDay; real: string | null }, authorJob: AuthorJob): NoteResult {
  if (input.text.length > param('noteMaxChars')) return { ok: false, key: 'note.too_long' };
  const note: Note = {
    id: nb.nextId, text: input.text, created: at, edited: null, subjects: dedupeSubjects(input.subjects),
    tags: [...new Set(input.tags ?? [])], kind: input.kind ?? 'general', pinned: input.pinned ?? false,
    season: at.world.seasonYear, authorJob, subjectMeasure: input.subjectMeasure ?? null, attachment: input.attachment ?? null, inheritedFrom: null,
  };
  return { ok: true, notebook: { ...nb, notes: [...nb.notes, note], nextId: nb.nextId + 1 }, note };
}

function replace(nb: Notebook, id: number, f: (n: Note) => Note): Notebook {
  return { ...nb, notes: nb.notes.map((n) => (n.id === id ? f(n) : n)) };
}

/** Edit keeps the original date and adds an edited date (E11.1.1 rule 3). */
export function editNote(nb: Notebook, id: number, change: { text?: string; tags?: readonly string[]; subjects?: readonly Subject[] }, at: { world: WorldDay; real: string | null }): NoteResult {
  const n = nb.notes.find((x) => x.id === id);
  if (!n) return { ok: false, key: 'note.unknown' };
  if (change.text !== undefined && change.text.length > param('noteMaxChars')) return { ok: false, key: 'note.too_long' };
  const next: Note = { ...n, text: change.text ?? n.text, tags: change.tags ? [...new Set(change.tags)] : n.tags, subjects: change.subjects ? dedupeSubjects(change.subjects) : n.subjects, edited: at };
  return { ok: true, notebook: replace(nb, id, () => next), note: next };
}

export const deleteNote = (nb: Notebook, id: number): Notebook => ({ ...nb, notes: nb.notes.filter((n) => n.id !== id) });
export const pinNote = (nb: Notebook, id: number, pinned: boolean): Notebook => replace(nb, id, (n) => ({ ...n, pinned }));
/** The same note can be re-kinded later (E11.2.1 edge case). */
export const rekindNote = (nb: Notebook, id: number, kind: NoteKind): Notebook => replace(nb, id, (n) => ({ ...n, kind }));

/** Merge notes into the first: texts joined in date order, subjects and tags united, earliest date kept. */
export function mergeNotes(nb: Notebook, ids: readonly number[]): NoteResult {
  const picked = nb.notes.filter((n) => ids.includes(n.id)).sort((a, b) => dayOrder(a.created.world, b.created.world) || a.id - b.id);
  if (picked.length < 2) return { ok: false, key: 'note.merge_needs_two' };
  const text = picked.map((n) => n.text).join('\n\n');
  if (text.length > param('noteMaxChars')) return { ok: false, key: 'note.too_long' };
  const first = picked[0]!;
  const merged: Note = { ...first, text, subjects: dedupeSubjects(picked.flatMap((n) => n.subjects)), tags: [...new Set(picked.flatMap((n) => n.tags))], pinned: picked.some((n) => n.pinned) };
  const rest = new Set(picked.slice(1).map((n) => n.id));
  return { ok: true, notebook: { ...nb, notes: nb.notes.filter((n) => !rest.has(n.id)).map((n) => (n.id === first.id ? merged : n)) }, note: merged };
}

/** A subject id merged by a data fix follows the merged id (E11.4.1 edge case, P3 id migration). */
export function migrateSubjectId(nb: Notebook, type: SubjectType, from: number | string, to: number | string): Notebook {
  return { ...nb, notes: nb.notes.map((n) => ({ ...n, subjects: dedupeSubjects(n.subjects.map((s) => (s.type === type && s.id === from ? { type, id: to } : s))) })) };
}

// ---------------------------------------------------------------------------------------------------
// Prompts (E11.2.1). A dismissed prompt records nothing; prompts never block.

export interface NotePrompt {
  readonly trigger: PromptTrigger;
  readonly key: string;
  /** Subjects the note box opens with if he answers. */
  readonly subjects: readonly Subject[];
  readonly kind: NoteKind;
}

const PROMPT: Readonly<Record<PromptTrigger, { key: string; kind: NoteKind }>> = {
  game_end: { key: 'note.prompt.after_game', kind: 'opponent' },
  job_end: { key: 'note.prompt.after_job_change', kind: 'self' },
  season_end: { key: 'note.prompt.season_self_assessment', kind: 'self' },
};

export function promptFor(nb: Notebook, trigger: PromptTrigger, subjects: readonly Subject[]): NotePrompt | null {
  if (!nb.promptsOn[trigger]) return null;
  return { trigger, key: PROMPT[trigger].key, subjects, kind: PROMPT[trigger].kind };
}

export const setPrompt = (nb: Notebook, trigger: PromptTrigger, on: boolean): Notebook => ({ ...nb, promptsOn: { ...nb.promptsOn, [trigger]: on } });

// ---------------------------------------------------------------------------------------------------
// Search, export and carrying (E11.4.1). Display, search and export are the only readers of text.

export interface NoteFilter {
  readonly text?: string;
  readonly tags?: readonly string[];
  readonly kinds?: readonly NoteKind[];
  readonly subjectTypes?: readonly SubjectType[];
  readonly season?: number;
  readonly jobCatalogueId?: string;
}

/** Plain-text and tag search with filters. Results newest first. */
export function searchNotes(nb: Notebook, f: NoteFilter): Note[] {
  const needle = f.text?.trim().toLowerCase() ?? '';
  return nb.notes.filter((n) =>
    (needle === '' || n.text.toLowerCase().includes(needle) || n.tags.some((t) => t.toLowerCase().includes(needle))) &&
    (!f.tags || f.tags.every((t) => n.tags.includes(t))) &&
    (!f.kinds || f.kinds.includes(n.kind)) &&
    (!f.subjectTypes || n.subjects.some((s) => f.subjectTypes!.includes(s.type))) &&
    (f.season === undefined || n.season === f.season) &&
    (f.jobCatalogueId === undefined || n.authorJob.jobCatalogueId === f.jobCatalogueId),
  ).sort((a, b) => dayOrder(b.created.world, a.created.world) || b.id - a.id);
}

/** Names for subjects in the export (E11.4.1 rule 5: export includes subject names). */
export type SubjectNamer = (s: Subject) => string;

/** The whole notebook as a readable text file, with dates and subjects, oldest first. */
export function exportNotebook(nb: Notebook, name: SubjectNamer): string {
  const lines: string[] = [];
  const notes = [...nb.notes].sort((a, b) => dayOrder(a.created.world, b.created.world) || a.id - b.id);
  for (const n of notes) {
    const date = `Season ${n.created.world.seasonYear}, day ${n.created.world.dayIndex}${n.created.real ? ` (${n.created.real})` : ''}`;
    const subj = n.subjects.length === 0 ? 'general' : n.subjects.map(name).join('; ');
    lines.push(`# ${date} | ${n.kind}${n.pinned ? ' | pinned' : ''}${n.inheritedFrom !== null ? ' | inherited file' : ''}`);
    lines.push(`About: ${subj}`);
    if (n.tags.length > 0) lines.push(`Tags: ${n.tags.join(', ')}`);
    if (n.edited) lines.push(`Edited: season ${n.edited.world.seasonYear}, day ${n.edited.world.dayIndex}`);
    lines.push(n.text, '');
  }
  return lines.join('\n');
}

/** A shared save carries the notebook only if the user ticks the box (E11.3.1 edge case, E11.4.1 rule 5). */
export function notebookForSharedSave(nb: Notebook, includeNotebook: boolean): Notebook {
  return includeNotebook ? nb : { ...nb, notes: [] };
}

/** Carry a finished career's notebook into a new career in the same world, marked as inherited. */
export function inheritNotebook(from: Notebook, into: Notebook): Notebook {
  let nextId = into.nextId;
  const carried = from.notes.map((n) => ({ ...n, id: nextId++, inheritedFrom: from.ownerPersonId, pinned: false }));
  return { ...into, notes: [...into.notes, ...carried], nextId };
}

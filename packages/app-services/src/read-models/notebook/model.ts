// The coach's notebook screen (coach.notebook). Two pages:
//  - Notes (E11.4.1): the whole file in one place, with filters by kind, subject type, tag, season and job,
//    and plain-text search. Pin, edit, merge, delete and export go through `applyNotebookAction` and
//    `exportNotebookText`, which wrap the G-29 career functions and add no rule of their own.
//  - Words and deeds (E10.4.1, E10.5.2): one row per commitment he has made, with what he did since. The
//    ledger is shown as demonstrated behaviour: counts of decisions that kept or broke it, the latest
//    examples (decision-log ids), and plain words with no label, grade or threshold of ours.
// Observer rules (G-27): note text is the user's own words and is shown as written; subject and job names
// come from the caller's observed namer; ledger inputs carry film grades and model margins, and none of
// them reaches this view: a row says only "kept" or "broke" per linked decision. A break the coach could
// not see the facts for is never shown (coach.buildLedger, E10.4.1 rule 2).
// No count of notes, streak or completion measure is in the view (E11.4.1 rule 6).
import { coach } from '@gm/career';

type Notebook = coach.Notebook;
type Note = coach.Note;
type WorldDay = coach.WorldDay;

// ---------------------------------------------------------------------------------------------------
// Notes

export interface NotebookNamer {
  /** Display name of a subject as the coach knows it (person, team, crew, play, concept, ...). */
  subject(s: coach.Subject): string;
  /** "Linebackers coach, Rivertown" for the job he held when he wrote it. */
  job(j: coach.AuthorJob): string;
  /** Name of the earlier coach whose file was inherited (E11.4.1). */
  person(personId: number): string;
}

/** Single choice per filter, as the address holds it (O1.1.3). Null or empty means "any". */
export interface NotebookFilter {
  readonly text?: string;
  readonly kind?: coach.NoteKind | null;
  readonly subjectType?: coach.SubjectType | null;
  readonly tag?: string | null;
  readonly season?: number | null;
  /** `jobKey` of a job row in the facets. */
  readonly job?: string | null;
}

export interface NoteSubjectView { readonly type: coach.SubjectType; readonly id: number | string; readonly name: string }

export interface NoteRow {
  readonly id: number;
  /** Exactly as written (E11.3.1 rule 5). */
  readonly text: string;
  readonly kind: coach.NoteKind;
  readonly pinned: boolean;
  readonly season: number;
  readonly created: { readonly seasonYear: number; readonly dayIndex: number; readonly real: string | null };
  readonly edited: { readonly seasonYear: number; readonly dayIndex: number; readonly real: string | null } | null;
  readonly subjects: readonly NoteSubjectView[];
  readonly tags: readonly string[];
  readonly job: { readonly key: string; readonly name: string };
  /** Name of the earlier coach for an inherited file, else null. */
  readonly inheritedFrom: string | null;
  readonly subjectMeasure: string | null;
  readonly attachment: 'philosophy_draft' | 'identity_draft' | null;
}

export interface NotebookFacets {
  readonly kinds: readonly coach.NoteKind[];
  readonly subjectTypes: readonly coach.SubjectType[];
  readonly tags: readonly string[];
  readonly seasons: readonly number[];
  readonly jobs: readonly { readonly key: string; readonly name: string }[];
}

export interface NotebookView {
  /** Matching notes: pinned first, then newest. */
  readonly rows: readonly NoteRow[];
  /** Filter choices drawn from the whole notebook. */
  readonly facets: NotebookFacets;
  /** True when the notebook has no notes at all (the screen says so instead of "nothing matches"). */
  readonly blank: boolean;
  readonly promptsOn: Readonly<Record<coach.PromptTrigger, boolean>>;
}

export const jobKey = (j: coach.AuthorJob): string => `${j.jobCatalogueId}@${j.teamId ?? '-'}`;

function row(n: Note, names: NotebookNamer): NoteRow {
  const d = (x: { world: WorldDay; real: string | null }) => ({ seasonYear: x.world.seasonYear, dayIndex: x.world.dayIndex, real: x.real });
  return {
    id: n.id, text: n.text, kind: n.kind, pinned: n.pinned, season: n.season,
    created: d(n.created), edited: n.edited ? d(n.edited) : null,
    subjects: n.subjects.map((s) => ({ type: s.type, id: s.id, name: names.subject(s) })),
    tags: n.tags, job: { key: jobKey(n.authorJob), name: names.job(n.authorJob) },
    inheritedFrom: n.inheritedFrom === null ? null : names.person(n.inheritedFrom),
    subjectMeasure: n.subjectMeasure, attachment: n.attachment?.type ?? null,
  };
}

function facets(nb: Notebook, names: NotebookNamer): NotebookFacets {
  const kinds = new Set<coach.NoteKind>(), types = new Set<coach.SubjectType>(), tags = new Set<string>(), seasons = new Set<number>();
  const jobs = new Map<string, coach.AuthorJob>();
  for (const n of nb.notes) {
    kinds.add(n.kind); seasons.add(n.season); jobs.set(jobKey(n.authorJob), n.authorJob);
    for (const s of n.subjects) types.add(s.type);
    for (const t of n.tags) tags.add(t);
  }
  return {
    kinds: coach.NOTE_KINDS.filter((k) => kinds.has(k)),
    subjectTypes: coach.SUBJECT_TYPES.filter((t) => types.has(t)),
    tags: [...tags].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0)),
    seasons: [...seasons].sort((a, b) => b - a),
    jobs: [...jobs.entries()].map(([key, j]) => ({ key, name: names.job(j) })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
  };
}

/** The notes page. Search is coach.searchNotes (plain text and tags, E11.4.1 rule 1). */
export function buildNotebook(nb: Notebook, names: NotebookNamer, f: NotebookFilter = {}): NotebookView {
  const found = coach.searchNotes(nb, {
    ...(f.text ? { text: f.text } : {}),
    ...(f.kind ? { kinds: [f.kind] } : {}),
    ...(f.subjectType ? { subjectTypes: [f.subjectType] } : {}),
    ...(f.tag ? { tags: [f.tag] } : {}),
    ...(f.season !== undefined && f.season !== null ? { season: f.season } : {}),
  });
  const matched = f.job ? found.filter((n) => jobKey(n.authorJob) === f.job) : found;
  // searchNotes returns newest first; pinned notes move to the top and keep that order.
  const rows = [...matched.filter((n) => n.pinned), ...matched.filter((n) => !n.pinned)].map((n) => row(n, names));
  return { rows, facets: facets(nb, names), blank: nb.notes.length === 0, promptsOn: nb.promptsOn };
}

/** What the screen can ask for. Writing from the screen itself uses `write` with no subjects (general). */
export type NotebookAction =
  | { readonly kind: 'write'; readonly text: string; readonly noteKind?: coach.NoteKind; readonly tags?: readonly string[]; readonly subjects?: readonly coach.Subject[] }
  | { readonly kind: 'edit'; readonly id: number; readonly text?: string; readonly tags?: readonly string[] }
  | { readonly kind: 'pin'; readonly id: number; readonly pinned: boolean }
  | { readonly kind: 'rekind'; readonly id: number; readonly noteKind: coach.NoteKind }
  | { readonly kind: 'merge'; readonly ids: readonly number[] }
  | { readonly kind: 'delete'; readonly id: number }
  | { readonly kind: 'prompt'; readonly trigger: coach.PromptTrigger; readonly on: boolean };

export type NotebookActionResult = { readonly ok: true; readonly notebook: Notebook } | { readonly ok: false; readonly key: string };

/**
 * Apply one screen action. `at` is the in-game date and the shell's real date (core reads no clock);
 * `job` is the job he holds now, stamped on new notes. Costs no in-game time (E11.1.1).
 */
export function applyNotebookAction(nb: Notebook, a: NotebookAction, at: { world: WorldDay; real: string | null }, job: coach.AuthorJob): NotebookActionResult {
  const known = (id: number) => nb.notes.some((n) => n.id === id);
  switch (a.kind) {
    case 'write': {
      if (a.text.trim() === '') return { ok: false, key: 'note.empty' };
      const r = coach.writeNote(nb, { text: a.text, subjects: a.subjects ?? [], ...(a.tags ? { tags: a.tags } : {}), ...(a.noteKind ? { kind: a.noteKind } : {}) }, at, job);
      return r.ok ? { ok: true, notebook: r.notebook } : r;
    }
    case 'edit': {
      const r = coach.editNote(nb, a.id, { ...(a.text !== undefined ? { text: a.text } : {}), ...(a.tags ? { tags: a.tags } : {}) }, at);
      return r.ok ? { ok: true, notebook: r.notebook } : r;
    }
    case 'pin': return known(a.id) ? { ok: true, notebook: coach.pinNote(nb, a.id, a.pinned) } : { ok: false, key: 'note.unknown' };
    case 'rekind': return known(a.id) ? { ok: true, notebook: coach.rekindNote(nb, a.id, a.noteKind) } : { ok: false, key: 'note.unknown' };
    case 'merge': {
      const r = coach.mergeNotes(nb, a.ids);
      return r.ok ? { ok: true, notebook: r.notebook } : r;
    }
    case 'delete': return known(a.id) ? { ok: true, notebook: coach.deleteNote(nb, a.id) } : { ok: false, key: 'note.unknown' };
    case 'prompt': return { ok: true, notebook: coach.setPrompt(nb, a.trigger, a.on) };
  }
}

/** The whole notebook as a text file with dates and subject names (E11.4.1 rule 5). */
export function exportNotebookText(nb: Notebook, names: NotebookNamer): string {
  return coach.exportNotebook(nb, (s) => names.subject(s));
}

// ---------------------------------------------------------------------------------------------------
// Words and deeds (E10.4.1), and the boss's ledger as his staff sees it (E10.5.2)

/** What he did, in plain words, from the counts only. No threshold, label or grade. */
export type Behaviour = 'not_yet_tested' | 'kept_every_time' | 'broke_every_time' | 'kept_and_broke';

export interface LedgerRowView {
  readonly catalogueId: string;
  /** His own wording, or null to show the catalogue's text (`textKey`). */
  readonly wording: string | null;
  readonly textKey: string;
  readonly audience: coach.Audience;
  readonly stated: WorldDay;
  readonly dropped: WorldDay | null;
  readonly measure: coach.MeasureKind;
  readonly kept: number;
  readonly broke: number;
  /** Kept share over the ledger window, null when not tested in it. */
  readonly consistency: number | null;
  readonly windowSeasons: number;
  /** Decision-log ids, newest first. */
  readonly recentKept: readonly number[];
  readonly recentBroke: readonly number[];
  readonly behaviour: Behaviour;
  /** Discipline rows show L3.3.1's value (E10.4.1 rule 5). */
  readonly fromDiscipline: boolean;
}

export interface LedgerView {
  readonly whose: 'own' | 'boss';
  /** The boss's name on a staff view; null for his own. */
  readonly ownerName: string | null;
  /** His statement in his own words, never parsed (E10.1.1). */
  readonly statement: string;
  /** Below head coach his own statement is a private draft (E10.5.2). */
  readonly draft: boolean;
  /** Active commitments first, in the order stated; dropped ones stay in the history. */
  readonly rows: readonly LedgerRowView[];
  /** "Does what he says" across all commitments (N2.8). */
  readonly overall: { readonly kept: number; readonly broke: number; readonly share: number | null };
}

export interface LedgerInput {
  readonly philosophy: coach.Philosophy;
  /** Logged decisions the measures read (from N3 and the owner leaves). */
  readonly decisions: readonly coach.LedgerDecision[];
  readonly now: WorldDay;
}

function behaviour(kept: number, broke: number): Behaviour {
  if (kept + broke === 0) return 'not_yet_tested';
  if (broke === 0) return 'kept_every_time';
  if (kept === 0) return 'broke_every_time';
  return 'kept_and_broke';
}

export function buildLedgerView(input: LedgerInput, whose: 'own' | 'boss' = 'own', ownerName: string | null = null): LedgerView {
  const rows = coach.buildLedger(input.philosophy, input.decisions, input.now);
  const windowSeasons = coach.param('ledgerWindowSeasons');
  const views: LedgerRowView[] = rows.map((r) => ({
    catalogueId: r.catalogueId, wording: r.wording, textKey: r.textKey, audience: r.audience,
    stated: r.dateStated, dropped: r.dropped, measure: r.measure, kept: r.honoured, broke: r.broken,
    consistency: r.consistency, windowSeasons, recentKept: r.recentHonoured, recentBroke: r.recentBroken,
    behaviour: behaviour(r.honoured, r.broken), fromDiscipline: r.fromL3,
  }));
  const ordered = [...views.filter((r) => r.dropped === null), ...views.filter((r) => r.dropped !== null)];
  const m = coach.consistencyMeasure(rows);
  return {
    whose, ownerName: whose === 'boss' ? ownerName : null, statement: input.philosophy.text,
    draft: input.philosophy.draft, rows: ordered, overall: { kept: m.honoured, broke: m.broken, share: m.share },
  };
}

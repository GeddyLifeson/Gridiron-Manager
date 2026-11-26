// The parts of the notebook read model (app-services read-models/notebook) the screen shows. Declared here
// because app-ui imports only the app-services entry point. No field here is a count of notes, a streak or
// a completion measure (E11.4.1 rule 6), and no ledger field carries a grade or model margin (E10.4.1).
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const nbTextIds = (): string[] => Object.keys(STRINGS);
export const hasNbText = (id: string): boolean => id in STRINGS;
export function nt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

export const NOTE_KINDS = ['general', 'opponent', 'official', 'player', 'staff', 'self', 'idea', 'job'] as const;
export type UiNoteKind = (typeof NOTE_KINDS)[number];
export const SUBJECT_TYPES = ['person', 'team', 'crew', 'play', 'formation', 'concept', 'game', 'decision', 'situation', 'opening'] as const;
export type UiSubjectType = (typeof SUBJECT_TYPES)[number];
export const PROMPT_TRIGGERS = ['game_end', 'job_end', 'season_end'] as const;
export type UiPromptTrigger = (typeof PROMPT_TRIGGERS)[number];

export interface UiDate { readonly seasonYear: number; readonly dayIndex: number; readonly real?: string | null }

export interface UiNoteRow {
  readonly id: number;
  readonly text: string;
  readonly kind: UiNoteKind;
  readonly pinned: boolean;
  readonly season: number;
  readonly created: UiDate;
  readonly edited: UiDate | null;
  readonly subjects: readonly { readonly type: UiSubjectType; readonly id: number | string; readonly name: string }[];
  readonly tags: readonly string[];
  readonly job: { readonly key: string; readonly name: string };
  readonly inheritedFrom: string | null;
  readonly subjectMeasure: string | null;
  readonly attachment: 'philosophy_draft' | 'identity_draft' | null;
}

export interface UiNotebookView {
  readonly rows: readonly UiNoteRow[];
  readonly facets: {
    readonly kinds: readonly UiNoteKind[];
    readonly subjectTypes: readonly UiSubjectType[];
    readonly tags: readonly string[];
    readonly seasons: readonly number[];
    readonly jobs: readonly { readonly key: string; readonly name: string }[];
  };
  readonly blank: boolean;
  readonly promptsOn: Readonly<Record<UiPromptTrigger, boolean>>;
}

export interface UiNotebookFilter {
  readonly text: string;
  readonly kind: UiNoteKind | null;
  readonly subjectType: UiSubjectType | null;
  readonly tag: string | null;
  readonly season: number | null;
  readonly job: string | null;
}

export const NO_FILTER: UiNotebookFilter = { text: '', kind: null, subjectType: null, tag: null, season: null, job: null };

export type UiNotebookAction =
  | { readonly kind: 'write'; readonly text: string; readonly tags?: readonly string[] }
  | { readonly kind: 'edit'; readonly id: number; readonly text: string }
  | { readonly kind: 'pin'; readonly id: number; readonly pinned: boolean }
  | { readonly kind: 'merge'; readonly ids: readonly number[] }
  | { readonly kind: 'delete'; readonly id: number }
  | { readonly kind: 'prompt'; readonly trigger: UiPromptTrigger; readonly on: boolean };

export type UiActionResult = { readonly ok: true } | { readonly ok: false; readonly key: string };

export type UiBehaviour = 'not_yet_tested' | 'kept_every_time' | 'broke_every_time' | 'kept_and_broke';

export interface UiLedgerRow {
  readonly catalogueId: string;
  readonly wording: string | null;
  readonly textKey: string;
  readonly audience: 'team' | 'staff' | 'owner' | 'public';
  readonly stated: UiDate;
  readonly dropped: UiDate | null;
  readonly measure: string;
  readonly kept: number;
  readonly broke: number;
  readonly consistency: number | null;
  readonly windowSeasons: number;
  readonly recentKept: readonly number[];
  readonly recentBroke: readonly number[];
  readonly behaviour: UiBehaviour;
  readonly fromDiscipline: boolean;
}

export interface UiLedgerView {
  readonly whose: 'own' | 'boss';
  readonly ownerName: string | null;
  readonly statement: string;
  readonly draft: boolean;
  readonly rows: readonly UiLedgerRow[];
  readonly overall: { readonly kept: number; readonly broke: number; readonly share: number | null };
}

export type NotebookTab = 'notes' | 'ledger';

export const dateText = (d: UiDate): string =>
  d.real ? nt('nb.date.real', { season: d.seasonYear, day: d.dayIndex, real: d.real }) : nt('nb.date', { season: d.seasonYear, day: d.dayIndex });
export const pct = (x: number): string => `${Math.round(x * 100)}%`;

const isKind = (s: string | undefined): s is UiNoteKind => (NOTE_KINDS as readonly string[]).includes(s ?? '');
const isSubject = (s: string | undefined): s is UiSubjectType => (SUBJECT_TYPES as readonly string[]).includes(s ?? '');

/** The filter and tab live in the address (O1.1.3). */
export function notebookStateFromView(view: Record<string, string>): { tab: NotebookTab; filter: UiNotebookFilter } {
  const tab: NotebookTab = view.tab === 'ledger' ? 'ledger' : 'notes';
  return {
    tab,
    filter: {
      text: view.q ?? '',
      kind: isKind(view.kind) ? view.kind : null,
      subjectType: isSubject(view.about) ? view.about : null,
      tag: view.tag || null,
      season: view.season && /^\d+$/.test(view.season) ? Number(view.season) : null,
      job: view.job || null,
    },
  };
}

export function viewFromNotebookState(tab: NotebookTab, f: UiNotebookFilter): Record<string, string> {
  const out: Record<string, string> = {};
  if (tab !== 'notes') out.tab = tab;
  if (f.text) out.q = f.text;
  if (f.kind) out.kind = f.kind;
  if (f.subjectType) out.about = f.subjectType;
  if (f.tag) out.tag = f.tag;
  if (f.season !== null) out.season = String(f.season);
  if (f.job) out.job = f.job;
  return out;
}

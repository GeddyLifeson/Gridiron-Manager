// Shapes of the playbook library read model (O3.3.1). Plain types: the zod schema with a visibility class
// on every field lives in @gm/schema (request CR-G67-S1), because app-services may not import zod itself.
// Every field is public to the club's staff except `readinessEstimate`, an observer estimate (G5.4.1).

/** Filter fields. `formation`, `concept` and `personnel` hold part ids from `options` (G3.5.1 filters by part). */
export interface PlaybookFilter {
  readonly text?: string;
  readonly formation?: string;
  readonly concept?: string;
  readonly personnel?: string;
  readonly role?: string;
  readonly situation?: string;
  readonly status?: string;
  readonly readinessAtLeast?: number;
  readonly includeRetired?: boolean;
}

export interface PlaybookRow {
  readonly id: string;
  readonly call: string;
  readonly family: string;
  readonly section: string;
  readonly personnel: string;
  readonly formation: string;
  readonly concept: string;
  readonly protection: string;
  readonly tags: readonly string[];
  readonly status: string;
  readonly role: string;
  readonly readinessEstimate: number | null;
  readonly called: number;
  readonly lastCalledWeek: number | null;
  /** Average result with its sample size (N3); null with no sample. */
  readonly avgResult: number | null;
  readonly sample: number;
  readonly lengthS: number;
  readonly words: number;
  readonly overLimit: boolean;
  readonly latestStartS: number | null;
}

export interface PlaybookFamily { readonly key: string; readonly plays: readonly string[]; /** Base plays with no linked complement (O3.3.1 family gaps). */ readonly gaps: readonly string[] }

export interface PlaybookWord {
  readonly partId: string;
  readonly type: string;
  readonly word: string;
  readonly syllables: number;
  readonly usedBy: number;
  readonly duplicate: boolean;
  readonly soundsLike: readonly string[];
}

export interface PlaybookLock { readonly allowed: boolean; readonly heldBy: string | null; readonly suggest: boolean }
export type PlaybookLocks = Readonly<Record<'view' | 'draft_play' | 'edit_group_coaching_points' | 'edit_side_playbook' | 'build_plan_and_sheet' | 'approve' | 'draw_scout_cards', PlaybookLock>>;

export interface PlaybookSize {
  readonly readinessCeiling: number;
  readonly upkeep: number;
  readonly capacity: number;
  readonly warning: 'none' | 'amber' | 'red';
  readonly warnings: readonly string[];
  readonly sectionUpkeep: readonly { readonly section: string; readonly units: number; readonly share: number }[];
}

export interface PlaybookOption { readonly id: string; readonly word: string }

export interface PlaybookView {
  readonly teamId: number;
  readonly side: 'offense' | 'defense' | 'special_teams';
  readonly sections: readonly { readonly key: string; readonly count: number }[];
  readonly rows: readonly PlaybookRow[];
  readonly total: number;
  readonly families: readonly PlaybookFamily[];
  readonly words: readonly PlaybookWord[];
  readonly size: PlaybookSize | null;
  readonly locks: PlaybookLocks;
  readonly filter: PlaybookFilter;
  /** Choices for the part filters, from the parts this side's live plays use. */
  readonly options: { readonly formation: readonly PlaybookOption[]; readonly concept: readonly PlaybookOption[]; readonly personnel: readonly PlaybookOption[] };
}

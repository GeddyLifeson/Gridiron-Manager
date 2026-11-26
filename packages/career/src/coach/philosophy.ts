// The philosophy statement (E10.1.1) and the commitment catalogue. A commitment is a catalogue entry
// with a defined measure (E10.4.1 rule 1); the coach may reword what is shown but cannot create one the
// game cannot measure. His own words are free text and are never parsed. Stating, rewording or dropping
// a commitment changes nothing outside this object (E10.1.1 acceptance); no entry grants anything.
//
// The catalogue below is final: Marlon approved these nine entries on 2026-11-26 14:06 UTC ("use those
// 9 coach commitments"), closing the E10.1.1 open question. Each entry's test lives in ./ledger.ts and
// reads only logged decisions. Adding or removing an entry needs his approval.
import { param } from './params.ts';

export interface WorldDay { readonly seasonYear: number; readonly dayIndex: number }

export const dayOrder = (a: WorldDay, b: WorldDay): number => (a.seasonYear - b.seasonYear) || (a.dayIndex - b.dayIndex);

/** Kinds of logged decision a commitment can be tested on (./ledger.ts LedgerDecision). */
export type MeasureKind =
  | 'depth_change' | 'discipline_case' | 'fourth_down' | 'two_point' | 'young_snaps'
  | 'game_penalties' | 'late_game_calls' | 'roster_notice' | 'injury_return';

/** Who sees a break or an honour (E10.4.1 rule 3). */
export type WitnessRule = 'public' | 'player_and_witnesses' | 'team' | 'staff';

export interface CatalogueEntry {
  readonly id: string;
  /** Default wording, a text key. The coach may reword it (E10.1.1 rule 1). */
  readonly textKey: string;
  readonly measure: MeasureKind;
  readonly witnesses: WitnessRule;
  /** Owner leaf of the decisions it reads. */
  readonly reads: string;
}

export const COMMITMENT_CATALOGUE: readonly CatalogueEntry[] = [
  { id: 'best_player_plays', textKey: 'commitment.best_player_plays', measure: 'depth_change', witnesses: 'player_and_witnesses', reads: 'M2, N1' },
  { id: 'rules_same_for_everyone', textKey: 'commitment.rules_same_for_everyone', measure: 'discipline_case', witnesses: 'team', reads: 'L3.3.1' },
  { id: 'go_when_numbers_say_go', textKey: 'commitment.go_when_numbers_say_go', measure: 'fourth_down', witnesses: 'public', reads: 'N3' },
  { id: 'go_for_two_when_numbers_say', textKey: 'commitment.go_for_two_when_numbers_say', measure: 'two_point', witnesses: 'public', reads: 'N3' },
  { id: 'run_to_win_fourth_quarter', textKey: 'commitment.run_to_win_fourth_quarter', measure: 'late_game_calls', witnesses: 'public', reads: 'N2, G8' },
  { id: 'young_players_real_snaps', textKey: 'commitment.young_players_real_snaps', measure: 'young_snaps', witnesses: 'team', reads: 'N2' },
  { id: 'tell_you_first', textKey: 'commitment.tell_you_first', measure: 'roster_notice', witnesses: 'player_and_witnesses', reads: 'H6, L1' },
  { id: 'no_beating_ourselves', textKey: 'commitment.no_beating_ourselves', measure: 'game_penalties', witnesses: 'public', reads: 'B8' },
  { id: 'nobody_plays_hurt', textKey: 'commitment.nobody_plays_hurt', measure: 'injury_return', witnesses: 'player_and_witnesses', reads: 'D11.3, H5' },
];

export function catalogueEntry(id: string): CatalogueEntry {
  const e = COMMITMENT_CATALOGUE.find((x) => x.id === id);
  if (!e) throw new Error(`coach: unknown commitment ${id}`);
  return e;
}

export type Audience = 'team' | 'staff' | 'owner' | 'public';
/** Where the commitment was made: the editor, a press conference (H7) or a one-on-one (L1). */
export type CommitmentSource = 'editor' | 'press' | 'one_on_one';

export interface Commitment {
  readonly catalogueId: string;
  /** The coach's own wording, or null for the catalogue's. Display only. */
  readonly wording: string | null;
  readonly dateStated: WorldDay;
  readonly audience: Audience;
  readonly source: CommitmentSource;
  /** One-on-one commitments name the player told in person (E10.4.1 rule 3, larger effect). */
  readonly toPersonId: number | null;
  /** Date dropped, or null while active. A dropped commitment stays in the history (E10.4.1 edge case). */
  readonly dropped: WorldDay | null;
}

export type PhilosophyEventKind = 'stated' | 'reworded' | 'dropped' | 'auto_added' | 'text_changed';
export interface PhilosophyEvent {
  readonly kind: PhilosophyEventKind;
  readonly date: WorldDay;
  readonly catalogueId: string | null;
}

/** The statement (E10.1.1 outputs `philosophy`): his own words plus commitments. */
export interface Philosophy {
  readonly personId: number;
  /** Free text, any length, never parsed (E10.1.1 rule 1). */
  readonly text: string;
  readonly commitments: readonly Commitment[];
  readonly events: readonly PhilosophyEvent[];
  /** Below head coach the statement is a private draft and has no effect (E10.5.2 rule 1). */
  readonly draft: boolean;
}

export type PhilosophyResult =
  | { readonly ok: true; readonly philosophy: Philosophy; readonly noticeKey: string | null }
  | { readonly ok: false; readonly key: string };

export function emptyPhilosophy(personId: number, draft: boolean): Philosophy {
  return { personId, text: '', commitments: [], events: [], draft };
}

export const activeCommitments = (p: Philosophy): readonly Commitment[] => p.commitments.filter((c) => c.dropped === null);

export function setText(p: Philosophy, text: string, date: WorldDay): Philosophy {
  return { ...p, text, events: [...p.events, { kind: 'text_changed', date, catalogueId: null }] };
}

function add(p: Philosophy, c: Omit<Commitment, 'dropped'>, kind: PhilosophyEventKind): PhilosophyResult {
  if (!COMMITMENT_CATALOGUE.some((e) => e.id === c.catalogueId)) return { ok: false, key: 'philosophy.not_measurable' };
  const active = activeCommitments(p);
  const same = active.find((x) => x.catalogueId === c.catalogueId && x.audience === c.audience && x.toPersonId === c.toPersonId);
  if (same) return { ok: true, philosophy: p, noticeKey: null };
  if (active.length >= param('maxCommitments')) return { ok: false, key: 'philosophy.too_many_commitments' };
  return {
    ok: true,
    philosophy: { ...p, commitments: [...p.commitments, { ...c, dropped: null }], events: [...p.events, { kind, date: c.dateStated, catalogueId: c.catalogueId }] },
    noticeKey: kind === 'auto_added' ? 'philosophy.notice.held_to_what_you_said' : null,
  };
}

/** State a commitment from the editor (E10.1.1). At most eight active (rule 4). */
export function stateCommitment(p: Philosophy, catalogueId: string, audience: Audience, date: WorldDay, wording: string | null = null): PhilosophyResult {
  return add(p, { catalogueId, wording, dateStated: date, audience, source: 'editor', toPersonId: null }, 'stated');
}

/**
 * E10.1.1 rule 5: a statement in a press conference (H7) or a one-on-one (L1) that matches a catalogue
 * entry is added to that audience with a notice. The caller supplies the match (the conversation
 * option's catalogue id); no free text is parsed here.
 */
export function recordSpokenCommitment(p: Philosophy, catalogueId: string, source: Exclude<CommitmentSource, 'editor'>, date: WorldDay, toPersonId: number | null): PhilosophyResult {
  const audience: Audience = source === 'press' ? 'public' : 'team';
  return add(p, { catalogueId, wording: null, dateStated: date, audience, source, toPersonId: source === 'one_on_one' ? toPersonId : null }, 'auto_added');
}

export function rewordCommitment(p: Philosophy, catalogueId: string, wording: string | null, date: WorldDay): Philosophy {
  return {
    ...p,
    commitments: p.commitments.map((c) => (c.catalogueId === catalogueId && c.dropped === null ? { ...c, wording } : c)),
    events: [...p.events, { kind: 'reworded', date, catalogueId }],
  };
}

/** Dropping is itself an event ("He used to say the best man plays", rule 3). */
export function dropCommitment(p: Philosophy, catalogueId: string, date: WorldDay): Philosophy {
  return {
    ...p,
    commitments: p.commitments.map((c) => (c.catalogueId === catalogueId && c.dropped === null ? { ...c, dropped: date } : c)),
    events: [...p.events, { kind: 'dropped', date, catalogueId }],
  };
}

/** Taking a head coach job turns a private draft into the stated philosophy (E10.5.2). */
export function presentDraft(p: Philosophy, date: WorldDay): Philosophy {
  return { ...p, draft: false, commitments: p.commitments.map((c) => (c.dropped === null ? { ...c, dateStated: date } : c)) };
}

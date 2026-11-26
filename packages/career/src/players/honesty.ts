// Honesty and consistency of word (L1.3.2). `coach_word` is team-wide, 0 to 100, changes only through logged
// events, and multiplies the trust effect of every later statement. It is never shown: players' talk about
// it reaches the user as a label through the shared label engine (area N), which reads the log rows.
import { clamp } from './math.ts';
import { pp } from './params.ts';

export type WordEventKind = 'caught_falsehood' | 'promise_kept' | 'promise_broken' | 'public_contradicted';

/** One logged change to coach_word, traceable to its source event (L1.3.2 acceptance, N3). */
export interface WordEvent {
  readonly kind: WordEventKind;
  readonly sourceEventId: number;
}

export interface CoachWord {
  readonly coachId: number;
  readonly value: number;
  /** Every change, oldest first: the log N3 and the label engine read. */
  readonly history: readonly { readonly kind: WordEventKind; readonly sourceEventId: number; readonly change: number }[];
}

/** Start at 60 plus the carry-over from his reputation with players, -60 to +40 (L1.3.2). */
export function newCoachWord(coachId: number, reputationCarry: number): CoachWord {
  return { coachId, value: clamp(pp('word.start') + reputationCarry, 0, pp('record.scaleMax')), history: [] };
}

function delta(kind: WordEventKind): number {
  switch (kind) {
    case 'caught_falsehood': return pp('word.caughtFalsehood');
    case 'promise_kept': return pp('word.kept');
    case 'promise_broken': return pp('word.broken');
    case 'public_contradicted': return pp('word.publicContradicted');
  }
}

export function applyWordEvent(w: CoachWord, e: WordEvent): CoachWord {
  const value = clamp(w.value + delta(e.kind), 0, pp('record.scaleMax'));
  return { ...w, value, history: [...w.history, { kind: e.kind, sourceEventId: e.sourceEventId, change: value - w.value }] };
}

/** Statement effect multiplier = 0.5 + coach_word/100 (L1.3.2). */
export function statementMultiplier(w: CoachWord): number {
  return pp('word.multBase') + w.value / 100;
}

/** A public statement and a later action, for the two-week contradiction check (L1.3.2). */
export interface PublicStatementCheck {
  /** Days from the statement to the action that contradicts it. */
  readonly daysToContradiction: number;
  /** Misdirection to the media about game plans never counts (L1.3.2 edge case). */
  readonly gamePlanMisdirection: boolean;
  /** Protecting a player in public while correcting him in private, or "a coach's decision" for a scratch. */
  readonly protectiveOrNeutral: boolean;
}

/** True when the statement counts as contradicted by action within two weeks (L1.3.2). */
export function isPublicContradiction(c: PublicStatementCheck): boolean {
  if (c.gamePlanMisdirection || c.protectiveOrNeutral) return false;
  return c.daysToContradiction >= 0 && c.daysToContradiction <= pp('word.publicWindowDays');
}

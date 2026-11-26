// Commands of the people screens (G-72; O4.1, O4.3, O4.4, O4.5). Each turns an intent into a command
// request or a refusal. No command here edits medical clearance (O4.1.4 acceptance) or reads a hidden
// value. Command types are registered by the integrator (CR-G72-3).
import type { OwnerView, PlayerCardView } from '../../read-models/people/index.ts';

export interface Refusal { readonly ok: false; readonly rule: string; readonly message: string; readonly fix: string }
export type CommandRequest<P> = { readonly ok: true; readonly type: string; readonly payload: P } | Refusal;
const refuse = (rule: string, message: string, fix: string): Refusal => ({ ok: false, rule, message, fix });

/** Pay staff hours to re-evaluate a player (O4.1.2; M3, E7). */
export function requestReevaluation(card: PlayerCardView, attributeGroup: string | null): CommandRequest<{ personId: number; clubId: number; group: string | null }> {
  return { ok: true, type: 'RequestEvaluation', payload: { personId: card.personId, clubId: card.clubId, group: attributeGroup } };
}

/** Write a note on a card (O4.1.1 output). */
export function writeNote(card: PlayerCardView, text: string): CommandRequest<{ personId: number; text: string }> {
  const t = text.trim();
  if (!t) return refuse('O4.1.1', 'A note needs some text.', 'Type the note.');
  return { ok: true, type: 'WriteNote', payload: { personId: card.personId, text: t } };
}

/** Ask for a meeting with a person (O4.1.5, O4.3.1, O4.4.1, O4.5.1; L1). */
export function requestMeeting(personId: number | null, subjectKey: string): CommandRequest<{ personId: number; subjectKey: string }> {
  if (personId === null) return refuse('O4.4.2', 'Nobody holds that seat.', 'Pick a person.');
  return { ok: true, type: 'RequestMeeting', payload: { personId, subjectKey } };
}

/** A request to the general manager for a move he holds (O4.5.1; L5.2.1). */
export function gmRequest(view: OwnerView, moveKey: string, personId: number | null): CommandRequest<{ moveKey: string; personId: number | null; toPersonId: number }> {
  if (view.gm.personId === null) return refuse('O4.5.1', 'There is no general manager to ask.', 'Make the move yourself where you hold it.');
  const say = view.gm.say.find((s) => s.moveKey === moveKey);
  if (say?.holderKey === 'coach') return refuse('O4.5.1', 'You hold this move yourself.', 'Make it on the roster moves screen.');
  return { ok: true, type: 'GmRequest', payload: { moveKey, personId, toPersonId: view.gm.personId } };
}

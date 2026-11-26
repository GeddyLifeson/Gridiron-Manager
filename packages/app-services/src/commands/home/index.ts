// Commands of the office screens (G-72; O1.2.2, O1.2.3). Each turns a screen intent into a command
// request, or refuses with the rule and the fix. The command types and payload schemas are registered by
// the integrator (CR-G72-3); until then these are the shapes the world side reads.
import type { AdvanceTarget, HomeView, Moment } from '../../read-models/home/index.ts';

export interface Refusal { readonly ok: false; readonly rule: string; readonly message: string; readonly fix: string }
export type CommandRequest<P> = { readonly ok: true; readonly type: string; readonly payload: P } | Refusal;

const refuse = (rule: string, message: string, fix: string): Refusal => ({ ok: false, rule, message, fix });

/** Answer an inbox item with one of its choices; the owning system applies it and N3 logs it (O1.2.2). */
export function answerItem(view: HomeView, itemId: number, choice: string): CommandRequest<{ itemId: number; choice: string }> {
  const item = view.inbox.find((i) => i.itemId === itemId);
  if (!item) return refuse('O1.2.2', 'That item is not in your inbox.', 'Refresh the inbox.');
  if (!item.answerCommand) return refuse('O1.2.2', 'This item is a note and needs no answer.', 'Mark it read.');
  return { ok: true, type: item.answerCommand, payload: { itemId, choice } };
}

/** Advance the calendar. Refused past an unanswered must item's deadline (O1.2.2 acceptance 1). */
export function advance(view: HomeView, target: AdvanceTarget): CommandRequest<{ to: Moment; target: AdvanceTarget }> {
  const opt = view.advance.find((o) => o.target === target);
  if (!opt || !opt.to) return refuse('O1.2.3', 'There is nothing to advance to.', 'Pick another target.');
  if (opt.blockedBy.length) {
    return refuse('O1.2.2', `Answer ${opt.blockedBy.length === 1 ? 'the must item' : `${opt.blockedBy.length} must items`} first: time cannot pass a must deadline.`, 'Open the inbox and answer the must items.');
  }
  return { ok: true, type: 'AdvanceTime', payload: { to: opt.to, target } };
}

/** Mark a note read. */
export function markRead(view: HomeView, itemId: number): CommandRequest<{ itemId: number }> {
  if (!view.inbox.some((i) => i.itemId === itemId)) return refuse('O1.2.2', 'That item is not in your inbox.', 'Refresh the inbox.');
  return { ok: true, type: 'MarkInboxRead', payload: { itemId } };
}

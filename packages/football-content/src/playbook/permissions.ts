// G3.4.3 edit permissions by job: the starting table as data. Area S refines it; where this table and the
// S3.1.1 ownership matrix differ, S3 wins and this row is corrected. Controls outside a job's row are shown
// locked with the name of who holds them; the user may submit a suggestion instead.
import type { Book } from './types.ts';

export type PlaybookJob = 'graduate_assistant' | 'quality_control' | 'position_coach' | 'coordinator' | 'head_coach';
export type PlaybookAction = 'view' | 'draft_play' | 'edit_group_coaching_points' | 'edit_side_playbook' | 'build_plan_and_sheet' | 'approve' | 'draw_scout_cards';
export type Grant = 'yes' | 'no' | 'suggest' | 'own_side' | 'all';

/** The G3.4.3 starting table. */
export const PERMISSIONS: Readonly<Record<PlaybookJob, Readonly<Record<PlaybookAction, Grant>>>> = {
  graduate_assistant: { view: 'yes', draft_play: 'yes', edit_group_coaching_points: 'no', edit_side_playbook: 'no', build_plan_and_sheet: 'no', approve: 'no', draw_scout_cards: 'yes' },
  quality_control: { view: 'yes', draft_play: 'yes', edit_group_coaching_points: 'no', edit_side_playbook: 'no', build_plan_and_sheet: 'no', approve: 'no', draw_scout_cards: 'yes' },
  position_coach: { view: 'yes', draft_play: 'yes', edit_group_coaching_points: 'yes', edit_side_playbook: 'suggest', build_plan_and_sheet: 'suggest', approve: 'no', draw_scout_cards: 'no' },
  coordinator: { view: 'yes', draft_play: 'yes', edit_group_coaching_points: 'yes', edit_side_playbook: 'own_side', build_plan_and_sheet: 'own_side', approve: 'own_side', draw_scout_cards: 'no' },
  head_coach: { view: 'yes', draft_play: 'yes', edit_group_coaching_points: 'yes', edit_side_playbook: 'all', build_plan_and_sheet: 'all', approve: 'all', draw_scout_cards: 'no' },
};

/** Job for a career rung (S1 ladder: 1 to 3 entry staff, 4 to 6 position coach, 7 coordinator, 8 and 9 head coach). */
export function jobForRung(rung: number): PlaybookJob {
  if (rung <= 2) return 'graduate_assistant';
  if (rung === 3) return 'quality_control';
  if (rung <= 6) return 'position_coach';
  if (rung === 7) return 'coordinator';
  return 'head_coach';
}

export interface Holder { readonly job: PlaybookJob; /** The side the user coordinates, if any. */ readonly side?: Book; /** A head coach who also calls plays on a side holds coordinator rights there. */ readonly callsPlaysOn?: Book }

export type Access = { readonly allowed: true } | { readonly allowed: false; readonly suggest: boolean; readonly heldBy: PlaybookJob };

/** May this holder take this action on this side? Locked controls name who holds them (G3.4.3). */
export function access(h: Holder, action: PlaybookAction, side: Book): Access {
  const g = PERMISSIONS[h.job][action];
  if (g === 'yes' || g === 'all') return { allowed: true };
  if (g === 'own_side' && h.side === side) return { allowed: true };
  if (h.job === 'head_coach' && h.callsPlaysOn === side) return { allowed: true };
  const heldBy: PlaybookJob = g === 'own_side' ? 'head_coach' : (action === 'edit_side_playbook' || action === 'build_plan_and_sheet' || action === 'approve') ? 'coordinator' : 'position_coach';
  return { allowed: false, suggest: g === 'suggest' || g === 'own_side' || action !== 'view', heldBy };
}

export interface Suggestion { readonly id: string; readonly from: string; readonly to: PlaybookJob; readonly action: PlaybookAction; readonly side: Book; readonly payload: string; readonly answer: 'pending' | 'accepted' | 'declined' }

/** A suggestion record for L4: the superior decides by his own beliefs and trust (L4), not here. */
export function suggest(id: string, from: string, h: Holder, action: PlaybookAction, side: Book, payload: string): Suggestion {
  const a = access(h, action, side);
  if (a.allowed) throw new Error('allowed actions are taken, not suggested');
  return { id, from, to: a.heldBy, action, side, payload, answer: 'pending' };
}

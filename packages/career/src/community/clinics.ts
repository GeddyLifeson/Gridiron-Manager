// L8.4.3 clinics and the coaching community. The gain is people who know him: every tie written here
// carries a dated source event (acceptance), and no clinic changes an attribute (the orders have no
// such kind). Sharing real scheme detail has a real cost: opponents tied to an attendee learn it.
import type { WorldDate } from '@gm/schema';
import { compliance } from '@gm/league';
import type { Order } from '../crisis/orders.ts';
import type { StreamFor } from '../crisis/events.ts';
import { param } from './params.ts';

export type ClinicKind = 'speak' | 'visit' | 'host' | 'listen';

export interface ClinicInvitation {
  readonly id: number;
  readonly kind: ClinicKind;
  readonly date: WorldDate;
  readonly minutes: number;
  /** Coaches in the room (speak, host, listen) or the staff visited (visit). */
  readonly attendeeIds: readonly number[];
  /** High school coaches who attend (L7.3.2 familiarity). */
  readonly highSchoolCoachIds: readonly number[];
}

/**
 * Offseason invitations follow visible history: a coach whose unit ranked in the top share (N2) gets
 * more. A graduate assistant gets none to speak, and may attend as a listener.
 */
export function invitationCount(unitRankShare: number | null, speaksAtAll: boolean): number {
  if (!speaksAtAll) return 0;
  const top = unitRankShare !== null && unitRankShare <= param('clinic.topUnitRankShare');
  return param('clinic.baseInvitations') + (top ? param('clinic.topUnitExtraInvitations') : 0);
}

export interface ClinicResult {
  readonly orders: Order[];
  /** Concepts he may copy into his playbook notes as ideas still to install (G3). */
  readonly conceptIdeas: readonly string[];
}

/**
 * Attend or host one clinic. `sourceEventId` is the history event that records it; every tie cites it.
 * `sharedConcept` set: opponents with a tie to an attendee get one tendency note on it (H2).
 */
export function attendClinic(
  coachId: number, inv: ClinicInvitation, sourceEventId: number, stream: StreamFor,
  opts: { readonly sharedConcept?: string | null; readonly opponentTies?: readonly { readonly teamId: number; readonly attendeeId: number }[]; readonly visitedConcepts?: readonly string[]; readonly coachTeamId?: number | null } = {},
): ClinicResult {
  const orders: Order[] = [{ kind: 'hours', personId: coachId, minutes: inv.minutes, what: `clinic:${inv.id}` }];
  const tie = (other: number, strength: number) => orders.push({ kind: 'tie', aId: coachId, bId: other, strength, sourceEventId, date: inv.date });
  let ideas: readonly string[] = [];
  if (inv.kind === 'visit') {
    for (const id of inv.attendeeIds) tie(id, param('clinic.visitTie'));
    ideas = [...(opts.visitedConcepts ?? [])];
  } else {
    const strength = param(inv.kind === 'listen' ? 'clinic.listenerTie' : 'clinic.speakTie');
    const s = stream(['community', 'clinic', inv.id, coachId, compliance.dayNumber(inv.date)]);
    for (const id of inv.attendeeIds) if (s.chance(param('clinic.speakSampleShare'))) tie(id, strength);
    if (inv.kind !== 'listen') {
      for (const hs of inv.highSchoolCoachIds) orders.push({ kind: 'familiarity', holderId: hs, aboutId: coachId, delta: param('clinic.highSchoolFamiliarity') });
      orders.push({ kind: 'notice', personId: coachId, what: `clinic:${inv.kind}` });
    }
  }
  if (opts.sharedConcept && inv.kind !== 'listen') {
    const seen = new Set<number>();
    for (const t of opts.opponentTies ?? []) {
      if (!inv.attendeeIds.includes(t.attendeeId) || seen.has(t.teamId) || t.teamId === opts.coachTeamId) continue;
      seen.add(t.teamId);
      orders.push({ kind: 'scouting_note', teamId: t.teamId, aboutTeamId: opts.coachTeamId ?? 0, concept: opts.sharedConcept });
    }
  }
  return { orders, conceptIdeas: ideas };
}

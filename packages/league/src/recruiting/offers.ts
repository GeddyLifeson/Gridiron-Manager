// T4.4.5 offer volume and the committable offer; T4.4.4 pulling an offer; T4.4.3 negative recruiting.
// None of these acts breaks a rule in the rule data: they never pass through L8.2.5. Their cost is in
// relationships and memory, carried to later classes from the same high school.
import { clamp, type RecruitingContext } from './context.ts';
import { P } from './params.ts';
import { addEvidence, bumpEdge, edgeOf } from './interest.ts';
import { tieOf, tiesOfProspect } from './limits.ts';
import type { MemoryNote, Offer, PreferenceKey, RecruitingState } from './types.ts';

export function activeOffer(state: RecruitingState, prospectId: number, teamId: number): Offer | undefined {
  return state.offers.find((o) => o.prospectId === prospectId && o.teamId === teamId && !o.withdrawn);
}

export function offersOf(state: RecruitingState, prospectId: number): Offer[] {
  return state.offers.filter((o) => o.prospectId === prospectId && !o.withdrawn);
}

/** The prospect's public offer list (T4.4.5 outputs): schools only, never `committable`. */
export function publicOfferList(state: RecruitingState, prospectId: number): number[] {
  return offersOf(state, prospectId).map((o) => o.teamId).sort((a, b) => a - b);
}

/**
 * Make an offer (T4.4.5). `committable` is the offering head coach's private choice: the school will take
 * the commitment now. Each offer raises the prospect's interest a little and is seen by rivals and press.
 */
export function makeOffer(state: RecruitingState, ctx: RecruitingContext, teamId: number, prospectId: number, day: number, committable: boolean): Offer {
  const existing = activeOffer(state, prospectId, teamId);
  if (existing) { existing.committable = committable; return existing; }
  const o: Offer = { prospectId, teamId, day, committable, withdrawn: false };
  state.offers.push(o);
  const t = tieOf(state, prospectId, teamId);
  t.impression = clamp(t.impression + P('offer.impression'), P('impression.floor'), P('impression.cap'));
  // Rivals see it on his public list (T4.4.5).
  for (const other of tiesOfProspect(state, prospectId)) {
    if (other.teamId === teamId) continue;
    addEvidence(state, other.teamId, prospectId, { kind: 'public_list', day, byStaffId: null, signal: null, rivalTeamId: teamId, reason: null });
  }
  void ctx;
  return o;
}

export function setCommittable(state: RecruitingState, prospectId: number, teamId: number, committable: boolean): void {
  const o = activeOffer(state, prospectId, teamId);
  if (o) o.committable = committable;
}

function remember(state: RecruitingState, note: MemoryNote): void { state.memory.push(note); }

export type DeliveredBy = 'head_coach_call' | 'recruiter_call' | 'silence';
export type DropReason = 'chosen' | 'not_qualified' | 'new_staff';

/**
 * Withdraw an offer or drop a committed player (T4.4.4). Free of any rule before signing; refused after
 * signing (that is T7.3.2 or T6.2.1, not this leaf). Cost: standing with the player, his family and his
 * high school coach, larger the later it comes and larger by silence; small when the reason is true and
 * outside the school's choice; reduced for a new head coach.
 */
export function withdrawOffer(
  state: RecruitingState, ctx: RecruitingContext, teamId: number, prospectId: number, day: number, by: DeliveredBy, reason: DropReason,
): { ok: true } | { ok: false; reason: 'signed' | 'no_offer' } {
  const st = state.status[prospectId];
  const p = state.prospects[prospectId];
  if (!st || !p) return { ok: false, reason: 'no_offer' };
  if ((st.status === 'signed' || st.status === 'enrolled') && st.teamId === teamId) return { ok: false, reason: 'signed' };
  const o = activeOffer(state, prospectId, teamId);
  if (!o) return { ok: false, reason: 'no_offer' };
  o.withdrawn = true;
  const committed = st.status === 'committed' && st.teamId === teamId;
  const weeksHeld = committed && st.sinceDay !== null ? (day - st.sinceDay) / P('daysPerWeek') : 0;
  let cost = committed ? P('drop.committedBase') + P('drop.perWeekHeld') * weeksHeld : P('drop.offerOnly');
  if (by === 'silence') cost *= P('drop.silenceMultiplier');
  if (reason === 'not_qualified') cost *= P('drop.trueReasonShare');
  if (reason === 'new_staff') cost *= P('drop.newStaffShare');
  const prog = ctx.programs.program(teamId);
  const recruiter = state.ties[`${prospectId}:${teamId}`]?.recruiterId ?? null;
  // The family blames the school and head coach more than the recruiter who made the promise (T4.4.4 edge case).
  for (const m of p.circle) {
    bumpEdge(state, prog.headCoachId, m.memberId, -cost, day);
    if (recruiter !== null) bumpEdge(state, recruiter, m.memberId, -cost * P('drop.recruiterBlameShare'), day);
    remember(state, { aboutTeamId: teamId, holderId: m.memberId, kind: committed && weeksHeld >= P('drop.lateWeeks') ? 'dropped_late' : 'offer_pulled', day, weight: cost });
  }
  if (committed) {
    st.status = 'open'; st.teamId = null; st.sinceDay = null; st.droppedBy.push(teamId);
  }
  const t = tieOf(state, prospectId, teamId);
  t.impression = clamp(t.impression - P('drop.impressionHit'), P('impression.floor'), P('impression.cap'));
  return { ok: true };
}

/**
 * A commitment attempt refused on an offer that was not committable (T4.4.5 acceptance 3, a form of T4.4.4).
 * Writes a memory entry for the prospect and his high school coach.
 */
export function refuseCommitment(state: RecruitingState, ctx: RecruitingContext, teamId: number, prospectId: number, day: number): void {
  const p = state.prospects[prospectId];
  if (!p) return;
  const prog = ctx.programs.program(teamId);
  for (const m of p.circle) {
    if (m.relation !== 'self' && m.relation !== 'hs_coach') continue;
    bumpEdge(state, prog.headCoachId, m.memberId, -P('refuse.edgeCost'), day);
    remember(state, { aboutTeamId: teamId, holderId: m.memberId, kind: 'commitment_refused', day, weight: P('refuse.edgeCost') });
  }
  const t = tieOf(state, prospectId, teamId);
  t.impression = clamp(t.impression - P('refuse.impressionHit'), P('impression.floor'), P('impression.cap'));
}

/** Starting relationship of a staff with a new prospect from a high school, carried from past classes (T4.4.4 acceptance 2). */
export function highSchoolStanding(state: RecruitingState, staffId: number, hsCoachId: number): number {
  return edgeOf(state, staffId, hsCoachId);
}

/**
 * T4.4.3 negative recruiting: a claim about a rival. A true or false claim touching what the prospect
 * cares about lowers his interest in the rival; a prospect who dislikes it holds it against the speaker.
 * The world checks the claim later (`settleClaims`). No rule is involved: no compliance row.
 */
export function negativeClaim(
  state: RecruitingState, ctx: RecruitingContext,
  c: { speakerTeamId: number; speakerId: number; rivalTeamId: number; prospectId: number; topic: PreferenceKey; isTrue: boolean; day: number },
): number {
  const p = state.prospects[c.prospectId];
  if (!p) return 0;
  const self = p.circle.find((m) => m.relation === 'self')!;
  const cares = self.prefs[c.topic] / Math.max(P('epsilon'), Math.max(...Object.values(self.prefs)));
  const rival = tieOf(state, c.prospectId, c.rivalTeamId);
  rival.impression = clamp(rival.impression - P('negative.effect') * cares, P('impression.floor'), P('impression.cap'));
  if (p.dislikesNegative) {
    const own = tieOf(state, c.prospectId, c.speakerTeamId);
    own.impression = clamp(own.impression - P('negative.backlash'), P('impression.floor'), P('impression.cap'));
  }
  const id = state.nextClaimId++;
  state.claims.push({ id, ...c, settled: false });
  void ctx;
  return id;
}

/**
 * Weekly check of open claims (T4.4.3). A false claim is found out at a weekly chance (the rival answers
 * it, the event does not happen, the family checks): it reverses, and the speaker loses standing with the
 * prospect, his family and his high school coach. A claim the world makes true later restores and raises
 * the speaker's standing. `becameTrue` is the world's answer for claims that were false when made.
 */
export function settleClaims(state: RecruitingState, ctx: RecruitingContext, day: number, becameTrue: (claimId: number) => boolean): void {
  for (const c of state.claims) {
    if (c.settled) continue;
    const p = state.prospects[c.prospectId];
    if (!p) { c.settled = true; continue; }
    if (!c.isTrue && becameTrue(c.id)) {
      c.settled = true;
      for (const m of p.circle) bumpEdge(state, c.speakerId, m.memberId, P('negative.confirmedGain'), day);
      continue;
    }
    if (c.isTrue) continue;
    if (!ctx.rng(['claim', c.id, day]).chance(P('negative.foundWeekly'))) continue;
    c.settled = true;
    const rival = tieOf(state, c.prospectId, c.rivalTeamId);
    rival.impression = clamp(rival.impression + P('negative.effect'), P('impression.floor'), P('impression.cap'));
    for (const m of p.circle) {
      bumpEdge(state, c.speakerId, m.memberId, -P('negative.foundCost'), day);
      remember(state, { aboutTeamId: c.speakerTeamId, holderId: m.memberId, kind: 'false_claim_found', day, weight: P('negative.foundCost') });
    }
  }
}

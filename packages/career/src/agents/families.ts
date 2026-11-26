// L7.3 families and outside voices: families (both levels), high school coaches, and college players'
// representatives. Families exist only for generated people: a real-imported player or coach has no family
// object, no family events and no family panel (L7.3.1 guard, L9.1.2). The functions refuse otherwise.
import { ap, clamp } from './params.ts';
import { mem, type MemoryWrite, type PromiseEntry } from './shared.ts';
import type { DisciplineSchedule } from './keys.ts';

export interface PersonFlags {
  readonly personId: number;
  /** Came from a people pack of real people (U, A6). */
  readonly imported: boolean;
}

export type FamilyRole = 'parent' | 'guardian' | 'spouse' | 'sibling';

export interface FamilyMember {
  readonly personId: number;
  readonly ofPersonId: number;
  readonly role: FamilyRole;
  /** 0.3 to 1.0 (L7.3.1). */
  readonly closeness: number;
  readonly metCoach: boolean;
}

/** The guard: may this person have family records at all? */
export function familyAllowed(p: PersonFlags): boolean {
  return !p.imported;
}

/** Keep only family members of people the guard allows (import and generation both pass through here). */
export function guardFamilies(members: readonly FamilyMember[], people: ReadonlyMap<number, PersonFlags>): FamilyMember[] {
  return members.filter((m) => {
    const p = people.get(m.ofPersonId);
    return p !== undefined && familyAllowed(p);
  });
}

/** Clamp a generated closeness into the L7.3.1 range. */
export function familyCloseness(raw: number): number {
  return clamp(raw, ap('family.closenessMin'), ap('family.closenessMax'));
}

/**
 * A family member's pull on the player: the player's D5 family value (0 to 100) times closeness. One advice
 * event moves role_belief or the stay-or-leave leaning by up to 5 points, the same size as an agent's.
 */
export function familyInfluence(familyValue: number, closeness: number): number {
  return (clamp(familyValue, 0, 100) / 100) * familyCloseness(closeness);
}

export function familyAdviceDelta(familyValue: number, closeness: number, direction: 'stay' | 'leave'): number {
  const v = ap('family.adviceMax') * familyInfluence(familyValue, closeness);
  return direction === 'stay' ? v : -v;
}

export type FamilyAct = 'call_after_surgery' | 'meeting_given' | 'meeting_refused';

/** The coach's acts toward a family write the same memory on the family member's and the player's records. */
export function familyActMemories(coachId: number, member: FamilyMember, player: PersonFlags, act: FamilyAct): MemoryWrite[] {
  if (!familyAllowed(player)) throw new Error('agents: family act for an imported person (L7.3.1 guard)');
  const delta = act === 'call_after_surgery' ? ap('family.surgeryCall') : act === 'meeting_given' ? ap('family.meetingGiven') : ap('family.meetingRefused');
  return [mem(member.personId, coachId, delta, `family_${act}`), mem(player.personId, coachId, delta, `family_${act}`)];
}

/** What an adult player lets the staff tell his family (starting default: football yes, medical detail no). */
export interface DisclosureFlag {
  readonly football: boolean;
  readonly medical: boolean;
}

export const DEFAULT_DISCLOSURE: DisclosureFlag = { football: true, medical: false };

export type ShareKind = 'football' | 'medical';

/** The options the user is shown. Medical detail is never offered when the player's flag is off. */
export function shareOptions(flag: DisclosureFlag): ShareKind[] {
  const out: ShareKind[] = [];
  if (flag.football) out.push('football');
  if (flag.medical) out.push('medical');
  return out;
}

/** An AI staff member (or a bug) sharing against the flag: -15 with the player for medical detail. */
export function shareWithFamily(coachId: number, playerId: number, kind: ShareKind, flag: DisclosureFlag): MemoryWrite[] {
  if (kind === 'medical' && !flag.medical) return [mem(playerId, coachId, ap('family.medicalAgainstFlag'), 'medical_shared_against_flag')];
  return [];
}

export interface Witness {
  readonly personId: number;
  readonly kind: 'parent' | 'guardian' | 'teammate' | 'hs_coach' | 'other';
}

/**
 * A broken promise copied to its witnesses. A promise made in recruiting is held by the parents as witnesses
 * at full strength (L7.3.1); everyone else gets the half-strength witness copy (L1.1.2).
 */
export function brokenPromiseCopies(p: PromiseEntry, origin: 'recruiting' | 'other', brokenDelta: number, witnesses: readonly Witness[]): MemoryWrite[] {
  return witnesses.map((w) => {
    const parent = w.kind === 'parent' || w.kind === 'guardian';
    const strength = origin === 'recruiting' && parent ? ap('witness.parentRecruitingStrength') : ap('witness.halfStrength');
    return mem(w.personId, p.promiserId, brokenDelta, 'promise_broken_witness', strength);
  });
}

// ---- High school coaches (L7.3.2) ----------------------------------------------------------------------

export type HsCoachStance = 'open' | 'neutral' | 'guarded' | 'closed';

/** Derived from the high school coach's trust in this coach; never stored, never shown (L7.3.2). */
export function hsCoachStance(trust: number): HsCoachStance {
  if (trust >= ap('hs.band.open')) return 'open';
  if (trust >= ap('hs.band.neutral')) return 'neutral';
  if (trust >= ap('hs.band.guarded')) return 'guarded';
  return 'closed';
}

/** Familiarity after a visit: +4, capped by what the recruiting calendar allows this period (T4 passes it). */
export function hsVisitFamiliarity(familiarity: number, calendarCap: number): number {
  return Math.min(calendarCap, Math.min(100, familiarity + ap('hs.visitFamiliarity')));
}

export interface HsAccess {
  /** Share by which the D6 uncertainty band on his players narrows. */
  readonly evalBandNarrowing: number;
  readonly inSchoolEvaluation: boolean;
  /** Added to a recruit's starting trust. */
  readonly recruitTrust: number;
}

export function hsAccess(stance: HsCoachStance): HsAccess {
  if (stance === 'open') return { evalBandNarrowing: ap('hs.openBandNarrowing'), inSchoolEvaluation: true, recruitTrust: ap('hs.openRecruitTrust') };
  if (stance === 'closed') return { evalBandNarrowing: 0, inSchoolEvaluation: false, recruitTrust: 0 };
  return { evalBandNarrowing: 0, inSchoolEvaluation: true, recruitTrust: 0 };
}

/** A late pulled offer or a signed player pushed out: -20 with his coach, a quarter of that to neighbours. */
export function latePullMemories(coachId: number, hsCoachId: number, neighbourHsCoachIds: readonly number[]): MemoryWrite[] {
  const d = ap('hs.latePull');
  return [mem(hsCoachId, coachId, d, 'offer_pulled_late'), ...neighbourHsCoachIds.filter((id) => id !== hsCoachId).map((id) => mem(id, coachId, d, 'offer_pulled_late_heard', ap('hs.neighbourShare')))];
}

// ---- College players' representatives (L7.3.3) ----------------------------------------------------------

/** Representative objects exist only where the year's rule data turns representation on. */
export function representativesActive(s: Pick<DisciplineSchedule, 'playerRepresentation'>): boolean {
  return s.playerRepresentation;
}

export interface RepAnswer {
  readonly promise: PromiseEntry;
  /** Shown before the user commits ("you do not hold this budget"); allowed either way. */
  readonly warning: string | null;
}

/**
 * Answer a representative. A role answer is an ordinary promise. A money term the user's seat does not hold
 * is allowed with a warning and logged unfunded: it breaks at full strength if the budget holder does not fund it.
 */
export function answerRepresentative(coachId: number, playerId: number, term: 'role' | 'money', holdsBudget: boolean, statedRole: string | null = null, byWeek: number | null = null): RepAnswer {
  const unfunded = term === 'money' && !holdsBudget;
  return {
    promise: { promiserId: coachId, holderId: playerId, about: term, statedRole, byWeek, strength: 1, keptAtOnce: false, unfunded, cause: 'representative_answer' },
    warning: unfunded ? 'agents.warn.no_budget' : null,
  };
}

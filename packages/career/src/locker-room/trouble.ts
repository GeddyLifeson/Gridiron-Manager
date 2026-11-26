// Signs of trouble (L2.5): players-only meetings and public complaints (L2.5.1), and losing the room (L2.5.2),
// the one rare, large relationship state. Trigger conditions are data (params). The `room_lost` flag never
// appears on a career screen: the user sees effort on film, staff reports, the owner and the press.
import { lp } from './params.ts';

export interface MeetingInput {
  readonly losingStreak: number;
  /** Captains with influence and trust in the coach. */
  readonly captains: readonly { readonly influence: number; readonly trustInCoach: number }[];
}

export type TroubleEvent =
  | { readonly kind: 'players_only_meeting'; readonly meaning: 'positive' | 'warning' | 'neutral'; readonly cultureDelta: number; readonly reasonText: string }
  | { readonly kind: 'public_complaint'; readonly playerId: number; readonly reasonText: string };

/**
 * A players-only meeting fires after three or more straight losses when at least one captain has influence
 * above 70 (L2.5.1). Leaders' mean trust above 55: positive (culture +3). Under 40: a warning that advances the
 * L2.5.2 sign counter. In between: neutral.
 */
export function playersOnlyMeeting(i: MeetingInput): TroubleEvent | null {
  if (i.losingStreak < lp('trouble.meeting.losingStreak')) return null;
  const leaders = i.captains.filter((c) => c.influence > lp('trouble.meeting.captainInfluenceAbove'));
  if (leaders.length === 0) return null;
  const trust = leaders.reduce((s, c) => s + c.trustInCoach, 0) / leaders.length;
  if (trust > lp('trouble.meeting.positiveTrustAbove')) return { kind: 'players_only_meeting', meaning: 'positive', cultureDelta: lp('trouble.meeting.positiveCulture'), reasonText: 'locker_room.trouble.meeting_leaders_handling' };
  if (trust < lp('trouble.meeting.warningTrustBelow')) return { kind: 'players_only_meeting', meaning: 'warning', cultureDelta: 0, reasonText: 'locker_room.trouble.meeting_warning' };
  return { kind: 'players_only_meeting', meaning: 'neutral', cultureDelta: 0, reasonText: 'locker_room.trouble.meeting_neutral' };
}

/** A public complaint fires from a player with ego above 70, role belief under 35 and leak propensity above the threshold (L2.5.1). */
export function publicComplaint(p: { readonly playerId: number; readonly ego: number; readonly roleBelief: number; readonly leakPropensity: number }): TroubleEvent | null {
  if (p.ego > lp('trouble.complaint.egoAbove') && p.roleBelief < lp('trouble.complaint.roleBeliefBelow') && p.leakPropensity > lp('trouble.complaint.leakAbove')) {
    return { kind: 'public_complaint', playerId: p.playerId, reasonText: 'locker_room.trouble.public_complaint' };
  }
  return null;
}

// ---- L2.5.2 losing the room ----

export interface RoomLostState {
  readonly flag: boolean;
  /** Consecutive weeks with weighted trust and culture both under the floor. */
  readonly weeksUnder: number;
  /** Consecutive weeks with both above the clear line while set. */
  readonly weeksAbove: number;
  /** Week indices (league year) with at least one visible sign logged: effort flags on film, an L2.5.1 warning or complaint, or a leak. */
  readonly signWeeks: readonly number[];
}

export const ROOM_OK: RoomLostState = { flag: false, weeksUnder: 0, weeksAbove: 0, signWeeks: [] };

export interface RoomWeek {
  readonly week: number;
  /** Influence-weighted trust in the head coach, 0 to 100. */
  readonly weightedTrust: number;
  readonly culture: number;
  /** A visible sign was logged this week (N1 effort flag, L2.5.1 warning or complaint, L6.3 leak). */
  readonly visibleSign: boolean;
}

/**
 * One week (L2.5.2): the flag sets when weighted trust and culture are both under 30 for four straight weeks
 * AND at least four weeks of visible signs have been logged before it (acceptance). It clears when both are
 * above 40 for three weeks. A late-season team with nothing to play for does not set it by itself (the
 * caller does not feed that as trust).
 */
export function stepRoomLost(s: RoomLostState, w: RoomWeek): { readonly state: RoomLostState; readonly event: 'set' | 'cleared' | null } {
  const signWeeks = w.visibleSign && !s.signWeeks.includes(w.week) ? [...s.signWeeks, w.week] : s.signWeeks;
  if (!s.flag) {
    const under = w.weightedTrust < lp('roomLost.trustFloor') && w.culture < lp('roomLost.cultureFloor');
    const weeksUnder = under ? s.weeksUnder + 1 : 0;
    const signsBefore = signWeeks.filter((x) => x <= w.week).length;
    if (weeksUnder >= lp('roomLost.setWeeks') && signsBefore >= lp('roomLost.signWeeks')) return { state: { flag: true, weeksUnder, weeksAbove: 0, signWeeks }, event: 'set' };
    return { state: { ...s, weeksUnder, signWeeks }, event: null };
  }
  const above = w.weightedTrust > lp('roomLost.clearAbove') && w.culture > lp('roomLost.clearAbove');
  const weeksAbove = above ? s.weeksAbove + 1 : 0;
  if (weeksAbove >= lp('roomLost.clearWeeks')) return { state: { flag: false, weeksUnder: 0, weeksAbove: 0, signWeeks: [] }, event: 'cleared' };
  return { state: { ...s, weeksAbove, signWeeks }, event: null };
}

/** The exact modifier list while the flag is set, and the neutral list when it is not (L2.5.2 acceptance). */
export interface RoomLostModifiers {
  readonly meetingAttention: number;
  readonly practiceEffort: number;
  /** team_discipline goes to its worst bound (modifier.ts reads `roomLost`). */
  readonly disciplineWorst: boolean;
  /** Per-snap chance a low-buy-in player gives reduced pursuit effort on plays away from him (K1 effort hook). */
  readonly pursuitLapseChance: number;
  /** Buy-in under which a player is "low-buy-in" for the K1 hook. */
  readonly lowBuyInBelow: number;
}

export function roomLostModifiers(flag: boolean): RoomLostModifiers {
  if (!flag) return { meetingAttention: 1, practiceEffort: 1, disciplineWorst: false, pursuitLapseChance: 0, lowBuyInBelow: lp('roomLost.lowBuyInBelow') };
  return {
    meetingAttention: lp('roomLost.attention'), practiceEffort: lp('roomLost.practiceEffort'), disciplineWorst: true,
    pursuitLapseChance: lp('roomLost.pursuitChance'), lowBuyInBelow: lp('roomLost.lowBuyInBelow'),
  };
}

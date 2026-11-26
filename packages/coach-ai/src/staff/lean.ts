// Staff with an angle (plans/head-coach-nuance.md item 1; N2, N9; K6.3.2 and I5.1.2 extended, proposed MA-83).
// A staff member's numbers carry his own error (I5.1.2, skill-based) and also a direction: the OC's fourth-down
// number leans toward going for it, the DC undersells his unit's problems, the assistant who wants a coordinator
// job oversells his room. Bad news comes soft and late, more so from a quiet man and from one whose bad news the
// head coach has punished before (K6.3.2 safety). The head coach can learn whose numbers to trust on what from
// settled calls: `trackRecord` and `corrected` are what a careful head coach does with that record.
//
// No line is made from hidden state: these functions take the staff member's own estimate and lean it. The lean
// comes from the person's facets, role and career aim (people/needs), never from a picked trait.
import type { Draws } from '../profile/index.ts';
import type { CandorHistory } from './candor.ts';
import { P, clamp, facetShare } from './params.ts';
import type { StaffMember } from './types.ts';

/** What a staff member wants from his career that bends his numbers (from people/needs, passed by the caller). */
export interface CareerAim {
  /** He wants a coordinator (or head) job: he oversells his room to show what he can do. */
  readonly wantsPromotion: boolean;
}

export const NO_AIM: CareerAim = { wantsPromotion: false };

/**
 * His fourth-down lean, in win-probability share added to "go" options: from riskTolerance (centred), plus the
 * offensive coordinator's pull toward keeping his unit on the field.
 */
export function fourthDownLean(m: StaffMember): number {
  const risk = (facetShare(m.facets.riskTolerance) - 0.5) * 2;
  const role = m.profile.role === 'offensiveCoordinator' ? P('lean_fourth_offense') : 0;
  return risk * P('lean_fourth_max') + role;
}

/** Share by which he undersells his own unit's problems (0 to `lean_own_unit`), from ego. */
export function ownUnitLean(m: StaffMember): number {
  return P('lean_own_unit') * facetShare(m.facets.ego);
}

/** How far (z) he oversells the players in his own room: career aim plus ego. */
export function roomLean(m: StaffMember, aim: CareerAim): number {
  return (aim.wantsPromotion ? P('lean_room_promotion') : 0) + P('lean_room_ego') * facetShare(m.facets.ego);
}

export interface FourthDownEstimate { readonly optionId: string; readonly wp: number }

/** His fourth-down estimates as he says them: each "go" option raised by his lean. Best first, with the margin. */
export function leanedFourthDown(own: readonly FourthDownEstimate[], goIds: readonly string[], lean: number): { said: FourthDownEstimate[]; best: string | null; margin: number } {
  const said = own.map((e) => ({ optionId: e.optionId, wp: goIds.includes(e.optionId) ? e.wp + lean : e.wp })).sort((a, b) => b.wp - a.wp || (a.optionId < b.optionId ? -1 : 1));
  const margin = said.length >= 2 ? said[0]!.wp - said[1]!.wp : 0;
  return { said, best: said[0]?.optionId ?? null, margin };
}

/** A grade he gives a player (z), leaned up when the player is in his own room. */
export function leanedGrade(own: number, inHisRoom: boolean, m: StaffMember, aim: CareerAim): number {
  return inHisRoom ? own + roomLean(m, aim) : own;
}

/** Bad news he knows: a slump, an injury that is worse than listed, a unit that is not ready. */
export interface BadNews {
  /** How bad, 0 to 1, by his own read. */
  readonly severity: number;
  /** About his own unit or room (the own-unit lean applies). */
  readonly ownUnit: boolean;
}

export interface BadNewsReport {
  /** Severity as he tells it. */
  readonly severitySaid: number;
  /** Days after he knew before it reaches the head coach. */
  readonly delayDays: number;
  /** Softening share used, for the review log (truth data, never shown in a career). */
  readonly softening: number;
}

/** How soft his bad news comes: low candor, fear (lost safety), and his own unit's lean. Never the whole of it. */
export function softening(m: StaffMember, h: CandorHistory, ownUnit: boolean): number {
  const quiet = P('filter_candor') * (1 - facetShare(m.facets.candor));
  const fear = P('filter_fear') * (1 - clamp(h.safety, 0, 1));
  return clamp(quiet + fear + (ownUnit ? ownUnitLean(m) : 0), 0, P('filter_cap'));
}

/** K6.3.2 extended: the bad news as it reaches the head coach. One uniform for the delay. */
export function reportBadNews(m: StaffMember, h: CandorHistory, news: BadNews, d: Draws): BadNewsReport {
  const s = softening(m, h, news.ownUnit);
  const delayDays = Math.round(P('filter_delay_max_days') * s * (0.5 + d.uniform()));
  return { severitySaid: clamp(news.severity, 0, 1) * (1 - s), delayDays, softening: s };
}

/** One settled call: what the adviser said and what it turned out to be worth once the evidence was in (N3). */
export interface TrackEntry { readonly said: number; readonly was: number }

export interface TrackRecord {
  readonly n: number;
  /** Mean of said minus was: his lean as the head coach can measure it. */
  readonly lean: number;
  /** Mean absolute miss after the lean is taken out. */
  readonly miss: number;
}

/** What his settled calls show about an adviser on one topic. */
export function trackRecord(entries: readonly TrackEntry[]): TrackRecord {
  const n = entries.length;
  if (n === 0) return { n: 0, lean: 0, miss: 0 };
  let sum = 0;
  for (const e of entries) sum += e.said - e.was;
  const lean = sum / n;
  let miss = 0;
  for (const e of entries) miss += Math.abs(e.said - e.was - lean);
  return { n, lean, miss: miss / n };
}

/** His number with the measured lean taken out, at a weight that grows with the settled calls behind it. */
export function corrected(said: number, rec: TrackRecord): number {
  const w = rec.n / (rec.n + P('track_shrink'));
  return said - w * rec.lean;
}

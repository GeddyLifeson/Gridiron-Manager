// The waiver wire review and claim recommendation (M3.4.1), practice squad targets and poach risk
// (M3.5.1), and claim risk on the club's own cuts (M6.4.4). Who may be claimed, the claim period, and who
// receives a claimed player belong to the roster engine (G-15, C5.5.1); this module only advises.
import { tierIndex, tierOf, type TierCuts, DEFAULT_CUTS } from './board.ts';
import { P } from './params.ts';
import type { Graded, JobId } from './types.ts';

export type Recommendation = 'claim' | 'pass' | 'sign_if_clears';

export interface WireItemView {
  readonly personId: number;
  readonly job: JobId;
  /** The club's grade at his job against its own profile (M3.1.1 rule 5). */
  readonly grade: Graded;
  /** The C6 cap check on the contract a claim inherits, as yes or no with a reason (M3.4.1 inputs). */
  readonly capCheck: { readonly ok: boolean; readonly reason: string };
  /** Waived with an injury designation: a claim inherits the injury (edge case). */
  readonly injured: boolean;
}

export interface OwnRosterSpot { readonly personId: number; readonly job: JobId; readonly grade: Graded; readonly lock: boolean }

export interface ClubAhead {
  readonly clubId: number;
  /** That club's public need at the job, 0 to 1 (public injuries and depth): K7's view of others. */
  readonly publicNeed: number;
}

export interface WireReview {
  readonly personId: number;
  readonly recommendation: Recommendation;
  readonly reasons: readonly string[];
  /** Who leaves the 53 for a claim (rule 5: the release must be valid in the transaction engine). */
  readonly releaseToMakeRoom: number | null;
  readonly chanceGoneBeforeUs: number;
  readonly likelyGone: boolean;
  readonly depthRank: number;
}

/** Chance a club ahead in the order claims first (rule 2), from public needs only. */
export function chanceGone(ahead: readonly ClubAhead[]): number {
  let none = 1;
  for (const c of ahead) none *= 1 - Math.min(1, Math.max(0, c.publicNeed)) * P.claimNeedToChance;
  return 1 - none;
}

/**
 * The staff recommendation (rules 1 to 3). Claim when the grade beats the last player at his position on
 * the 53 by more than one tier-step, or he fills a flagged need, and the inherited contract passes the cap
 * check. A player the cap check rejects is never recommended for a claim (acceptance); one worth having on
 * a smaller deal is "sign if he clears".
 */
export function reviewWireItem(item: WireItemView, roster: readonly OwnRosterSpot[], flaggedNeeds: readonly JobId[], ahead: readonly ClubAhead[], cuts: TierCuts = DEFAULT_CUTS): WireReview {
  const atJob = roster.filter((r) => r.job === item.job).sort((a, b) => b.grade.mean - a.grade.mean || a.personId - b.personId);
  const last = atJob[atJob.length - 1] ?? null;
  const tierStep = last ? tierIndex(tierOf(last.grade.mean, cuts)) - tierIndex(tierOf(item.grade.mean, cuts)) : 1;
  const beatsLast = last === null || (tierStep >= 1 && item.grade.mean - last.grade.mean > P.claimMarginIss);
  const fillsNeed = flaggedNeeds.includes(item.job);
  const reasons: string[] = [];
  if (beatsLast) reasons.push('better than the last player at his position by more than a tier-step');
  if (fillsNeed) reasons.push('fills a flagged need');
  if (item.injured) reasons.push('waived injured: a claim inherits the injury');
  let recommendation: Recommendation = 'pass';
  if ((beatsLast || fillsNeed) && item.capCheck.ok) recommendation = 'claim';
  else if ((beatsLast || fillsNeed) && !item.capCheck.ok) { recommendation = 'sign_if_clears'; reasons.push(`cap: ${item.capCheck.reason}`); }
  else if (last && item.grade.mean > last.grade.mean) recommendation = 'sign_if_clears';
  const candidates = roster.filter((r) => !r.lock);
  const sameJob = candidates.filter((r) => r.job === item.job).sort((a, b) => a.grade.mean - b.grade.mean || a.personId - b.personId);
  const any = [...candidates].sort((a, b) => a.grade.mean - b.grade.mean || a.personId - b.personId);
  const release = recommendation === 'claim' ? (sameJob[0] ?? any[0] ?? null) : null;
  const gone = chanceGone(ahead);
  const depthRank = atJob.filter((r) => r.grade.mean > item.grade.mean).length + 1;
  return { personId: item.personId, recommendation, reasons, releaseToMakeRoom: release?.personId ?? null, chanceGoneBeforeUs: gone, likelyGone: gone > P.likelyGoneChance, depthRank };
}

/** The daily review, batched by position on cutdown weekend (edge case), claims first. */
export function wireReview(items: readonly WireItemView[], roster: readonly OwnRosterSpot[], flaggedNeeds: readonly JobId[], aheadOf: (personId: number) => readonly ClubAhead[], cuts: TierCuts = DEFAULT_CUTS): WireReview[] {
  const rank = (r: Recommendation) => (['claim', 'sign_if_clears', 'pass'] as const).indexOf(r);
  const jobOf = new Map(items.map((i) => [i.personId, i.job]));
  return items.map((i) => reviewWireItem(i, roster, flaggedNeeds, aheadOf(i.personId), cuts))
    .sort((a, b) => (jobOf.get(a.personId) ?? '').localeCompare(jobOf.get(b.personId) ?? '') || rank(a.recommendation) - rank(b.recommendation) || a.personId - b.personId);
}

// ---------- M3.5.1 practice squad targets and poach risk ----------

export interface SquadPlayer {
  readonly personId: number;
  readonly clubId: number;
  readonly job: JobId;
  readonly grade: Graded;
  readonly protectedThisWeek: boolean;
  /** On the user's next opponent's squad inside the restricted window (C5.3.3 rule 4). */
  readonly nextOpponentRestricted: boolean;
  /** His rank at his job on his own club's depth (1 = next up), a visible fact. */
  readonly pathRank: number;
  /** What his agent has said, if anything (L7). */
  readonly agentSaid: 'wants_chance' | 'happy_where_he_is' | null;
}

export type Read = 'likely' | 'even' | 'unlikely';

export interface Target { readonly personId: number; readonly cost: { readonly rosterSpot: true; readonly guaranteedWeeks: number }; readonly read: Read; readonly basis: readonly string[]; readonly wideBand: true }

/**
 * Targets (rules 1, 2 and 4): unprotected players graded above the user's own depth at the job (the second
 * player there), never a protected player or one inside the next-opponent window (acceptance). The read is
 * in words from visible facts only; evidence on squad players is thin, so the band is always called wide.
 */
export function practiceSquadTargets(pool: readonly SquadPlayer[], ownDepth: Readonly<Record<JobId, number>>, roleOfferedRank: number, poachPayWeeks: number, ownClubId: number): Target[] {
  return pool
    .filter((p) => p.clubId !== ownClubId && !p.protectedThisWeek && !p.nextOpponentRestricted && p.grade.mean > (ownDepth[p.job] ?? Number.NEGATIVE_INFINITY))
    .sort((a, b) => b.grade.mean - a.grade.mean || a.personId - b.personId)
    .map((p) => {
      const basis: string[] = [];
      let score = p.pathRank - roleOfferedRank;
      basis.push(roleOfferedRank < p.pathRank ? 'we offer a clearer path to the field' : 'his path where he is is as good as ours');
      if (p.agentSaid === 'wants_chance') { score += 1; basis.push('his agent says he wants a chance on a 53'); }
      if (p.agentSaid === 'happy_where_he_is') { score -= 1; basis.push('his agent says he is happy where he is'); }
      const read: Read = score > 0 ? 'likely' : score < 0 ? 'unlikely' : 'even';
      return { personId: p.personId, cost: { rosterSpot: true as const, guaranteedWeeks: poachPayWeeks }, read, basis, wideBand: true as const };
    });
}

/**
 * The true chance he accepts (rule 2, hidden, K9): rises with the role offered against his current path
 * and falls with trust in his current coaches. World side only; screens show `practiceSquadTargets` words.
 */
export function acceptChance(roleOfferedRank: number, pathRank: number, trustInCurrentCoaches: number): number {
  const pull = P.poachAcceptBase + P.poachAcceptPerRank * (pathRank - roleOfferedRank) - P.poachAcceptTrustWeight * Math.min(1, Math.max(0, trustInCurrentCoaches));
  return Math.min(1, Math.max(0, pull));
}

export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Poach risk on the club's own squad players (rule 3): the club's grade against league depth at the job,
 * weighted by the share of clubs with a flagged need there this week.
 */
export function poachRisk(grade: Graded, leagueDepthMean: number, clubsWithNeed: number, clubs: number): { level: RiskLevel; score: number } {
  const edge = Math.max(0, grade.mean - leagueDepthMean) / P.riskIssScale;
  const share = clubs > 0 ? clubsWithNeed / clubs : 0;
  const score = Math.min(1, edge * share * P.riskNeedWeight);
  return { level: score >= P.riskHigh ? 'high' : score >= P.riskMedium ? 'medium' : 'low', score };
}

/**
 * Claim risk on a player the club cuts (M6.4.4): league-wide need at his job, raised by a strong preseason
 * showing other clubs saw on film (M6.3.3 rule 5). Shown as low, medium or high on the cutdown board.
 */
export function claimRisk(grade: Graded, leagueDepthMean: number, clubsWithNeed: number, clubs: number, preseasonShowing: number): { level: RiskLevel; score: number } {
  const base = poachRisk(grade, leagueDepthMean, clubsWithNeed, clubs).score;
  const score = Math.min(1, base * (1 + P.claimRiskFilmWeight * Math.max(0, preseasonShowing)));
  return { level: score >= P.riskHigh ? 'high' : score >= P.riskMedium ? 'medium' : 'low', score };
}

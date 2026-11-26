// Veterans, rookies and specialists (L2.3): mentor pairings and the rookie tradition policy (L2.3.1);
// kicker slumps and how the coach handles them (L2.3.2). The default has NO time-varying confidence effect on
// kick accuracy: the project has no evidence for one, so a slump is noise unless the true attribute changed.
import { lp } from './params.ts';

export interface MentorCandidate {
  readonly id: number;
  readonly leadership: number;
  readonly room: string;
}

export interface MentorPairing {
  readonly mentorId: number;
  readonly rookieId: number;
  readonly willing: boolean;
  /** The pairing screen's warning: the veteran is the man whose job the rookie is after. */
  readonly directCompetitionWarning: boolean;
}

/** A willing mentor has leadership above 55 and is not in direct competition with the rookie (L2.3.1). */
export function pairMentor(mentor: MentorCandidate, rookieId: number, rookieRoom: string, directCompetition: boolean): MentorPairing {
  if (mentor.room !== rookieRoom) throw new Error('career.locker_room: a mentor comes from the rookie\'s own room (L2.3.1)');
  return { mentorId: mentor.id, rookieId, willing: mentor.leadership > lp('mentor.leadershipAbove') && !directCompetition, directCompetitionWarning: directCompetition };
}

/**
 * Effects of a pairing (L2.3.1): a willing mentor gives +5 percent weekly knowledge gain in the rookie's
 * first season only and +10 tie; an unwilling one gives nothing and a little friction (Assumption size).
 */
export function mentorEffects(p: MentorPairing, rookieSeasonIndex: number): { readonly knowledgeGain: number; readonly tie: number } {
  if (!p.willing) return { knowledgeGain: 0, tie: lp('mentor.unwillingFriction') };
  return { knowledgeGain: rookieSeasonIndex === 0 ? lp('mentor.knowledgeGain') : 0, tie: lp('mentor.tieBoost') };
}

export type TraditionPolicy = 'allowed' | 'limited' | 'banned';

/**
 * The rookie traditions policy (a team policy, not a game setting, L2.3.1). Banning costs -1 veteran trust
 * and cuts the rare hazing event (L9.2.6) to a quarter of the limited rate; it never removes it, since bans
 * are broken and enforcement depends on culture and player policing.
 */
export function traditionPolicy(p: TraditionPolicy): { readonly veteranTrust: number; readonly hazingMultiplier: number } {
  return {
    veteranTrust: p === 'banned' ? lp('traditions.banVeteranTrust') : 0,
    hazingMultiplier: lp(`traditions.hazingMult.${p}`),
  };
}

// ---- L2.3.2 kickers and specialists ----

export interface KickGame {
  /** Misses inside the kicker's normal range in one game. */
  readonly missesInRange: number;
}

/** A slump: two or more misses inside his normal range across his last two games (L2.3.2). */
export function inSlump(lastGames: readonly KickGame[]): boolean {
  const n = lp('specialist.slumpGames');
  if (lastGames.length < n) return false;
  return lastGames.slice(-n).reduce((s, g) => s + g.missesInRange, 0) >= lp('specialist.slumpMisses');
}

export type SlumpChoice = 'back_publicly' | 'private_talk' | 'bring_in_competition' | 'replace';

/** Relationship change from the choice (L2.3.2): public backing +10 from him, a tryout -10. Nothing changes his accuracy. */
export function slumpChoiceTrust(c: SlumpChoice): number {
  return c === 'back_publicly' ? lp('specialist.backPublicTrust') : c === 'bring_in_competition' || c === 'replace' ? lp('specialist.tryoutTrust') : 0;
}

/**
 * The kick model's confidence term (L2.3.2): `kick_confidence_effect` times the recent-miss deviation. At the
 * default 0 the term is exactly 0, so accuracy stays independent of prior makes and misses.
 */
export function kickConfidenceTerm(recentMissDeviation: number): number {
  const e = lp('specialist.kickConfidenceEffect');
  return e === 0 ? 0 : e * recentMissDeviation;
}

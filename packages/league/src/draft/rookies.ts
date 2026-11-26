// Rookie contracts and undrafted free agents (C7.4.1, C6.4.2).
//
// A drafted player's club is deemed to tender him a contract at the minimum salary for each league year (CBA Art. 6
// s.3); his rookie contract has the fixed length of C6.4.2 rule 1. The slot scale (signing bonus and salary by
// pick from the Total Rookie Compensation Pool) is not in the rule set yet (C6.4.2 open question), so the scale is
// an input; without one the contract is the required tender. In v1 every drafted player signs before camp
// (C7.4.1 rule 1, Assumption in the bible).
import type { RuleSet } from '@gm/schema';
import { NOT_GUARANTEED, FULLY_GUARANTEED, plainYear, type CapContract } from '../cap/contract.ts';
import { checkRookieContract, rookieLength, type DraftRound } from '../cap/rookie.ts';
import { minimumSalary } from '../cap/minimums.ts';
import { CENTS_PER_USD } from '../cap/params.ts';
import { FIRST_ROUND, KEY, param } from './params.ts';
import type { ClubId, PersonId, UnitDraw } from './types.ts';

/** One slot of a rookie scale: signing bonus and any salary above the minimum per contract year, in cents. */
export interface SlotTerms { readonly signingBonusCents: number; readonly extraBaseCents: readonly number[] }

/** A rookie scale by overall pick for one draft. Data owed by research (C6.4.2 open question). */
export interface RookieScale { readonly year: number; slot(overall: number): SlotTerms | undefined }

/**
 * The rookie contract for a drafted (or undrafted, `round` null) player. Year i pays the minimum salary for a
 * player with i credited seasons (the required tender, CBA Art. 6 s.3), plus the scale's extra salary. Checked
 * against the fixed length and the 25 percent rule (C6.4.2 rules 1 and 2).
 */
export function rookieContract(input: {
  id: number; round: DraftRound; overall: number | null; firstLeagueYear: number; scale?: RookieScale; signingBonusCents?: number;
}, rules: RuleSet): { ok: true; contract: CapContract } | { ok: false; reason: string } {
  const length = rookieLength(input.round, rules);
  const slot = input.scale && input.overall !== null ? input.scale.slot(input.overall) : undefined;
  const bonus = input.signingBonusCents ?? slot?.signingBonusCents ?? 0;
  const years = Array.from({ length }, (_, i) => {
    const y = input.firstLeagueYear + i;
    return plainYear(y, minimumSalary(rules, y, i) + (slot?.extraBaseCents[i] ?? 0), NOT_GUARANTEED);
  });
  const contract: CapContract = {
    id: input.id, form: 'rookie', offset: false, years,
    tranches: bonus > 0 ? [{ amountCents: bonus, firstLeagueYear: input.firstLeagueYear, paidLeagueYear: input.firstLeagueYear, source: 'signing', guarantee: FULLY_GUARANTEED }] : [],
  };
  const check = checkRookieContract(contract, input.round, rules);
  return check.ok ? { ok: true, contract } : check;
}

/**
 * The per-club undrafted signing bonus pool for a draft (C7.4.1 rule 3), read from the latest
 * `rookie.undrafted_pool_<year>_usd` at or before the draft year. `exact` is false when an earlier year is used
 * (the CBA raises it each year by the pool's percentage rise, which the rule set does not carry yet).
 */
export function undraftedPoolCents(rules: RuleSet, draftYear: number): { cents: number; basisYear: number; exact: boolean } {
  const re = new RegExp(`^${KEY.undraftedPoolPrefix.replace('.', '\\.')}(\\d+)_usd$`);
  const years = rules.keys().map((k) => re.exec(k)).filter((m): m is RegExpExecArray => m !== null).map((m) => Number(m[FIRST_ROUND])).filter((y) => y <= draftYear).sort((a, b) => b - a);
  const basis = years[0];
  if (basis === undefined) throw new Error(`league.draft: no undrafted pool at or before ${draftYear}`);
  return { cents: Math.round(rules.num(`${KEY.undraftedPoolPrefix}${basis}_usd`) * CENTS_PER_USD), basisYear: basis, exact: basis === draftYear };
}

/** One club's offer to an undrafted player (C7.4.1 rule 2, M4.5.2). */
export interface UdfaOffer {
  readonly clubId: ClubId;
  readonly bonusCents: number;
  /** Players ahead of him at his position on that club's depth chart. */
  readonly depthAhead: number;
  /** A coach phoned him (M4.5.2). */
  readonly coachCalled: boolean;
  readonly distanceFromHome: number;
}

export interface UdfaFactor { readonly clubId: ClubId; readonly bonus: number; readonly depth: number; readonly call: number; readonly distance: number; readonly noise: number; readonly total: number }

/**
 * The player's choice among offers (C7.4.1 rule 2): bonus, depth chart ahead, a coach's call and distance from
 * home, with noise. Each factor is scaled by the best (or worst) offer so the weights compare. Returns every
 * offer's factors, which the user can read afterwards (C7.4.1 acceptance).
 */
export function chooseUdfaClub(personId: PersonId, offers: readonly UdfaOffer[], draw: UnitDraw): { clubId: ClubId | null; factors: readonly UdfaFactor[] } {
  if (offers.length === 0) return { clubId: null, factors: [] };
  const maxBonus = Math.max(...offers.map((o) => o.bonusCents));
  const maxDepth = Math.max(...offers.map((o) => o.depthAhead));
  const maxDist = Math.max(...offers.map((o) => o.distanceFromHome));
  const share = (v: number, max: number) => (max > 0 ? v / max : 0);
  const factors = offers.map((o) => {
    const bonus = param('league.draft.udfaWeightBonus') * share(o.bonusCents, maxBonus);
    const depth = -param('league.draft.udfaWeightDepth') * share(o.depthAhead, maxDepth);
    const call = o.coachCalled ? param('league.draft.udfaWeightCall') : 0;
    const distance = -param('league.draft.udfaWeightDistance') * share(o.distanceFromHome, maxDist);
    const noise = param('league.draft.udfaNoise') * draw.unit(`udfa:${personId}:${o.clubId}`);
    return { clubId: o.clubId, bonus, depth, call, distance, noise, total: bonus + depth + call + distance + noise };
  });
  const best = [...factors].sort((a, b) => b.total - a.total || a.clubId - b.clubId)[0]!;
  return { clubId: best.clubId, factors };
}

/** Why a club cannot make this undrafted offer, or null (C7.4.1 acceptance: within 90 and within the bonus pool). */
export function udfaOfferBlock(o: UdfaOffer, spentCents: number, poolCents: number, rosterCount: number, rosterLimit: number | null): string | null {
  if (spentCents + o.bonusCents > poolCents) return 'league rule: undrafted signing bonuses would exceed the club pool';
  if (rosterLimit !== null && rosterCount >= rosterLimit) return 'league rule: the roster is at its offseason limit';
  return null;
}


// K7.3.1 in-season moves and K7.4.5 the offseason roster and the cutdown. Every move goes through the roster
// engine (C5.7.1), which refuses an illegal roster; this file decides which moves to file. Game-day actives
// are the head coach's (K7.3.1 rule 5) and are not decided here.
import type { GmProfile } from './profile.ts';
import { needAt, type Need } from './needs.ts';
import { P } from './params.ts';
import { marketReadSd } from './trade.ts';
import { costWins, playerWorth, rosterDelta } from './value.ts';
import { clamp, type PersonId, type PlayerView, type ValueContext } from './types.ts';

/** K7.3.1 rule 1: position groups below their minimum healthy count for the system, most short first. */
export function mandatoryGaps(roster: readonly PlayerView[], unavailable: ReadonlySet<PersonId>, minHealthy: Readonly<Record<string, number>>): { position: string; short: number }[] {
  return Object.keys(minHealthy).sort()
    .map((position) => ({ position, short: minHealthy[position]! - roster.filter((v) => v.position === position && !unavailable.has(v.personId)).length }))
    .filter((g) => g.short > 0)
    .sort((a, b) => b.short - a.short || (a.position < b.position ? -1 : 1));
}

/** K7.3.1 rule 1 and K7.4.5 rule 2: the ready-list player (M3.2.1) he signs for a gap, or null when none fits the room. */
export function fillGap(gm: GmProfile, position: string, readyList: readonly PlayerView[], roomCents: number, ctx: ValueContext): PlayerView | null {
  return readyList
    .filter((v) => v.position === position && (v.costCentsByYear[0] ?? 0) <= roomCents)
    .map((v) => ({ v, s: playerWorth(gm, v, ctx).surplus }))
    .sort((a, b) => b.s - a.s || a.v.personId - b.v.personId)[0]?.v ?? null;
}

/** K7.3.1 rule 2: the reserve designation for an injured player, by expected weeks out against the list's rules (C5.4, read by key). */
export function injuryMove(weeksOut: number, list: { readonly minWeeksOut: number; readonly returnSlotsLeft: number }, seasonWeeksLeft: number): 'stay_active' | 'reserve_return' | 'reserve_season' {
  if (weeksOut < list.minWeeksOut) return 'stay_active';
  return weeksOut >= seasonWeeksLeft || list.returnSlotsLeft <= 0 ? 'reserve_season' : 'reserve_return';
}

export interface Claim { readonly claim: boolean; readonly dropId: PersonId | null; readonly gain: number }

/**
 * K7.3.1 rule 3: claim a waived player when he adds more than the worst player at that roster spot, by a
 * margin. Waiver priority decides between claiming clubs (C5.5.1) and is the roster engine's.
 */
export function claimDecision(gm: GmProfile, roster: readonly PlayerView[], waived: PlayerView, rosterFull: boolean, ctx: ValueContext): Claim {
  const same = roster.filter((v) => v.position === waived.position).map((v) => ({ v, s: playerWorth(gm, v, ctx).surplus })).sort((a, b) => a.s - b.s || a.v.personId - b.v.personId);
  const drop = rosterFull ? same[0]?.v.personId ?? null : null;
  if (rosterFull && drop === null) return { claim: false, dropId: null, gain: 0 };
  const gain = rosterDelta(gm, roster, [waived], drop === null ? [] : [drop], ctx);
  return { claim: gain > P('roster.claimMargin'), dropId: drop, gain };
}

/** K7.3.1 rule 4: practice squad from the eligible players with the highest projected surplus (eligibility is C5.3.1's). */
export function practiceSquad(gm: GmProfile, eligible: readonly PlayerView[], size: number, ctx: ValueContext): PersonId[] {
  return eligible.map((v) => ({ id: v.personId, s: playerWorth(gm, v, ctx).surplus })).sort((a, b) => b.s - a.s || a.id - b.id).slice(0, size).map((x) => x.id);
}

/** K7.3.1 rule 4: the practice-squad player raised for game day at the position of greatest need (C5.3.2). */
export function elevate(gm: GmProfile, squad: readonly PlayerView[], needs: readonly Need[], ctx: ValueContext): PersonId | null {
  return squad.map((v) => ({ id: v.personId, s: playerWorth(gm, v, ctx, 1).value * needAt(needs, v.position) }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.id - b.id)[0]?.id ?? null;
}

/** K7.4.5 rule 1: his ranking of the undrafted pool, K7.2.2 value with a need term. The player chooses (C8.3.2 form, `draft.chooseUdfaClub`). */
export function undraftedBoard(gm: GmProfile, pool: readonly PlayerView[], needs: readonly Need[], ctx: ValueContext): PersonId[] {
  return pool.map((v) => ({ id: v.personId, s: playerWorth(gm, v, ctx).value * (1 + P('roster.udfaNeedWeight') * needAt(needs, v.position)) }))
    .sort((a, b) => b.s - a.s || a.id - b.id).map((x) => x.id);
}

export interface CutdownInput {
  readonly roster: readonly PlayerView[];
  readonly limit: number;
  /** Position minimums for the head coach's system. */
  readonly minByPosition: Readonly<Record<string, number>>;
  /** The head coach's ranking of the roster, best first (rank from 1). */
  readonly coachRank: ReadonlyMap<PersonId, number>;
  /** Round of this year's draft the club took him in. */
  readonly draftedRound: ReadonlyMap<PersonId, number>;
  /** Cap charge by year the club keeps if it cuts him (C6.3.2). */
  readonly deadCentsByYear: ReadonlyMap<PersonId, readonly number[]>;
  readonly rounds: number;
  /**
   * K7.4.1 rule 2: this league year's cap. `roomCents` is the cap less the team salary if every player is kept;
   * `deltaIfCutCents` is how much cutting each player changes this year's team salary (his salary saved, less
   * guaranteed salary of later years that accelerates into this year, CBA Art. 13 s.6(d)(iv)). Absent: no cap.
   */
  readonly cap?: { readonly roomCents: number; readonly deltaIfCutCents: ReadonlyMap<PersonId, number> };
}

export interface Cutdown { readonly keep: readonly PersonId[]; readonly cut: readonly PersonId[]; readonly shortAt: readonly string[] }

/**
 * K7.4.5 rule 3: rank by surplus over the horizon with the dead-money arithmetic of K7.4.1, hold his own
 * draft picks to a lower bar (a bonus by round), blend the head coach's ranking at `coachVoiceWeight`, then
 * keep the best legal set at the limit with the position minimums filled first.
 */
export function cutdown(gm: GmProfile, input: CutdownInput, ctx: ValueContext, w: number = gm.coachVoiceWeight): Cutdown {
  const bonus = (round: number | undefined) => round === undefined ? 0
    : P('roster.ownPickBonus') * (1 + gm.philosophy.draftVsVeteran * P('roster.ownPickBonusLean')) * (1 - (round - 1) / Math.max(1, input.rounds));
  const scored = input.roster.map((v) => {
    const worth = playerWorth(gm, v, ctx);
    // Cutting him saves his cost less the dead money, so keeping him is worth his surplus plus the dead money.
    return { v, s: worth.surplus + costWins(gm, input.deadCentsByYear.get(v.personId) ?? [], ctx) + bonus(input.draftedRound.get(v.personId)) };
  }).sort((a, b) => b.s - a.s || a.v.personId - b.v.personId);
  const ranked = scored
    .map((x, i) => { const c = input.coachRank.get(x.v.personId); return { ...x, own: i + 1, blended: c === undefined ? i + 1 : (1 - w) * (i + 1) + w * c }; })
    .sort((a, b) => a.blended - b.blended || a.own - b.own);
  const keep = new Set<PersonId>();
  const shortAt: string[] = [];
  for (const position of Object.keys(input.minByPosition).sort()) {
    const best = ranked.filter((x) => x.v.position === position).slice(0, input.minByPosition[position]!);
    if (best.length < input.minByPosition[position]!) shortAt.push(position);
    for (const x of best) if (keep.size < input.limit) keep.add(x.v.personId);
  }
  for (const x of ranked) if (keep.size < input.limit) keep.add(x.v.personId);
  if (input.cap) capRepair(ranked.map((x) => x.v), keep, input.cap);
  const order = ranked.map((x) => x.v.personId);
  return { keep: order.filter((id) => keep.has(id)), cut: order.filter((id) => !keep.has(id)), shortAt };
}

/**
 * K7.4.1 rule 2 repair pass: the cuts may not leave this year's team salary over the cap. While they do, the
 * cut player whose release costs the most room (accelerated guarantees) is kept instead of the lowest-ranked
 * kept player at his position whose release saves room, so position counts and the limit hold; only if that
 * is not enough, at any position. `ranked` is best first; `keep` is changed in place.
 */
function capRepair(ranked: readonly PlayerView[], keep: Set<PersonId>, cap: NonNullable<CutdownInput['cap']>): void {
  const delta = (id: PersonId) => cap.deltaIfCutCents.get(id) ?? 0;
  let over = ranked.filter((v) => !keep.has(v.personId)).reduce((s, v) => s + delta(v.personId), 0) - cap.roomCents;
  const costly = ranked.filter((v) => !keep.has(v.personId) && delta(v.personId) > 0)
    .sort((a, b) => delta(b.personId) - delta(a.personId) || a.personId - b.personId);
  // The law comes before the head coach's position counts: a second pass may swap across positions.
  for (const samePosition of [true, false]) {
    for (const back of costly) {
      if (over <= 0) return;
      if (keep.has(back.personId)) continue;
      // The lowest-ranked kept player (at the same position on the first pass) whose release saves room.
      const out = [...ranked].reverse().find((v) => keep.has(v.personId) && (!samePosition || v.position === back.position) && delta(v.personId) <= 0);
      if (!out) continue;
      keep.delete(out.personId);
      keep.add(back.personId);
      over += delta(out.personId) - delta(back.personId);
    }
  }
}

/**
 * K7.4.5 rule 4: a player he wants on the practice squad must clear waivers. He estimates the claim risk
 * from public interest with his `marketRead` error and keeps the player on the roster a week when the
 * expected loss is too large.
 */
export function hideFromWaivers(gm: GmProfile, v: PlayerView, publicClaimRisk: number, ctx: ValueContext): { hide: boolean; riskAsHeSeesIt: number } {
  const risk = clamp(publicClaimRisk * (1 + ctx.draw('market', gm.personId, v.personId) * marketReadSd(gm.behavior.marketRead)), 0, 1);
  return { hide: risk * playerWorth(gm, v, ctx).surplus > P('roster.hideThreshold'), riskAsHeSeesIt: risk };
}

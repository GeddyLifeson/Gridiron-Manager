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
  const score = udfaScore(gm, needs, ctx);
  return pool.map((v) => ({ id: v.personId, s: score(v) }))
    .sort((a, b) => b.s - a.s || a.id - b.id).map((x) => x.id);
}

function udfaScore(gm: GmProfile, needs: readonly Need[], ctx: ValueContext): (v: PlayerView) => number {
  const weight = P('roster.udfaNeedWeight');
  const needBy = new Map<string, number>();
  return (v) => {
    let n = needBy.get(v.position);
    if (n === undefined) { n = needAt(needs, v.position); needBy.set(v.position, n); }
    return playerWorth(gm, v, ctx).value * (1 + weight * n);
  };
}

/** The top of `undraftedBoard` without sorting the rest: the highest score, the lower id on a tie. Null for an empty pool. */
export function undraftedTop(gm: GmProfile, pool: readonly PlayerView[], needs: readonly Need[], ctx: ValueContext): PersonId | null {
  const score = udfaScore(gm, needs, ctx);
  let top: PersonId | null = null, topS = -Infinity;
  for (const v of pool) {
    const s = score(v);
    if (top === null || s > topS || (s === topS && v.personId < top)) { top = v.personId; topS = s; }
  }
  return top;
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
  /** The cap this league year, when the club must fit under it (C6.2.1, K7.4.5 rule 3). Without it the cutdown ignores the cap. */
  readonly cap?: CutdownCap;
}

/**
 * This league year's cap arithmetic of a cutdown (C6.3.2): what each player charges if kept and if cut.
 * A player with no entry in `keptCents` charges `minimumCents` if kept (he has no contract yet), and nothing
 * if cut; a cut player charges his `deadNowCents` entry.
 */
export interface CutdownCap {
  readonly capCents: number;
  /** Charges already on the books that no cutdown choice changes (players released earlier this year). */
  readonly committedCents: number;
  readonly keptCents: ReadonlyMap<PersonId, number>;
  /** This year's charge if cut: the dead money that accelerates into this year. */
  readonly deadNowCents: ReadonlyMap<PersonId, number>;
  readonly minimumCents: number;
}

export interface Cutdown {
  readonly keep: readonly PersonId[];
  readonly cut: readonly PersonId[];
  readonly shortAt: readonly string[];
  /** This year's cap charge of the choice (kept players plus dead money), when a cap was given. */
  readonly capChargeCents?: number;
}

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
  const c = input.cap;
  // C6.3.2 with K7.4.5 rule 3: keeping a player moves this year's charge from his dead money to his salary.
  const net = (id: PersonId) => (c ? (c.keptCents.get(id) ?? c.minimumCents) - (c.deadNowCents.get(id) ?? 0) : 0);
  const slots = Math.min(input.limit, input.roster.length);
  let used = c ? c.committedCents + input.roster.reduce((s, v) => s + (c.deadNowCents.get(v.personId) ?? 0), 0) : 0;
  // He keeps a player only while the rest of the roster still fits at the cheapest charge a slot can have.
  const reserve = c ? Math.max(0, Math.min(c.minimumCents, ...input.roster.map((v) => net(v.personId)))) : 0;
  const fits = (id: PersonId) => !c || used + net(id) + reserve * Math.max(0, slots - keep.size - 1) <= c.capCents;
  const add = (id: PersonId) => { keep.add(id); used += net(id); };
  for (const position of Object.keys(input.minByPosition).sort()) {
    const at = ranked.filter((x) => x.v.position === position);
    const want = input.minByPosition[position]!;
    if (at.length < want) shortAt.push(position);
    let n = 0;
    for (const x of at) if (n < want && keep.size < input.limit && fits(x.v.personId)) { add(x.v.personId); n++; }
    // The position minimum is legality (C5): with no one left who fits, the cheapest fill it.
    for (const x of [...at].sort((a, b) => net(a.v.personId) - net(b.v.personId) || a.own - b.own)) {
      if (n >= want || keep.size >= input.limit) break;
      if (!keep.has(x.v.personId)) { add(x.v.personId); n++; }
    }
  }
  for (const x of ranked) if (keep.size < input.limit && !keep.has(x.v.personId) && fits(x.v.personId)) add(x.v.personId);
  // The roster is filled to the limit; past what fits, the cheapest charges fill the last places.
  for (const x of [...ranked].sort((a, b) => net(a.v.personId) - net(b.v.personId) || a.own - b.own)) if (keep.size < slots && !keep.has(x.v.personId)) add(x.v.personId);
  const order = ranked.map((x) => x.v.personId);
  return { keep: order.filter((id) => keep.has(id)), cut: order.filter((id) => !keep.has(id)), shortAt, ...(c ? { capChargeCents: used } : {}) };
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

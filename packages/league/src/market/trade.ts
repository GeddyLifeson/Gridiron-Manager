// C8.4.1 trade rules and valuation. A trade is legal when the trading period is open, both clubs pass the
// cap check after it (the old club keeps the dead money, C6.3.2 rule 5), the roster engine accepts the
// moves (C5.7.1), every pick belongs to its giver, and the players whose consent the CBA requires give it.
// Valuation is surplus value in chart points, adjusted for each club's competitive window (rules 5 to 7).
import type { RuleSet } from '@gm/schema';
import { teamCapPosition, type PlayerCapFacts, type TeamCapInput, type TeamCapPosition } from '../cap/charges.ts';
import type { CapContract } from '../cap/contract.ts';
import { tradeCharges, type LeaveInput } from '../cap/release.ts';
import { applyTransaction } from '../roster/engine.ts';
import type { RosterRules } from '../roster/keys.ts';
import type { LeagueRosters, WireEntry } from '../roster/types.ts';
import { compareInstant } from '../calendar/date.ts';
import type { MarketRules } from './keys.ts';
import { atOrAfter, before, type MarketDates } from './dates.ts';
import { P } from './params.ts';
import { refuse, type Instant, type PickRef, type Refusal } from './types.ts';

/** What one club sends. `rights` are unsigned players under the club's tender (CBA Art. 9 s.3(h)). */
export interface TradePackage {
  readonly players: readonly number[];
  readonly picks: readonly PickRef[];
  readonly rights: readonly number[];
}

export interface TradeProposal {
  readonly clubA: number;
  readonly clubB: number;
  readonly aSends: TradePackage;
  readonly bSends: TradePackage;
}

/** A tender standing on an unsigned player whose rights are traded (CBA Art. 9 s.3(h); Art. 10 for tags). */
export interface TenderedRights {
  readonly personId: number;
  readonly clubId: number;
  /** exclusive: exclusive rights or exclusive franchise (no restrictions); compensation: RFA with a pick or non-exclusive franchise; consent_only: transition or right of first refusal only. */
  readonly kind: 'exclusive' | 'compensation' | 'consent_only';
  /** Rounds of the picks the tender would yield, best first (compensation kind). */
  readonly compensationRounds: readonly number[];
}

export interface TradeContext {
  readonly now: Instant;
  readonly dates: MarketDates;
  readonly mr: MarketRules;
  readonly roster: LeagueRosters;
  readonly rosterRules: RosterRules;
  readonly capRules: RuleSet;
  /** Each club's cap input for the market year (contracts with player facts, other charges). */
  readonly caps: ReadonlyMap<number, TeamCapInput>;
  /** Contract and cap facts of every traded player, by person id. */
  readonly contracts: ReadonlyMap<number, { readonly contract: CapContract; readonly player: PlayerCapFacts }>;
  /** Leave facts for the old club's dead money: timing and pay already received this league year (C6.3.2). */
  readonly leave: (personId: number) => LeaveInput;
  /** Players with a no-trade clause (C8.4.1 rule 4). */
  readonly noTrade: ReadonlySet<number>;
  /** Players who have consented to this trade (no-trade waiver, tendered-rights approval, trade-back consent). */
  readonly consents: ReadonlySet<number>;
  readonly tendered: ReadonlyMap<number, TenderedRights>;
  /** Matched offer sheets: the player may not go to the offering club before `until` without consent (CBA Art. 9 s.3(h)). */
  readonly tradeBackBlocks: readonly { readonly personId: number; readonly offeringClubId: number; readonly until: Instant }[];
  /** The pick ledger's answer (C7.2.1, G-34): does the club hold this pick? */
  readonly ownsPick: (clubId: number, pick: PickRef) => boolean;
}

export interface MovedContract { readonly personId: number; readonly fromClubId: number; readonly toClubId: number; readonly contract: CapContract }
export interface DeadCharge { readonly personId: number; readonly clubId: number; readonly byYear: ReadonlyMap<number, number> }

export interface TradeAccepted {
  readonly ok: true;
  readonly roster: LeagueRosters;
  readonly wire: readonly WireEntry[];
  readonly caps: ReadonlyMap<number, TeamCapPosition>;
  readonly moved: readonly MovedContract[];
  readonly dead: readonly DeadCharge[];
  /** Arriving players start with zero knowledge of the new system (C8.4.1 edge case, C8.4.2 acceptance; D9 applies it). */
  readonly schemeKnowledgeReset: readonly number[];
}
export type TradeCheck = TradeAccepted | { readonly ok: false; readonly refusals: readonly Refusal[] };

const empty = (p: TradePackage) => p.players.length + p.picks.length + p.rights.length === 0;

/** C8.4.1 rule 3 (C5.5.2): open from the league year start until the trade deadline. */
export function tradingOpen(now: Instant, dates: MarketDates, mr: MarketRules, roster: LeagueRosters): Refusal | null {
  if (mr.tradeDeadlineAfterWeek === null) return refuse('C8.4.1', 'phase', 'this league has no trades', 'none');
  if (before(now, dates.leagueYearStart)) return refuse('C8.4.1', 'phase', 'trading opens with the league year', 'wait for the league year');
  if (roster.tradeDeadlinePassed || atOrAfter(now, dates.tradeDeadline)) return refuse('C8.4.1', 'deadline', 'the trade deadline has passed; trading reopens with the new league year', 'wait for the new league year');
  return null;
}

function consentChecks(p: TradeProposal, ctx: TradeContext): Refusal[] {
  const out: Refusal[] = [];
  const sides: [TradePackage, number, TradePackage][] = [[p.aSends, p.clubB, p.bSends], [p.bSends, p.clubA, p.aSends]];
  const inSigningPeriod = atOrAfter(ctx.now, ctx.dates.leagueYearStart) && compareInstant(ctx.now, ctx.dates.offerSheetDeadline) <= 0;
  for (const [sent, toClub, returned] of sides) {
    for (const id of sent.players) {
      if (ctx.noTrade.has(id) && !ctx.consents.has(id)) out.push(refuse('C8.4.1', 'consent', `player ${id} has a no-trade clause and has not agreed`, 'ask the player to waive it'));
      const block = ctx.tradeBackBlocks.find((b) => b.personId === id && b.offeringClubId === toClub && before(ctx.now, b.until));
      if (block && !ctx.consents.has(id)) out.push(refuse('C8.4.1', 'consent', `player ${id} was matched from this club's offer sheet; he cannot go there for a year without consent (CBA Art. 9 s.3(h))`, 'ask the player'));
    }
    for (const id of sent.rights) {
      const t = ctx.tendered.get(id);
      if (!t) { out.push(refuse('C8.4.1', 'eligibility', `player ${id} is not under this club's tender`, 'trade players or tendered rights the club holds')); continue; }
      if (t.kind === 'exclusive') continue;
      if (inSigningPeriod && !ctx.consents.has(id)) out.push(refuse('C8.4.1', 'consent', `player ${id} and the players' union must approve a trade of his tendered rights in the signing period (CBA Art. 9 s.3(h))`, 'get the player\'s approval'));
      if (t.kind === 'compensation') {
        if (returned.players.length > 0 || returned.rights.length > 0) out.push(refuse('C8.4.1', 'precondition', `a trade of player ${id}'s tendered rights may not bring back another player's contract (CBA Art. 9 s.3(h)(ii))`, 'trade for picks only'));
        const rounds = [...returned.picks].map((k) => k.round).sort((a, b) => a - b);
        const tooMuch = rounds.length > t.compensationRounds.length || rounds.some((r, i) => r < t.compensationRounds[i]!);
        if (tooMuch) out.push(refuse('C8.4.1', 'limit', `picks for player ${id}'s tendered rights exceed the tender's compensation (CBA Art. 9 s.3(h)(i))`, 'ask for no more than the tender would yield'));
      }
    }
  }
  return out;
}

function pickChecks(p: TradeProposal, ctx: TradeContext): Refusal[] {
  const out: Refusal[] = [];
  for (const [club, pack] of [[p.clubA, p.aSends], [p.clubB, p.bSends]] as const) {
    for (const k of pack.picks) if (!ctx.ownsPick(club, k)) out.push(refuse('C8.4.1', 'eligibility', `club ${club} does not hold the ${k.season} round ${k.round} pick of club ${k.originalClubId}`, 'trade picks the club holds'));
  }
  return out;
}

/** C8.4.1 rule 2: both clubs after the trade, with the old club keeping proration as dead money (C6.3.2 rule 5). */
function capAfter(p: TradeProposal, ctx: TradeContext): { caps: Map<number, TeamCapPosition>; moved: MovedContract[]; dead: DeadCharge[]; refusals: Refusal[] } {
  const year = ctx.dates.season;
  const moved: MovedContract[] = [], dead: DeadCharge[] = [], refusals: Refusal[] = [];
  const inputs = new Map<number, TeamCapInput>();
  for (const club of [p.clubA, p.clubB]) {
    const base = ctx.caps.get(club);
    if (!base) { refusals.push(refuse('C8.4.1', 'unknown', `no cap position for club ${club}`, 'supply both clubs\' cap inputs')); continue; }
    inputs.set(club, base);
  }
  if (refusals.length) return { caps: new Map(), moved, dead, refusals };
  const send = (from: number, to: number, ids: readonly number[]) => {
    for (const id of ids) {
      const c = ctx.contracts.get(id);
      if (!c) { refusals.push(refuse('C8.4.1', 'unknown', `no contract on file for player ${id}`, 'supply the contract')); continue; }
      const t = tradeCharges(c.contract, ctx.leave(id), ctx.capRules);
      const fromIn = inputs.get(from)!, toIn = inputs.get(to)!;
      inputs.set(from, {
        ...fromIn,
        contracts: fromIn.contracts.filter((x) => x.contract.id !== c.contract.id),
        other: [...fromIn.other, { label: `dead money, traded player ${id}`, amountCents: t.oldClub.byYear.get(year) ?? 0, kind: 'dead' as const }],
      });
      inputs.set(to, { ...toIn, contracts: [...toIn.contracts, { contract: t.newClubContract, player: c.player }] });
      moved.push({ personId: id, fromClubId: from, toClubId: to, contract: t.newClubContract });
      dead.push({ personId: id, clubId: from, byYear: t.oldClub.byYear });
    }
  };
  send(p.clubA, p.clubB, p.aSends.players);
  send(p.clubB, p.clubA, p.bSends.players);
  const caps = new Map<number, TeamCapPosition>();
  for (const [club, input] of inputs) {
    const pos = teamCapPosition(input, ctx.capRules);
    caps.set(club, pos);
    if (pos.roomCents < 0) refusals.push(refuse('C8.4.1', 'cap', `club ${club} would be ${-pos.roomCents} cents over the cap after the trade`, 'clear room first, or convert salary to bonus before the trade (C8.4.1 rule 9)'));
  }
  return { caps, moved, dead, refusals };
}

/**
 * Checks a trade and, when legal, returns the league after it (C8.4.1 rules 1 to 4, C5.5.2). No trade
 * completes after the deadline or over the cap (C8.4.1 acceptance). Every refusal found is listed.
 */
export function checkTrade(p: TradeProposal, ctx: TradeContext): TradeCheck {
  const open = tradingOpen(ctx.now, ctx.dates, ctx.mr, ctx.roster);
  if (open) return { ok: false, refusals: [open] };
  if (p.clubA === p.clubB) return { ok: false, refusals: [refuse('C8.4.1', 'unknown', 'a club cannot trade with itself', 'pick another club')] };
  if (empty(p.aSends) && empty(p.bSends)) return { ok: false, refusals: [refuse('C8.4.1', 'precondition', 'a trade must move at least one asset', 'add a player or a pick')] };
  const refusals = [...consentChecks(p, ctx), ...pickChecks(p, ctx)];
  let roster = ctx.roster;
  let wire: readonly WireEntry[] = [];
  if (p.aSends.players.length + p.bSends.players.length > 0) {
    const r = applyTransaction(ctx.roster, { type: 'trade', clubId: p.clubA, otherClubId: p.clubB, give: [...p.aSends.players], get: [...p.bSends.players] }, ctx.rosterRules);
    if (!r.ok) refusals.push(refuse(r.rule, r.code, r.message, r.fix));
    else { roster = r.state; wire = r.wire; }
  }
  const cap = capAfter(p, ctx);
  refusals.push(...cap.refusals);
  if (refusals.length) return { ok: false, refusals };
  return { ok: true, roster, wire, caps: cap.caps, moved: cap.moved, dead: cap.dead, schemeKnowledgeReset: [...p.aSends.players, ...p.bSends.players, ...p.aSends.rights, ...p.bSends.rights] };
}

/** C8.4.1 edge case: a failed physical voids the trade, only for a player with an injury flag. `draw` is uniform [0, 1) from the caller's stream. */
export function physicalVoids(injuryFlag: boolean, draw: number): boolean {
  return injuryFlag && draw < P.physicalFailChance;
}

// ---------------------------------------------------------------- valuation (rules 5 to 7)

export type CompetitiveWindow = 'contending' | 'neutral' | 'rebuilding';

/** An asset valued by one club in chart points (C7.5.1 chart, G-34). */
export interface AssetValue {
  readonly kind: 'player' | 'pick' | 'rights';
  readonly id: string;
  readonly points: number;
  /** Players: age. */
  readonly age?: number;
  /** Picks: draft season. */
  readonly season?: number;
}

/**
 * C8.4.1 rule 5: surplus value, the club's estimate of a player's worth over the contract minus what the
 * contract pays, converted to chart points by `toPoints` (C7.5.1). A good player on a large contract can be
 * worth little or less than nothing.
 */
export function surplusPoints(estimateCentsByYear: readonly number[], payCentsByYear: readonly number[], toPoints: (cents: number) => number): number {
  const n = Math.max(estimateCentsByYear.length, payCentsByYear.length);
  let cents = 0;
  for (let i = 0; i < n; i++) cents += (estimateCentsByYear[i] ?? 0) - (payCentsByYear[i] ?? 0);
  return toPoints(cents);
}

/** C8.4.1 rule 6: a contending club discounts future picks; a rebuilding club discounts older players. */
export function adjustForWindow(a: AssetValue, clubWindow: CompetitiveWindow, currentSeason: number): number {
  if (clubWindow === 'contending' && a.kind === 'pick' && (a.season ?? currentSeason) > currentSeason) return a.points * (1 - P.contenderFuturePickDiscount);
  if (clubWindow === 'rebuilding' && a.kind === 'player' && (a.age ?? 0) >= P.veteranAge && a.points > 0) return a.points * (1 - P.rebuilderVeteranDiscount);
  return a.points;
}

export interface Valuation {
  readonly clubId: number;
  readonly clubWindow: CompetitiveWindow;
  readonly receives: readonly { readonly id: string; readonly raw: number; readonly adjusted: number }[];
  readonly gives: readonly { readonly id: string; readonly raw: number; readonly adjusted: number }[];
  readonly receivePoints: number;
  readonly givePoints: number;
  readonly net: number;
  /** Rule 6: accepts when what it receives exceeds what it gives by its own valuation. */
  readonly accepts: boolean;
  /** Untouchable players it was asked to give (rule 7): a club with these in the package refuses. */
  readonly untouchableAsked: readonly string[];
}

export function valueSide(clubId: number, clubWindow: CompetitiveWindow, currentSeason: number, receives: readonly AssetValue[], gives: readonly AssetValue[], untouchable: ReadonlySet<string> = new Set()): Valuation {
  const line = (a: AssetValue) => ({ id: a.id, raw: a.points, adjusted: adjustForWindow(a, clubWindow, currentSeason) });
  const r = receives.map(line), g = gives.map(line);
  const receivePoints = r.reduce((s, x) => s + x.adjusted, 0), givePoints = g.reduce((s, x) => s + x.adjusted, 0);
  const untouchableAsked = gives.filter((a) => a.kind === 'player' && untouchable.has(a.id)).map((a) => a.id);
  return { clubId, clubWindow, receives: r, gives: g, receivePoints, givePoints, net: receivePoints - givePoints, accepts: receivePoints > givePoints && untouchableAsked.length === 0, untouchableAsked };
}

/** C8.4.1 rule 7: players with surplus in the club's top N, plus the head coach's stated core players. */
export function untouchables(players: readonly { readonly personId: number; readonly surplusPoints: number }[], coachCore: readonly number[] = []): Set<string> {
  const top = [...players].sort((a, b) => b.surplusPoints - a.surplusPoints || a.personId - b.personId).slice(0, P.untouchableTopN);
  return new Set([...top.map((x) => String(x.personId)), ...coachCore.map(String)]);
}

/** Every trade stores each side's valuation for later review (C8.4.1 acceptance). */
export interface TradeRecord {
  readonly at: Instant;
  readonly proposal: TradeProposal;
  readonly valuations: readonly [Valuation, Valuation];
  readonly completed: boolean;
}

export function tradeRecord(at: Instant, proposal: TradeProposal, a: Valuation, b: Valuation, completed: boolean): TradeRecord {
  return { at, proposal, valuations: [a, b], completed };
}

// K7.4.1 contracts and the cap. The cap arithmetic is the league cap module's (C6): the caller prices every
// option with it (charges by year, dead money, cash) and files the chosen ones through it (rule 5). This file
// chooses: greedy by surplus, then a repair pass until every year fits the cap and the owner's cash (rule 2).
import type { GmProfile } from './profile.ts';
import { P } from './params.ts';
import { costWins, winsByYear, yearWeight } from './value.ts';
import { clamp, sum, type PersonId, type PlayerView, type ValueContext } from './types.ts';

export type ContractAction = 'keep' | 'extend' | 'restructure' | 'tag' | 'trade' | 'release';

/** One way to handle one player, priced by the cap module. */
export interface ContractOption {
  readonly personId: PersonId;
  readonly action: ContractAction;
  /** The club's cap charge for him by year under this option, dead money included (C6.3.2). */
  readonly capCentsByYear: readonly number[];
  /** Cash the club pays him this league year under this option (C6.2.3). */
  readonly cashCents: number;
  /** Seasons he plays for the club under this option (0 for release and trade). */
  readonly yearsKept: number;
  /** Trade only: what the general manager expects back, in wins (K7.4.4). */
  readonly returnWins?: number;
}

/** Rule 1: surplus of one option over his horizon, dead money included. */
export function optionSurplus(gm: GmProfile, v: PlayerView, o: ContractOption, ctx: ValueContext): number {
  const years = Math.min(o.yearsKept, P('value.horizonYears'));
  const value = sum(winsByYear(gm, v, ctx, years).map((w, y) => w * yearWeight(gm, ctx.pressure, y)));
  // Money pushed into later years weighs less on a general manager who pushes money and more on one who
  // pays as he goes (rule 4, `capStyle`).
  const ease = o.action === 'restructure' ? 1 - (gm.philosophy.capStyle + gm.philosophy.capStyle - 1) * P('contracts.restructureEase') : 1;
  return value + (o.returnWins ?? 0) - costWins(gm, o.capCentsByYear, ctx) * ease;
}

export interface CapPlanInput {
  readonly views: ReadonlyMap<PersonId, PlayerView>;
  /** Every option for every player with an expiring or bloated contract; each player has a `keep` or `release`. */
  readonly options: readonly ContractOption[];
  /** Cap room by year before these players are counted (cap less every other charge), cents. */
  readonly roomCentsByYear: readonly number[];
  /** Cash the owner allows for these players this year (C6.2.3), and the least the spending floor needs. */
  readonly cashLimitCents: number;
  readonly cashFloorCents: number;
}

export interface CapPlan {
  readonly chosen: readonly ContractOption[];
  readonly totalSurplus: number;
  /** Cents still over the cap by year after repair: the gap he could not close (K7.3.1 edge case). */
  readonly overCentsByYear: readonly number[];
  readonly cashCents: number;
  readonly legal: boolean;
}

/** Rule 2: the set of actions with the most surplus that fits the cap in every year, the floor and the cash limit. */
export function capPlan(gm: GmProfile, input: CapPlanInput, ctx: ValueContext): CapPlan {
  const years = input.roomCentsByYear.length;
  const scored = input.options.map((o) => ({ o, s: optionSurplus(gm, input.views.get(o.personId)!, o, ctx) }));
  const byPlayer = new Map<PersonId, { o: ContractOption; s: number }[]>();
  for (const x of scored) byPlayer.set(x.o.personId, [...(byPlayer.get(x.o.personId) ?? []), x]);
  const ids = [...byPlayer.keys()].sort((a, b) => a - b);
  const pick = new Map<PersonId, { o: ContractOption; s: number }>();
  for (const id of ids) pick.set(id, [...byPlayer.get(id)!].sort((a, b) => b.s - a.s || (a.o.action < b.o.action ? -1 : 1))[0]!);
  const over = () => Array.from({ length: years }, (_, y) => Math.max(0, sum([...pick.values()].map((p) => p.o.capCentsByYear[y] ?? 0)) - input.roomCentsByYear[y]!));
  const cash = () => sum([...pick.values()].map((p) => p.o.cashCents));
  const violation = () => sum(over()) + Math.max(0, cash() - input.cashLimitCents) + Math.max(0, input.cashFloorCents - cash());
  // Repair: the switch that removes the most violation per win of surplus given up, until none helps.
  for (let guard = 0; guard < input.options.length && violation() > 0; guard++) {
    const before = violation();
    let best: { id: PersonId; alt: { o: ContractOption; s: number }; rate: number } | null = null;
    for (const id of ids) {
      const cur = pick.get(id)!;
      for (const alt of byPlayer.get(id)!) {
        if (alt.o === cur.o) continue;
        pick.set(id, alt);
        const freed = before - violation();
        pick.set(id, cur);
        if (freed <= 0) continue;
        const rate = freed / Math.max(cur.s - alt.s, P('contracts.minSurplusStep'));
        if (!best || rate > best.rate) best = { id, alt, rate };
      }
    }
    if (!best) break;
    pick.set(best.id, best.alt);
  }
  const overCentsByYear = over();
  const cashCents = cash();
  return {
    chosen: ids.map((id) => pick.get(id)!.o), totalSurplus: sum(ids.map((id) => pick.get(id)!.s)), overCentsByYear, cashCents,
    legal: sum(overCentsByYear) === 0 && cashCents <= input.cashLimitCents && cashCents >= input.cashFloorCents,
  };
}

/** Rule 4: the share of a new deal he pays as signing bonus, which the cap spreads over later years (C6.3.1). */
export function bonusShare(gm: GmProfile): number {
  return P('contracts.bonusShareMin') + (P('contracts.bonusShareMax') - P('contracts.bonusShareMin')) * gm.philosophy.capStyle;
}

export type Talks = { readonly agreed: true; readonly apyCents: number } | { readonly agreed: false; readonly reason: 'no_overlap' | 'broke_down' };

/**
 * Rule 3: each side has a walk-away value and the deal lands between them at a point set by his `negotiation`
 * against the agent's (K8.6.1). Talks can fail. `draw` is uniform [0, 1) from the caller's stream.
 */
export function negotiate(gm: GmProfile, clubWalkAwayCents: number, playerWalkAwayCents: number, agentNegotiation: number, draw: number): Talks {
  if (clubWalkAwayCents < playerWalkAwayCents) return { agreed: false, reason: 'no_overlap' };
  const gap = clubWalkAwayCents - playerWalkAwayCents;
  if (gap < clubWalkAwayCents * P('contracts.thinOverlap') && draw < P('contracts.breakdownChance')) return { agreed: false, reason: 'broke_down' };
  const playerShare = clamp(P('contracts.evenSplit') - P('contracts.sharePerZ') * (gm.behavior.negotiation - agentNegotiation), P('contracts.shareMin'), P('contracts.shareMax'));
  return { agreed: true, apyCents: Math.round(playerWalkAwayCents + gap * playerShare) };
}

/**
 * Rule 6 camp fines. A waivable fine is waived for a starter or a player with an extension pending. Waiving or
 * repaying a non-waivable fine is not decided here: it is a K7.7.1 opportunity for K2.8.2 and the L8.2.5 pipeline.
 */
export function campFine(fine: { readonly waivable: boolean }, player: { readonly starter: boolean; readonly extensionPending: boolean }): 'waive' | 'collect' | 'violation_opportunity' {
  const wants = player.starter || player.extensionPending;
  if (!wants) return 'collect';
  return fine.waivable ? 'waive' : 'violation_opportunity';
}

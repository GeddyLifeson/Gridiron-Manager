// K7.4.2 free agency, the club side: targets and offers for one market round. All clubs form offers from the
// same snapshot (K7.8.1 rule 2); the player's choice is the market module's (C8.3.2 governs, `market.choose`),
// and so are the window, tenders and contract postings (C8). Overpays and bargains come from each general
// manager's own grading error (rule 4); there is no scripted bust rate.
import type { GmProfile } from './profile.ts';
import { needAt, type Need } from './needs.ts';
import { P } from './params.ts';
import { marketReadSd } from './trade.ts';
import { playerWorth, walkAwayCents } from './value.ts';
import { clamp, type PersonId, type PlayerView, type ValueContext } from './types.ts';

export interface FreeAgent extends PlayerView {
  /** Contract length the market expects (C8.3.1 `expectedContract.years`). */
  readonly expectedYears: number;
  /** Guarantee share the market expects (C8.3.1). */
  readonly guaranteeShare: number;
  /** His minimum salary (C6.4.1). */
  readonly minimumCents: number;
  /** Clubs publicly linked to him: all anyone knows of competing interest. */
  readonly publicSuitors: number;
}

export interface Target { readonly personId: PersonId; readonly priority: number; readonly walkAwayApyCents: number; readonly years: number }

/** Rule 1: targets by need and surplus at the price he expects to pay. A player he passed on before ranks lower. */
export function targets(gm: GmProfile, pool: readonly FreeAgent[], needs: readonly Need[], ctx: ValueContext): Target[] {
  const needWeight = P('fa.needWeight');
  const passedFactor = 1 - P('fa.passedOnDiscount');
  const passedOn = gm.memory.playersPassedOn.length > 0 ? new Set(gm.memory.playersPassedOn) : null;
  const needBy = new Map<string, number>();
  const needOf = (position: string): number => {
    let n = needBy.get(position);
    if (n === undefined) { n = needAt(needs, position); needBy.set(position, n); }
    return n;
  };
  return pool
    .map((v) => {
      const years = Math.max(1, v.expectedYears);
      const { walk, value } = priced(gm, v, ctx, years);
      const passed = passedOn?.has(v.personId) ? passedFactor : 1;
      return { personId: v.personId, priority: value * (1 + needWeight * needOf(v.position)) * passed, walkAwayApyCents: walk, years, min: v.minimumCents };
    })
    .filter((t) => t.walkAwayApyCents >= t.min && t.priority > 0)
    .sort((a, b) => b.priority - a.priority || a.personId - b.personId)
    .map(({ min: _min, ...t }) => t);
}

/**
 * His walk-away number and his value of one free agent at one length. Both read only the profile, the view and
 * the context, so a context that may remember (`memo`, types.ts) keeps them: a club asks again every pick and
 * every round of a market, over the same views, and the answer cannot have moved.
 */
function priced(gm: GmProfile, v: FreeAgent, ctx: ValueContext, years: number): { readonly walk: number; readonly value: number } {
  if (!ctx.memo) return { walk: walkAwayCents(gm, v, ctx, years), value: playerWorth(gm, v, ctx, years).value };
  let byGm = PRICED.get(ctx);
  if (!byGm) { byGm = new WeakMap(); PRICED.set(ctx, byGm); }
  let byView = byGm.get(gm);
  if (!byView) { byView = new WeakMap(); byGm.set(gm, byView); }
  let byYears = byView.get(v);
  if (!byYears) { byYears = new Map(); byView.set(v, byYears); }
  let out = byYears.get(years);
  if (!out) { out = { walk: walkAwayCents(gm, v, ctx, years), value: playerWorth(gm, v, ctx, years).value }; byYears.set(years, out); }
  return out;
}

const PRICED = new WeakMap<ValueContext, WeakMap<GmProfile, WeakMap<FreeAgent, Map<number, { readonly walk: number; readonly value: number }>>>>();

export interface ClubOffer { readonly personId: PersonId; readonly years: number; readonly apyCents: number; readonly guaranteedCents: number }

/**
 * Rule 1: offer up to the walk-away value, opening at a fraction set by `negotiation` and his read of the
 * competing interest, and closing the gap each round he is still unsigned. Offers stop when cap room does.
 * `round` counts from 0 at the opening of the window.
 */
export function roundOffers(gm: GmProfile, pool: readonly FreeAgent[], needs: readonly Need[], ctx: ValueContext, roomCents: number, round: number, openSpots: number): ClubOffer[] {
  const byId = new Map(pool.map((v) => [v.personId, v]));
  const out: ClubOffer[] = [];
  let room = roomCents;
  for (const t of targets(gm, pool, needs, ctx)) {
    if (out.length >= Math.min(openSpots, P('fa.offersPerRound'))) break;
    const v = byId.get(t.personId)!;
    // He believes more clubs are in when his read says so; a hard bargainer still opens lower.
    const read = clamp(v.publicSuitors * (1 + ctx.draw('market', gm.personId, v.personId) * marketReadSd(gm.behavior.marketRead)), 0, P('fa.suitorsForFullOpen'));
    const open = clamp(P('fa.openBase') - P('fa.openPerNegotiationZ') * gm.behavior.negotiation + P('fa.openPerSuitor') * read, P('fa.openMin'), 1);
    const share = Math.min(1, open + P('fa.raisePerRound') * round);
    const apy = Math.max(v.minimumCents, Math.round(t.walkAwayApyCents * share));
    if (apy > room) continue;
    room -= apy;
    out.push({ personId: t.personId, years: t.years, apyCents: apy, guaranteedCents: Math.round(apy * t.years * v.guaranteeShare) });
  }
  return out;
}

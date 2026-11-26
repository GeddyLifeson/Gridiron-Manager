// Commands of the free agency screen (item 7; C8.1.1, C8.2.1, C6.4.3, M5.2.1, M5.3.1, L5.2.1, L7). Every
// contract act checks the `final_say_contracts` field first: with it the user's offer, tender or tag is
// filed; without it it becomes a request to the holder (L5.2.2); delegated, the personnel man acts. Offers
// must fit the club's cap room after its other open offers (C6) and a roster spot (C5.1.1), and respect the
// player's rights (C8.1.1). The head coach's own call (M5.2.1) is his in every arrangement: illegal contact
// is never refused, only warned and logged for the compliance pipeline (C11.6.2, G-28).
import { cap, market } from '@gm/league';
import { authorityFor } from '../../read-models/draft-room/authority.ts';
import { agentBlocks, agentRead, contactTarget, type FreeAgencyInput, type FreeAgentInput } from '../../read-models/free-agency/model.ts';
import type { gm } from '@gm/front-office';

export type FreeAgencyContext = FreeAgencyInput;

export interface FaRefusal { readonly ok: false; readonly rule: string; readonly message: string; readonly fix: string }
const refuse = (rule: string, message: string, fix: string): FaRefusal => ({ ok: false, rule, message, fix });

export interface OfferTerms { readonly personId: number; readonly years: number; readonly apyCents: number; readonly guaranteedCents: number }

export type ContractAct =
  | { readonly kind: 'offer'; readonly terms: OfferTerms; readonly offerSheet: boolean }
  | { readonly kind: 'tender'; readonly tender: market.Tender }
  | { readonly kind: 'tag'; readonly personId: number; readonly tag: cap.TagKind };

/** L5.2.2 request to the holder of the contracts field. */
export interface ContractRequest { readonly act: ContractAct; readonly holder: gm.Holder }

export type ContractOutcome =
  | { readonly ok: true; readonly kind: 'filed'; readonly act: ContractAct; /** Agreed now, executed when the league year opens (C8.2.1 rule 1). */ readonly executesLater: boolean }
  | { readonly ok: true; readonly kind: 'request'; readonly request: ContractRequest }
  | FaRefusal;

function route(ctx: FreeAgencyContext, act: ContractAct): ContractOutcome {
  const a = authorityFor(ctx.power, 'final_say_contracts');
  if (a.authority === 'delegated') return refuse('L5.2.1', 'you handed contracts to your personnel man', 'take contracts back to act yourself');
  if (a.authority === 'advise') return { ok: true, kind: 'request', request: { act, holder: a.holder } };
  return { ok: true, kind: 'filed', act, executesLater: !market.mayExecuteContract(ctx.now, ctx.dates).ok };
}

function player(ctx: FreeAgencyContext, personId: number): FreeAgentInput | FaRefusal {
  return ctx.players.find((p) => p.personId === personId) ?? refuse('C8.1.1', `player ${personId} is not on the market list`, 'pick a listed player');
}
const isRefusal = (x: unknown): x is FaRefusal => typeof x === 'object' && x !== null && (x as { ok?: unknown }).ok === false;

/**
 * An offer to another club's free agent (C8.2.1, C8.1.1, C6, C5.1.1). Checked the same whether it is filed
 * or asked for, so a request names a legal move. A restricted player's offer is an offer sheet.
 */
export function makeOffer(ctx: FreeAgencyContext, terms: OfferTerms): ContractOutcome {
  const p = player(ctx, terms.personId);
  if (isRefusal(p)) return p;
  if (p.expiring.priorClubId === ctx.clubId) return refuse('C8.1.1', 'he is your own player', 'tender, tag or extend him instead');
  if (p.signed) return refuse('C8.1.1', `${p.name} has signed`, 'none');
  if (market.before(ctx.now, ctx.dates.negotiatingOpen)) return refuse('C8.2.1', 'talks with other clubs\' free agents open with the negotiating window', 'wait for the window');
  if (terms.years < 1 || terms.apyCents <= 0 || terms.guaranteedCents < 0 || terms.guaranteedCents > terms.apyCents * terms.years) {
    return refuse('C6', 'the terms are not a contract', 'at least one year, money per year above zero, guarantee no more than the total');
  }
  const rights = market.rightsAt(p.expiring, p.tender, ctx.now, ctx.dates, ctx.mr).rights;
  const offerSheet = rights === 'offer_sheet';
  const target = contactTarget(p, ctx.clubId, ctx);
  if (!offerSheet && !market.maySign(p.expiring, p.tender, ctx.clubId, ctx.now, ctx.dates, ctx.mr) && target !== 'pending_ufa') {
    return refuse('C8.1.1', `${p.name} may not sign with your club now`, 'wait until his rights allow it');
  }
  const committed = ctx.offers.filter((o) => o.personId !== terms.personId && (o.status === 'open' || o.status === 'accepted')).reduce((s, o) => s + o.apyCents, 0);
  if (terms.apyCents > ctx.capRoomCents - committed) return refuse('C6', 'the offer does not fit under the cap with your other offers', 'clear room or lower the money per year');
  const pendingSigned = ctx.offers.filter((o) => o.status === 'accepted').length;
  if (ctx.rosterCount + pendingSigned >= ctx.rosterLimit) return refuse('C5.1.1', `the roster is at its limit of ${ctx.rosterLimit}`, 'release a player first');
  return route(ctx, { kind: 'offer', terms, offerSheet });
}

/** M5.3.1, C8.1.1: a tender to the club's own expiring player, through the market module. */
export function tender(ctx: FreeAgencyContext, personId: number, level: market.TenderLevel): ContractOutcome {
  const p = player(ctx, personId);
  if (isRefusal(p)) return p;
  const current = p.tender && (p.tender.withdrawnAt === null || market.before(ctx.now, p.tender.withdrawnAt)) ? p.tender : null;
  const t = market.makeTender(level, p.expiring, ctx.clubId, ctx.now, ctx.dates, ctx.mr, ctx.capRules, current, p.signed);
  if (!t.ok) return refuse(t.rule, t.message, t.fix);
  return route(ctx, { kind: 'tender', tender: t.tender });
}

/** M5.3.1, C6.4.3: a franchise or transition tag on the club's own expiring player. League checks are blocks. */
export function tag(ctx: FreeAgencyContext, personId: number, kind: cap.TagKind): ContractOutcome {
  const p = player(ctx, personId);
  if (isRefusal(p)) return p;
  if (p.expiring.priorClubId !== ctx.clubId) return refuse('C6.4.3', 'only his own club may tag a player', 'make an offer instead');
  const c = cap.checkTag({ kind, day: ctx.tags.day, leagueYearStartDay: ctx.tags.leagueYearStartDay, tagsUsed: ctx.tags.tagsUsed }, ctx.capRules);
  if (!c.ok) return refuse('C6.4.3', c.reason, 'none this year');
  return route(ctx, { kind: 'tag', personId, tag: kind });
}

export interface CallInput {
  readonly personId: number;
  readonly pitch: market.Pitch;
  /** The club's offer as the player's choice scores it (C8.3.2), or null when there is none yet. */
  readonly offer: market.Offer | null;
  /** The player's true weights: used by the market to apply the pitch, never shown (M5.2.1 rule 1). */
  readonly weights: market.Weights;
}

export type CallOutcome =
  | {
    readonly ok: true;
    readonly legal: boolean;
    readonly reason: string;
    readonly usesWindowCall: boolean;
    /** Logged and sent to the compliance pipeline when the call breaks the contact rules (C11.6.2). */
    readonly breakable: market.BreakableAct | null;
    /** The offer with its non-money terms moved by the pitch, or null. */
    readonly offer: market.Offer | null;
  }
  | FaRefusal;

/**
 * M5.2.1: the head coach calls the player and pitches role, scheme, winning, relationships or the city. The
 * agent may hold the call until the money is close (L7). An illegal call goes ahead, warned and logged.
 */
export function callPlayer(ctx: FreeAgencyContext, c: CallInput): CallOutcome {
  const p = player(ctx, c.personId);
  if (isRefusal(p)) return p;
  const o = ctx.offers.find((x) => x.personId === c.personId);
  const read = o ? agentRead(o.apyCents, p.ask.apyCents) : null;
  if (agentBlocks(p.agent?.stance ?? null, read)) return refuse('L7', `${p.agent?.name ?? 'his agent'} will not put the call through until the money is close`, 'bring the offer near his ask first');
  const v = market.checkContact({ clubId: ctx.clubId, personId: p.personId, actor: 'head_coach', kind: 'player_call', target: contactTarget(p, ctx.clubId, ctx), callsUsed: ctx.windowCallsUsed }, ctx.now, ctx.dates, ctx.mr);
  return { ok: true, legal: v.legal, reason: v.reason, usesWindowCall: v.usesWindowCall, breakable: v.breakable, offer: c.offer ? market.applyPitch(c.offer, c.weights, c.pitch) : null };
}

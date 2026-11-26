// Builds the free agency view from the market module (G-35: classes, rights, tenders, the window, contact
// rules), the cap module (G-16: tags), the club's cap and roster position, the agents (G-49 stance words) and
// the club's offers. Pure: same input, same view.
import type { RuleSet } from '@gm/schema';
import { cap, market } from '@gm/league';
import type { gm } from '@gm/front-office';
import type { scouting } from '@gm/people';
import { authorityFor } from '../draft-room/authority.ts';
import { observedGrade } from '../draft-room/grade.ts';
import type { AgentRead, AgentStance, CallView, FreeAgencyView, MarketPhase, MarketRow, OfferView, OwnRow, TagOption, TenderOption } from './types.ts';

export interface FreeAgentInput {
  readonly personId: number;
  readonly name: string;
  readonly position: string;
  readonly age: number;
  readonly expiring: market.ExpiringPlayer;
  /** The prior club's latest tender to him, live or withdrawn. */
  readonly tender: market.Tender | null;
  /** Signed anywhere already. */
  readonly signed: boolean;
  /** The club's role grade cell for him (G-19 `gradeCells`), or null when nobody watched. */
  readonly grade: scouting.GradeCell | null;
  /** The market's expected contract line (C8.3.1 `expectedContract`): what his agent asks. */
  readonly ask: market.ExpectedContract;
  readonly publicSuitors: number;
  /** His top value as the club has heard it (X1 words), or null when unknown. */
  readonly saysHeWants: market.NonMoneyTerm | null;
  /** His agent (L7), or null when he represents himself. */
  readonly agent: { readonly name: string; readonly stance: AgentStance } | null;
}

export interface ClubOffer {
  readonly personId: number;
  readonly years: number;
  readonly apyCents: number;
  readonly guaranteedCents: number;
  readonly status: OfferView['status'];
}

export interface TagState {
  /** Day index of today and of the first day of the new league year (C4 calendar). */
  readonly day: number;
  readonly leagueYearStartDay: number;
  readonly tagsUsed: number;
}

export interface FreeAgencyInput {
  readonly clubId: number;
  readonly now: market.Instant;
  readonly dates: market.MarketDates;
  readonly mr: market.MarketRules;
  /** The league rule set (cap keys for tender salaries and tags). */
  readonly capRules: RuleSet;
  readonly power: gm.Power;
  readonly clubNames: Readonly<Record<string, string>>;
  readonly capRoomCents: number;
  readonly rosterCount: number;
  /** The roster limit now (C5.1.1: 90 in the offseason). */
  readonly rosterLimit: number;
  readonly windowCallsUsed: number;
  readonly players: readonly FreeAgentInput[];
  readonly offers: readonly ClubOffer[];
  readonly tags: TagState;
}

export function marketPhase(now: market.Instant, dates: market.MarketDates): MarketPhase {
  if (market.before(now, dates.negotiatingOpen)) return 'before_window';
  if (market.before(now, dates.leagueYearStart)) return 'negotiating_window';
  return 'open';
}

/** L7: the agent's read of an offer against his ask (C8.3.1 range): at or above the middle is close. */
export function agentRead(apyCents: number, ask: market.Range): AgentRead {
  if (apyCents >= ask.mid) return 'close';
  if (apyCents >= ask.low) return 'talking';
  return 'far_apart';
}

/**
 * M5.2.1 edge case: the agent blocks the call until money is close. Reading (Assumption W-FA-1): a hostile
 * agent wants the offer close; a wary one wants it inside his range; others put the call through.
 */
export function agentBlocks(stance: AgentStance | null, read: AgentRead | null): boolean {
  if (stance === 'hostile') return read !== 'close';
  if (stance === 'wary') return read === null || read === 'far_apart';
  return false;
}

/** The player's standing toward the club for the contact rules (C8.2.1). */
export function contactTarget(p: FreeAgentInput, clubId: number, input: Pick<FreeAgencyInput, 'now' | 'dates' | 'mr'>): market.ContactTarget {
  if (p.expiring.priorClubId === clubId) return 'own_player';
  const cls = market.freeAgentClass(p.expiring.accruedSeasons, input.mr);
  if (market.before(input.now, input.dates.leagueYearStart)) return cls === 'unrestricted' ? 'pending_ufa' : 'under_contract_elsewhere';
  const r = market.rightsAt(p.expiring, p.tender, input.now, input.dates, input.mr).rights;
  return r === 'any_club' || r === 'offer_sheet' ? 'free_agent' : 'under_contract_elsewhere';
}

/** The head coach's own call (M5.2.1), checked against the contact rules and the agent. */
export function callView(p: FreeAgentInput, input: FreeAgencyInput, read: AgentRead | null): CallView {
  const v = market.checkContact({ clubId: input.clubId, personId: p.personId, actor: 'head_coach', kind: 'player_call', target: contactTarget(p, input.clubId, input), callsUsed: input.windowCallsUsed }, input.now, input.dates, input.mr);
  return { legal: v.legal, reason: v.reason, usesWindowCall: v.usesWindowCall, blockedByAgent: agentBlocks(p.agent?.stance ?? null, read) };
}

const live = (t: market.Tender | null, now: market.Instant): t is market.Tender => !!t && (t.withdrawnAt === null || market.before(now, t.withdrawnAt));

/** Tender levels a player of this class could get (C8.1.1). */
export function tenderLevels(cls: market.FaClass): readonly market.TenderLevel[] {
  if (cls === 'exclusive_rights') return ['erfa'];
  if (cls === 'restricted') return [...market.RFA_LEVELS, 'june1', 'june15'];
  if (cls === 'unrestricted') return ['ufa'];
  return [];
}

const TAG_KINDS: readonly cap.TagKind[] = ['franchise_nonexclusive', 'franchise_exclusive', 'transition'];

export function buildFreeAgencyView(input: FreeAgencyInput): FreeAgencyView {
  const { clubId, now, dates, mr } = input;
  const name = (id: number) => input.clubNames[String(id)] ?? `#${id}`;
  const offers = new Map(input.offers.map((o) => [o.personId, o]));
  const committedCents = input.offers.filter((o) => o.status === 'open' || o.status === 'accepted').reduce((s, o) => s + o.apyCents, 0);

  const marketRows: MarketRow[] = input.players
    .filter((p) => !p.signed && p.expiring.priorClubId !== clubId)
    .map((p) => {
      const r = market.rightsAt(p.expiring, p.tender, now, dates, mr);
      const o = offers.get(p.personId);
      const read = o ? agentRead(o.apyCents, p.ask.apyCents) : null;
      return {
        personId: p.personId, name: p.name, position: p.position, age: p.age, priorClubName: name(p.expiring.priorClubId), cls: r.cls, rights: r.rights, rightsReason: r.reason,
        canSign: market.maySign(p.expiring, p.tender, clubId, now, dates, mr), offerSheet: r.rights === 'offer_sheet',
        tenderLevel: live(p.tender, now) ? p.tender.level : null, grade: observedGrade(p.grade),
        askYears: p.ask.years, askApyCents: p.ask.apyCents, askGuaranteeCents: p.ask.guaranteeCents, publicSuitors: p.publicSuitors, saysHeWants: p.saysHeWants,
        agentName: p.agent?.name ?? null, agentStance: p.agent?.stance ?? null,
        offer: o ? { years: o.years, apyCents: o.apyCents, guaranteedCents: o.guaranteedCents, status: o.status } : null, agentRead: read, call: callView(p, input, read),
      };
    })
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.personId - b.personId));

  const own: OwnRow[] = input.players
    .filter((p) => !p.signed && p.expiring.priorClubId === clubId)
    .map((p) => {
      const cls = market.freeAgentClass(p.expiring.accruedSeasons, mr);
      const current = live(p.tender, now) ? p.tender : null;
      const tenders: TenderOption[] = tenderLevels(cls).map((level) => {
        const t = market.makeTender(level, p.expiring, clubId, now, dates, mr, input.capRules, current, p.signed);
        return t.ok ? { level, salaryCents: t.tender.salaryCents, ok: true, reason: null } : { level, salaryCents: null, ok: false, reason: t.message };
      });
      const tags: TagOption[] = TAG_KINDS.map((kind) => {
        const c = cap.checkTag({ kind, day: input.tags.day, leagueYearStartDay: input.tags.leagueYearStartDay, tagsUsed: input.tags.tagsUsed }, input.capRules);
        return c.ok ? { kind, ok: true, reason: null } : { kind, ok: false, reason: c.reason };
      });
      return {
        personId: p.personId, name: p.name, position: p.position, age: p.age, cls, grade: observedGrade(p.grade),
        tender: current ? { level: current.level, salaryCents: current.salaryCents } : null, tenders, tags, askYears: p.ask.years, askApyCents: p.ask.apyCents,
      };
    })
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.personId - b.personId));

  return {
    clubId, authority: authorityFor(input.power, 'final_say_contracts'), phase: marketPhase(now, dates), firstWave: market.inFirstWave(now, dates),
    mayExecute: market.mayExecuteContract(now, dates).ok, capRoomCents: input.capRoomCents, committedCents, roomAfterOffersCents: input.capRoomCents - committedCents,
    rosterCount: input.rosterCount, rosterLimit: input.rosterLimit, windowCallsUsed: input.windowCallsUsed, windowCalls: mr.windowCalls,
    market: marketRows, own, tagsUsed: input.tags.tagsUsed,
  };
}

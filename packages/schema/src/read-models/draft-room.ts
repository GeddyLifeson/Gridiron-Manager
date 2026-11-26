// The zod schemas of the draft room and free agency read models (item 7, PR 268: C7.3.1, C7.5.1, M4.5.1,
// C8.1.1, C8.2.1, M5.2.1, M5.3.1), with a visibility class on every field. Mirrors app-services
// read-models/draft-room/types.ts and free-agency/types.ts; the league enums are copied here because
// @gm/schema imports no other package. Public: the order, the picks, the wire, the market's public facts.
// Own: the club's board order, picks, needs, offers and cap room. Grades are the staff's estimate (MA-48):
// never a true rating, board score or valuation number.
import { z } from 'zod';
import { pub, own, est } from '../field.ts';

const int = () => z.number().int();
const text = () => own(z.string());
const ptext = () => pub(z.string());
const flag = () => own(z.boolean());
const arr = <T extends z.ZodType>(t: T) => own(z.array(t));
const pid = () => pub(int().positive(), 'id');
const cents = () => own(int(), 'cents');

// --- shared ---------------------------------------------------------------------------------------
/** front-office gm.PowerField and gm.Holder (L5.2.1). */
const POWER_FIELD = ['final_say_roster', 'final_say_draft', 'final_say_contracts'] as const;
const GM_HOLDER = ['general_manager', 'head_coach', 'owner', 'executive'] as const;
const Authority = own(z.object({
  field: own(z.enum(POWER_FIELD)), authority: own(z.enum(['decide', 'delegated', 'advise'])), holder: own(z.enum(GM_HOLDER)),
}).strict());

/** A grade the club's staff set (G-19 formatGrade), or unwatched. */
const ObservedGrade = est(z.discriminatedUnion('state', [
  z.object({
    state: est(z.literal('graded')), text: est(z.string()), label: est(z.string()), confidence: est(z.string()), bandText: est(z.string()),
    grader: est(z.string()), n: est(int().min(0), 'count'),
    asOf: est(z.object({ seasonYear: est(int(), 'season_year'), dayIndex: est(int().min(0), 'day_index') }).strict()),
  }).strict(),
  z.object({ state: est(z.literal('unwatched')) }).strict(),
]));

// --- draft room -----------------------------------------------------------------------------------
/** league draft.PickKind, PickStatus, DraftWire kind, UserStance kind, DecidedBy. */
const PICK_KIND = ['regular', 'compensatory', 'equal_count', 'supplemental'] as const;
const PICK_STATUS = ['open', 'used', 'forfeited'] as const;
const WIRE_KIND = ['on_clock', 'pick', 'late_pick', 'clock_expired', 'trade', 'day_closed', 'draft_complete'] as const;
const DECIDED_BY = ['club', 'user', 'fallback_after_expiry'] as const;

const Clock = pub(z.object({
  overall: pub(int().min(1), 'index'), round: pub(int().min(1), 'index'), inRound: pub(int().min(1), 'index'), kind: pub(z.enum(PICK_KIND)),
  clubId: pid(), clubName: ptext(), userOnClock: own(z.boolean()),
  secondsLeft: pub(z.number().min(0), 's'), limitSec: pub(z.number().min(0), 's'), day: pub(int().min(1), 'index'),
}).strict());
const TakenBy = pub(z.object({ overall: pub(int().min(1), 'index'), clubId: pid(), clubName: ptext() }).strict());
const BoardLine = own(z.object({
  rank: own(int().min(1), 'index'), personId: pid(), name: ptext(), position: ptext(), school: ptext().nullable(),
  grade: ObservedGrade,
  potential: est(z.object({ text: est(z.string()), evaluator: est(z.string()) }).strict()).nullable(),
  consensusRank: pub(int().min(1), 'index'), taken: TakenBy.nullable(),
}).strict());
const PickLine = pub(z.object({
  overall: pub(int().min(1), 'index'), round: pub(int().min(1), 'index'), inRound: pub(int().min(1), 'index'), clubId: pid(), clubName: ptext(),
  personId: pid(), name: ptext(), position: ptext(), late: pub(z.boolean()), mine: own(z.boolean()),
}).strict());
const HeldPick = own(z.object({
  pickId: text(), year: own(int(), 'season_year'), round: own(int().min(1), 'index'), overall: own(int().min(1), 'index').nullable(),
  kind: own(z.enum(PICK_KIND)), status: own(z.enum(PICK_STATUS)), fromClubName: text().nullable(), locked: flag(),
}).strict());
const NeedLine = own(z.object({
  position: text(), word: own(z.enum(['high', 'some', 'low'])), frame: own(z.enum(['now', 'this_offseason', 'next_year'])), coachAsked: flag(),
}).strict());
const PickLabel = own(z.object({ pickId: text(), year: own(int(), 'season_year'), round: own(int().min(1), 'index'), overall: own(int().min(1), 'index').nullable() }).strict());
const OfferCard = own(z.object({
  id: text(), withClubId: pid(), withClubName: ptext(), give: arr(PickLabel), get: arr(PickLabel),
  giveTotal: own(z.number(), 'points'), getTotal: own(z.number(), 'points'), personnelLean: own(z.enum(['take', 'pass'])), beforeClockEnds: flag(),
}).strict());
const TickerLine = pub(z.object({
  seq: pub(int().min(0), 'index'), atSec: pub(z.number().min(0), 's'), kind: pub(z.enum(WIRE_KIND)), clubName: ptext().nullable(),
  overall: pub(int().min(1), 'index').nullable(), personName: ptext().nullable(), withClubName: ptext().nullable(),
}).strict());
const LogLine = own(z.object({
  overall: own(int().min(1), 'index'), personName: text(), stance: own(z.enum(['made', 'mention', 'recommend', 'insist', 'silent'])),
  decidedBy: own(z.enum(DECIDED_BY)), late: flag(),
}).strict());
const UserStance = own(z.discriminatedUnion('kind', [
  z.object({ kind: own(z.literal('made')) }).strict(),
  z.object({ kind: own(z.enum(['mention', 'recommend', 'insist'])), personId: own(int().positive(), 'id').nullable(), trade: flag() }).strict(),
  z.object({ kind: own(z.literal('silent')) }).strict(),
]));

export const DraftRoomData = z.object({
  clubId: pid(), year: pub(int(), 'season_year'), authority: Authority, clock: Clock.nullable(),
  waitingForDay: pub(int().min(1), 'index').nullable(), complete: pub(z.boolean()), userExpired: flag(),
  board: arr(BoardLine),
  lean: est(z.array(est(z.object({ personId: pid(), name: ptext(), position: ptext() }).strict()))),
  picks: pub(z.array(PickLine)), held: arr(HeldPick), needs: arr(NeedLine), offers: arr(OfferCard), ticker: pub(z.array(TickerLine)), log: arr(LogLine),
  stance: UserStance.nullable(), insistsMade: own(int().min(0), 'count'), nextInsist: own(z.enum(['full', 'reduced'])),
}).strict().nullable();

// --- free agency ----------------------------------------------------------------------------------
/** league market.FaClass, Rights, TenderLevel, NonMoneyTerm; cap.TagKind. */
const FA_CLASS = ['exclusive_rights', 'restricted', 'unrestricted', 'free'] as const;
const RIGHTS = ['under_contract', 'any_club', 'offer_sheet', 'prior_club_only', 'no_club'] as const;
const TENDER_LEVEL = ['erfa', 'rofr', 'original_round', 'second_round', 'first_round', 'first_round_waived', 'june1', 'june15', 'ufa'] as const;
const NON_MONEY_TERM = ['role', 'winning', 'relationships', 'scheme', 'location'] as const;
const TAG_KIND = ['franchise_nonexclusive', 'franchise_exclusive', 'transition'] as const;

/** The market's expected contract line (C8.3.1): a staff estimate, not a promise. */
const CentsRange = est(z.object({ low: est(int(), 'cents'), mid: est(int(), 'cents'), high: est(int(), 'cents') }).strict());
const Call = own(z.object({ legal: flag(), reason: text(), usesWindowCall: flag(), blockedByAgent: est(z.boolean()) }).strict());
const Offer = own(z.object({
  years: own(int().min(1), 'count'), apyCents: cents(), guaranteedCents: cents(), status: own(z.enum(['open', 'accepted', 'declined', 'request'])),
}).strict());
const MarketRow = own(z.object({
  personId: pid(), name: ptext(), position: ptext(), age: pub(int().min(0), 'count'), priorClubName: ptext(),
  cls: pub(z.enum(FA_CLASS)), rights: pub(z.enum(RIGHTS)), rightsReason: ptext(), canSign: flag(), offerSheet: flag(),
  tenderLevel: pub(z.enum(TENDER_LEVEL)).nullable(), grade: ObservedGrade,
  askYears: est(int().min(0), 'count'), askApyCents: CentsRange, askGuaranteeCents: CentsRange,
  publicSuitors: pub(int().min(0), 'count'), saysHeWants: est(z.enum(NON_MONEY_TERM)).nullable(),
  agentName: ptext().nullable(), agentStance: est(z.enum(['favourable', 'neutral', 'wary', 'hostile'])).nullable(),
  offer: Offer.nullable(), agentRead: est(z.enum(['close', 'talking', 'far_apart'])).nullable(), call: Call,
}).strict());
const TenderOption = own(z.object({ level: own(z.enum(TENDER_LEVEL)), salaryCents: cents().nullable(), ok: flag(), reason: text().nullable() }).strict());
const TagOption = own(z.object({ kind: own(z.enum(TAG_KIND)), ok: flag(), reason: text().nullable() }).strict());
const OwnRow = own(z.object({
  personId: pid(), name: ptext(), position: ptext(), age: pub(int().min(0), 'count'), cls: pub(z.enum(FA_CLASS)), grade: ObservedGrade,
  tender: own(z.object({ level: own(z.enum(TENDER_LEVEL)), salaryCents: cents() }).strict()).nullable(),
  tenders: arr(TenderOption), tags: arr(TagOption), askYears: est(int().min(0), 'count'), askApyCents: CentsRange,
}).strict());

export const FreeAgencyData = z.object({
  clubId: pid(), authority: Authority, phase: pub(z.enum(['before_window', 'negotiating_window', 'open'])),
  firstWave: pub(z.boolean()), mayExecute: pub(z.boolean()),
  capRoomCents: cents(), committedCents: cents(), roomAfterOffersCents: cents(),
  rosterCount: own(int().min(0), 'count'), rosterLimit: pub(int().min(0), 'count'),
  windowCallsUsed: own(int().min(0), 'count'), windowCalls: pub(int().min(0), 'count').nullable(),
  market: arr(MarketRow), own: arr(OwnRow), tagsUsed: own(int().min(0), 'count'),
}).strict().nullable();

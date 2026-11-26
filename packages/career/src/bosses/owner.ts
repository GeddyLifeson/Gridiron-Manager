// The person the head coach answers to: L5.1 owner, and L5.4.1 the athletic director in his place
// (L5.1.1 to L5.1.5 apply with the athletic director as the main actor). Meetings, interference, resource
// asks, hot-seat signs and dead money, business obligations, late-season requests.
import { possible, type RandomStream } from '@gm/schema';
import { memory, signal, type BossEvent, type BossPromise, type BossRecord } from './events.ts';
import { param } from './params.ts';
import type { BossProfile, OwnerInterest } from './profile.ts';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// ---- L5.1.2 meetings -----------------------------------------------------------------------------------

export function meetingCadence(p: BossProfile): 'weekly' | 'monthly' {
  return p.weights.involvement >= param('meeting.weeklyInvolvement') ? 'weekly' : 'monthly';
}

/** A decision or result from the N3 decision log, as the meeting reads it. */
export interface LoggedItem {
  readonly id: number;
  readonly day: number;
  /** Which owner interest the item touches (a fourth-down call touches `fourth_downs`), or null. */
  readonly interest: OwnerInterest | null;
  /** A football decision (a call, a quarterback choice) rather than a plain result. */
  readonly football: boolean;
  /** N3: was the choice sound on the information held then. */
  readonly soundOnInformation: boolean;
  /** Did it turn out well. */
  readonly outcomeGood: boolean;
}

/**
 * L5.1.2: the owner raises 1 to 3 items from the log, weighted by his interests and recency. An involved
 * owner raises more items and more football items. Acceptance: every raised item is a real logged item.
 */
export function pickMeetingItems(p: BossProfile, log: readonly LoggedItem[], today: number, stream: RandomStream): LoggedItem[] {
  const max = param('meeting.maxItems');
  const count = Math.min(log.length, 1 + Math.round(p.weights.involvement * (max - 1)));
  const half = param('meeting.recencyHalfLifeDays');
  const pool = [...log];
  const out: LoggedItem[] = [];
  while (out.length < count && pool.length > 0) {
    const weights = pool.map((it) => {
      const age = Math.max(0, today - it.day);
      const recency = half / (half + age);
      const rank = it.interest === null ? -1 : p.interests.indexOf(it.interest);
      const interest = rank < 0 ? 1 : 3 - rank;
      const football = it.football ? 0.5 + p.weights.involvement : 1;
      return recency * interest * football;
    });
    out.push(pool.splice(stream.pick(weights), 1)[0]!);
  }
  return out;
}

export const MEETING_ANSWERS = ['explain_with_evidence', 'take_responsibility', 'point_to_roster', 'point_to_staff', 'deflect'] as const;
export type MeetingAnswer = (typeof MEETING_ANSWERS)[number];

export interface AnswerContext {
  readonly bossPersonId: number;
  readonly day: number;
  /** For `point_to_staff`: the staff member named, who hears of it through L2.4.2 travel. */
  readonly blamedStaffPersonId?: number | null;
  /** For `point_to_roster`: the general manager who built it, if any. */
  readonly rosterBuilderPersonId?: number | null;
}

/**
 * L5.1.2 answer effect. "Explain with evidence" works when the log shows the choice was sound; an owner with
 * low football involvement weighs the outcome over the process (his weight is hidden and learnable).
 */
export function answerItem(p: BossProfile, item: LoggedItem, answer: MeetingAnswer, ctx: AnswerContext): BossEvent[] {
  const inv = p.weights.involvement;
  const outcome = item.outcomeGood ? param('answer.outcomeGood') : param('answer.outcomeBad');
  const process: Record<MeetingAnswer, number> = {
    explain_with_evidence: item.soundOnInformation ? param('answer.evidenceSound') : param('answer.evidenceUnsound'),
    take_responsibility: param('answer.responsibility'),
    point_to_roster: param('answer.pointElsewhere'),
    point_to_staff: param('answer.pointElsewhere'),
    deflect: param('answer.deflect'),
  };
  const strength = inv * process[answer] + (1 - inv) * outcome;
  const out: BossEvent[] = [memory(ctx.bossPersonId, null, `meeting.${answer}`, strength, ctx.day, `item ${item.id}`)];
  if (answer === 'point_to_staff' && ctx.blamedStaffPersonId != null) {
    out.push(memory(ctx.blamedStaffPersonId, null, 'blamed_to_owner', param('answer.blamedStaff'), ctx.day, `item ${item.id} (if it reaches him, L2.4.2)`));
  }
  if (answer === 'point_to_roster' && ctx.rosterBuilderPersonId != null) {
    out.push(memory(ctx.rosterBuilderPersonId, null, 'blamed_to_owner', param('answer.blamedStaff'), ctx.day, `item ${item.id} (no united front, L5.2.4)`));
  }
  return out;
}

/** L5.1.2: a timeline promise ("we contend next year") goes to the ledger with its test season. */
export function timelinePromise(bossPersonId: number, text: string, day: number, testSeason: number): BossPromise {
  return { type: 'promise', toPersonId: bossPersonId, kind: 'timeline', text, day, testSeason };
}

/** L5.1.2: a skipped or delegated meeting leaves the access need unmet. */
export function skippedMeeting(p: BossProfile, day: number): BossEvent[] {
  return [memory(p.personId, null, 'need_unmet.access', param('answer.skipped'), day, 'meeting skipped or delegated')];
}

// ---- L5.1.3 interference -------------------------------------------------------------------------------

export const INTERFERENCE_KINDS = ['play_player', 'hire_staff', 'fire_staff', 'keep_veteran', 'public_remark', 'presence'] as const;
export type InterferenceKind = (typeof INTERFERENCE_KINDS)[number];

/** Which interest makes each kind of request likely (L5.1.3 acceptance: the debug record names it). */
const KIND_INTEREST: Readonly<Record<InterferenceKind, OwnerInterest>> = {
  play_player: 'favoured_player', hire_staff: 'wins_now', fire_staff: 'wins_now', keep_veteran: 'attendance', public_remark: 'image', presence: 'wins_now',
};

/**
 * L5.1.3 weekly chance: follows involvement, falls with trust and with results above expectation.
 * `resultsVsExpectation` runs -1 to 1 (E4 owns it).
 */
export function interferenceChance(p: BossProfile, rec: BossRecord, resultsVsExpectation: number): number {
  const results = 1 - param('interference.resultsDamp') * Math.max(0, resultsVsExpectation);
  return possible(clamp(param('interference.baseWeekly') * p.weights.involvement * (1 - rec.trust / 100) * results, 0, 1));
}

export interface InterferenceRequest { readonly kind: InterferenceKind; readonly interest: OwnerInterest; readonly day: number }

/** One week's draw: null, or a request with the interest behind it. Fixed draw order: chance, then kind. */
export function drawInterference(p: BossProfile, rec: BossRecord, resultsVsExpectation: number, day: number, stream: RandomStream): InterferenceRequest | null {
  if (!stream.chance(interferenceChance(p, rec, resultsVsExpectation))) return null;
  const weights = INTERFERENCE_KINDS.map((k) => {
    const rank = p.interests.indexOf(KIND_INTEREST[k]);
    return rank < 0 ? 1 : 4 - rank;
  });
  const kind = INTERFERENCE_KINDS[stream.pick(weights)]!;
  return { kind, interest: KIND_INTEREST[kind], day };
}

export const INTERFERENCE_RESPONSES = ['comply', 'comply_partly', 'refuse_with_reasons', 'refuse_flatly', 'through_gm', 'ask_to_stay_away', 'use_him', 'say_nothing'] as const;
export type InterferenceResponse = (typeof INTERFERENCE_RESPONSES)[number];

export interface ResponseContext {
  readonly day: number;
  /** A lineup change the room can see that is not football-driven (L3.3.1 consistency cost). */
  readonly visibleNonFootball?: boolean;
  readonly displacedPlayerId?: number | null;
  /** The decision log later bore the coach out (refusing with reasons then costs nothing). */
  readonly boreOut?: boolean;
}

/** L5.1.3 response costs. Asking an owner to stay away is a refusal. A demanded staff change is a hot-seat sign. */
export function respondToInterference(p: BossProfile, req: InterferenceRequest, resp: InterferenceResponse, ctx: ResponseContext): BossEvent[] {
  const why = `interference ${req.kind} from interest ${req.interest}`;
  const out: BossEvent[] = [];
  const refusal = resp === 'refuse_with_reasons' || resp === 'refuse_flatly' || resp === 'ask_to_stay_away';
  if (refusal) {
    const base = resp === 'refuse_with_reasons' ? param('interference.refuseReasons') : param('interference.refuseFlat');
    out.push(memory(p.personId, null, `refused.${req.kind}`, resp === 'refuse_with_reasons' && ctx.boreOut ? 0 : base, ctx.day, why));
  } else if (resp === 'comply' || resp === 'comply_partly' || resp === 'use_him') {
    out.push(memory(p.personId, null, `complied.${req.kind}`, resp === 'comply_partly' ? param('interference.complyPartly') : param('interference.comply'), ctx.day, why));
    if (ctx.visibleNonFootball) {
      out.push(signal('room', 'consistency_cost', ctx.day, `${why}: lineup change not football-driven (L3.3.1)`));
      if (ctx.displacedPlayerId != null) out.push(memory(ctx.displacedPlayerId, null, 'displaced_by_owner_request', param('interference.displaced'), ctx.day, why));
    }
  } else if (resp === 'through_gm') {
    out.push(memory(p.personId, null, `deferred_to_gm.${req.kind}`, 0, ctx.day, why));
  }
  if (req.kind === 'fire_staff') out.push(signal('hot_seat', 'demanded_staff_change', ctx.day, why));
  if (req.kind === 'public_remark' || req.kind === 'presence') out.push(signal('room', `owner_${req.kind}`, ctx.day, why));
  return out;
}

// ---- L5.1.4 resource asks and T9.1.1 requests ----------------------------------------------------------

export const ASK_OUTCOMES = ['yes', 'yes_with_condition', 'later', 'no'] as const;
export type AskOutcome = (typeof ASK_OUTCOMES)[number];

/** T9.1.1 acceptance: every grant or refusal carries a reason code. */
export type AskReason =
  | 'trusts_you' | 'results_earned_it' | 'spends_freely' | 'wants_return_first' | 'tight_with_money' | 'low_trust'
  | 'results_below_expectation' | 'interim_defers' | 'gm_opposes' | 'donors_willing';

export interface AskInput {
  readonly costUsd: number;
  readonly resultsVsExpectation: number;
  /** Asks granted in the last 12 months that have not yet shown a return (L5.1.4). */
  readonly unreturnedGrants: number;
  /** The general manager's voice on this ask, -1 (opposes) to 1 (backs) (L5.1.4 edge case, L5.2.4). */
  readonly gmVoice?: number;
  /** Booster mood 0 to 100 where donors stand behind the athletic director (L5.4.3), else omitted. */
  readonly boosterMood?: number;
}

export function askChance(p: BossProfile, rec: BossRecord, a: AskInput): number {
  const shift = param('ask.trustShift') * (rec.trust - 50) / 50
    + param('ask.resultsShift') * a.resultsVsExpectation
    - param('ask.unreturnedPenalty') * a.unreturnedGrants
    + param('ask.gmShift') * (a.gmVoice ?? 0)
    + (a.boosterMood === undefined ? 0 : param('ask.boosterShift') * (a.boosterMood - 50) / 50);
  return possible(clamp(p.weights.spending + shift, param('ask.minChance'), param('ask.maxChance')));
}

export interface AskAnswer { readonly outcome: AskOutcome; readonly reason: AskReason; readonly chance: number }

/** Resolve one ask. Fixed draw order: one uniform for grant, one for the kind of answer. */
export function resolveAsk(p: BossProfile, rec: BossRecord, a: AskInput, stream: RandomStream): AskAnswer {
  const chance = askChance(p, rec, a);
  const u = stream.uniform();
  const v = stream.uniform();
  if (p.interim && a.costUsd >= param('ad.largeRequestUsd')) return { outcome: 'later', reason: 'interim_defers', chance };
  if (u < chance) {
    const reason: AskReason = a.boosterMood !== undefined && a.boosterMood > 60 ? 'donors_willing'
      : rec.trust >= 60 ? 'trusts_you' : a.resultsVsExpectation > 0 ? 'results_earned_it' : 'spends_freely';
    return { outcome: v < param('ask.conditionShare') ? 'yes_with_condition' : 'yes', reason, chance };
  }
  const reason: AskReason = (a.gmVoice ?? 0) < 0 ? 'gm_opposes' : a.unreturnedGrants > 0 ? 'wants_return_first'
    : rec.trust < 40 ? 'low_trust' : a.resultsVsExpectation < 0 ? 'results_below_expectation' : 'tight_with_money';
  return { outcome: v < param('ask.laterShare') ? 'later' : 'no', reason, chance };
}

// ---- L5.1.5 hot-seat signs and dead money --------------------------------------------------------------

export const HOT_SEAT_SIGNS = ['process_to_results', 'owner_talks_to_players', 'vote_of_confidence', 'demanded_staff_change', 'no_extension', 'gm_stops_consulting'] as const;
export type HotSeatSign = (typeof HOT_SEAT_SIGNS)[number];
const PUBLIC_SIGNS: ReadonlySet<HotSeatSign> = new Set(['vote_of_confidence', 'owner_talks_to_players']);

export interface SignContext {
  /** E4 confidence, 0 to 100. */
  readonly confidence: number;
  /** In the last contract year with no extension offered (E3). */
  readonly lastContractYear: boolean;
  /** The job has a general manager who consults the coach. */
  readonly hasGm: boolean;
}

/**
 * L5.1.5: signs emitted by E4 confidence band, filtered by the owner's public behaviour (a private owner gives
 * fewer public signs, so a firing can come with little warning). Acceptance: no sign without its band.
 * One uniform is drawn per public sign whose band is crossed, in list order.
 */
export function hotSeatSigns(p: BossProfile, c: SignContext, stream: RandomStream): HotSeatSign[] {
  const out: HotSeatSign[] = [];
  for (const s of HOT_SEAT_SIGNS) {
    if (c.confidence >= param(`hotSeat.band.${s}`)) continue;
    if (s === 'no_extension' && !c.lastContractYear) continue;
    if (s === 'gm_stops_consulting' && !c.hasGm) continue;
    if (PUBLIC_SIGNS.has(s) && !stream.chance(p.weights.publicBehaviour)) continue;
    out.push(s);
  }
  return out;
}

/** L5.1.5 output: a coach seen as leaving has less hold on players signed beyond his last year. */
export function leavingCoachRoleBelief(playerContractEndSeason: number, coachLastSeason: number): number {
  return playerContractEndSeason > coachLastSeason ? param('hotSeat.lastYearRoleBelief') : 0;
}

/** Firing cost = remaining guaranteed salary minus expected offset (L5.1.5; L5.4.6 for programs, less a donor share). */
export function firingCost(remainingGuaranteedUsd: number, expectedOffsetUsd: number, donorShare = 0): number {
  return Math.max(0, remainingGuaranteedUsd - expectedOffsetUsd) * (1 - clamp(donorShare, 0, 1));
}

/**
 * L5.1.5 starting formula: raise in E4's firing threshold (confidence points) = 2 x (firing cost / annual
 * salary) + 1 per $10M of dead coaching money carried from firings in the last three seasons, all times
 * (1 - spending weight). Three years owed in full at spending 0 raises it by 6.
 */
export function firingThresholdRaise(firingCostUsd: number, annualSalaryUsd: number, deadCarriedUsd: number, spending: number): number {
  const salaryYears = annualSalaryUsd > 0 ? firingCostUsd / annualSalaryUsd : 0;
  const carried = deadCarriedUsd / param('deadMoney.carryUsdUnit');
  return (param('deadMoney.perSalaryYear') * salaryYears + param('deadMoney.perTenMillionCarried') * carried) * (1 - clamp(spending, 0, 1));
}

/** Dead coaching money still counted: firings in the last three seasons (L5.1.5). */
export function deadMoneyCarried(firings: readonly { readonly season: number; readonly costUsd: number }[], season: number): number {
  const seasons = param('deadMoney.carrySeasons');
  return firings.filter((f) => season - f.season < seasons && f.season <= season).reduce((s, f) => s + f.costUsd, 0);
}

// ---- L5.1.1 being told -----------------------------------------------------------------------------------

/** L5.1.1: an owner who learns of a suspension or benching from the media gets a "not told" memory, strength 40. */
export function learnedFromMedia(p: BossProfile, day: number, what: string): BossEvent[] {
  return [memory(p.personId, null, 'not_told', -param('memory.notTold'), day, `learned of ${what} from the media`)];
}

/**
 * L5.1.1: the owner reads `room_lost` through his ties after 2 weeks, sooner when a favoured player has
 * complained to him directly. Returns the day he knows.
 */
export function roomLostKnownOn(roomLostDay: number, favouredComplainedDay: number | null): number {
  const later = roomLostDay + 7 * param('owner.roomLostDelayWeeks');
  return favouredComplainedDay === null ? later : Math.min(later, Math.max(roomLostDay, favouredComplainedDay));
}

// ---- L5.3.1 obligations --------------------------------------------------------------------------------

/** Decline allowance during game weeks = 1 + round(3 x (1 - image interest)). */
export function declineAllowance(p: BossProfile): number {
  return param('obligation.allowanceBase') + Math.round(param('obligation.allowanceScale') * (1 - p.weights.imageInterest));
}

/**
 * One declined business event. Past the allowance (or any offseason event) it writes -2 on the president and
 * -1 on the owner. `declinedBefore` counts game-week declines already made this season.
 */
export function declineObligation(owner: BossProfile, presidentPersonId: number | null, declinedBefore: number, gameWeek: boolean, day: number): BossEvent[] {
  if (gameWeek && declinedBefore < declineAllowance(owner)) return [];
  const why = gameWeek ? 'declined past the game-week allowance' : 'declined an offseason event';
  const out: BossEvent[] = [memory(owner.personId, null, 'does_not_help_business', param('obligation.ownerMemory'), day, why)];
  if (presidentPersonId !== null) out.push(memory(presidentPersonId, null, 'does_not_help_business', param('obligation.presidentMemory'), day, why));
  return out;
}

// ---- L5.2.6 late-season aims ---------------------------------------------------------------------------

export const LATE_REQUESTS = ['shut_down_player', 'start_rookie_qb', 'rest_starters', 'snaps_for_young'] as const;
export type LateRequest = (typeof LATE_REQUESTS)[number];

/**
 * L5.2.6 weekly chance of a late-season request from the general manager or owner. Zero until the club is
 * eliminated or locked into its seed (acceptance). Rises with the general manager's draft interest and the
 * owner's involvement.
 */
export function lateRequestChance(flagSet: boolean, gm: BossProfile | null, owner: BossProfile): number {
  if (!flagSet) return possible(0);
  const pull = gm === null ? owner.weights.involvement : (gm.weights.draftInterest + owner.weights.involvement) / 2;
  return possible(clamp(param('late.baseWeekly') * (0.5 + pull), 0, 1));
}

export function drawLateRequest(flagSet: boolean, gm: BossProfile | null, owner: BossProfile, day: number, stream: RandomStream): BossEvent | null {
  if (!flagSet) return null;
  if (!stream.chance(lateRequestChance(flagSet, gm, owner))) return null;
  const from = gm ?? owner;
  const w = gm === null ? [1, 1, 1, 1] : [1, 1 + gm.weights.draftInterest, 1, 1 + gm.weights.draftInterest];
  const kind = LATE_REQUESTS[stream.pick(w)]!;
  return signal('e4', `late_request.${kind}`, day, `${from.kind} ${from.personId}: ${gm ? 'draft and young-player interest' : 'owner involvement'} after a clinch or elimination flag`);
}

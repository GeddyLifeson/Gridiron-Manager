// AI recruiting for programs the user does not run (T4 "AI use" lines). AI staffs see the same public
// ratings, take their own noisy looks, read the same evidence with their own judgement error, and spend
// the same day pools under the same calendar. They break a rule only when K2.8.2 says so, through the same
// pipeline as the user. Recruiting another school's committed player reads no rule-respect value (T4.5.2).
import { toWorldDate } from '../calendar/date.ts';
import { decideViolation, type Disposition, type StreamFor as ComplianceStreams } from '../compliance/index.ts';
import { civil } from '../calendar/date.ts';
import unitsJson from './data/units.json' with { type: 'json' };
import type { RecruitingContext } from './context.ts';
import { P } from './params.ts';
import { KEY, num } from './keys.ts';
import { defaultPlan } from './classplan.ts';
import { boardRoom, gradeOf, takeLook } from './evaluation.ts';
import { heldIndex, offersByTeam, prospectsOfClass, type HeldIndex } from './indexes.ts';
import { boardOf } from './interest.ts';
import { breachesOf, nameRecruiters, periodOn, tieOf } from './limits.ts';
import { takeAct, type ComplianceHook } from './actions.ts';
import { activeOffer, makeOffer, withdrawOffer } from './offers.ts';
import { hostOfficialVisit, hostUnofficialVisit, VISIT_BLOCKS, type VisitPlan } from './visits.ts';
import type { ActionKind, ClassPlanRow, PositionGroup, ProgramInfo, Prospect, RecruitingState } from './types.ts';

export interface AiPeople {
  /** K2.8.2 disposition of a staff member (hidden truth). Null for a person who never breaks a rule. */
  disposition(staffId: number): Disposition | null;
  /** Hidden K2 evaluation accuracy, 0 to 1. */
  evaluationSkill(staffId: number): number;
  /** Judgement error when writing a staff read (K2), a share of reads off by one step. */
  judgementError(staffId: number): number;
  /** Recruiting reach in a region: ties where he lived, coached or recruited (T4.6.1). 1 is neutral. */
  reach(staffId: number, region: string): number;
  /** Stream `conduct` for K2.8.2 rate limiting. */
  readonly conduct: ComplianceStreams;
}

const offersPerPlace = (tier: ProgramInfo['tier']) => tier === 'top' ? P('offer.perPlaceTop') : tier === 'middle' ? P('offer.perPlaceMiddle') : P('offer.perPlaceLower');

function planOf(state: RecruitingState, ctx: RecruitingContext, teamId: number): ClassPlanRow[] {
  let plan = state.plans[teamId];
  if (!plan) { plan = defaultPlan(ctx, teamId); state.plans[teamId] = plan; }
  return plan;
}

/**
 * The choices of an AI program's roster builder inside its week (K7.5.1): the order of its board, how many
 * offers it holds out, and how many of them it would take a commitment on. League code cannot import the
 * front office (P1.2.1), so the world loop binds it here. Each hook may answer null to keep this module's
 * tier default. A hook reads the staff's own board grades only (K9): it is handed ids, never a prospect.
 */
export interface AiProgramPolicy {
  /**
   * The order offers go out in for one room. `ranked` is the staff's board for the room in grade order,
   * prospects already signed included (the caller skips them); it is the same array on every ask until a
   * grade on that board moves, so an answer may be kept against it. The answer must hold the same ids.
   */
  readonly boardOrder?: (q: RoomQuery & { readonly ranked: readonly number[] }) => readonly number[] | null;
  /** Live offers the program wants out for the room's open places (T4.4.5). */
  readonly offersWanted?: (q: RoomQuery) => number | null;
  /** How many of the top of the room's board get an offer the school would take a commitment on today (T4.4.5). */
  readonly committable?: (q: RoomQuery & { readonly wanted: number }) => number | null;
}

/** One position room of one program's class, as a policy hook is asked about it. */
export interface RoomQuery {
  readonly teamId: number;
  readonly classYear: number;
  readonly position: PositionGroup;
  readonly day: number;
  /** High school and junior college places still open in the room (the plan less those committed and signed). */
  readonly open: number;
}

/** Prospects a school holds now (committed, signed or enrolled) at a position, from the week's table. */
function heldNow(state: RecruitingState, held: HeldIndex, teamId: number, position: PositionGroup): Prospect[] {
  return held.of(teamId, position).filter((p) => {
    const st = state.status[p.personId]!;
    return st.teamId === teamId && (st.status === 'committed' || st.status === 'signed' || st.status === 'enrolled');
  });
}

function countAt(state: RecruitingState, teamId: number, classYear: number, position: PositionGroup): number {
  let n = 0;
  for (const p of prospectsOfClass(state, classYear)) {
    if (p.position !== position) continue;
    const st = state.status[p.personId]!;
    if (st.teamId === teamId && (st.status === 'committed' || st.status === 'signed' || st.status === 'enrolled')) n += 1;
  }
  return n;
}

function hsPlaces(row: ClassPlanRow): number { return row.target - row.heldForTransfer; }

/** The public rating band a program aims at (T4.1.1): its tier's stars, one more either way at home. */
function inBand(prog: ProgramInfo, p: Prospect): boolean {
  const floor = prog.tier === 'top' ? P('ai.minStarsTop') : prog.tier === 'middle' ? P('ai.minStarsMiddle') : P('ai.minStarsLower');
  const ceiling = prog.tier === 'top' ? P('stars.five') : prog.tier === 'middle' ? P('ai.maxStarsMiddle') : P('ai.maxStarsLower');
  const near = p.region === prog.region;
  if (p.publicStars < floor && !(near && p.publicStars >= floor - 1)) return false;
  if (p.publicStars > ceiling && !(near && p.publicStars <= ceiling + 1)) return false;
  return true;
}

/**
 * The staff's shortlist order for one room (T4.3.1): the band's prospects, those on the published national
 * list first (staffs work from the services' lists), then by public rating, a home-region lift and the
 * staff's own finds. The finds are drawn once per staff and prospect, so the order
 * is a pure function of the class; it is kept against the class table (rebuilt when prospects change) and
 * is never saved.
 */
const ORDERS = new WeakMap<readonly Prospect[], Map<string, number[]>>();
function shortlistOrder(state: RecruitingState, ctx: RecruitingContext, prog: ProgramInfo, classYear: number, position: PositionGroup): readonly number[] {
  const cls = prospectsOfClass(state, classYear);
  let byRoom = ORDERS.get(cls);
  if (!byRoom) { byRoom = new Map(); ORDERS.set(cls, byRoom); }
  const k = `${prog.teamId}:${position}`;
  let order = byRoom.get(k);
  if (order) return order;
  const keyed: { id: number; key: number }[] = [];
  for (const p of cls) {
    if (p.position !== position || !inBand(prog, p)) continue;
    const r = ctx.rng(['shortlist', prog.teamId, p.personId]);
    keyed.push({ id: p.personId, key: (p.publicRank !== null ? P('stars.five') : 0) + p.publicStars + (p.region === prog.region ? P('shortlist.homeBonus') : 0) + P('shortlist.findSpread') * r.uniform() });
  }
  keyed.sort((a, b) => b.key - a.key || a.id - b.id);
  order = keyed.map((x) => x.id);
  byRoom.set(k, order);
  return order;
}

/** Names a staff puts on its shortlist for a number of open places: its offers per place, times the names it evaluates per offer. */
function shortlistSize(prog: ProgramInfo, places: number): number {
  return Math.ceil(places * offersPerPlace(prog.tier) * P('shortlist.perOffer'));
}

/** First-pass film on the next names of a room's shortlist. Returns how many were added. */
function addToShortlist(state: RecruitingState, ctx: RecruitingContext, prog: ProgramInfo, people: AiPeople, classYear: number, position: PositionGroup, count: number, day: number): number {
  if (count <= 0) return 0;
  const evaluator = prog.staffIds[prog.staffIds.length - 1] ?? prog.headCoachId;
  const skill = people.evaluationSkill(evaluator);
  const graded = boardOf(state, prog.teamId).grades;
  let added = 0;
  for (const id of shortlistOrder(state, ctx, prog, classYear, position)) {
    if (added >= count) break;
    if (graded[id] || state.status[id]?.status !== 'open') continue;
    takeLook(state, ctx, prog.teamId, id, 'first_pass_film', day, { skill, competition: 1, byPositionCoach: false });
    added += 1;
  }
  return added;
}

/**
 * First-pass board for a class (T4.3.1), as real staffs build it: a shortlist per position room, sized to
 * the room's open places, not a grade on every prospect in the program's band. Ruling 2026-11-26
 * (shortlists, like real staffs). Sizes: F-recruiting-practice-0001 and -0002 through `shortlist.perOffer`.
 */
export function aiBuildBoard(state: RecruitingState, ctx: RecruitingContext, prog: ProgramInfo, people: AiPeople, classYear: number, day: number): void {
  for (const row of planOf(state, ctx, prog.teamId)) {
    addToShortlist(state, ctx, prog, people, classYear, row.position, shortlistSize(prog, hsPlaces(row)), day);
  }
}

/** The AI head coach's answer to a commitment on an offer that was not committable (T4.4.5). */
export function aiAcceptsCommitment(state: RecruitingState, ctx: RecruitingContext, teamId: number, prospectId: number): boolean {
  const p = state.prospects[prospectId];
  if (!p) return false;
  const row = planOf(state, ctx, teamId).find((r) => r.position === p.position);
  if (!row) return false;
  if (countAt(state, teamId, p.classYear, p.position) >= hsPlaces(row) + P('ai.overSignAllowance')) return false;
  // Under a roster limit the over-sign allowance stays inside the room the plan holds for the whole class (T4.8.1).
  if (ctx.programs.rosterLimit?.(teamId) === undefined) return true;
  const plan = planOf(state, ctx, teamId);
  const room = plan.reduce((a, r) => a + r.target, 0);
  let held = 0;
  for (const r of plan) held += countAt(state, teamId, p.classYear, r.position);
  return held < room;
}

/** Try an act as an AI person: skip it if it breaks a rule and K2.8.2 says no (T4.2.1 AI use). */
function aiTry(state: RecruitingState, ctx: RecruitingContext, hook: ComplianceHook, people: AiPeople, kind: ActionKind, teamId: number, staffId: number, prospectId: number, day: number, region: string): boolean {
  const breaches = breachesOf(state, ctx, { kind, teamId, staffId, prospectId, day });
  if (breaches.length > 0) {
    const d = people.disposition(staffId);
    if (!d) return false;
    const decision = decideViolation(hook.state, { classId: breaches[0]!.classId, gain: P('ai.contactGain'), pDetectPerceived: P('ai.perceivedDetect'), penaltyPerceived: P('ai.perceivedPenalty') }, d, toWorldDate(day), people.conduct);
    if (!decision.commit) return false;
  }
  takeAct(state, ctx, hook, { kind, teamId, staffId, prospectId, day }, { reach: people.reach(staffId, region), aiJudgementError: people.judgementError(staffId), breaches });
  return true;
}

/** Extras a caller may hand `aiProgramWeek`: the roster builder's choices, and the week's table of who holds whom. */
export interface AiWeekOptions {
  readonly policy?: AiProgramPolicy | undefined;
  /** Built once per week by `recruitingWeek`. Left out, the program builds its own. */
  readonly held?: HeldIndex | undefined;
}

/**
 * One AI program's recruiting week for one class: name recruiters, offer by tier and need, contact offered
 * prospects within each recruiter's hours, host official visits when the calendar allows, and drop
 * commitments past the plan (T4.4.4, T4.4.5, T4.5.1, T4.6.1).
 */
export function aiProgramWeek(state: RecruitingState, ctx: RecruitingContext, hook: ComplianceHook, prog: ProgramInfo, people: AiPeople, classYear: number, day: number, opts: AiWeekOptions = {}): void {
  const teamId = prog.teamId;
  const policy = opts.policy;
  const board = boardOf(state, teamId);
  if (!board.builtClasses.includes(classYear)) { aiBuildBoard(state, ctx, prog, people, classYear, day); board.builtClasses.push(classYear); }
  const held = opts.held ?? heldIndex(state, classYear);
  const rules = ctx.rulesOn(day);
  const max = num(rules, KEY.offcampusMax) ?? prog.staffIds.length;
  nameRecruiters(state, ctx, teamId, prog.staffIds.slice(0, max), day);
  const plan = planOf(state, ctx, teamId);
  const fall = civil(day).m >= unitsJson.fallFirstMonth;
  const offeredHere = new Set<number>();
  for (const o of offersByTeam(state, teamId)) if (!o.withdrawn) offeredHere.add(o.prospectId);
  // Prospects of this class the program has a live offer out to, by room: open ones, and all not yet signed.
  const liveOut = new Map<PositionGroup, number>();
  const offeredRoom = new Map<PositionGroup, number[]>();
  for (const id of offeredHere) {
    const p = state.prospects[id];
    const st = state.status[id];
    if (!p || !st || p.classYear !== classYear || st.status === 'signed' || st.status === 'enrolled' || !board.grades[id]) continue;
    if (st.status === 'open') liveOut.set(p.position, (liveOut.get(p.position) ?? 0) + 1);
    let room = offeredRoom.get(p.position);
    if (!room) { room = []; offeredRoom.set(p.position, room); }
    room.push(id);
  }
  // Offers (T4.4.5): offers per open place by tier, committable for the top of each room.
  for (const row of plan) {
    const open = hsPlaces(row) - heldNow(state, held, teamId, row.position).length;
    if (open <= 0) continue;
    const q: RoomQuery = { teamId, classYear, position: row.position, day, open };
    const want = policy?.offersWanted?.(q) ?? Math.round(open * offersPerPlace(prog.tier));
    // The staff's board for the room, best grade first (T4.3.1). Signed prospects are still listed and are skipped.
    const graded = boardRoom(state, teamId, classYear, row.position);
    const ranked = policy?.boardOrder?.({ ...q, ranked: graded }) ?? graded;
    // Live offers: to prospects still choosing. One committed elsewhere no longer holds a place on the plan.
    let out = liveOut.get(row.position) ?? 0;
    const committableTop = policy?.committable?.({ ...q, wanted: want }) ?? Math.round(open * offersPerPlace(prog.tier) * P('offer.committableShare'));
    let rank = 0;
    for (const id of ranked) {
      if (out >= want) break;
      const st = state.status[id];
      if (!st || st.status === 'signed' || st.status === 'enrolled') continue;
      rank += 1;
      if (offeredHere.has(id)) continue;
      if (st.status === 'committed' && !(st.teamId === teamId)) continue;
      makeOffer(state, ctx, teamId, id, day, rank <= committableTop || fall);
      offeredHere.add(id); out += 1;
      const room = offeredRoom.get(row.position);
      if (room) room.push(id); else offeredRoom.set(row.position, [id]);
    }
    // The room's shortlist has run dry before its offers are out (names committed elsewhere or offered
    // already): the staff evaluates the next names on its list and offers down them (T4.3.1).
    if (out < want && addToShortlist(state, ctx, prog, people, classYear, row.position, Math.ceil((want - out) * P('shortlist.perOffer')), day) > 0) {
      for (const id of boardRoom(state, teamId, classYear, row.position)) {
        if (out >= want) break;
        const st = state.status[id];
        if (!st || st.status !== 'open' || offeredHere.has(id)) continue;
        makeOffer(state, ctx, teamId, id, day, fall);
        offeredHere.add(id); out += 1;
        const room = offeredRoom.get(row.position);
        if (room) room.push(id); else offeredRoom.set(row.position, [id]);
      }
    }
    if (fall) for (const id of offeredRoom.get(row.position) ?? []) { const o = activeOffer(state, id, teamId); if (o) o.committable = true; }
  }
  // Contacts within hours (T4.4.1): best-graded offered prospects first; the head coach takes the top few.
  const period = periodOn(ctx, day);
  const targets = [...offeredHere].filter((id) => {
    const st = state.status[id];
    return !!st && st.status !== 'signed' && st.status !== 'enrolled' && st.status !== 'not_qualified' && (st.status !== 'committed' || st.teamId === teamId || gradeOf(state, teamId, id).mean >= P('ai.flipGradeLine'));
  }).sort((a, b) => gradeOf(state, teamId, b).mean - gradeOf(state, teamId, a).mean || a - b);
  const recruiters = prog.staffIds.filter((s) => s !== prog.headCoachId);
  const budget = new Map<number, number>(recruiters.map((s) => [s, P('ai.contactsPerRecruiterWeek')]));
  let hcLeft = P('ai.headCoachContactsWeek');
  let visitsLeft = P('ai.visitsPerWeek');
  let unofficialLeft = P('ai.unofficialPerWeek');
  targets.forEach((id, i) => {
    const p = state.prospects[id]!;
    const t = tieOf(state, id, teamId);
    if (t.recruiterId === null && recruiters.length > 0) t.recruiterId = recruiters[i % recruiters.length]!;
    const rec = t.recruiterId ?? prog.headCoachId;
    const left = budget.get(rec) ?? 0;
    if (left > 0) {
      const kind: ActionKind = period === 'contact' ? 'contact_off_campus' : 'call';
      if (aiTry(state, ctx, hook, people, kind, teamId, rec, id, day, p.region)) budget.set(rec, left - 1);
      else aiTry(state, ctx, hook, people, 'message', teamId, rec, id, day, p.region);
    }
    if (hcLeft > 0 && i < P('ai.headCoachTargets')) {
      const kind: ActionKind = period === 'contact' ? 'home_visit' : 'call';
      if (aiTry(state, ctx, hook, people, kind, teamId, prog.headCoachId, id, day, p.region)) hcLeft -= 1;
    }
    // Unofficial visits (T4.5.1): the family pays; any period that allows on-campus contact. Juniors come in spring and summer.
    const lastUnofficial = t.unofficialVisits[t.unofficialVisits.length - 1];
    if (unofficialLeft > 0 && i < P('ai.visitTargets') && period !== 'dead' && period !== null
      && (lastUnofficial === undefined || day - lastUnofficial >= P('ai.unofficialGapWeeks') * P('daysPerWeek'))) {
      if (breachesOf(state, ctx, { kind: 'unofficial_visit', teamId, staffId: rec, prospectId: id, day }).length === 0) {
        hostUnofficialVisit(state, ctx, hook, teamId, rec, id, day);
        unofficialLeft -= 1;
      }
    }
    // Official visits (T4.5.1): top targets, on weekends the calendar allows, a home game in the fall.
    if (visitsLeft > 0 && t.officialVisits.length === 0 && i < P('ai.visitTargets') && period !== 'dead' && period !== null) {
      const blocks = VISIT_BLOCKS.filter((b) => b !== 'home_game' || fall);
      const plan: VisitPlan = { blocks, hours: P('ai.visitHours'), paidCompanions: P('ai.visitCompanions'), hostId: rec, hostUnhappy: false, inducement: false };
      const breaches = breachesOf(state, ctx, { kind: 'official_visit', teamId, staffId: prog.headCoachId, prospectId: id, day });
      if (breaches.length === 0) { hostOfficialVisit(state, ctx, hook, teamId, prog.headCoachId, id, day, plan); visitsLeft -= 1; }
    }
  });
  // Drops (T4.4.4): commitments past the plan go, lowest grade first; a few more for other reasons.
  for (const row of plan) {
    const here = heldNow(state, held, teamId, row.position);
    const mine = here.filter((p) => state.status[p.personId]!.status === 'committed')
      .sort((a, b) => gradeOf(state, teamId, a.personId).mean - gradeOf(state, teamId, b.personId).mean || a.personId - b.personId);
    let over = here.length - hsPlaces(row) - P('ai.overSignAllowance');
    for (const p of mine) {
      if (over <= 0) break;
      withdrawOffer(state, ctx, teamId, p.personId, day, 'recruiter_call', 'chosen');
      over -= 1;
    }
    for (const p of mine) {
      if (state.status[p.personId]!.status !== 'committed') continue;
      if (ctx.rng(['drop', teamId, p.personId, day]).chance(P('drop.weeklyOther'))) withdrawOffer(state, ctx, teamId, p.personId, day, 'recruiter_call', 'chosen');
    }
  }
}

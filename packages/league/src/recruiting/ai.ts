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
import { boardOrder, gradeOf, takeLook } from './evaluation.ts';
import { boardOf } from './interest.ts';
import { breachesOf, nameRecruiters, periodOn, tieOf } from './limits.ts';
import { takeAct, type ComplianceHook } from './actions.ts';
import { activeOffer, makeOffer, withdrawOffer } from './offers.ts';
import { hostOfficialVisit, hostUnofficialVisit, VISIT_BLOCKS, type VisitPlan } from './visits.ts';
import type { ActionKind, ClassPlanRow, PositionGroup, ProgramInfo, RecruitingState } from './types.ts';

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

function countAt(state: RecruitingState, teamId: number, classYear: number, position: PositionGroup): number {
  let n = 0;
  for (const p of Object.values(state.prospects)) {
    if (p.classYear !== classYear || p.position !== position) continue;
    const st = state.status[p.personId]!;
    if (st.teamId === teamId && (st.status === 'committed' || st.status === 'signed' || st.status === 'enrolled')) n += 1;
  }
  return n;
}

function hsPlaces(row: ClassPlanRow): number { return row.target - row.heldForTransfer; }

/** First-pass board for a class (T4.3.1): prospects whose public rating the program can aim at, plus its own region. */
export function aiBuildBoard(state: RecruitingState, ctx: RecruitingContext, prog: ProgramInfo, people: AiPeople, classYear: number, day: number): void {
  const floor = prog.tier === 'top' ? P('ai.minStarsTop') : prog.tier === 'middle' ? P('ai.minStarsMiddle') : P('ai.minStarsLower');
  const ceiling = prog.tier === 'top' ? P('stars.five') : prog.tier === 'middle' ? P('ai.maxStarsMiddle') : P('ai.maxStarsLower');
  const evaluator = prog.staffIds[prog.staffIds.length - 1] ?? prog.headCoachId;
  for (const p of Object.values(state.prospects)) {
    if (p.classYear !== classYear) continue;
    const near = p.region === prog.region;
    // A program boards the prospects it can aim at: its rating band, one more star either way at home (T4.1.1).
    if (p.publicStars < floor && !(near && p.publicStars >= floor - 1)) continue;
    if (p.publicStars > ceiling && !(near && p.publicStars <= ceiling + 1)) continue;
    if (state.boards[prog.teamId]?.grades[p.personId]) continue;
    takeLook(state, ctx, prog.teamId, p.personId, 'first_pass_film', day, { skill: people.evaluationSkill(evaluator), competition: 1, byPositionCoach: false });
  }
}

/** The AI head coach's answer to a commitment on an offer that was not committable (T4.4.5). */
export function aiAcceptsCommitment(state: RecruitingState, ctx: RecruitingContext, teamId: number, prospectId: number): boolean {
  const p = state.prospects[prospectId];
  if (!p) return false;
  const row = planOf(state, ctx, teamId).find((r) => r.position === p.position);
  if (!row) return false;
  return countAt(state, teamId, p.classYear, p.position) < hsPlaces(row) + P('ai.overSignAllowance');
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
  takeAct(state, ctx, hook, { kind, teamId, staffId, prospectId, day }, { reach: people.reach(staffId, region), aiJudgementError: people.judgementError(staffId) });
  return true;
}

/**
 * One AI program's recruiting week for one class: name recruiters, offer by tier and need, contact offered
 * prospects within each recruiter's hours, host official visits when the calendar allows, and drop
 * commitments past the plan (T4.4.4, T4.4.5, T4.5.1, T4.6.1).
 */
export function aiProgramWeek(state: RecruitingState, ctx: RecruitingContext, hook: ComplianceHook, prog: ProgramInfo, people: AiPeople, classYear: number, day: number): void {
  const teamId = prog.teamId;
  const board = boardOf(state, teamId);
  if (!board.builtClasses.includes(classYear)) { aiBuildBoard(state, ctx, prog, people, classYear, day); board.builtClasses.push(classYear); }
  const rules = ctx.rulesOn(day);
  const max = num(rules, KEY.offcampusMax) ?? prog.staffIds.length;
  nameRecruiters(state, ctx, teamId, prog.staffIds.slice(0, max), day);
  const plan = planOf(state, ctx, teamId);
  const fall = civil(day).m >= unitsJson.fallFirstMonth;
  const offeredHere = new Set(state.offers.filter((o) => o.teamId === teamId && !o.withdrawn).map((o) => o.prospectId));
  // Offers (T4.4.5): offers per open place by tier, committable for the top of each room.
  for (const row of plan) {
    const open = hsPlaces(row) - countAt(state, teamId, classYear, row.position);
    if (open <= 0) continue;
    const want = Math.round(open * offersPerPlace(prog.tier));
    const ranked = boardOrder(state, teamId, (id) => {
      const p = state.prospects[id];
      const st = state.status[id];
      return !!p && !!st && p.classYear === classYear && p.position === row.position && st.status !== 'signed' && st.status !== 'enrolled';
    });
    // Live offers: to prospects still choosing. One committed elsewhere no longer holds a place on the plan.
    let out = ranked.filter((id) => offeredHere.has(id) && state.status[id]!.status === 'open').length;
    const committableTop = Math.round(open * offersPerPlace(prog.tier) * P('offer.committableShare'));
    let rank = 0;
    for (const id of ranked) {
      if (out >= want) break;
      rank += 1;
      if (offeredHere.has(id)) continue;
      if (state.status[id]!.status === 'committed' && !(state.status[id]!.teamId === teamId)) continue;
      makeOffer(state, ctx, teamId, id, day, rank <= committableTop || fall);
      offeredHere.add(id); out += 1;
    }
    if (fall) for (const id of ranked) { const o = activeOffer(state, id, teamId); if (o) o.committable = true; }
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
    const mine = Object.values(state.prospects).filter((p) => p.classYear === classYear && p.position === row.position && state.status[p.personId]!.teamId === teamId && state.status[p.personId]!.status === 'committed')
      .sort((a, b) => gradeOf(state, teamId, a.personId).mean - gradeOf(state, teamId, b.personId).mean || a.personId - b.personId);
    let over = countAt(state, teamId, classYear, row.position) - hsPlaces(row) - P('ai.overSignAllowance');
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

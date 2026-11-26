// T4.5.2 commitment, flips and signing. A verbal commitment binds nobody; signing does. Firmness is
// hidden: a committed prospect carries a weekly decommitment chance with the T4.5.2 multipliers, and the
// staff sees only words with a basis and a date.
import { dayNumber } from '../calendar/date.ts';
import { clamp, type RecruitingContext } from './context.ts';
import { P } from './params.ts';
import { addEvidence, boardOf, interestTable } from './interest.ts';
import { prospectsOfClass } from './indexes.ts';
import { tieOf, tiesOfProspect } from './limits.ts';
import { activeOffer, refuseCommitment, setCommittable } from './offers.ts';
import { rivalVisitThisWeek } from './visits.ts';
import type { FirmnessWord, Prospect, RecruitingState } from './types.ts';

export interface SigningDates {
  readonly earlyOpen: number | null;
  readonly earlyClose: number | null;
  readonly february: number | null;
}

/** Early period (December before the class year) and the February date of the class year, from the calendar. */
export function signingDates(ctx: RecruitingContext, classYear: number): SigningDates {
  const prev = ctx.calendar.resolver('college').season(classYear - 1).windows.find((w) => w.id === 'early_signing');
  const feb = ctx.calendar.resolver('college').season(classYear).windows.find((w) => w.id === 'february_signing_day');
  return { earlyOpen: prev?.openDay ?? null, earlyClose: prev?.closeDay ?? null, february: feb?.openDay ?? null };
}

/** The head coach's answer when a prospect tries to commit on an offer that is not committable (T4.4.5). */
export type CommitDecider = (teamId: number, prospectId: number, day: number) => boolean;

/** Weekly decommitment chance with the T4.5.2 multipliers. Truth. */
export function decommitHazard(state: RecruitingState, ctx: RecruitingContext, prospectId: number, day: number): number {
  const st = state.status[prospectId];
  if (!st || st.status !== 'committed' || st.teamId === null) return 0;
  const team = st.teamId;
  const t = tieOf(state, prospectId, team);
  const week = P('daysPerWeek');
  let h = P('decommit.weeklyBase');
  if (t.lastContactDay === null || day - t.lastContactDay >= P('decommit.lapseWeeks') * week) h *= P('decommit.lapseMultiplier');
  if (t.recruiterLeftDay !== null && day - t.recruiterLeftDay < P('decommit.recruiterLeftWeeks') * week) h *= P('decommit.recruiterLeftMultiplier');
  if (ctx.programs.headCoachOn(team, day) !== ctx.programs.headCoachOn(team, day - P('decommit.hcWindowWeeks') * week)) h *= P('decommit.hcChangeMultiplier');
  if (rivalVisitThisWeek(state, prospectId, team, day)) h *= P('decommit.rivalVisitMultiplier');
  if (ctx.programs.lossStreak(team) >= P('decommit.lossStreak')) h *= P('decommit.lossMultiplier');
  return clamp(h, 0, 1);
}

function firmnessWord(state: RecruitingState, ctx: RecruitingContext, prospectId: number, day: number): FirmnessWord {
  const ratio = decommitHazard(state, ctx, prospectId, day) / P('decommit.weeklyBase');
  return ratio <= P('firm.solidRatio') ? 'solid' : ratio <= P('firm.listeningRatio') ? 'listening' : 'at_risk';
}

export interface WeekSummary {
  commits: number;
  decommits: number;
  signings: number;
  refusals: number;
}

function commit(state: RecruitingState, p: Prospect, teamId: number, day: number): void {
  const st = state.status[p.personId]!;
  st.status = 'committed'; st.teamId = teamId; st.sinceDay = day;
  for (const t of tiesOfProspect(state, p.personId)) {
    addEvidence(state, t.teamId, p.personId, { kind: 'commitment', day, byStaffId: null, signal: t.teamId === teamId ? 'we_lead' : 'no_real_chance', rivalTeamId: t.teamId === teamId ? null : teamId, reason: null });
  }
}

function sign(state: RecruitingState, p: Prospect, day: number, early: boolean): void {
  const st = state.status[p.personId]!;
  st.status = 'signed'; st.signedDay = day; st.signedEarly = early;
  for (const t of tiesOfProspect(state, p.personId)) {
    addEvidence(state, t.teamId, p.personId, { kind: 'signed', day, byStaffId: null, signal: t.teamId === st.teamId ? 'we_lead' : 'no_real_chance', rivalTeamId: null, reason: null });
  }
}

/**
 * One week for every prospect of a class (T4.5.2): commitments, decommitments, signing in the early period
 * and on the February date, and the staff's firmness read. A prospect commits when one school's interest
 * reaches his threshold, leads the next by his margin, and that school holds an offer for him.
 */
export function prospectWeek(state: RecruitingState, ctx: RecruitingContext, classYear: number, day: number, decide: CommitDecider): WeekSummary {
  const out: WeekSummary = { commits: 0, decommits: 0, signings: 0, refusals: 0 };
  const dates = signingDates(ctx, classYear);
  const inEarly = dates.earlyOpen !== null && dates.earlyClose !== null && day >= dates.earlyOpen && day - P('daysPerWeek') < dates.earlyClose;
  const afterFeb = dates.february !== null && day >= dates.february;
  const afterEarly = dates.earlyClose !== null && day > dates.earlyClose;
  const week = P('daysPerWeek');
  for (const p of prospectsOfClass(state, classYear)) {
    const id = p.personId;
    const st = state.status[id]!;
    if (st.status === 'signed' || st.status === 'enrolled' || st.status === 'not_qualified') continue;
    const r = ctx.rng(['week', id, day]);
    if (st.status === 'committed' && st.teamId !== null) {
      if (r.chance(decommitHazard(state, ctx, id, day))) {
        const t = tieOf(state, id, st.teamId);
        t.impression = clamp(t.impression - P('decommit.impressionHit'), P('impression.floor'), P('impression.cap'));
        t.decommitDay = day;
        for (const other of tiesOfProspect(state, id)) {
          addEvidence(state, other.teamId, id, { kind: 'decommitment', day, byStaffId: null, signal: other.teamId === st.teamId ? 'trailing' : null, rivalTeamId: null, reason: null });
        }
        st.status = 'open'; st.teamId = null; st.sinceDay = null; st.decommits += 1;
        out.decommits += 1;
      } else {
        // Staff firmness read (T4.5.2): words from the last contact, "unknown" when contact has lapsed.
        const t = tieOf(state, id, st.teamId);
        const board = boardOf(state, st.teamId);
        if (t.lastContactDay !== null && day - t.lastContactDay < week) {
          let word = firmnessWord(state, ctx, id, day);
          if (r.chance(P('firm.misreadShare'))) word = word === 'solid' ? 'listening' : 'solid';
          board.firmness[id] = { word, basis: 'said_to_recruiter', day };
        } else if (t.lastContactDay === null || day - t.lastContactDay >= P('firm.unknownWeeks') * week) {
          board.firmness[id] = { word: 'unknown', basis: 'said_to_recruiter', day };
        }
      }
    }
    if (st.status === 'open') {
      const table = interestTable(state, ctx, id);
      const best = table[0];
      if (best) {
        const second = table[1]?.interest ?? 0;
        // Urgency: the bar falls as the early period nears (a junior in January needs more certainty than a
        // senior in November), and keeps falling for a prospect still unsigned after it (late signees).
        const start = dayNumber({ y: classYear - 1, m: 1, d: 1 });
        const toEarly = dates.earlyOpen !== null && dates.earlyOpen > start ? clamp((day - start) / (dates.earlyOpen - start), 0, 1) : 0;
        const relax = P('commit.urgencyMax') * toEarly + (afterEarly ? clamp(P('commit.lateRelaxPerWeek') * (day - dates.earlyClose!) / week, 0, P('commit.lateRelaxMax')) : 0);
        // A higher-rated prospect aims higher (he expects more offers to choose from).
        const threshold = (p.commitThreshold + P('commit.perStar') * (p.publicStars - P('stars.floor'))) * (1 - relax);
        const t = tieOf(state, id, best.teamId);
        const cooling = t.decommitDay !== null && day - t.decommitDay < P('decommit.cooldownWeeks') * week;
        const o = activeOffer(state, id, best.teamId);
        // Readiness ramps across the bar, so commitments spread over weeks instead of piling up at it.
        const ready = clamp(P('half') + (best.interest - threshold) / (P('commit.rampWidth') + P('commit.rampWidth')), 0, 1);
        if (o && !cooling && best.interest - second >= p.commitMargin && r.chance(P('commit.weeklyPace') * ready)) {
          if (o.committable || decide(best.teamId, id, day)) {
            setCommittable(state, id, best.teamId, true);
            commit(state, p, best.teamId, day);
            out.commits += 1;
          } else {
            refuseCommitment(state, ctx, best.teamId, id, day);
            out.refusals += 1;
          }
        }
      }
    }
    if (st.status === 'committed') {
      if (inEarly) {
        if (st.waitsForFebruary === null) st.waitsForFebruary = !r.chance(P('sign.earlyShare'));
        if (!st.waitsForFebruary) { sign(state, p, day, true); out.signings += 1; }
      } else if (afterFeb) { sign(state, p, day, false); out.signings += 1; }
    }
  }
  return out;
}

/** The main recruiter leaves (S6): every tie he held loses him the same day; his prospects may follow him (T4.4.1). */
export function recruiterLeaves(state: RecruitingState, teamId: number, staffId: number, day: number, newTeamId: number | null): void {
  for (const t of Object.values(state.ties)) {
    if (t.teamId !== teamId || t.recruiterId !== staffId) continue;
    t.recruiterId = null; t.recruiterLeftDay = day;
    if (newTeamId !== null) {
      const nt = tieOf(state, t.prospectId, newTeamId);
      if (nt.recruiterId === null) nt.recruiterId = staffId;
    }
  }
}

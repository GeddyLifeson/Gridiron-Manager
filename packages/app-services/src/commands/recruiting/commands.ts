// Commands of the recruiting board (O7.5.1 outputs: recruiting actions as commands). Each runs the same
// league recruiting code AI staffs use (T4, K6), so the user plays by the same rules.
//
// - Ownership (S3, T4.6.1): a verb the user does not own but may suggest becomes a request to whoever owns
//   it (the head coach closes); a verb with no right is refused.
// - Rules (L8.2.5, T4.2.1): nothing is blocked by a rule. An act that breaks one first comes back as a
//   warning naming the rule with both choices; sent again with `goAhead`, it is taken and logged as exactly
//   one compliance row through G-28.
import { recruiting } from '@gm/league';
import { ACT_VERBS, gradeView } from '../../read-models/recruiting/model.ts';
import type { RecruitingVerb, RightButton } from '../../read-models/recruiting/types.ts';

export interface RecruitingCommandContext {
  readonly state: recruiting.RecruitingState;
  readonly ctx: recruiting.RecruitingContext;
  readonly hook: recruiting.ComplianceHook;
  readonly teamId: number;
  /** The user. */
  readonly staffId: number;
  readonly day: number;
  readonly rights: Partial<Record<RecruitingVerb, RightButton>>;
  /** The user's evaluation accuracy 0 to 1 (demonstrated, from his record; never a picked trait). */
  readonly evaluationSkill: number;
  /** Strength of a prospect's high school schedule 0 to 1 (T4.7.1); film against weak opposition counts less. */
  competition(prospectId: number): number;
  /** Whether the user is the position coach for the prospect's group (T4.3.1: his grade replaces the first pass). */
  isPositionCoach(prospectId: number): boolean;
  readonly gradeSink?: recruiting.GradeSink;
}

export interface CommandRefusal { readonly ok: false; readonly kind: 'refused'; readonly rule: string; readonly message: string; readonly fix: string }
/** L8.2.5 step 1: the act breaks a rule. The screen shows the warning with "go back" and "do it anyway". */
export interface CommandWarning { readonly ok: false; readonly kind: 'warning'; readonly breaches: readonly string[]; readonly warning: recruiting.Preview['warning'] }
/** A suggestion to the owner of the verb (S3 "suggest"); K6 or the head coach answers. */
export interface RecruitingRequest {
  readonly verb: RecruitingVerb;
  readonly what: string;
  readonly prospectId: number;
  readonly askedBy: number;
  readonly day: number;
  readonly answer: 'pending';
}
export type Outcome<T> =
  | ({ readonly ok: true; readonly kind: 'done'; readonly hours: number } & T)
  | { readonly ok: true; readonly kind: 'request'; readonly request: RecruitingRequest }
  | CommandWarning
  | CommandRefusal;

const refuse = (rule: string, message: string, fix: string): CommandRefusal => ({ ok: false, kind: 'refused', rule, message, fix });

function gate(c: RecruitingCommandContext, verb: RecruitingVerb, what: string, prospectId: number): CommandRefusal | { ok: true; kind: 'request'; request: RecruitingRequest } | null {
  const right = c.rights[verb] ?? 'none';
  if (right === 'do_it') return null;
  if (right === 'suggest') return { ok: true, kind: 'request', request: { verb, what, prospectId, askedBy: c.staffId, day: c.day, answer: 'pending' } };
  return refuse('S3', `your job does not include "${verb}" in recruiting`, 'ask the head coach or the recruiting coordinator');
}

function known(c: RecruitingCommandContext, prospectId: number): CommandRefusal | null {
  return c.state.prospects[prospectId] ? null : refuse('T4.1', `no prospect ${prospectId}`, 'pick a prospect on the board');
}

/** Look kind a contact act gives the evaluator (T4.3.1): seeing him play live, or measuring him at camp. */
const LOOK_OF_ACT: Partial<Record<recruiting.ActionKind, recruiting.LookKind>> = { evaluation: 'live', camp: 'camp' };

/**
 * Any act: evaluation, camp, call, message, off- or on-campus contact, home visit (T4.4.1, T4.2.1). An act that
 * breaks a rule is returned as a warning unless `goAhead` is set; then it is taken and logged.
 */
export function act(
  c: RecruitingCommandContext, kind: Exclude<recruiting.ActionKind, 'official_visit' | 'unofficial_visit'>, prospectId: number,
  opts: { readonly goAhead?: boolean; readonly withMemberId?: number } = {},
): Outcome<{ readonly logId: number | null; readonly breaches: readonly string[] }> {
  const bad = known(c, prospectId);
  if (bad) return bad;
  const g = gate(c, ACT_VERBS[kind], kind, prospectId);
  if (g) return g;
  const ref: recruiting.ActRef = { kind, teamId: c.teamId, staffId: c.staffId, prospectId, day: c.day };
  const pv = recruiting.previewAct(c.state, c.ctx, ref, c.hook.party(c.staffId, c.teamId));
  if (pv.breaches.length && !opts.goAhead) return { ok: false, kind: 'warning', breaches: pv.breaches.map((b) => b.rule), warning: pv.warning };
  const res = recruiting.takeAct(c.state, c.ctx, c.hook, { ...ref, withMemberId: opts.withMemberId }, { breaches: pv.breaches });
  const look = LOOK_OF_ACT[kind];
  if (look) lookAt(c, prospectId, look);
  return { ok: true, kind: 'done', hours: recruiting.hoursOf(kind), logId: res.logId, breaches: res.breaches.map((b) => b.rule) };
}

function lookAt(c: RecruitingCommandContext, prospectId: number, look: recruiting.LookKind): recruiting.BoardGrade {
  return recruiting.takeLook(c.state, c.ctx, c.teamId, prospectId, look, c.day, {
    skill: c.evaluationSkill, competition: c.competition(prospectId), byPositionCoach: c.isPositionCoach(prospectId), ...(c.gradeSink ? { sink: c.gradeSink } : {}),
  });
}

/** Watch his high school film (T4.3.1). No contact, no period rule; costs hours. */
export function watchFilm(c: RecruitingCommandContext, prospectId: number, kind: 'first_pass_film' | 'full_film'): Outcome<{ readonly looks: number }> {
  const bad = known(c, prospectId);
  if (bad) return bad;
  const g = gate(c, 'evaluate', kind, prospectId);
  if (g) return g;
  const grade = lookAt(c, prospectId, kind);
  return { ok: true, kind: 'done', hours: recruiting.hoursOf(kind), looks: grade.looks[kind] ?? 0 };
}

/** Host an unofficial or official visit (T4.5.1). The official visit checks the visit plan's rules too. */
export function hostVisit(
  c: RecruitingCommandContext, prospectId: number, visit: { readonly kind: 'unofficial' } | { readonly kind: 'official'; readonly plan: recruiting.VisitPlan },
  opts: { readonly goAhead?: boolean } = {},
): Outcome<{ readonly logId: number | null; readonly breaches: readonly string[] }> {
  const bad = known(c, prospectId);
  if (bad) return bad;
  const kind = visit.kind === 'official' ? 'official_visit' : 'unofficial_visit';
  const g = gate(c, 'visit', kind, prospectId);
  if (g) return g;
  const breaches = visit.kind === 'official'
    ? recruiting.officialVisitBreaches(c.state, c.ctx, c.teamId, prospectId, c.day, visit.plan, c.staffId)
    : recruiting.breachesOf(c.state, c.ctx, { kind, teamId: c.teamId, staffId: c.staffId, prospectId, day: c.day });
  if (breaches.length && !opts.goAhead) {
    return { ok: false, kind: 'warning', breaches: breaches.map((b) => b.rule), warning: recruiting.warningOf(breaches, c.ctx.rulesOn(c.day), c.hook.party(c.staffId, c.teamId)) };
  }
  const res = visit.kind === 'official'
    ? recruiting.hostOfficialVisit(c.state, c.ctx, c.hook, c.teamId, c.staffId, prospectId, c.day, visit.plan)
    : recruiting.hostUnofficialVisit(c.state, c.ctx, c.hook, c.teamId, c.staffId, prospectId, c.day);
  return { ok: true, kind: 'done', hours: recruiting.hoursOf(kind), logId: res.logId, breaches: res.breaches.map((b) => b.rule) };
}

/** Offer a place (T4.4.5). `committable`: the school will take his commitment now. Offers are the head coach's (T4.4.1). */
export function offer(c: RecruitingCommandContext, prospectId: number, committable: boolean): Outcome<{ readonly offer: recruiting.Offer }> {
  const bad = known(c, prospectId);
  if (bad) return bad;
  const g = gate(c, 'offer', committable ? 'offer_committable' : 'offer', prospectId);
  if (g) return g;
  const st = c.state.status[prospectId];
  if (st && (st.status === 'signed' || st.status === 'enrolled')) return refuse('T4.5.2', 'he has signed; signing ends recruiting', 'look at the transfer portal later (T6)');
  return { ok: true, kind: 'done', hours: 0, offer: recruiting.makeOffer(c.state, c.ctx, c.teamId, prospectId, c.day, committable) };
}

/** Say whether the school will take his commitment now (T4.4.5). */
export function setCommittable(c: RecruitingCommandContext, prospectId: number, committable: boolean): Outcome<{ readonly committable: boolean }> {
  const bad = known(c, prospectId);
  if (bad) return bad;
  const g = gate(c, 'offer', 'set_committable', prospectId);
  if (g) return g;
  if (!recruiting.activeOffer(c.state, prospectId, c.teamId)) return refuse('T4.4.5', 'there is no offer to him', 'make an offer first');
  recruiting.setCommittable(c.state, prospectId, c.teamId, committable);
  return { ok: true, kind: 'done', hours: 0, committable };
}

/** Pull an offer or drop a commitment (T4.4.4). Allowed before signing; it costs standing with him and his circle. */
export function withdraw(c: RecruitingCommandContext, prospectId: number, by: recruiting.DeliveredBy, reason: recruiting.DropReason): Outcome<Record<never, never>> {
  const bad = known(c, prospectId);
  if (bad) return bad;
  const g = gate(c, 'offer', 'withdraw', prospectId);
  if (g) return g;
  const r = recruiting.withdrawOffer(c.state, c.ctx, c.teamId, prospectId, c.day, by, reason);
  if (!r.ok) return r.reason === 'signed'
    ? refuse('T4.4.4', 'he has signed with you; a signed player is not dropped here', 'see the roster and transfer rules (T6.2.1, T7.3.2)')
    : refuse('T4.4.4', 'there is no offer to him', 'nothing to withdraw');
  return { ok: true, kind: 'done', hours: 0 };
}

/** Put him in the position coach's queue by hand, whatever his first-pass grade (T4.3.1). */
export function queue(c: RecruitingCommandContext, prospectId: number): Outcome<Record<never, never>> {
  const bad = known(c, prospectId);
  if (bad) return bad;
  const g = gate(c, 'evaluate', 'queue', prospectId);
  if (g) return g;
  recruiting.queueByHand(c.state, c.teamId, prospectId);
  return { ok: true, kind: 'done', hours: 0 };
}

/** Store the user's own grade (S11.1.1), graded against how he turns out. Only for a prospect someone has watched (MA-48). */
export function setUserGrade(c: RecruitingCommandContext, prospectId: number, grade: number): Outcome<{ readonly grade: number }> {
  const bad = known(c, prospectId);
  if (bad) return bad;
  const g = gate(c, 'evaluate', 'grade', prospectId);
  if (g) return g;
  if (!gradeView(c.state.boards[c.teamId]?.grades[prospectId] ?? null)) return refuse('MA-48', 'no one on the staff has watched him yet', 'watch his film or see him play first');
  recruiting.setUserGrade(c.state, c.teamId, prospectId, grade);
  return { ok: true, kind: 'done', hours: 0, grade: c.state.boards[c.teamId]!.grades[prospectId]!.userGrade! };
}

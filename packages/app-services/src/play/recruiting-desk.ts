// The user's own recruiting (T4; playtest finding recruiting.no_context:unbound). In a college career the
// user's program is taken out of the world's AI programs (world/recruiting `user` binding) and its acts are
// the ones the user queues here: contacts, calls, messages and camps (league `takeAct`), evaluations
// (`takeLook`), offers (`makeOffer`) and unofficial visits. They are taken on the next recruiting Wednesday
// of the world's weekly pass, with the world's own rule values (world/recruiting `recruitingRules`), before
// prospects decide. A rule-breaking act is refused unless the user chose to go ahead after the warning
// (T4.2.1); then it is taken and its breach goes to the compliance hook like any program's.
//
// Decisions (DECISIONS.md CY-14 to CY-16, ASSUMPTION):
// - Acts with no staff id are taken by the head coach (the user's seat).
// - The user's commitments to non-committable offers are answered by his staff as an AI program would
//   (league `aiAcceptsCommitment`) until the inbox carries the question.
// - An act whose class is not open on its day stays queued for the next recruiting day of its class.
import { recruiting as rec } from '@gm/league';
import type { recruiting as wrec } from '@gm/world';

export type QueuedAct =
  | { readonly type: 'act'; readonly kind: 'call' | 'message' | 'contact_off_campus' | 'home_visit' | 'contact_on_campus' | 'evaluation' | 'camp'; readonly prospectId: number; readonly staffId?: number; readonly goAhead?: boolean }
  | { readonly type: 'look'; readonly kind: rec.LookKind; readonly prospectId: number }
  | { readonly type: 'offer'; readonly prospectId: number; readonly committable: boolean }
  | { readonly type: 'unofficial_visit'; readonly prospectId: number; readonly staffId?: number; readonly goAhead?: boolean };

export interface ActRecord {
  readonly day: number;
  readonly act: QueuedAct;
  readonly outcome: 'taken' | 'refused' | 'unknown_prospect';
  readonly breaches: readonly string[];
}

export interface RecruitingDeskSave {
  readonly version: 1;
  readonly queue: readonly QueuedAct[];
  readonly log: readonly ActRecord[];
}

/** Evaluation skill of the user's own look (E9.1.3 case 1: the median evaluator's weight, no stored skill). */
const USER_LOOK_SKILL = 0.5;

export class RecruitingDesk {
  private queue: QueuedAct[] = [];
  private readonly log: ActRecord[] = [];

  static restore(save: RecruitingDeskSave): RecruitingDesk {
    if (save.version !== 1) throw new Error(`recruiting desk: save version ${String(save.version)} is not supported`);
    const d = new RecruitingDesk();
    d.queue = [...save.queue];
    d.log.push(...save.log);
    return d;
  }

  /** Queues an act for the next recruiting day. */
  queueAct(a: QueuedAct): void { this.queue.push(a); }
  get queued(): readonly QueuedAct[] { return this.queue; }
  get record(): readonly ActRecord[] { return this.log; }

  /** The world binding for the user's program: `teamId` is left out of the AI programs and acts through this desk. */
  binding(teamId: number): wrec.UserRecruiting {
    return { teamIds: [teamId], act: (d) => this.takeDay(teamId, d) };
  }

  private takeDay(teamId: number, d: wrec.UserRecruitingDay): void {
    const prog = d.programs.find((p) => p.teamId === teamId);
    if (!prog) return;
    // The head coach names his off-campus recruiters as every program does each week (T4.2.2).
    const max = rec.num(d.ctx.rulesOn(d.day), rec.KEY.offcampusMax) ?? prog.staffIds.length;
    rec.nameRecruiters(d.state, d.ctx, teamId, prog.staffIds.slice(0, max), d.day);
    const keep: QueuedAct[] = [];
    for (const a of this.queue) {
      const p = d.state.prospects[a.prospectId];
      if (!p) { this.log.push({ day: d.day, act: a, outcome: 'unknown_prospect', breaches: [] }); continue; }
      if (p.classYear !== d.classYear) { keep.push(a); continue; }
      this.take(teamId, prog, a, d);
    }
    this.queue = keep;
  }

  private take(teamId: number, prog: rec.ProgramInfo, a: QueuedAct, d: wrec.UserRecruitingDay): void {
    const staffId = ('staffId' in a ? a.staffId : undefined) ?? prog.headCoachId;
    const note = (outcome: ActRecord['outcome'], breaches: readonly rec.Breach[]) =>
      this.log.push({ day: d.day, act: a, outcome, breaches: breaches.map((b) => b.rule) });
    if (a.type === 'look') {
      rec.takeLook(d.state, d.ctx, teamId, a.prospectId, a.kind, d.day, { skill: USER_LOOK_SKILL, competition: 1, byPositionCoach: false });
      note('taken', []);
      return;
    }
    if (a.type === 'offer') {
      rec.makeOffer(d.state, d.ctx, teamId, a.prospectId, d.day, a.committable);
      note('taken', []);
      return;
    }
    if (a.type === 'unofficial_visit') {
      const pre = rec.breachesOf(d.state, d.ctx, { kind: 'unofficial_visit', teamId, staffId, prospectId: a.prospectId, day: d.day });
      if (pre.length > 0 && !a.goAhead) { note('refused', pre); return; }
      const r = rec.hostUnofficialVisit(d.state, d.ctx, d.hook, teamId, staffId, a.prospectId, d.day);
      note('taken', r.breaches);
      return;
    }
    const ref: rec.ActRef = { kind: a.kind, teamId, staffId, prospectId: a.prospectId, day: d.day };
    const pre = rec.breachesOf(d.state, d.ctx, ref);
    if (pre.length > 0 && !a.goAhead) { note('refused', pre); return; }
    const r = rec.takeAct(d.state, d.ctx, d.hook, ref, { breaches: pre });
    note('taken', r.breaches);
  }

  save(): RecruitingDeskSave { return { version: 1, queue: this.queue, log: this.log }; }
}

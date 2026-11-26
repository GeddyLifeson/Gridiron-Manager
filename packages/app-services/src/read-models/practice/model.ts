// Builds the practice desk view and the `practice.planner` input from the career's practice desk (G-65, CY-06
// to CY-09 in play/DECISIONS.md). The desk keeps plans and records as plain data; this file only reads them.
import { practice as pr } from '@gm/league';
import type { PlanCheck, PracticePlan, PracticeRecord } from '../../play/index.ts';
import type { PersonRef, PlanRow, PracticeDeskView, ReportRow } from './types.ts';

/** What the view reads from a practice desk (the `PracticeDesk` class satisfies it). */
export interface PracticeDeskLike {
  readonly planned: readonly PracticePlan[];
  readonly history: readonly PracticeRecord[];
  readonly paddedUsed: number;
  check(plan: PracticePlan): PlanCheck;
  staffPlan(day: number, seasonYear: number, week: number): PracticePlan;
}

/** One team's desk and the context the host knows about it. */
export interface PracticeDeskContext {
  readonly desk: PracticeDeskLike;
  /** The practice rule lookup at the team's level (`practiceRules` from play). */
  readonly rules: (key: string) => number | undefined;
  /** The world's date and week now: the staff plan of an unplanned week is dated here. */
  readonly now: { readonly day: number; readonly seasonYear: number; readonly week: number };
  /** The name the club knows for a world person id; null when unknown. */
  readonly nameOf?: (personId: string) => string | null;
}

/** The plans the coming week runs: the user's, or the staff week (the desk's own rule in `runWeek`). */
export function weekPlans(ctx: PracticeDeskContext): { readonly by: 'user' | 'staff'; readonly plans: readonly PracticePlan[] } {
  const own = ctx.desk.planned;
  if (own.length > 0) return { by: 'user', plans: own };
  return { by: 'staff', plans: [ctx.desk.staffPlan(ctx.now.day, ctx.now.seasonYear, ctx.now.week)] };
}

/** The G-65 planner input of one plan (the `practice.planner` spec renders it with `practiceView`). */
export function plannerInput(ctx: PracticeDeskContext, plan: PracticePlan, check: PlanCheck = ctx.desk.check(plan)): pr.PracticeViewInput {
  const scripts = Object.values(plan.scripts);
  const calls = [...new Set(scripts.flatMap((s) => s.reps.map((r) => r.callId)))];
  return {
    practice: plan.practice, rules: ctx.rules, coverage: pr.coverage(calls, scripts),
    findings: check.findings, participation: [], paddedUsed: ctx.desk.paddedUsed,
  };
}

/**
 * The `practice.planner` source over a desk: the week spec on main (`WeekSources.practice`) takes
 * `(teamId, practiceId)` and answers the planner input, or null for another team or an unknown practice.
 */
export function plannerSource(desks: (teamId: number) => PracticeDeskContext | null): (teamId: number, practiceId: string) => pr.PracticeViewInput | null {
  return (teamId, practiceId) => {
    const ctx = desks(teamId);
    if (!ctx) return null;
    const plan = weekPlans(ctx).plans.find((p) => p.practice.id === practiceId);
    return plan ? plannerInput(ctx, plan) : null;
  };
}

function planRow(ctx: PracticeDeskContext, plan: PracticePlan, by: 'user' | 'staff'): PlanRow {
  const check = ctx.desk.check(plan);
  const v = pr.practiceView(plannerInput(ctx, plan, check));
  return {
    practiceId: plan.practice.id, by, day: plan.practice.day, pads: plan.practice.pads, mockGame: plan.practice.mockGame === true,
    periods: plan.practice.periods.length,
    minutes: { planned: v.minutes.planned, block: v.minutes.block, remaining: v.minutes.remaining },
    expectedReps: v.expectedReps, coverage: v.coverage, ok: check.ok,
    problems: check.problems.map((p) => ({ code: p.code, period: p.period, plain: p.plain })),
    findings: check.findings.map((f) => ({ hard: f.hardness === 'hard', plain: f.plain, penalty: f.penalty, leaf: f.leaf, period: f.period, status: f.status })),
  };
}

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function reportRow(r: PracticeRecord, person: (id: string) => PersonRef): ReportRow {
  const rep = r.report;
  const ids = new Set([...Object.keys(r.reps), ...Object.keys(r.fullSpeed)]);
  return {
    seasonYear: r.seasonYear, week: r.week, practiceId: rep.practiceId, by: r.by, padded: r.paddedUsed, repsCompleted: rep.repsCompleted,
    errors: rep.errors.map((e) => ({ period: e.period, rep: e.rep, person: person(e.personId) })),
    standouts: rep.standouts.map(person),
    poor: rep.poor.map(person),
    competition: rep.competition.map((g) => ({ person: person(g.personId), position: g.position, wins: g.wins, reps: g.reps })),
    injuries: rep.injuries.map((i) => ({ period: i.period, rep: i.rep, person: person(i.personId) })),
    participation: Object.keys(rep.participation).sort(byId).map((id) => ({ person: person(id), label: rep.participation[id]! })),
    reps: [...ids].map((id) => ({ person: person(id), reps: r.reps[id] ?? 0, fullSpeed: r.fullSpeed[id] ?? 0 }))
      .sort((a, b) => b.reps - a.reps || byId(a.person.personId, b.person.personId)),
  };
}

/**
 * The desk view: the coming week's plans with their checks, the padded counter, and the kept reports of one
 * season (default the current one), newest first. Records of the same week keep the order they ran in.
 */
export function buildPracticeDeskView(teamId: number, ctx: PracticeDeskContext, season?: number | null): PracticeDeskView {
  const { by, plans } = weekPlans(ctx);
  const rows = plans.map((p) => planRow(ctx, p, by));
  const left = rows.length > 0 ? pr.practiceView(plannerInput(ctx, plans[0]!)).paddedLeft : null;
  const person = (id: string): PersonRef => ({ personId: id, name: ctx.nameOf?.(id) ?? null });
  const history = ctx.desk.history;
  const seasons = [...new Set(history.map((r) => r.seasonYear))].sort((a, b) => b - a);
  const shown = season ?? ctx.now.seasonYear;
  const reports = history.map((r, i) => ({ r, i })).filter((x) => x.r.seasonYear === shown)
    .sort((a, b) => b.r.week - a.r.week || b.i - a.i).map((x) => reportRow(x.r, person));
  return {
    teamId, seasonYear: ctx.now.seasonYear, week: ctx.now.week, plannedBy: by, plans: rows,
    padded: { used: ctx.desk.paddedUsed, left }, reportSeason: shown, reports, seasons,
  };
}

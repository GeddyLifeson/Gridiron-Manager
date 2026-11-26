// Step 4 of L8.2.5: detection. Weekly chance per logged violation = 1 - product over sources of (1 - p).
// No input says who the actor is beyond his role and his relations, so the user and an AI person with
// the same act, knowers, trace and body get the same chance (L8.2.5 "One mechanism", K9.5.1).
// Detection shares are unpublished (0 of 3): every source value is a design parameter.
import { violationClass, type ViolationClass } from './catalogue.ts';
import { K, P } from './params.ts';
import { addWeeks, weeksPerYear, yearsBetween } from './dates.ts';
import { EVENT, draft } from './events.ts';
import { windowYearsOf } from './log.ts';
import { possible, type WorldDate, type WorldTier } from '@gm/schema';
import type { CaseResponse, CaseRow, ComplianceContext, ComplianceState, EventSink, ViolationLogRow } from './types.ts';

export interface SourceChance { readonly source: string; readonly p: number }

/** Years a violation stays detectable: the rule set's key, else the L8.2.5 starting value. */
export function detectWindowYears(ctx: ComplianceContext): number {
  return windowYearsOf(ctx.rules);
}

function inspectionP(row: ViolationLogRow, c: ViolationClass): number {
  return row.severity === 'major' && c.inspection.pMajor !== undefined ? c.inspection.pMajor : c.inspection.p;
}

/** Every source and its chance for this row this week. Pure: the equal-chance tests read it directly. */
export function detectionSources(row: ViolationLogRow, ctx: ComplianceContext): SourceChance[] {
  const c = violationClass(row.classId);
  const out: SourceChance[] = [];
  if (row.certainTrace) out.push({ source: 'record', p: 1 });
  // The body's own inspection (the owning leaf's chance, never added twice), scaled by its strictness only.
  const firstCheck = !row.actSourcesDrawn;
  if (c.inspection.per === 'week' || firstCheck) {
    out.push({ source: 'inspection', p: Math.min(1, inspectionP(row, c) * ctx.bodyStrictness(c.body)) });
  }
  if (c.unionVisit && firstCheck && ctx.rules.keys().includes(K.unionVisitsPerYear)) {
    out.push({ source: 'union_visit', p: Math.min(1, ctx.rules.num(K.unionVisitsPerYear) / weeksPerYear()) });
  }
  // People who knew, other than the actor and the orderer, talk at the L6.3.1 base; a grievance doubles it.
  const insiders = new Set([row.actor.personId, row.orderedBy?.personId]);
  for (const k of new Set(row.knew)) {
    if (insiders.has(k)) continue;
    const mult = ctx.grievance(k, row.actor.personId) ? P('grievance_multiplier') : 1;
    out.push({ source: `knower:${k}`, p: Math.min(1, P('leak_weekly') * mult) });
  }
  if (c.trace) out.push({ source: 'rival', p: P('rival_notice_weekly') });
  const strict = ctx.complianceStrictness(row.actor.teamId);
  if (strict > 0) out.push({ source: 'compliance_office', p: (strict / P('facet_max')) * P('compliance_review_weekly_max') });
  const media = ctx.mediaLeakWeekly(row.actor.teamId);
  if (media > 0) out.push({ source: 'media', p: Math.min(1, media) });
  return out;
}

export function combine(sources: readonly SourceChance[]): number {
  let miss = 1;
  for (const s of sources) miss *= 1 - s.p;
  return 1 - miss;
}

export function detectionChance(row: ViolationLogRow, ctx: ComplianceContext): number {
  return combine(detectionSources(row, ctx));
}

/** AI parties cooperate by candor (K2.8.1 `candor`, 0 to 100; L8.2.5 "AI people choose by profile"). */
export function aiResponse(candor: number): CaseResponse {
  return candor >= P('candor_cooperate_min') ? 'cooperate' : 'fight';
}

function caseWeeks(rows: readonly ViolationLogRow[]): number {
  return rows.some((r) => r.severity === 'major') ? P('case_weeks_major') : P('case_weeks_minor');
}

interface Meta { readonly tier: WorldTier; readonly source: 'sim' | 'history_run' | 'user' }

/**
 * Open a case on rows of one team. The inquiry sweeps the team's other undetected rows (T9.5.2 rule 3),
 * each found at 30 percent, more when the program cooperates.
 */
export function openCase(
  state: ComplianceState, teamId: number, rowIds: readonly number[], date: WorldDate,
  ctx: ComplianceContext, sink: EventSink, meta: Meta, forced?: CaseResponse,
): { state: ComplianceState; case: CaseRow } {
  const id = state.nextCaseId;
  const response = forced ?? ctx.respond({ teamId, rowIds });
  const found = new Set(rowIds);
  const windowYears = detectWindowYears(ctx);
  const sweep = P('inquiry_sweep_p') + (response === 'fight' ? 0 : P('inquiry_sweep_coop_bonus'));
  for (const r of state.log) {
    if (found.has(r.id) || r.caseId !== null || r.actor.teamId !== teamId || yearsBetween(r.date, date) > windowYears) continue;
    if (ctx.enforcement(['sweep', id, r.id]).chance(possible(sweep))) found.add(r.id);
  }
  const rows = state.log.filter((r) => found.has(r.id));
  const body = rows.length ? violationClass(rows[0]!.classId).body : 'league';
  const c: CaseRow = {
    id, teamId, body, rowIds: rows.map((r) => r.id), opened: date, resolveBy: addWeeks(date, caseWeeks(rows)),
    response, falseAccusation: rows.length === 0, status: 'open', outcome: null,
  };
  sink.append(draft(EVENT.inquiry, { date, competitionId: rows[0]?.competitionId ?? null, teamId, ...meta }, [],
    [{ kind: 'team', id: teamId }], { caseId: id, body, falseAccusation: c.falseAccusation }, { kind: 'public' }, null));
  return {
    case: c,
    state: {
      ...state,
      cases: [...state.cases, c],
      log: state.log.map((r) => (found.has(r.id) ? { ...r, caseId: id } : r)),
      nextCaseId: id + 1,
    },
  };
}

/** One weekly detection pass over every open, detectable row. Draws are keyed by row and date. */
export function detectionWeek(state: ComplianceState, date: WorldDate, ctx: ComplianceContext, sink: EventSink, meta: Meta): ComplianceState {
  const windowYears = detectWindowYears(ctx);
  const hits: ViolationLogRow[] = [];
  const drawn = new Set<number>();
  for (const r of state.log) {
    if (r.caseId !== null || yearsBetween(r.date, date) < 0 || yearsBetween(r.date, date) > windowYears) continue;
    const p = detectionChance(r, ctx);
    drawn.add(r.id);
    if (p > 0 && ctx.enforcement(['detect', r.id, date.seasonYear, date.dayIndex]).chance(possible(p))) hits.push(r);
  }
  let s: ComplianceState = { ...state, log: state.log.map((r) => (drawn.has(r.id) && !r.actSourcesDrawn ? { ...r, actSourcesDrawn: true } : r)) };
  // One case per team per week: rows found the same week at one program are one inquiry.
  const teams = [...new Set(hits.map((h) => h.actor.teamId))].sort((a, b) => a - b);
  for (const t of teams) {
    const ids = hits.filter((h) => h.actor.teamId === t).map((h) => h.id);
    const live = ids.filter((i) => s.log.find((r) => r.id === i)?.caseId === null);
    if (live.length) s = openCase(s, t, live, date, ctx, sink, meta).state;
  }
  return s;
}

/** Self-reporting (T9.5.1, L8.2.5): opens the case now and lowers the penalty one tier where allowed. */
export function selfReport(state: ComplianceState, rowId: number, date: WorldDate, ctx: ComplianceContext, sink: EventSink, meta: Meta) {
  const r = state.log.find((x) => x.id === rowId);
  if (!r || r.caseId !== null) return { state, case: null };
  return openCase(state, r.actor.teamId, [rowId], date, ctx, sink, meta, 'self_report');
}

/**
 * "Report it to the league" on evidence a person holds (L8.2.5, L6.3.2). With a real row the case is
 * opened on it; without one it is an accusation with no act behind it and ends with no finding.
 */
export function reportToLeague(state: ComplianceState, teamId: number, rowId: number | null, date: WorldDate, ctx: ComplianceContext, sink: EventSink, meta: Meta) {
  const r = rowId === null ? undefined : state.log.find((x) => x.id === rowId && x.actor.teamId === teamId && x.caseId === null);
  return openCase(state, teamId, r ? [r.id] : [], date, ctx, sink, meta);
}

/**
 * False accusations (L8.2.5): a low weekly base rate per team raises an inquiry with no act behind it.
 * The inquiry still sweeps like any other (T9.5.2 rule 3), so a program with real rows may be found out.
 */
export function falseAccusationWeek(state: ComplianceState, teamIds: readonly number[], date: WorldDate, ctx: ComplianceContext, sink: EventSink, meta: Meta): ComplianceState {
  let s = state;
  for (const t of teamIds) {
    if (ctx.enforcement(['false', t, date.seasonYear, date.dayIndex]).chance(possible(P('false_accusation_weekly')))) s = openCase(s, t, [], date, ctx, sink, meta).state;
  }
  return s;
}

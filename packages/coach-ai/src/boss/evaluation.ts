// S4.3.1 grade records and S4.3.2 the season evaluation. Every completed duty writes exactly one record.
// The evaluation is reproducible from the records and the boss's weights (S4.3.2 acceptance): the only
// draw is the extra memory noise of a boss who was fired before evaluations, taken from the stream the
// caller hands in.
import type { Draws } from '../profile/index.ts';
import { B, clamp, share } from './params.ts';
import type { Boss, GradeRecord, GraderKind, UsedAs } from './types.ts';

export interface RecordInput {
  readonly workerId: number;
  readonly dutyId: string;
  readonly family: string;
  readonly day: number;
  readonly grader: GraderKind;
  readonly truthScore: number | null;
  readonly bossScore: number | null;
  readonly onTime: boolean;
  readonly missing?: boolean;
  readonly hoursSpent: number;
  readonly components?: Readonly<Record<string, number>>;
  readonly usedAs: UsedAs;
  readonly consequence?: string | null;
}

/** Mixed duties weigh truth and boss parts equally (G-55 `mixedGrade` is the ladder's own; this mirrors its default). */
function mixed(truth: number | null, boss: number | null): number | null {
  if (truth === null) return boss;
  if (boss === null) return null;
  return (truth + boss) / 2;
}

/** One S4.3.1 record. `score` is what counts now; null while a boss or outcome part is pending. */
export function gradeRecord(boss: Boss, i: RecordInput): GradeRecord {
  const missing = i.missing ?? false;
  let score: number | null;
  switch (i.grader) {
    case 'truth': score = i.truthScore; break;
    case 'boss': score = i.bossScore; break;
    case 'mixed': score = mixed(i.truthScore, i.bossScore); break;
    default: score = null;
  }
  if (missing) score = 0;
  return {
    workerId: i.workerId, bossId: boss.personId, dutyId: i.dutyId, family: i.family, day: i.day, grader: i.grader,
    truthScore: missing ? null : i.truthScore, bossScore: missing ? null : i.bossScore, outcomeScore: null, score,
    onTime: missing ? false : i.onTime, missing, hoursSpent: missing ? 0 : i.hoursSpent, components: i.components ?? {},
    usedAs: missing ? 'not_used' : i.usedAs, consequence: i.consequence ?? null,
  };
}

/** The outcome part arrives from play (S4.3.1). An outcome-graded record's score becomes the outcome. */
export function withOutcome(r: GradeRecord, outcome: number): GradeRecord {
  const score = r.grader === 'outcome' ? outcome : r.score;
  return { ...r, outcomeScore: outcome, score };
}

/** The number the boss holds for a record: his own score where he graded it, else the counted score. */
export function bossView(r: GradeRecord): number | null {
  return r.missing ? 0 : r.bossScore ?? r.score;
}

/**
 * Certified mode (N4): only truth and outcome scores count toward the exportable record, since boss
 * scores depend on a generated personality (S4.3.1 edge case).
 */
export function certifiedScore(r: GradeRecord): number | null {
  if (r.missing) return 0;
  return r.outcomeScore ?? r.truthScore;
}

export interface EvaluationInput {
  readonly workerId: number;
  readonly season: number;
  readonly records: readonly GradeRecord[];
  readonly trust: number;
  /** L4 relationship edge, -100 to +100. */
  readonly relationship: number;
  /** True after a losing season (S4.3.2: team results colour everything). */
  readonly losingSeason: boolean;
  /** S4.3.2 edge case: the boss was fired before evaluations and writes from memory. */
  readonly bossDeparted: boolean;
}

export interface SeasonEvaluation {
  readonly workerId: number;
  readonly bossId: number;
  readonly season: number;
  /** Area (duty family) to rating 0 to 100. */
  readonly areas: Readonly<Record<string, number>>;
  /** Weighted by detail_focus family weights. */
  readonly overall: number;
  readonly strengths: readonly string[];
  readonly fixes: readonly string[];
  /** Reference strength for S6, -1 (warns teams off) to +1 (strong). */
  readonly reference: number;
  /** The area moved by the junior's case, if any (S4.3.2: one rating at most). */
  readonly caseArea: string | null;
}

/** Area ratings before blame: mean of the boss's view of each record by family. */
export function rawAreas(records: readonly GradeRecord[]): Record<string, number> {
  const sum: Record<string, number> = {}, n: Record<string, number> = {};
  for (const r of records) {
    const v = bossView(r);
    if (v === null) continue;
    sum[r.family] = (sum[r.family] ?? 0) + v;
    n[r.family] = (n[r.family] ?? 0) + 1;
  }
  const out: Record<string, number> = {};
  for (const f of Object.keys(sum).sort()) out[f] = sum[f]! / n[f]!;
  return out;
}

/** Blame drift after a losing season: full at trust 0, gone at the shield (S4.3.2). */
export function blameDrift(trust: number, losing: boolean): number {
  if (!losing) return 0;
  return B('blame_factor') * clamp(1 - trust / B('blame_trust_shield'), 0, 1);
}

/**
 * S4.3.2 the reference a boss will give: a function of the evaluation, the relationship and his loyalty.
 * Neutral at overall 50, relationship 0; loyalty widens it in both directions it is earned.
 */
export function referenceStrength(boss: Boss, overall: number, relationship: number): number {
  const work = (overall - 50) / 50;
  const rel = clamp(relationship, -100, 100) / 100;
  const loyal = share(boss.facets.loyaltyToStaff);
  return clamp(B('reference_work_weight') * work + B('reference_relationship_weight') * rel + B('reference_loyalty_lift') * loyal * Math.max(0, work + rel), -1, 1);
}

function weightedOverall(boss: Boss, areas: Readonly<Record<string, number>>): number {
  let w = 0, s = 0;
  for (const f of Object.keys(areas).sort()) {
    const wf = Math.max(0, boss.facets.detailFocus[f] ?? 1);
    w += wf; s += wf * areas[f]!;
  }
  return w > 0 ? s / w : 0;
}

function finish(boss: Boss, i: EvaluationInput, areas: Record<string, number>, caseArea: string | null): SeasonEvaluation {
  const overall = weightedOverall(boss, areas);
  const ordered = Object.keys(areas).sort((a, b) => areas[b]! - areas[a]! || (a < b ? -1 : 1));
  return {
    workerId: i.workerId, bossId: boss.personId, season: i.season, areas, overall,
    strengths: ordered.slice(0, 2), fixes: ordered.length > 2 ? ordered.slice(-2).reverse() : ordered.slice(2),
    reference: referenceStrength(boss, overall, i.relationship), caseArea,
  };
}

/** S4.3.2 the season evaluation. `draws` is read only when the boss departed (memory noise). */
export function seasonEvaluation(boss: Boss, i: EvaluationInput, draws: Draws | null): SeasonEvaluation {
  const recs = i.records.filter((r) => r.workerId === i.workerId && r.bossId === boss.personId);
  const raw = rawAreas(recs);
  const drift = blameDrift(i.trust, i.losingSeason);
  const areas: Record<string, number> = {};
  for (const f of Object.keys(raw)) {
    const noise = i.bossDeparted && draws ? draws.normal() * B('departed_noise_sd') : 0;
    areas[f] = clamp(raw[f]! - drift + noise, 0, 100);
  }
  return finish(boss, i, areas, null);
}

/**
 * The junior makes his case once with truth-graded evidence (S4.3.2). The area where truth beats the
 * boss's rating by the most moves toward the truth mean, by at most `case_max_move`. Boss-only evidence
 * moves nothing.
 */
export function makeCase(boss: Boss, ev: SeasonEvaluation, i: EvaluationInput): SeasonEvaluation {
  const recs = i.records.filter((r) => r.workerId === i.workerId && r.bossId === boss.personId);
  let best: string | null = null, bestGap = 0;
  for (const f of Object.keys(ev.areas).sort()) {
    const truths = recs.filter((r) => r.family === f).map(certifiedScore).filter((v): v is number => v !== null);
    if (truths.length === 0) continue;
    const gap = truths.reduce((s, v) => s + v, 0) / truths.length - ev.areas[f]!;
    if (gap > bestGap) { bestGap = gap; best = f; }
  }
  if (best === null) return ev;
  const areas = { ...ev.areas, [best]: clamp(ev.areas[best]! + Math.min(bestGap, B('case_max_move')), 0, 100) };
  return finish(boss, i, areas, best);
}

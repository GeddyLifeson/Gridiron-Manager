// Culture drift with the people in charge (X9.3.1). At each season end every numeric field moves toward
// the value the leaders' logged behaviour that season implies, by 5 percent of the gap, slowed by
// tradition, never more than 5 percent of its range. Nothing is picked from a menu.
import type { Culture } from './record.ts';
import { cp } from './params.ts';

/** One logged discipline case at the team this season (L3), with how hard the action was. */
export interface DisciplineCase {
  readonly violationClass: string;
  /** True when the case drew no action or a light one (warning, reprimand). */
  readonly lightOrNone: boolean;
}

/** A person the leaders hired, kept or fired this season, with the labels he holds (X2.2.1). */
export interface PersonnelCall {
  readonly personId: number;
  readonly labels: readonly string[];
  readonly call: 'hired' | 'kept' | 'fired';
}

/** A head-coach decision by the owner or athletic director this season. */
export interface CoachDecision {
  readonly call: 'fired' | 'kept';
  /** The coach's season number in the job (1 for his first season). */
  readonly seasonInJob: number;
  /** For `kept`: whether he missed the target that season. Keeping a coach who met it says nothing about patience. */
  readonly missedTarget: boolean;
}

export interface SeasonBehaviour {
  readonly discipline: readonly DisciplineCase[];
  readonly personnel: readonly PersonnelCall[];
  readonly coachDecisions: readonly CoachDecision[];
  readonly ownerOrAdChanged: boolean;
  readonly headCoachChanged: boolean;
  /** An interim head coach's season does not count toward drift (X9.3.1 edge case). */
  readonly interimSeason: boolean;
}

/** Fields the season moved, for the label engine (X9.3.1 emits `culture_shifted` only when a public label forms or fades). */
export interface DriftResult {
  readonly moved: readonly string[];
  readonly traditionBefore: number;
  readonly traditionAfter: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** step = 0.05 (implied - f) (1 - tradition / 125), capped at 5 percent of the field's range (X9.3.1 rules 2 and 3). */
export function driftStep(current: number, implied: number, tradition: number, range: number): number {
  const raw = cp('drift.rate') * (implied - current) * (1 - tradition / cp('drift.traditionDivisor'));
  const cap = cp('drift.maxRangeShare') * range;
  return clamp(raw, -cap, cap);
}

/** Implied tolerance per class: the share of cases that drew no or light action, scaled to 0 to 100. */
export function impliedTolerance(cases: readonly DisciplineCase[]): Record<string, number> {
  const by = new Map<string, { light: number; all: number }>();
  for (const c of cases) {
    const e = by.get(c.violationClass) ?? { light: 0, all: 0 };
    e.all += 1;
    if (c.lightOrNone) e.light += 1;
    by.set(c.violationClass, e);
  }
  const out: Record<string, number> = {};
  for (const k of [...by.keys()].sort()) { const e = by.get(k)!; out[k] = (e.light / e.all) * cp('tolerance.max'); }
  return out;
}

/**
 * Implied patience (X9.3.1 rule 1): firing a coach in season n sets it to n. Keeping a coach who missed
 * the target in season n implies at least n (Assumption: the leaf names firing and keeping; only firing
 * has a stated value). Null when the season held no such decision.
 */
export function impliedPatience(decisions: readonly CoachDecision[], current: number): number | null {
  let implied: number | null = null;
  for (const d of decisions) {
    const v = d.call === 'fired' ? d.seasonInJob : d.missedTarget ? Math.max(current, d.seasonInJob) : null;
    if (v !== null) implied = implied === null ? v : Math.min(implied, v);
  }
  return implied === null ? null : clamp(implied, cp('patience.min'), cp('patience.max'));
}

/** Implied preference per label: mean of +1 (hired or kept) and -1 (fired) over the people holding it. */
export function impliedPreferences(calls: readonly PersonnelCall[]): Record<string, number> {
  const by = new Map<string, { sum: number; n: number }>();
  for (const c of calls) {
    const w = c.call === 'fired' ? -1 : 1;
    for (const l of new Set(c.labels)) {
      const e = by.get(l) ?? { sum: 0, n: 0 };
      e.sum += w; e.n += 1;
      by.set(l, e);
    }
  }
  const out: Record<string, number> = {};
  for (const k of [...by.keys()].sort()) { const e = by.get(k)!; out[k] = e.sum / e.n; }
  return out;
}

/**
 * Season-end drift (X9.3.1). Moves the record in place and updates tradition after the fields move, so
 * the season is judged at the tradition it was played under. An interim season moves no field but still
 * counts the head coach change against tradition.
 */
export function seasonEndDrift(c: Culture, s: SeasonBehaviour): DriftResult {
  const t0 = c.traditionStrength;
  const moved: string[] = [];
  if (!s.interimSeason) {
    const tolRange = cp('tolerance.max');
    for (const [k, implied] of Object.entries(impliedTolerance(s.discipline))) {
      const cur = c.conductTolerance[k];
      if (cur === undefined) continue;
      const step = driftStep(cur, implied, t0, tolRange);
      if (step !== 0) { c.conductTolerance[k] = clamp(cur + step, 0, tolRange); moved.push(`conductTolerance.${k}`); }
    }
    const ip = impliedPatience(s.coachDecisions, c.patience);
    if (ip !== null) {
      const step = driftStep(c.patience, ip, t0, cp('patience.max') - cp('patience.min'));
      if (step !== 0) { c.patience = clamp(c.patience + step, cp('patience.min'), cp('patience.max')); moved.push('patience'); }
    }
    const prefRange = cp('preference.max') - cp('preference.min');
    for (const [k, implied] of Object.entries(impliedPreferences(s.personnel))) {
      const cur = c.labelPreferences[k] ?? 0;
      const step = driftStep(cur, implied, t0, prefRange);
      if (step !== 0) { c.labelPreferences[k] = clamp(cur + step, cp('preference.min'), cp('preference.max')); moved.push(`labelPreferences.${k}`); }
    }
  }
  let t = t0;
  if (s.ownerOrAdChanged) t -= cp('tradition.ownerChange');
  if (s.headCoachChanged) t -= cp('tradition.headCoachChange');
  if (!s.ownerOrAdChanged && !s.headCoachChanged) t += cp('tradition.stableGain');
  c.traditionStrength = clamp(t, 0, cp('tradition.max'));
  return { moved, traditionBefore: t0, traditionAfter: c.traditionStrength };
}

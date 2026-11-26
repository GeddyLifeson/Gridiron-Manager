// T4.5.3 recruits who do not qualify; T4.1.2 the two-year transfer academic rule.
// Grades move each term by the prospect's drive; the staff cannot change them, except by the academic
// fraud act, which is available through L8.2.5. The final ruling arrives before fall camp.
import { clamp, type RecruitingContext } from './context.ts';
import { KEY, bool, num } from './keys.ts';
import { P } from './params.ts';
import { breach } from './limits.ts';
import { logBreaches, type ComplianceHook } from './actions.ts';
import { boardOf } from './interest.ts';
import type { AcademicWord, JucoStatus, Prospect, RecruitingState } from './types.ts';
import type { RuleSet } from '@gm/schema';

/** One school term of the final year: grade average moves by drive and noise, core courses are added. */
export function academicTerm(state: RecruitingState, ctx: RecruitingContext, classYear: number, term: number): void {
  for (const p of Object.values(state.prospects)) {
    if (p.classYear !== classYear || p.source !== 'high_school') continue;
    const r = ctx.rng(['term', p.personId, term]);
    const a = p.academics;
    a.coreGpa = clamp(a.coreGpa + P('academic.termDrift') * (a.drive - P('half')) + P('academic.termNoise') * r.normal(), P('academic.gpaFloor'), P('academic.gpaCeiling'));
    a.coreCourses += Math.max(0, Math.round(P('academic.coursesPerTerm') - (r.chance(P('academic.missedCourseShare')) ? 1 : 0)));
  }
}

/** Does a high school record meet the initial-eligibility values of the rule year (T4.5.3)? Missing keys apply no test. */
export function qualifies(rules: RuleSet, p: Prospect): boolean {
  if (p.origin === 'imported') return true; // No academic failure for a real person (L9.1.2).
  const a = p.academics;
  const need = (k: string, v: number) => { const n = num(rules, k); return n === undefined || v >= n; };
  return need(KEY.coreCourses, a.coreCourses) && need(KEY.coreGpa, a.coreGpa) && need(KEY.coreBeforeFinal, a.coreBeforeFinalYear) && need(KEY.coreBeforeFinalEms, a.coreBeforeFinalYearEms);
}

/** T4.1.2: may a junior college player enrol at a four-year school under the rule year's transfer rule? */
export function meetsTransferRule(rules: RuleSet, j: JucoStatus): boolean {
  const gpa = num(rules, KEY.jucoGpa);
  if (gpa !== undefined && j.transferGpa < gpa) return false;
  if (!j.qualifierOutOfHighSchool) {
    const terms = num(rules, KEY.jucoNqTerms); const hours = num(rules, KEY.jucoNqHours);
    if (bool(rules, KEY.jucoNqGraduate, false) && !j.graduated) return false;
    if (terms !== undefined && j.fullTimeTerms < terms) return false;
    if (hours !== undefined && j.transferableHours < hours) return false;
    return true;
  }
  const terms = num(rules, KEY.jucoQTerms); const per = num(rules, KEY.jucoQHoursPerTerm);
  if (terms !== undefined && j.fullTimeTerms < terms) return false;
  if (per !== undefined && j.fullTimeTerms > 0 && j.transferableHours / j.fullTimeTerms < per) return false;
  return true;
}

/** Seasons a junior college signee has left (T4.1.2 acceptance 3): never a fresh window when the seasons count. */
export function jucoSeasonsLeft(rules: RuleSet, j: JucoStatus): number | undefined {
  const years = num(rules, KEY.windowYears);
  if (years === undefined) return undefined;
  return bool(rules, KEY.jucoSeasonsCount, true) ? Math.max(0, years - j.seasonsUsed) : years;
}

/**
 * Final ruling before fall camp (T4.5.3): every signee of the class is a qualifier and enrols, or is not
 * and leaves the incoming class (he can enter the junior college pool). Junior college signees enrol only
 * when they meet the transfer rule (T4.1.2 acceptance 2). Returns the ids that did not qualify.
 */
export function finalRuling(state: RecruitingState, ctx: RecruitingContext, classYear: number, day: number): number[] {
  const rules = ctx.rulesOn(day);
  const failed: number[] = [];
  for (const p of Object.values(state.prospects)) {
    const st = state.status[p.personId];
    if (p.classYear !== classYear || !st || st.status !== 'signed') continue;
    const ok = p.source === 'juco' && p.juco ? meetsTransferRule(rules, p.juco) : qualifies(rules, p);
    if (ok) st.status = 'enrolled';
    else { st.status = 'not_qualified'; failed.push(p.personId); }
  }
  return failed.sort((a, b) => a - b);
}

/**
 * The staff's academic read (T4.5.3): from the transcript when the school or family shared it, else the
 * high school coach's word (biased toward his own player), else unknown.
 */
export function readAcademics(state: RecruitingState, ctx: RecruitingContext, teamId: number, prospectId: number, day: number, source: 'transcript' | 'hs_coach_says'): AcademicWord {
  const p = state.prospects[prospectId];
  if (!p) return 'unknown';
  const rules = ctx.rulesOn(day);
  const gpaNeed = num(rules, KEY.coreGpa);
  let gpa = p.academics.coreGpa;
  if (source === 'hs_coach_says') gpa += P('academic.hsCoachBias') + P('academic.hsCoachNoise') * ctx.rng(['acad_read', teamId, prospectId, day]).normal();
  const margin = gpaNeed === undefined ? P('academic.onTrackMargin') : gpa - gpaNeed;
  const word: AcademicWord = margin >= P('academic.onTrackMargin') ? 'on_track' : margin >= 0 ? 'needs_strong_final_year' : 'long_shot';
  boardOf(state, teamId).academics[prospectId] = { word, basis: source, day };
  return word;
}

/** The academic fraud act (T4.5.3 rules, T9.5.1 row): available, warns, raises the grades, writes one row. */
export function academicFraud(state: RecruitingState, ctx: RecruitingContext, hook: ComplianceHook, teamId: number, staffId: number, prospectId: number, day: number): number | null {
  const p = state.prospects[prospectId];
  if (!p) return null;
  p.academics.coreGpa = clamp(p.academics.coreGpa + P('academic.fraudBoost'), P('academic.gpaFloor'), P('academic.gpaCeiling'));
  return logBreaches(state, ctx, hook, [breach('academic_fraud')], { staffId, teamId, prospectId, day, knew: [prospectId], gain: P('academic.fraudGain') });
}

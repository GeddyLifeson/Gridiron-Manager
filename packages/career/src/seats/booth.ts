// S5.3 booth roles. S5.3.1 booth eyes: name the opponent's look from a pad of the staff's terms, graded against
// the truth record by family and variant (partial credit by family tree, S3.3.1) and by time; pre-snap reports are
// graded against the shown shell, post-snap against what was played, so disguise works on him. Against tempo
// only the family is asked. S5.3.2 charting: a row per snap, the personnel relay, and departure flags graded with
// a binomial test. There is one booth view for everyone; nothing here names or hints at the answer (index rule 9).
import { tagCredit, fieldScore, type AnswerRow, type FieldRow } from '../ladder/grading.ts';
import { chance, clamp, lerp, normal, type Draw } from '../gameday/math.ts';
import { sp } from './params.ts';

// ---------- S5.3.1 booth eyes ----------

/** A look as a path in the staff's terms: `family/variant`, e.g. `cover3/buzz` or `bear/fire_zone`. */
export type Look = string;

export interface LookTruth { readonly playId: number; readonly shown: Look; readonly played: Look; readonly snapS: number }

export interface BoothAnswer { readonly playId: number; readonly phase: 'pre' | 'post'; readonly look: Look | null; readonly atS: number | null }

export interface BoothGrade {
  readonly playId: number;
  readonly phase: 'pre' | 'post';
  readonly truth: Look;
  readonly answer: Look | null;
  /** 0 to 1 by family tree; family only against tempo. */
  readonly credit: number;
  readonly familyRight: boolean;
  /** Seconds from the snap (post) to the answer; null when no answer. */
  readonly seconds: number | null;
  /** Inside the window, so the caller gets it in time for the next call. */
  readonly delivered: boolean;
  readonly windowS: number;
}

const family = (l: Look): string => l.split('/')[0] ?? l;

export const answerWindowS = (tempo: boolean): number => sp(tempo ? 'booth.tempoWindowS' : 'booth.answerWindowS');

export function gradeBooth(t: LookTruth, a: BoothAnswer, tempo: boolean): BoothGrade {
  const truth = a.phase === 'pre' ? t.shown : t.played;
  const windowS = answerWindowS(tempo);
  const seconds = a.atS === null || a.look === null ? null : Math.max(0, a.atS - t.snapS);
  const familyRight = a.look !== null && family(a.look) === family(truth);
  const credit = a.look === null ? 0 : tempo ? (familyRight ? 1 : 0) : tagCredit(truth, a.look);
  const delivered = seconds !== null && (a.phase === 'pre' ? a.atS! <= t.snapS : seconds <= windowS);
  return { playId: t.playId, phase: a.phase, truth, answer: a.look, credit, familyRight, seconds, delivered, windowS };
}

/** An AI booth coach's report from his hidden K2 recognition (0 to 1): family, then variant, then a delay. */
export function aiBoothAnswer(t: LookTruth, recognition: number, pad: readonly Look[], tempo: boolean, draw: Draw): BoothAnswer {
  const r = clamp(recognition, 0, 1);
  const fam = family(t.played);
  const famRight = chance(lerp(sp('booth.aiFamilyAtZero'), sp('booth.aiFamilyAtFull'), r), draw);
  const famPool = pad.filter((l) => famRight ? family(l) === fam : family(l) !== fam);
  let look: Look | null = famPool.length ? famPool[Math.floor(draw() * famPool.length)]! : null;
  if (famRight && !tempo && chance(lerp(sp('booth.aiVariantAtZero'), sp('booth.aiVariantAtFull'), r), draw)) look = t.played;
  if (tempo && look !== null) look = family(look);
  const mean = lerp(sp('booth.aiDelayAtZeroS'), sp('booth.aiDelayAtFullS'), r);
  const delay = Math.max(0.3, mean + 0.5 * normal(draw));
  return { playId: t.playId, phase: 'post', look, atS: t.snapS + delay };
}

/** Running accuracy of one booth source in this game, with a prior so a single miss does not zero it. */
export function runningAccuracy(grades: readonly BoothGrade[]): number {
  const n = sp('booth.priorReports');
  const hits = grades.reduce((s, g) => s + g.credit, 0);
  return (hits + n * sp('booth.priorAccuracy')) / (grades.length + n);
}

/** How much the caller leans on the booth: trust in the reporter (S4.2, 0 to 1) times his running accuracy. */
export const reportWeight = (trust: number, grades: readonly BoothGrade[]): number => clamp(trust, 0, 1) * runningAccuracy(grades);

/**
 * What the caller believes the opponent played (fed to K4 beliefs, or shown to a human head coach). With a
 * delivered report he takes it with the report weight; otherwise his own sideline view, which is worse for
 * coverage. `pad` gives the wrong looks his own view can land on.
 */
export function callerReading(t: LookTruth, report: BoothGrade | null, weight: number, pad: readonly Look[], draw: Draw): { look: Look; source: 'booth' | 'sideline' } {
  if (report && report.delivered && report.answer !== null && chance(weight, draw)) return { look: report.answer, source: 'booth' };
  const fam = family(t.played);
  if (chance(sp('booth.sidelineFamily'), draw)) {
    if (chance(sp('booth.sidelineVariant'), draw)) return { look: t.played, source: 'sideline' };
    const same = pad.filter((l) => family(l) === fam && l !== t.played);
    return { look: same.length ? same[Math.floor(draw() * same.length)]! : fam, source: 'sideline' };
  }
  const other = pad.filter((l) => family(l) !== fam);
  return { look: other.length ? other[Math.floor(draw() * other.length)]! : fam, source: 'sideline' };
}

// ---------- S5.3.2 charting ----------

/** Chart row fields per snap (S5.3.2 depth pass). */
export const CHART_FIELDS = ['down', 'distance', 'zone', 'personnel', 'formation', 'call'] as const;

/** Chart accuracy, 0 to 100, against the truth rows (truth-graded; S3.3.1 field scoring). */
export function chartAccuracy(truth: readonly FieldRow[], rows: readonly AnswerRow[]): number {
  return fieldScore(truth, rows);
}

/** The personnel relay: right grouping and on the channel before the play call goes in. */
export function gradeRelay(truthPersonnel: string, sent: string | null, arrivesS: number | null, callInS: number): { right: boolean; inTime: boolean; score: number } {
  const right = sent === truthPersonnel;
  const inTime = arrivesS !== null && arrivesS <= callInS;
  return { right, inTime, score: right && inTime ? 1 : 0 };
}

export type FlagVerdict = 'too_early' | 'real' | 'not_real';

/**
 * A departure flag (S5.3.2 depth pass): with at least `flag.minSnaps` snaps of the situation seen today, it is real
 * when the observed count differs from the report's prediction by at least `flag.sd` binomial standard deviations.
 * Compared in squares, so no root is needed (P1.1.1). A report rate of 0 or 1 has no spread: any difference is real.
 */
export function gradeFlag(snapsSeen: number, observed: number, reportRate: number): FlagVerdict {
  if (snapsSeen < sp('flag.minSnaps')) return 'too_early';
  const p = clamp(reportRate, 0, 1);
  const diff = observed - snapsSeen * p;
  const varr = snapsSeen * p * (1 - p);
  const k = sp('flag.sd');
  if (varr === 0) return diff !== 0 ? 'real' : 'not_real';
  return diff * diff >= k * k * varr ? 'real' : 'not_real';
}

/** The in-game tendency table for I8: share of each call by situation key, from the chart as filled (errors and all). */
export function tendencyTable(rows: readonly { situation: string; call: string | null }[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};
  for (const r of rows) {
    if (r.call === null) continue;
    const s = (out[r.situation] ??= {});
    s[r.call] = (s[r.call] ?? 0) + 1;
    totals[r.situation] = (totals[r.situation] ?? 0) + 1;
  }
  for (const [sit, calls] of Object.entries(out)) for (const c of Object.keys(calls)) calls[c] = calls[c]! / totals[sit]!;
  return out;
}

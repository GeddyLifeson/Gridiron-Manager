// The Q5 report: all four studies, the deferral state, and the evidence level, in one deterministic
// text (fixed order, fixed number format, no clock), so the same inputs always print the same bytes.
import { studyStatuses, DEFERRAL_RULING, type StudyStatus } from './status.ts';
import { scoreLevel, checkSheet, fmtPct, type FilmAnswer, type ReasonJudgement, type AnswerLists, type FilmLevelResult } from './blind-film.ts';
import type { ClipTruth, Level } from './clips.ts';
import { sliceGate, fileReviewStatus, checkFinding, findingLabel, type Finding, type Response, type OwnerAction, type Reviewer, type ReviewRound, type SliceGate } from './football-review.ts';
import { separation, type Participant, type SeparationReport } from './skill-separation.ts';
import { checkForms, learningGain, type Question, type FormContext, type LearningParticipant, type LearningResult } from './learning-test.ts';
import { evidenceLevel, WORDING, RECORD_NAME_LEVEL0, type EvidenceLevel } from './claims.ts';
import { param } from './params.ts';

export interface ValidationInputs {
  readonly coachReviewersAvailable: boolean;
  readonly film: { readonly clips: readonly ClipTruth[]; readonly answers: readonly FilmAnswer[]; readonly judgements: readonly ReasonJudgement[]; readonly lists: AnswerLists };
  readonly review: {
    readonly reviewers: readonly Reviewer[]; readonly findings: readonly Finding[]; readonly responses: readonly Response[];
    readonly actions: ReadonlyMap<string, OwnerAction>; readonly rounds: readonly ReviewRound[];
    /** Every written F and G4 file (Q5.1.1 acceptance). */
    readonly files: readonly string[];
  };
  readonly participants: readonly Participant[];
  readonly learning: { readonly questions: readonly Question[]; readonly ctx: FormContext; readonly participants: readonly LearningParticipant[]; readonly coachReviewed: boolean };
  readonly earned: EvidenceLevel;
}

export interface ValidationReport {
  readonly statuses: readonly StudyStatus[];
  readonly review: { readonly gates: readonly SliceGate[]; readonly files: readonly { readonly file: string; readonly status: 'reviewed' | 'not reviewed' }[]; readonly problems: readonly string[]; readonly labels: readonly { readonly id: string; readonly label: string }[] };
  readonly film: { readonly levels: readonly FilmLevelResult[]; readonly problems: readonly string[] };
  readonly separation: SeparationReport;
  readonly learning: { readonly forms: readonly string[]; readonly result: LearningResult };
  readonly level: EvidenceLevel;
  readonly wording: string;
  readonly releaseNotes: readonly string[];
}

const LEVELS: readonly Level[] = ['pro', 'college'];

export function buildValidationReport(i: ValidationInputs): ValidationReport {
  const statuses = studyStatuses(i.coachReviewersAvailable);
  const rv = new Map(i.review.reviewers.map((r) => [r.id, r]));
  const slices = [...new Set(i.review.findings.map((f) => f.slice))].sort();
  const gates = slices.map((s) => sliceGate(s, i.review.findings, i.review.responses, i.review.actions, rv));
  const files = [...i.review.files].sort().map((f) => ({ file: f, status: fileReviewStatus(f, i.review.rounds, rv) }));
  const reviewProblems = i.review.findings.flatMap((f) => checkFinding(f, rv));
  const labels = [...i.review.findings].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((f) => ({ id: f.id, label: findingLabel(f, rv) }));
  const levels = LEVELS.filter((l) => i.film.clips.some((c) => c.level === l)).map((l) => scoreLevel(l, i.film.clips, i.film.answers, i.film.judgements));
  const filmProblems = checkSheet(i.film.answers, i.film.clips, i.film.lists, i.film.judgements);
  const sep = separation(i.participants, param('validation.separation.minPerGroup'));
  const forms = checkForms(i.learning.questions, i.learning.ctx);
  const result = learningGain(i.learning.participants, param('validation.learning.hours'), i.learning.coachReviewed);
  const coach = i.coachReviewersAvailable;
  const level = evidenceLevel({
    footballReviewComplete: coach && files.length > 0 && files.every((f) => f.status === 'reviewed'),
    blindFilmPassed: coach && LEVELS.every((l) => levels.find((x) => x.level === l)?.verdict === 'pass'),
    orderingShown: coach && sep.orderingShown,
    learningGainShown: forms.length === 0 && result.problems.length === 0 && (result.gainOverControl ?? 0) > 0,
    earned: i.earned,
  });
  return {
    statuses, review: { gates, files, problems: reviewProblems, labels }, film: { levels, problems: filmProblems }, separation: sep,
    learning: { forms, result }, level, wording: WORDING[level], releaseNotes: statuses.map((s) => s.releaseNote).filter((n) => n.length > 0),
  };
}

const n3 = (x: number | null) => (x === null ? 'n/a' : (Math.round(x * 1000) / 1000).toFixed(3));

export function formatValidationReport(r: ValidationReport): string {
  const L: string[] = [];
  L.push('# Coach validation report (Q5)', '');
  L.push(`Evidence level: ${r.level}`, `Allowed wording: "${r.wording}"`);
  if (r.level === 0) L.push(`The coaching record is "${RECORD_NAME_LEVEL0}".`);
  L.push('', '## Study status');
  if (r.statuses.some((s) => s.state !== 'active')) L.push(DEFERRAL_RULING);
  for (const s of r.statuses) L.push(`- ${s.leaf} ${s.study}: ${s.state}${s.state === 'active' ? '' : `; stand-in: ${s.standIn}`}`);
  L.push('', '## Football review (Q5.1.1)');
  for (const f of r.review.files) L.push(`- ${f.file}: ${f.status}`);
  for (const g of r.review.gates) L.push(`- slice ${g.slice}: ${g.blocked ? `BLOCKED by ${g.blocking.join(', ')}` : 'open'}; coach reviewers ${g.coachReviewers}; staff findings ${g.staffFindings}${g.treeDifferences.length ? `; tree differences ${g.treeDifferences.join(', ')}` : ''}`);
  for (const l of r.review.labels) L.push(`- finding ${l.id}: ${l.label}`);
  for (const p of r.review.problems) L.push(`- problem: ${p}`);
  L.push('', '## Blind film test (Q5.2.1)');
  if (r.film.levels.length === 0) L.push('- no clips');
  for (const lv of r.film.levels) {
    L.push(`- ${lv.level}: ${lv.verdict.toUpperCase()}; ${lv.clips} clips, ${lv.reviewers.length} reviewers`);
    L.push(`  coverage ${fmtPct(lv.pooled.coverage.rate)} (${lv.pooled.coverage.hit}/${lv.pooled.coverage.of}, mark ${fmtPct(lv.marks.coverage)}); concept ${fmtPct(lv.pooled.concept.rate)} (${lv.pooled.concept.hit}/${lv.pooled.concept.of}, mark ${fmtPct(lv.marks.concept)}); reason ${fmtPct(lv.pooled.reason.rate)} (${lv.pooled.reason.hit}/${lv.pooled.reason.of}, mark ${fmtPct(lv.marks.reason)}). Marks are Assumptions.`);
    for (const rv of lv.reviewers) L.push(`  ${rv.reviewerId}: coverage ${fmtPct(rv.coverage.rate)}, concept ${fmtPct(rv.concept.rate)}, reason ${fmtPct(rv.reason.rate)}, cannot tell ${rv.cannotTell}, confidence ${n3(rv.meanConfidence)}`);
    for (const nt of lv.notes) L.push(`  note: ${nt}`);
    for (const m of lv.misread) L.push(`  misread ${m.clipId} ${m.question}: ${m.wrong}/${m.of} wrong; ${m.study}`);
  }
  for (const p of r.film.problems) L.push(`- problem: ${p}`);
  L.push('', '## Skill separation (Q5.3.1)');
  const s = r.separation;
  L.push(`- participants ${s.participants}; coach group ${s.coachGroupRun ? 'run' : 'not run'}; ordering ${s.orderingShown ? 'shown' : 'not shown'}${s.undersized.length ? `; under the starting sample: ${s.undersized.join(', ')}` : ''}`);
  if (!s.coachGroupRun) L.push('- Fans against newcomers only: supports no claim above evidence level 0.');
  for (const o of s.orderings) {
    L.push(`- ${o.measure}: ${o.groups.map((g) => `${g.group} n=${g.n} mean ${n3(g.mean)} adjusted ${n3(g.adjusted)}`).join('; ')}`);
    for (const p of o.pairs) L.push(`  ${p.higher} above ${p.lower}: raw ${p.heldRaw ? 'held' : 'did not hold'}, interface-adjusted ${p.heldAdjusted === null ? 'n/a' : p.heldAdjusted ? 'held' : 'did not hold'}`);
  }
  for (const p of s.problems) L.push(`- problem: ${p}`);
  L.push('', '## Learning test (Q5.4.1)');
  const lr = r.learning.result;
  L.push(`- ${lr.label}`, `- forms: ${r.learning.forms.length ? 'NOT READY' : 'ready'}`);
  for (const p of r.learning.forms) L.push(`  ${p}`);
  L.push(`- play n=${lr.playN} gain ${n3(lr.playGain)}; control n=${lr.controlN} gain ${n3(lr.controlGain)}; over control ${n3(lr.gainOverControl)}; without outside study ${n3(lr.gainOverControlNoOutsideStudy)}`);
  L.push('- A gain supports the learning claim for knowledge. It does not show coaching ability.');
  for (const p of lr.problems) L.push(`- problem: ${p}`);
  L.push('', '## Release notes must say');
  if (r.releaseNotes.length === 0) L.push('- nothing extra');
  for (const n of r.releaseNotes) L.push(`- ${n}`);
  return L.join('\n') + '\n';
}

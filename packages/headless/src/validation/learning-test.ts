// Q5.4.1 Learning test: the two test forms and their checks, and the gain over the control group.
// While the coach review of the forms is deferred, every question must trace to a rule-book section
// or a fact-register row (Q6), and every result says "test not reviewed by a coach".

export type Topic = 'formations_personnel' | 'coverage' | 'protection' | 'down_distance_clock' | 'rules';
/** The five areas the test covers (Q5.4.1 rules). */
export const TOPICS: readonly Topic[] = ['formations_personnel', 'coverage', 'protection', 'down_distance_clock', 'rules'];

export type Trace =
  | { readonly kind: 'rule'; readonly ruleBook: string; readonly section: string }
  | { readonly kind: 'fact'; readonly factId: string };

export interface Question {
  readonly id: string;
  readonly form: 'A' | 'B';
  readonly topic: Topic;
  readonly text: string;
  readonly trace: Trace | null;
}

export interface FormContext {
  /** Fact-register ids that exist (facts/*.json). */
  readonly factIds: ReadonlySet<string>;
  /** Rule books a trace may cite, by id (for example the shipped rule-set files' sources). */
  readonly ruleBooks: ReadonlySet<string>;
  /** Terms that exist only in this game (no game-specific terms on the test, Q5.4.1 Inputs). Lower case. */
  readonly gameOnlyTerms: readonly string[];
}

/** Q5.4.1 acceptance: both forms exist, every question traces, and the forms are equivalent (same count per topic, all five topics). */
export function checkForms(qs: readonly Question[], ctx: FormContext): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const q of qs) {
    if (ids.has(q.id)) out.push(`${q.id}: listed twice`);
    ids.add(q.id);
    if (!q.text.trim()) out.push(`${q.id}: no question text`);
    if (q.trace === null) out.push(`${q.id}: does not trace to a rule-book section or a fact-register row`);
    else if (q.trace.kind === 'fact' && !ctx.factIds.has(q.trace.factId)) out.push(`${q.id}: fact row ${q.trace.factId} does not exist`);
    else if (q.trace.kind === 'rule' && (!ctx.ruleBooks.has(q.trace.ruleBook) || !q.trace.section.trim())) out.push(`${q.id}: rule trace ${q.trace.ruleBook} ${q.trace.section} is not a known rule book and section`);
    const lower = q.text.toLowerCase();
    for (const t of ctx.gameOnlyTerms) if (t && lower.includes(t)) out.push(`${q.id}: uses the game-only term "${t}"`);
  }
  for (const form of ['A', 'B'] as const) if (!qs.some((q) => q.form === form)) out.push(`form ${form} does not exist`);
  for (const t of TOPICS) {
    const a = qs.filter((q) => q.form === 'A' && q.topic === t).length;
    const b = qs.filter((q) => q.form === 'B' && q.topic === t).length;
    if (a === 0 || b === 0) out.push(`topic ${t} missing from form ${a === 0 ? 'A' : 'B'}`);
    else if (a !== b) out.push(`topic ${t}: form A has ${a} questions, form B has ${b}`);
  }
  return out;
}

export interface LearningParticipant {
  readonly id: string;
  readonly arm: 'play' | 'control';
  /** Share correct, 0 to 1. */
  readonly formA: number;
  readonly formB: number;
  /** Hours through the teaching track and regular play between the forms (0 for control). */
  readonly hours: number;
  /** Edge case: the form asks whether they studied outside the game. */
  readonly studiedOutside: boolean;
}

export interface LearningResult {
  readonly playN: number;
  readonly controlN: number;
  readonly playGain: number | null;
  readonly controlGain: number | null;
  /** Play gain minus control gain. Positive supports the learning claim for knowledge, not coaching ability. */
  readonly gainOverControl: number | null;
  /** The same with those who studied outside the game left out. */
  readonly gainOverControlNoOutsideStudy: number | null;
  readonly problems: readonly string[];
  readonly label: string;
}

const meanGain = (ps: readonly LearningParticipant[]) => (ps.length ? ps.reduce((s, p) => s + (p.formB - p.formA), 0) / ps.length : null);
const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

export function learningGain(ps: readonly LearningParticipant[], hours: number, coachReviewed: boolean): LearningResult {
  const problems: string[] = [];
  for (const p of ps) {
    if (p.formA < 0 || p.formA > 1 || p.formB < 0 || p.formB > 1) problems.push(`${p.id}: scores must be shares 0 to 1`);
    if (p.arm === 'control' && p.hours !== 0) problems.push(`${p.id}: control group plays nothing between forms`);
    if (p.arm === 'play' && p.hours < hours) problems.push(`${p.id}: ${p.hours} h played, the study sets ${hours} h`);
  }
  const play = ps.filter((p) => p.arm === 'play');
  const ctrl = ps.filter((p) => p.arm === 'control');
  const pg = meanGain(play); const cg = meanGain(ctrl);
  return {
    playN: play.length, controlN: ctrl.length, playGain: pg, controlGain: cg, gainOverControl: diff(pg, cg),
    gainOverControlNoOutsideStudy: diff(meanGain(play.filter((p) => !p.studiedOutside)), meanGain(ctrl.filter((p) => !p.studiedOutside))),
    problems, label: coachReviewed ? 'test reviewed by a coach' : 'test not reviewed by a coach',
  };
}

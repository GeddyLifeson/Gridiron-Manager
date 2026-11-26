// Q5.1.1 Football review: the findings form, the slice gate, and the review status of each content file.
// Also carries Q5.6.1 rule 2b: while no coach reviewer exists, project staff may file film comparisons
// on the same form, and every one is labelled "project staff, not a coach" and counts for no status.

export type Severity = 'wrong' | 'missing' | 'unusual_but_defensible';
export type ReviewerKind = 'coach' | 'project_staff';

/** Label the form prints for a stand-in finding (Q5.6.1 rule 2b). */
export const STAFF_LABEL = 'project staff, not a coach';

export interface Reviewer {
  readonly id: string;
  readonly kind: ReviewerKind;
  /** Background (level coached, side of the ball, years) lives outside the repo (Q5.6.1 Outputs). Only the
   * coaching tree is kept here, so two reviewers' disagreement can be recorded as a tree difference. */
  readonly tree: string | null;
}

export interface Finding {
  readonly id: string;
  readonly reviewerId: string;
  /** Content slice of the round, for example "pass_protection" (Q5.1.1 rules). */
  readonly slice: string;
  /** Area letter and leaf ID (Q5.1.1 Outputs). */
  readonly area: string;
  readonly leafId: string;
  readonly whatIsWrong: string;
  readonly coachWouldExpect: string;
  readonly severity: Severity;
  /** Edge case: "would another good staff do this differently?" Must be answered. */
  readonly anotherStaffWouldDiffer: boolean | null;
  /** Clip ids the finding cites, if any. */
  readonly clips: readonly string[];
  /** Q5.1.1 AI use: a finding about an AI coach's plan or adjustment no real staff would make. */
  readonly aboutAiCoach: boolean;
}

/** A second reviewer's answer to a finding. */
export interface Response {
  readonly findingId: string;
  readonly reviewerId: string;
  readonly stance: 'agree' | 'dispute';
}

export type OwnerAction = 'accepted' | 'fixed' | 'disputed' | 'open';

export function checkFinding(f: Finding, reviewers: ReadonlyMap<string, Reviewer>): string[] {
  const out: string[] = [];
  if (!reviewers.has(f.reviewerId)) out.push(`${f.id}: unknown reviewer`);
  if (!/^[A-Z]\d+(\.\d+)*$/.test(f.leafId)) out.push(`${f.id}: leaf id "${f.leafId}" is not a bible leaf id`);
  if (f.area.length === 0 || f.leafId[0] !== f.area[0]) out.push(`${f.id}: area must match the leaf's letter`);
  if (!f.whatIsWrong.trim()) out.push(`${f.id}: "what is wrong" is empty`);
  if (!f.coachWouldExpect.trim()) out.push(`${f.id}: "what a coach would expect" is empty`);
  if (f.anotherStaffWouldDiffer === null) out.push(`${f.id}: "would another good staff do this differently?" is unanswered`);
  return out;
}

/** The label a finding carries in every report: who filed it. */
export function findingLabel(f: Finding, reviewers: ReadonlyMap<string, Reviewer>): string {
  return reviewers.get(f.reviewerId)?.kind === 'coach' ? 'coach' : STAFF_LABEL;
}

export interface SliceGate {
  readonly slice: string;
  readonly blocked: boolean;
  /** Findings of severity "wrong", filed by a coach, not fixed, and not disputed by a second coach. */
  readonly blocking: readonly string[];
  /** Findings two coaches disagree on: recorded as a known difference between coaching trees. */
  readonly treeDifferences: readonly string[];
  /** Coach reviewers who filed or answered in this slice. */
  readonly coachReviewers: number;
  readonly staffFindings: number;
}

/**
 * Q5.1.1 rules: a "wrong" finding blocks the slice's gate until fixed or until a second reviewer
 * disputes it. Only coach findings and coach disputes count: a staff finding is filed and shown but
 * moves no gate, because no gate may depend on a coach review while the studies are deferred (Q5.6.1
 * acceptance) and staff findings are not coach reviews.
 */
export function sliceGate(slice: string, findings: readonly Finding[], responses: readonly Response[], actions: ReadonlyMap<string, OwnerAction>, reviewers: ReadonlyMap<string, Reviewer>): SliceGate {
  const isCoach = (id: string) => reviewers.get(id)?.kind === 'coach';
  const mine = findings.filter((f) => f.slice === slice);
  const blocking: string[] = [];
  const tree: string[] = [];
  const coaches = new Set<string>();
  let staff = 0;
  for (const f of mine) {
    if (!isCoach(f.reviewerId)) { staff++; continue; }
    coaches.add(f.reviewerId);
    const disputes = responses.filter((r) => r.findingId === f.id && r.reviewerId !== f.reviewerId && isCoach(r.reviewerId) && r.stance === 'dispute');
    for (const r of responses) if (r.findingId === f.id && isCoach(r.reviewerId)) coaches.add(r.reviewerId);
    if (disputes.length > 0) tree.push(f.id);
    const action = actions.get(f.id) ?? 'open';
    if (f.severity === 'wrong' && action !== 'fixed' && disputes.length === 0) blocking.push(f.id);
  }
  return { slice, blocked: blocking.length > 0, blocking: blocking.sort(), treeDifferences: tree.sort(), coachReviewers: coaches.size, staffFindings: staff };
}

/** A completed review round of one content file (F or G4) by coach reviewers. */
export interface ReviewRound {
  readonly file: string;
  readonly slice: string;
  readonly reviewerIds: readonly string[];
  readonly completed: boolean;
}

/**
 * Q5.1.1 acceptance: a file is "reviewed" once one completed round had at least one coach reviewer;
 * otherwise "not reviewed". Q6.1.2: a convention confirmed by two coaches from different trees earns
 * "Reviewed (2 coaches)", which is not Verified.
 */
export function fileReviewStatus(file: string, rounds: readonly ReviewRound[], reviewers: ReadonlyMap<string, Reviewer>): 'reviewed' | 'not reviewed' {
  const ok = rounds.some((r) => r.file === file && r.completed && r.reviewerIds.some((id) => reviewers.get(id)?.kind === 'coach'));
  return ok ? 'reviewed' : 'not reviewed';
}

export function conventionStatus(confirmedBy: readonly string[], reviewers: ReadonlyMap<string, Reviewer>): 'Reviewed (2 coaches)' | 'not reviewed' {
  const trees = new Set<string>();
  for (const id of new Set(confirmedBy)) {
    const r = reviewers.get(id);
    if (r?.kind === 'coach' && r.tree) trees.add(r.tree);
  }
  return trees.size >= 2 ? 'Reviewed (2 coaches)' : 'not reviewed';
}

// Shared types for the release gate (G-100, R1.2.10).
// A check is never PASS unless something verified it at the commit under test (Q1.8.1, masterclaude rule 10).

/** PASS: verified at this commit. FAIL: ran and failed. MISSING: the module, input or tool does not exist yet.
 *  PENDING: exists, but no evidence at this commit. STALE: evidence is from another commit.
 *  NOT_APPLICABLE: out of scope for this release, with the reason given. */
export type CheckStatus = 'PASS' | 'FAIL' | 'MISSING' | 'PENDING' | 'STALE' | 'NOT_APPLICABLE';

export type CheckKind = 'automated' | 'tracked';

export type CheckGroup =
  | 'release-gate'      // R1.2.10 items 1 to 6
  | 'release-suites'    // Q1.8.1 "Before a release" row, per platform
  | 'phase-gates'       // R1.2.1 to R1.2.9 gate items (earlier gates must still hold)
  | 'engine-plan'       // plans/engine-build-plan.md WP acceptance
  | 'game-plan'         // plans/game-build-plan.md G acceptance
  | 'bible';            // every v1 bible leaf's acceptance criteria

export interface Check {
  id: string;
  group: CheckGroup;
  kind: CheckKind;
  title: string;
  /** Bible leaf, plan row or gate item the check comes from. */
  source: string;
  /** The criterion text, as written in its source. */
  criterion: string;
  /** Work package that owns the work, when known (G-xx or WP-xx). */
  owner?: string;
  /** Blocks the release when not PASS. Every in-scope check blocks; NOT_APPLICABLE does not. */
  blocking: boolean;
}

export interface CheckResult extends Check {
  status: CheckStatus;
  detail: string;
}

export interface EvidenceRecord {
  check: string;
  result: 'pass' | 'fail';
  /** Commit the evidence was taken at (short or long hash). */
  commit: string;
  date: string;
  /** Three independent confirmations (masterclaude rule 10): e.g. the test, a direct measurement, the output as the user sees it. */
  confirmations: string[];
  by: string;
  notes?: string;
}

export interface GateContext {
  root: string;
  commit: string;
  /** Uncommitted changes under the source folders: evidence cannot be tied to the commit. */
  dirty: boolean;
}

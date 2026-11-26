// Certified conditions (N4.3.1, P8.1.1, P7.4.1): what a certified career may hold, what breaks it, and
// which games are voided. Certified mode is tamper-proofing only: the play clock always runs for every
// user and the game has one difficulty, so there is no pacing or difficulty rule to pin (N4.3.1 rules 1, 2).
import type { ParamFile } from '@gm/schema';

/** Version of the certified ruleset (N4.3.1 inputs). Printed on every exported record. */
export const CERTIFIED_RULESET_VERSION = 'certified.g95.1';

/** N4.3.1 edge case: more than a starting two resumes in one game voids it. */
export const MAX_RESUMES_PER_GAME = 2;

export const PARAMS: ParamFile = {
  module: 'store.certified',
  version: 'g95.1',
  params: [{
    name: 'store.certified.maxResumesPerGame', value: MAX_RESUMES_PER_GAME, min: 0, max: 20, unit: 'count', belongsTo: 'store.certified',
    basis: 'bible', leaf: 'N4.3.1', constrainedBy: 'N4.3.1 acceptance: every voiding condition has a test', status: 'starting',
  }],
};

/**
 * Switches for questions waiting on Marlon (game-build-plan: "G-95 and G-100 build switches for these,
 * off until he decides").
 */
export interface CertifiedSwitches {
  /** P7.4.1: at most one locked people pack in a certified career (coordinator decision, unconfirmed). Off: none allowed. */
  readonly allowPeoplePack: boolean;
}
export const DEFAULT_CERTIFIED_SWITCHES: CertifiedSwitches = { allowPeoplePack: false };

/** Why certification ended (P8.1.1 `certifiedBrokenReason`). The text key is `certified.broken.<reason>`. */
export type BreakReason =
  | 'unsigned_content'        // a pack that is not signed official content (P7.4.1)
  | 'core_override'           // an override of a core item (P7.4.1)
  | 'rule_set_override'       // a rule-set or core override (P8.1.1)
  | 'people_pack_not_allowed' // a people pack while the switch is off, or a second pack (P7.4.1)
  | 'people_pack_edited'      // an edit, re-import or re-estimate of an imported person (P7.4.1)
  | 'truth_build_opened'      // opened by the developer or coaching-school truth build (K9.1 rule 5)
  | 'decision_chain_failed'   // the decision log chain did not verify at load (P5.3.2, N3.5.1)
  | 'older_copy'              // a file whose session counter is behind the local index (P8.1.2)
  | 'copy_saved'              // "Save a copy" makes the copy uncertified (P8.1.2)
  | 'unpublished_seed';       // a certified season without the published seed, or a scenario pack not published (N4.3.1 rule 3)

export const BREAK_REASONS: readonly BreakReason[] = [
  'unsigned_content', 'core_override', 'rule_set_override', 'people_pack_not_allowed', 'people_pack_edited',
  'truth_build_opened', 'decision_chain_failed', 'older_copy', 'copy_saved', 'unpublished_seed',
];

export function breakTextKey(reason: BreakReason): string {
  return `certified.broken.${reason}`;
}

/** One content item as the certified check sees it. */
export interface CertifiedContentItem {
  readonly id: string;
  readonly kind: string;
  /** From `packSignatureState` (signatures.ts). */
  readonly signature: 'official' | 'community';
  /** The user's own playbook content created inside this career (P7.4.1: his coaching, allowed). */
  readonly userPlaybook: boolean;
  readonly overridesCore: boolean;
}

export interface CertifiedStart {
  readonly content: readonly CertifiedContentItem[];
  /** People packs the career would start with. */
  readonly peoplePacks: readonly { readonly id: string; readonly hash: string }[];
  readonly ruleSetOverride: boolean;
  /** The published seed or scenario pack id the career starts from (N4.3.1 rule 3); null when not published. */
  readonly publishedSeed: string | null;
}

/** The reasons a career cannot start certified (empty: it can). */
export function startProblems(s: CertifiedStart, switches: CertifiedSwitches = DEFAULT_CERTIFIED_SWITCHES): BreakReason[] {
  const out = new Set<BreakReason>();
  for (const c of s.content) {
    if (c.overridesCore) out.add('core_override');
    if (c.signature !== 'official' && !c.userPlaybook) out.add('unsigned_content');
  }
  if (s.ruleSetOverride) out.add('rule_set_override');
  if (s.peoplePacks.length > (switches.allowPeoplePack ? 1 : 0)) out.add('people_pack_not_allowed');
  if (s.publishedSeed === null) out.add('unpublished_seed');
  return BREAK_REASONS.filter((r) => out.has(r));
}

/** Something that happened in a certified career that may end certification (P8.1.1 list). */
export type CertifiedEvent =
  | { readonly kind: 'content_adopted'; readonly item: CertifiedContentItem }
  | { readonly kind: 'people_pack_added' }
  | { readonly kind: 'imported_person_changed'; readonly personId: number }
  | { readonly kind: 'opened_by_truth_build' }
  | { readonly kind: 'rule_set_override' }
  | { readonly kind: 'copy_saved' }
  /** A new official parameter set or application version: recorded in the chain, never breaking (P8.1.1 edge case). */
  | { readonly kind: 'official_update'; readonly version: string };

/** The reason this event ends certification, or null when it does not. Warn before a deliberate one (P8.1.1). */
export function breakReasonFor(e: CertifiedEvent): BreakReason | null {
  switch (e.kind) {
    case 'content_adopted':
      if (e.item.overridesCore) return 'core_override';
      return e.item.signature === 'official' || e.item.userPlaybook ? null : 'unsigned_content';
    case 'people_pack_added': return 'people_pack_not_allowed';
    case 'imported_person_changed': return 'people_pack_edited';
    case 'opened_by_truth_build': return 'truth_build_opened';
    case 'rule_set_override': return 'rule_set_override';
    case 'copy_saved': return 'copy_saved';
    case 'official_update': return null;
  }
}

/** Why a single game is voided for certification while the career stays certified (N4.3.1 rule 4, edge case). */
export type VoidReason = 'reload' | 'too_many_resumes';

/**
 * Per-game voiding (N4.3.1): a reload to undo voids the affected game (the reload itself is a decision-log
 * entry, N3.5.1); a crash resume from the last dead-ball snapshot is allowed up to the limit.
 */
export class GameVoids {
  private readonly resumes = new Map<number, number>();
  private readonly voided = new Map<number, VoidReason>();

  resume(gameId: number): VoidReason | null {
    const n = (this.resumes.get(gameId) ?? 0) + 1;
    this.resumes.set(gameId, n);
    if (n > MAX_RESUMES_PER_GAME && !this.voided.has(gameId)) this.voided.set(gameId, 'too_many_resumes');
    return this.voided.get(gameId) ?? null;
  }

  reload(gameId: number): VoidReason {
    if (!this.voided.has(gameId)) this.voided.set(gameId, 'reload');
    return this.voided.get(gameId)!;
  }

  status(gameId: number): VoidReason | null {
    return this.voided.get(gameId) ?? null;
  }

  voidedGames(): { gameId: number; reason: VoidReason }[] {
    return [...this.voided.entries()].sort((a, b) => a[0] - b[0]).map(([gameId, reason]) => ({ gameId, reason }));
  }
}

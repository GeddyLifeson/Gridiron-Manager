// @gm/football-lang, language module (WP-10): the assignment rule language of J4. The vocabulary
// is a data file; the compiler turns an assignment into closures over the perceived view; the
// validator reports problems and never repairs or refuses an illegal play (J4.6.1, B4.6.1).
import type { Assignment, DeterministicMath, FootballLang, ParamFile, ParamTable, RuleKeyManifest, RuleSet, ValidationFinding } from '@gm/schema';
import { PARAMS as LEGALITY_PARAMS, checkAlignment, paramTableOf, type AlignedPlayer, type AlignmentBounds } from '../legality/index.ts';
import { compileAssignment, type Compiled } from './compile.ts';
import { PARAMS } from './params.ts';
import { alignmentOf, validateAssignment, validateAssignments, type PathBounds } from './validate.ts';

export { PARAMS, constsOf, type Consts } from './params.ts';
export {
  VOCABULARY, checkVocabulary, CONDITION_DEFS, ACTION_DEFS, BEHAVIOR_DEFS, UNIVERSAL_EVENTS, isBehavior, isName, namesTrueState,
  type Vocabulary, type ArgSpec, type ConditionDef, type ActionDef, type BehaviorDef, type ActionCall, type UniversalEvent,
} from './vocabulary.ts';
export { CONDITIONS, zoneOf, type Args, type CondFn, type CompileEnv } from './conditions.ts';
export { ACTIONS, INSTANT_ACTIONS, type ActFn } from './actions.ts';
export { F, T, U, compileSelector, isSelector, parseReceiver, type Tri, type Ctx, type Sel, type PerceivedViewExt } from './runtime.ts';
export { compileAssignment, attentionOf, fillArgs, type Compiled, type CompileOptions } from './compile.ts';
export { validateAssignment, validateAssignments, alignmentOf, designBounds, type PathBounds, type ValidateOptions } from './validate.ts';
export { printAssignment, parseAssignment, printCondition, printAction } from './text.ts';
export { bindAssignments, type BindInput, type BindResult } from './bind.ts';

/** Rule keys the language module reads. The legality module lists its own. */
export const RULE_KEYS: RuleKeyManifest = [
  { key: 'substitution.max_players', type: 'number', unit: 'count', meaning: 'Players per team on the field', ownerLeaf: 'B2.3.1', readBy: ['football-lang.lang'] },
];

export const PARAM_FILES: readonly ParamFile[] = [PARAMS, LEGALITY_PARAMS];

export interface FootballLangOptions {
  /** The merged parameter table. Defaults to this package's own starting values. */
  readonly params?: ParamTable;
  readonly math?: DeterministicMath | null;
  /** The active rule set, for the role count and the formation check inside `validateAssignments`. */
  readonly rules?: RuleSet | null;
  /** Play-frame box for "a path outside the field" (see `designBounds`). */
  readonly pathBounds?: PathBounds | null;
  /** Sidelines for the alignment check, play frame. */
  readonly alignmentBounds?: AlignmentBounds | null;
  /** Jersey number of a role, so `validateAssignments` can check the drawn formation (B4.6.1). */
  readonly jerseyOf?: ((role: string) => number) | null;
}

/** The concrete language surface: the contract's three functions plus what the designers need. */
export interface FootballLangImpl extends FootballLang {
  compile(a: Assignment): { compiled: Compiled | null; findings: ValidationFinding[] };
  /** `side: 'offense'` adds the formation check when the options carry rules and jersey numbers. */
  validateAssignments(assignments: readonly Assignment[], context?: { readonly side?: 'offense' | 'defense' }): ValidationFinding[];
  checkAlignment(players: readonly AlignedPlayer[], rules: RuleSet): ValidationFinding[];
}

export function createFootballLang(opts: FootballLangOptions = {}): FootballLangImpl {
  const params = opts.params ?? paramTableOf(PARAM_FILES);
  const validateOpts = { pathBounds: opts.pathBounds ?? null, rules: opts.rules ?? null };
  const alignmentBounds = opts.alignmentBounds ?? null;
  return {
    compile(a) {
      const findings = validateAssignment(a, validateOpts);
      // Errors stop compilation (J4.6.1). Warnings never do: an illegal or odd play still compiles and runs.
      if (findings.some((f) => f.severity === 'error')) return { compiled: null, findings };
      return { compiled: compileAssignment(a, { params, math: opts.math ?? null }), findings };
    },
    validateAssignments(assignments, context) {
      const findings = validateAssignments(assignments, validateOpts);
      const rules = opts.rules ?? null, jerseyOf = opts.jerseyOf ?? null;
      if (context?.side === 'offense' && rules !== null && jerseyOf !== null) {
        findings.push(...checkAlignment(alignmentOf(assignments, jerseyOf), rules, params, alignmentBounds));
      }
      return findings;
    },
    checkAlignment(players, rules) {
      return checkAlignment(players, rules, params, alignmentBounds);
    },
  };
}

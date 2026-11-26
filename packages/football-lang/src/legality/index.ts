// Entry point of the legality validator (WP-10; B4.6.1, G1.5.1, P4.2.2, Q1.1.3).
// The integrator re-exports this file from the package barrel.
export { RULE_KEYS, PARAMS, paramTableOf } from './params.ts';
export {
  analyseAlignment, checkAlignment, isIllegalAsDrawn, FOUL_OF_CODE,
  type AlignedPlayer, type AlignmentBounds, type AlignmentReport, type LegalityFinding, type LineStatus,
} from './formation.ts';
export { checkPreSnapScript, type PreSnapScript, type PreSnapStep, type ScriptedMove } from './sequence.ts';

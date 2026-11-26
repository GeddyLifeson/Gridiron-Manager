// Player designer (G-92; D13.1). An editor on the same person record everything else uses: three entry
// points (archetype, measurables, blank sheet) plus "edit a copy", the generator's own D13.1.2 plausibility
// checks with the sandbox switch, the real-person locks of D13.6.2, and a commit that yields the
// generator's GeneratedPlayer shape so designed players meet the same drift guards (D13.4).
export { PARAMS, param } from './params.ts';
export { ARCHETYPES, archetypeById, archetypesFor, type Archetype } from './archetypes.ts';
export {
  blankSheet, sheetFromRecord, footballAge, isRealPerson, originOf, missingFields, lockedChanges, REQUIRED_SCALARS, REAL_PERSON_LOCKED, EMPTY_TESTS,
  type Sheet, type SheetTests, type EntryPoint, type Side,
} from './sheet.ts';
export {
  currentBody, adultEquivalent, rangeProblems, designerWarnings, derivedPhysical, sheetChangeOfDirection, impliedSplit,
  type RangeProblem, type DesignerWarning,
} from './checks.ts';
export { fromArchetype, fromMeasurables, applyArchetype, type StartRequest, type StartResult, type Measurables } from './entry.ts';
export { staffGrade, primaryAttributes, type StaffGrade } from './grade.ts';
export {
  commitSheet, designerAccess, mayEnterCertifiedCareer, inSharedRankings, DESIGNER_VERSION, STREAM_DESIGN,
  type DesignerWorld, type DesignedPlayer, type DesignerLogEntry, type CommitInput, type Refusal,
} from './commit.ts';
export {
  openDesigner, applyIntent, setField, designerView,
  type DesignerSession, type DesignerEnv, type DesignerIntent, type DesignerView, type ViewField,
} from './session.ts';

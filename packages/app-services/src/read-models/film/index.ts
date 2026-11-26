// G-63 film room services (N1, O2.6, I9.2, I9.4): the film filter bridge, the play database and
// cut-ups, tags and notes, grading and grade scales, breakdown and responsibility, corrections, film
// time and the watch-without-calling rules, and the film read models.
export * from './types.ts';
export * from './views.ts';
export { filmRecord, publicEvents, baseSet, coachingSet, ownAssignments, viewerSide, playIdOf, DEFAULT_VOCAB, type ChartOptions } from './chart.ts';
export { scrubTrajectory, TrajectoryScrubError } from './scrub.ts';
export { loafCandidates, type LoafCandidate, type LoafPattern, type LoafInput } from './loafs.ts';
export {
  staffGradeSheet, userGradeSheet, sheetTotals, snapScore, zeroToFourMark, loafPrompts, gradingEvidence, displayGrade, assignmentWords,
  policyEffects, staffReleaseDay, GRADE_SCALES, type GradeScale, type GradePolicy, type PolicyForm, type PolicyPlayer, type PolicyEffect, type GradingEvidence, type SheetOptions,
} from './grading.ts';
export { breakdown, staffResponsibility, userResponsibility, responsibilityEvidence, playFailed } from './breakdown.ts';
export { FilmLibrary, STANDARD_REELS, breakdownWindow, distanceBand, fieldZone, resultBand, type FilmFilter, type ReelTemplate, type OpponentGame, type DistanceBand, type FieldZone, type ResultBand } from './library.ts';
export { emptyAnnotation, addTag, removeTag, setNote, addDrawing, removeDrawing, fixedTerm, notebookEntry, type NotebookEntry } from './annotations.ts';
export { buildCutUp, reelFromTemplate, sendCutUp, reelConcepts, type Audience } from './cutups.ts';
export { divergenceNote, foldStreaks, isGarbageTime, type ProductionInput, type DivergenceNote } from './production.ts';
export { buildCorrections, topPerUnit, setState, wentRight, minusGradeErrors, workOnLine, type ErrorSnap, type Unit } from './corrections.ts';
export { filmAvailable, filmHours, type FilmKind, type WeekFilmWork, type FilmHours } from './access.ts';
export { SPEEDS_BY_CONTEXT, defaultStopRules, stopBeforeSnap, stopAfterPlay, driveSummary, checkRuleCount, type StopRule, type StripSituation, type PlayAfter, type WatchMode, type SummaryPlay } from './watch.ts';
export { FilmRoom } from './room.ts';
export { recordToWire, recordFromWire, toBase64, fromBase64 } from './wire.ts';
export { filmReadModels, standardReel, type FilmModelSchemas } from './models.ts';
export { PARAMS, param, provisionalParams } from './params.ts';

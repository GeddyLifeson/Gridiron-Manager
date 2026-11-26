// Play designer model (G-90; bible G1, O3.1, O3.7). Pure: the screen and the shared editor core
// (app-services/src/editor) call these. The integrator re-exports this file from the package barrel
// as the namespace `designer`.
export { RULE_KEYS, PROPOSED_RULE_KEYS, PARAMS } from './params.ts';
export type * from './types.ts';
export { splitPersonnel, slotsForPersonnel, isLineSlot, defaultSlot, EMPTY_ASSIGNMENT, LINE_SLOTS, type PersonnelSplit } from './slots.ts';
export { newDraft, applyEdit, mirrorDraft, neg, DesignError, type PlayEdit, type FormationPart } from './edits.ts';
export { toFrame, snapSpots, slotAssignment, toAssignments, toOffenseCall, canonical, contentHash, draftContentHash } from './to-engine.ts';
export { validateDraft, isRefused, isIllegal, ROUTE_BEHAVIORS, type DesignMessage, type MessageLevel, type PreviewLook, type ValidateContext } from './validate.ts';
export { snapAlignment, alignmentReadout, snapPath, recognizeRoute, landmarksOf, sidelines, type HashSpot, type Landmarks, type RouteTemplate } from './snap.ts';
export { publishDraft, changedRoles, type PublishResult } from './publish.ts';

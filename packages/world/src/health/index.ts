// D11 injuries and health bound to the off-screen world: the weekly `health` step over league.medical.
export { MODULE, PARAMS, param } from './params.ts';
export { PLAYER_INJURED, HEALTH_EVENT_TYPES } from './events.ts';
export {
  HEALTH_KEY, STREAM_HEALTH, FALLBACK_RULES, emptyHealth, healthOf, openCaseOf, isOut, injuryHistoryOf, medicalRulesFrom, diagnosisOf, dayOf, healthStep,
  type InjuryHistory, type HealthState, type MedicalRulesFor, type HealthBinding,
} from './binding.ts';
export { injuriesFromTruth, type EnginePlayer } from './from-engine.ts';

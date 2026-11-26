// @gm/app-services, read models of the coach's own screens (O4.6, O7.6.1) and the assignment list (O7.2.1):
// coach.career, coach.job_market, coach.contract, coach.record, coach.finance, coach.life and the Office list.
// Builders join the career core (ladder, market, contract, wealth, life, record, reputation); the views match
// the app-ui career screens (G-85).
export * from './types.ts';
export { PARAMS } from './params.ts';
export { buildAssignmentsView, type AssignmentsInput } from './assignments.ts';
export { buildCareerView, ladderRungs, enrolmentLine, type CareerInput, type StintInput, type NetworkInput, type AudienceInput } from './career.ts';
export { buildJobMarketView, type JobMarketInput, type OfferInput, type SignInput, type OpeningLabel } from './market.ts';
export { buildContractView, contractTerms, contractClauses, type ContractInput } from './contract.ts';
export { buildRecordView, familyLines, type RecordInput, type SeasonInput } from './record.ts';
export { buildFinanceView, mixModel, projectRange, type FinanceInput } from './finance.ts';
export { buildLifeView, hoursByTask, sleepWord, energyWord, healthLines, effectLines, familyRows, type LifeInput } from './life.ts';
export { careerSpecs, CAREER_MODELS, type CareerSources, type CareerSchemas, type CoachParams } from './spec.ts';
export { t as careerText, money } from './text.ts';

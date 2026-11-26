// Design constants of the contract module (game build plan section 2: PARAMS with basis bible or assumption).
// "bible" means an E3 leaf states the number as a starting value (every one is marked Assumption there);
// "assumption" means the leaf names the knob but gives no number and this module chose it. None of these is
// a real-world fact. Real-world numbers live in facts.json and are referenced from defaults.json.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

const MODULE = 'career.contract';

const ROWS: readonly Row[] = [
  // E3.2.1 band position words: shares of the band span from low to high.
  ['bandBottomShare', 0.2, 0, 1, 'ratio', 'assumption', 'E3.2.1'],
  ['bandTopShare', 0.8, 0, 1, 'ratio', 'assumption', 'E3.2.1'],
  ['salaryRaiseMin', 0.03, 0, 0.2, 'ratio/yr', 'bible', 'E3.1.1'],
  ['salaryRaiseMax', 0.05, 0, 0.2, 'ratio/yr', 'bible', 'E3.1.1'],
  // E3.2.2 incentives
  ['bonusPayDays', 30, 0, 120, 'days', 'bible', 'E3.2.2'],
  // E3.3.1 death or permanent disability: years of salary paid (current year).
  ['deathPayYears', 1, 0, 5, 'years', 'bible', 'E3.3.1'],
  ['assistantHeadCoachLeftMonths', 12, 0, 36, 'months', 'bible', 'E3.3.1'],
  // E3.3.2 offset: market floor below this share of band median.
  ['offsetFloorShareOfMedian', 0.5, 0, 1, 'ratio', 'bible', 'E3.3.2'],
  // E3.3.3 disputed for-cause notice
  ['causeWinFinding', 0.7, 0, 1, 'probability', 'bible', 'E3.3.3'],
  ['causeWinCharge', 0.5, 0, 1, 'probability', 'bible', 'E3.3.3'],
  ['causeWinConduct', 0.3, 0, 1, 'probability', 'bible', 'E3.3.3'],
  ['causeDelayMinMonths', 3, 0, 24, 'months', 'bible', 'E3.3.3'],
  ['causeDelayMaxMonths', 9, 0, 24, 'months', 'bible', 'E3.3.3'],
  ['causeLegalCostMin', 0.02, 0, 0.2, 'ratio', 'bible', 'E3.3.3'],
  ['causeLegalCostMax', 0.05, 0, 0.2, 'ratio', 'bible', 'E3.3.3'],
  // E3.3.4 the coach leaves early
  ['buyoutDueDays', 75, 0, 180, 'days', 'bible', 'E3.3.4'],
  ['newEmployerPaysShare', 0.7, 0, 1, 'probability', 'bible', 'E3.3.4'],
  ['buyoutGrossUp', 0.3, 0, 1, 'ratio', 'bible', 'E3.3.4'],
  // E3.3.5 settlements: offer share = top - slope * (expected offset / owed), floor.
  ['settlementTop', 0.85, 0, 1, 'ratio', 'bible', 'E3.3.5'],
  ['settlementSlope', 0.3, 0, 1, 'ratio', 'bible', 'E3.3.5'],
  ['settlementFloor', 0.55, 0, 1, 'ratio', 'bible', 'E3.3.5'],
  ['settlementMinDays', 30, 0, 365, 'days', 'bible', 'E3.3.5'],
  ['settlementMaxDays', 120, 0, 365, 'days', 'bible', 'E3.3.5'],
  // E3.4.1 full roster control: prior head coach winning share bar, or this many competing offers.
  ['fullControlWinShareBar', 0.6, 0, 1, 'ratio', 'assumption', 'E3.4.1'],
  ['fullControlMinSeasons', 3, 0, 20, 'seasons', 'assumption', 'E3.4.1'],
  ['fullControlCompetingOffers', 2, 0, 10, 'count', 'bible', 'E3.4.1'],
  // E3.5.1 negotiation
  ['slightlyAboveShare', 0.1, 0, 1, 'ratio', 'assumption', 'E3.5.1'],
  ['patienceStart', 3, 1, 10, 'count', 'assumption', 'E3.5.1'],
  ['maxRounds', 4, 2, 10, 'rounds', 'bible', 'E3.5.1'],
  ['hardDemandMark', -3, -20, 0, 'relationship points', 'bible', 'E3.5.1'],
  ['agentNoiseAtZeroSkill', 0.3, 0, 1, 'ratio', 'assumption', 'E3.5.1'],
  ['agentNoiseAtFullSkill', 0.03, 0, 1, 'ratio', 'assumption', 'E3.5.1'],
  ['unitsPerSalaryMillion', 1, 0, 100, 'units/USD million', 'assumption', 'E3.5.1'],
  ['unitsPerYear', 0.5, 0, 10, 'units/year', 'assumption', 'E3.5.1'],
  ['unitsPerGuaranteeShare', 2, 0, 20, 'units', 'assumption', 'E3.5.1'],
  ['unitsPerControlStep', 1.5, 0, 20, 'units/step', 'assumption', 'E3.5.1'],
  ['unitsPerStaffPoolMillion', 0.5, 0, 10, 'units/USD million', 'assumption', 'E3.5.1'],
  ['unitsPerPerkClause', 0.1, 0, 5, 'units', 'assumption', 'E3.5.1'],
  // E3.5.2 leverage
  ['leveragePerOffer', 0.15, 0, 1, 'ratio', 'bible', 'E3.5.2'],
  ['leverageOfferCap', 2, 0, 10, 'count', 'bible', 'E3.5.2'],
  ['leverageGapWeight', 0.2, 0, 1, 'ratio', 'bible', 'E3.5.2'],
  ['leverageRecordWeight', 0.2, 0, 1, 'ratio', 'assumption', 'E3.5.2'],
  ['leverageUnemployedPenalty', 0.2, 0, 1, 'ratio', 'bible', 'E3.5.2'],
  ['leverageMin', 0.8, 0, 2, 'ratio', 'bible', 'E3.5.2'],
  ['leverageMax', 1.5, 0, 3, 'ratio', 'bible', 'E3.5.2'],
  // E3.6.3 shared representation
  ['sharedAgentCandidateBonus', 10, 0, 100, 'candidate score', 'bible', 'E3.6.3'],
  ['sharedAgentSkillPenalty', 10, 0, 100, 'skill points', 'bible', 'E3.6.3'],
  // E3.7.1 extensions
  ['extensionConfidence', 0.6, 0, 1, 'ratio', 'assumption', 'E3.7.1'],
  ['extensionMaxYearsLeft', 2, 0, 10, 'years', 'bible', 'E3.7.1'],
  // E3.7.2 final-year effects on other people's choices
  ['finalYearAssistantLeaveAdd', 0.15, 0, 1, 'probability', 'bible', 'E3.7.2'],
  ['finalYearRecruitPromiseFactor', 0.8, 0, 1, 'ratio', 'bible', 'E3.7.2'],
  ['finalYearRoleBeliefDrop', 5, 0, 100, 'points', 'bible', 'E3.7.2'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g51.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf,
    constrainedBy: basis === 'bible' ? `${leaf} starting value (Assumption in the bible, needs research)` : `${leaf} knob (assumption, needs research)`,
    status: 'starting',
  })),
};

const VALUES = new Map(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value] as const));

/** Read one design constant by its short name; throws on an unknown name. */
export function cparam(name: string): number {
  const v = VALUES.get(name);
  if (v === undefined) throw new Error(`contract: unknown parameter ${name}`);
  return v;
}

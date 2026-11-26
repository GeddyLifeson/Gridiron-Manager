// Player contracts in the off-screen world (C6, C8.3.1): every capped club's contracts, the yearly player
// payroll on the club's books (C6.2.3 rule 1), and the minimum cash spending floor (C6.2.3 rule 2).
export { MODULE, PARAMS, param, type FloorPeriod } from './params.ts';
export {
  CONTRACTS_KEY, contractsOf, setContracts, contractOf, clubContracts, salaryIn, lastYear,
  type PlayerTerms, type PlayerContract, type FloorCheck, type ContractsState,
} from './state.ts';
export {
  PLAYER_PAY_REASON, FLOOR_SHORTFALL_REASON, STREAM_FOUNDING, FLOOR_PCT_KEY, ruleSetFor, namedFloorPeriods, floorPeriodOf, runContractYear, playerCashPaid, contractsStep,
  type ContractsBinding, type ContractYearRun,
} from './step.ts';

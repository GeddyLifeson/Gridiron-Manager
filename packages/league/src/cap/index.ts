// @gm/league cap module (G-16): player contracts and cap accounting (bible C6; CBA Articles 7, 10, 12, 13, 26, 27).
export {
  fromTerms, plainYear, yearOf, totalValueCents, yearCashCents, FULLY_GUARANTEED, NOT_GUARANTEED,
  type CapContract, type CapYear, type CapItem, type BonusTranche, type ReleaseReason,
} from './contract.ts';
export { prorationYears, prorateTranche, prorationSchedule, prorationFor, remainingProration, type ProrationSchedule } from './proration.ts';
export {
  yearCharge, reducedOffseasonCharge, teamCapPosition, capAmount, fitsUnderCap,
  type ChargeBreakdown, type PlayerCapFacts, type CapPhase, type TeamContract, type OtherCharge, type TeamCapInput, type TeamCapLine, type TeamCapPosition,
} from './charges.ts';
export { minimumSalary, qualifyingContract, type QualifyingContractCharge } from './minimums.ts';
export {
  releaseCharges, tradeCharges, offsetCreditCents,
  type LeaveTiming, type LeaveInput, type ReleaseInput, type DeadMoney, type ReleaseResult, type TradeResult,
} from './release.ts';
export { restructure, extend, payCut, type ChangeResult } from './restructure.ts';
export {
  TAG_POSITIONS, article10Salary, averageOfRanks, capPercentageAverage, nonExclusiveFranchiseTender, exclusiveFranchiseTender,
  transitionTender, thirdFranchiseTender, checkTag, type TagPosition, type TagYear, type TenderInput, type TagKind, type TagRequest,
} from './tags.ts';
export {
  rookieLength, rookieSalary, maxAnnualIncrease, increaseRuleBreach, checkRookieContract, optionTier, optionSalary, escalatorLevel, escalatorRaise,
  type DraftRound, type SeasonPlays, type OptionTier, type OptionPrices, type EscalatorLevel,
} from './rookie.ts';
export { settleYear, cashInYear, cashFloor, type SettlementInput, type SettlementResult, type FloorResult } from './settlement.ts';
export { RULE_KEYS, PARAMS, paramTable, CENTS_PER_USD } from './params.ts';

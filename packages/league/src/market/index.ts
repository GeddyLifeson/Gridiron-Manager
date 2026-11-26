// @gm/league market module (G-35): free agency and trades mechanics (bible C8; M5 mechanics; CBA 2020
// Articles 8 and 9). Free agent classes, tenders and offer sheets read every value by key; the negotiating
// window, the opening and the trade period open and close on calendar anchors; trades are legal only by the
// cap (G-16) and roster (G-15) engines. K7 (G-76) makes the decisions with these mechanics.
export { RULE_KEYS, FALLBACK_KEYS, marketLookup, marketRules, need, type MarketRules, type MarketLookup, type FallbackRow } from './keys.ts';
export { PARAMS, P } from './params.ts';
export * from './types.ts';
export { marketDates, before, atOrAfter, addDays, startOfDay, type MarketDates } from './dates.ts';
export {
  RFA_LEVELS, freeAgentClass, signingFlags, tenderSalary, acceptedTenderSalary, makeTender, withdrawTender, compensationFor, rightsAt, maySign,
  type TenderCheck, type Compensation, type Rights, type RightsView,
} from './status.ts';
export {
  signOfferSheet, matchOfferSheet, settleOfferSheet, withdrawOfferSheet, isRfaTender,
  type OfferSheetTerms, type OfferSheet, type OfferSheetContext, type OfferSheetResult, type OfferSheetOutcome,
} from './offer-sheet.ts';
export {
  checkContact, mayExecuteContract, inFirstWave, marketRounds, postAgreement,
  type ContactActor, type ContactKind, type ContactTarget, type ContactInput, type ContactVerdict, type Agreement, type AgreementPosting,
} from './window.ts';
export {
  positionScale, shareAt, demandFactor, timeFactor, expectedContract, positionSpendShares,
  type ScaleContract, type PositionScale, type ValueInput, type Range, type ExpectedContract,
} from './value.ts';
export {
  TERMS, medianWeights, checkWeights, expectationCents, scoreOffers, reservationScore, choose, topReasons, topValue, applyPitch,
  type Term, type NonMoneyTerm, type Weights, type Offer, type Chooser, type Scored, type Reason, type Choice, type Pitch,
} from './choice.ts';
export {
  tradingOpen, checkTrade, physicalVoids, surplusPoints, adjustForWindow, valueSide, untouchables, tradeRecord,
  type TradePackage, type TradeProposal, type TenderedRights, type TradeContext, type MovedContract, type DeadCharge, type TradeAccepted, type TradeCheck,
  type CompetitiveWindow, type AssetValue, type Valuation, type TradeRecord,
} from './trade.ts';
export { STANCES, gmStance, deadlineStance, type Stance, type StanceInput, type StanceResult } from './deadline.ts';
export { insistWeight, perNameWeight, mustKeepWeight, coreNameWeight, requestKind, type RequestAnswer } from './voice.ts';

// Tuning constants of the market module (G-35, bible C8 and M5 mechanics). The values live in params.json
// because league source holds no number other than 0 and 1 (P1.1.2). Each row names the bible leaf that
// states it as a starting value, or says it is this module's assumption.
import { ParamFile } from '@gm/schema';
import file from './params.json' with { type: 'json' };
import units from './units.json' with { type: 'json' };

export const PARAMS: ParamFile = ParamFile.parse(file);

const byName = new Map(PARAMS.params.map((p) => [p.name, p.value]));
function param(name: string): number {
  const v = byName.get(`league.market.${name}`);
  if (v === undefined) throw new Error(`league.market: unknown parameter ${name}`);
  return v;
}

export const P = {
  backoutChance: param('backoutChance'),
  firstWaveHours: param('firstWaveHours'),
  roundIntervalHours: param('roundIntervalHours'),
  hourlyRoundDaysAfterOpen: param('hourlyRoundDaysAfterOpen'),
  dailyRoundHour: param('dailyRoundHour'),
  demandOneSuitor: param('demandOneSuitor'),
  demandFullSuitors: param('demandFullSuitors'),
  demandFullSuitorCount: param('demandFullSuitorCount'),
  timeDiscountFirst: param('timeDiscountFirst'),
  timeDiscountPerMonth: param('timeDiscountPerMonth'),
  daysPerMonth: param('daysPerMonth'),
  pooledScaleMinContracts: param('pooledScaleMinContracts'),
  maxContractYears: param('maxContractYears'),
  guaranteeShareTop: param('guaranteeShareTop'),
  guaranteeShareBottom: param('guaranteeShareBottom'),
  guaranteeAgeDropPerYear: param('guaranteeAgeDropPerYear'),
  guaranteeInjuryFactor: param('guaranteeInjuryFactor'),
  weightMoney: param('weightMoney'),
  weightRole: param('weightRole'),
  weightWinning: param('weightWinning'),
  weightRelationships: param('weightRelationships'),
  weightScheme: param('weightScheme'),
  weightLocation: param('weightLocation'),
  weightMoneyMax: param('weightMoneyMax'),
  weightWinningMax: param('weightWinningMax'),
  oldClubTermMax: param('oldClubTermMax'),
  nonMoneyOffsetMaxShare: param('nonMoneyOffsetMaxShare'),
  pitchGeneralGain: param('pitchGeneralGain'),
  pitchSpecificPromiseGain: param('pitchSpecificPromiseGain'),
  pitchFilmGain: param('pitchFilmGain'),
  untouchableTopN: param('untouchableTopN'),
  contenderFuturePickDiscount: param('contenderFuturePickDiscount'),
  rebuilderVeteranDiscount: param('rebuilderVeteranDiscount'),
  veteranAge: param('veteranAge'),
  physicalFailChance: param('physicalFailChance'),
  buyAboveOddsPct: param('buyAboveOddsPct'),
  sellBelowOddsPct: param('sellBelowOddsPct'),
  habitShiftPctPerStep: param('habitShiftPctPerStep'),
  voiceTrustThreshold: param('voiceTrustThreshold'),
  insistFullWeightCount: param('insistFullWeightCount'),
  mustKeepFullWeightCount: param('mustKeepFullWeightCount'),
  coreListFullWeightCount: param('coreListFullWeightCount'),
  extraNameWeightFactor: param('extraNameWeightFactor'),
  neutralTerm: param('neutralTerm'),
} as const;

export const PERCENT: number = units.percent;
export const MINUTES_PER_HOUR: number = units.minutesPerHour;
export const REASONS_PER_SIGNING: number = units.reasonsPerSigning;

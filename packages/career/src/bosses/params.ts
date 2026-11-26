// Design constants of the bosses module (game build plan section 2). Every value is a starting value the
// bible states (basis "bible"; the bible marks each one Assumption) or one this module chose where the leaf
// names a parameter without a number (basis "assumption"). None is a real-world fact. The one real-world
// count behind the arrangement odds (L5.2.1, 2016 survey) is a fact row in facts.json, cited by name.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

export const MODULE = 'career.bosses';

const ROWS: readonly Row[] = [
  // L5.2.1 arrangement odds for generated pro clubs, out of 32 (anchor: fact F-bosses-0001, 1 of 3).
  ['power.odds.general_manager', 21, 0, 32, 'weight', 'bible', 'L5.2.1'],
  ['power.odds.head_coach', 5, 0, 32, 'weight', 'bible', 'L5.2.1'],
  ['power.odds.owner', 4, 0, 32, 'weight', 'bible', 'L5.2.1'],
  ['power.odds.executive', 2, 0, 32, 'weight', 'bible', 'L5.2.1'],
  // L5.2.1: split duties drawn inside the general manager and owner groups.
  ['power.splitShare', 1 / 3, 0, 1, 'probability', 'bible', 'L5.2.1'],
  // T9.1.1 rule 1 college variants.
  ['power.college.paymentsAbove', 0.1, 0, 1, 'probability', 'bible', 'T9.1.1'],
  ['power.college.gmReportsToAd', 0.2, 0, 1, 'probability', 'bible', 'T9.1.1'],
  // L5.1.1 owner reads room_lost through his ties after a delay.
  ['owner.roomLostDelayWeeks', 2, 0, 12, 'weeks', 'bible', 'L5.1.1'],
  ['memory.notTold', 40, 0, 100, 'strength', 'bible', 'L5.1.1'],
  ['memory.endRun', 50, 0, 100, 'strength', 'bible', 'L5.2.4'],
  // L5.1.2 meetings: involvement above this meets weekly, otherwise monthly; 1 to 3 items.
  ['meeting.weeklyInvolvement', 0.6, 0, 1, 'ratio', 'assumption', 'L5.1.2'],
  ['meeting.maxItems', 3, 1, 5, 'count', 'bible', 'L5.1.2'],
  ['meeting.recencyHalfLifeDays', 30, 1, 365, 'days', 'assumption', 'L5.1.2'],
  // L5.1.2 answers: memory strength on the boss = involvement x process term + (1 - involvement) x outcome term.
  ['answer.evidenceSound', 4, -20, 20, 'strength', 'assumption', 'L5.1.2'],
  ['answer.evidenceUnsound', -3, -20, 20, 'strength', 'assumption', 'L5.1.2'],
  ['answer.responsibility', 1, -20, 20, 'strength', 'assumption', 'L5.1.2'],
  ['answer.pointElsewhere', -1, -20, 20, 'strength', 'assumption', 'L5.1.2'],
  ['answer.deflect', -3, -20, 20, 'strength', 'assumption', 'L5.1.2'],
  ['answer.outcomeGood', 2, -20, 20, 'strength', 'assumption', 'L5.1.2'],
  ['answer.outcomeBad', -2, -20, 20, 'strength', 'assumption', 'L5.1.2'],
  ['answer.blamedStaff', -10, -50, 0, 'strength', 'assumption', 'L5.1.2'],
  ['answer.skipped', -2, -20, 0, 'strength', 'assumption', 'L5.1.2'],
  // L5.1.3 response memories on the owner.
  ['interference.refuseReasons', -2, -20, 0, 'strength', 'assumption', 'L5.1.3'],
  ['interference.refuseFlat', -6, -20, 0, 'strength', 'assumption', 'L5.1.3'],
  ['interference.comply', 2, 0, 20, 'strength', 'assumption', 'L5.1.3'],
  ['interference.complyPartly', 0, -20, 20, 'strength', 'assumption', 'L5.1.3'],
  ['interference.displaced', -8, -50, 0, 'strength', 'assumption', 'L5.1.3'],
  ['ask.gmShift', 0.15, 0, 1, 'ratio', 'assumption', 'L5.1.4'],
  ['ask.boosterShift', 0.15, 0, 1, 'ratio', 'assumption', 'L5.4.3'],
  ['power.college.paymentsHolderAdShare', 0.5, 0, 1, 'probability', 'assumption', 'T9.1.1'],
  // L5.1.3 interference chance per week = base * involvement * (1 - trust/100) * results factor.
  ['interference.baseWeekly', 0.25, 0, 1, 'probability', 'assumption', 'L5.1.3'],
  ['interference.resultsDamp', 0.5, 0, 1, 'ratio', 'assumption', 'L5.1.3'],
  // L5.1.4 resource asks.
  ['ask.trustShift', 0.3, 0, 1, 'ratio', 'assumption', 'L5.1.4'],
  ['ask.resultsShift', 0.3, 0, 1, 'ratio', 'assumption', 'L5.1.4'],
  ['ask.unreturnedPenalty', 0.1, 0, 1, 'probability', 'assumption', 'L5.1.4'],
  ['ask.windowDays', 365, 30, 730, 'days', 'bible', 'L5.1.4'],
  ['ask.minChance', 0.02, 0, 1, 'probability', 'assumption', 'L5.1.4'],
  ['ask.maxChance', 0.95, 0, 1, 'probability', 'assumption', 'L5.1.4'],
  ['ask.conditionShare', 0.25, 0, 1, 'ratio', 'assumption', 'L5.1.4'],
  ['ask.laterShare', 0.4, 0, 1, 'ratio', 'assumption', 'L5.1.4'],
  // L5.1.5 dead money: threshold raise = 2 * cost/salary + 1 per $10M carried, times (1 - spending).
  ['deadMoney.perSalaryYear', 2, 0, 10, 'points', 'bible', 'L5.1.5'],
  ['deadMoney.perTenMillionCarried', 1, 0, 10, 'points', 'bible', 'L5.1.5'],
  ['deadMoney.carryUsdUnit', 10_000_000, 1, 100_000_000, 'USD', 'bible', 'L5.1.5'],
  ['deadMoney.carrySeasons', 3, 1, 10, 'seasons', 'bible', 'L5.1.5'],
  ['hotSeat.lastYearRoleBelief', -5, -50, 0, 'points', 'bible', 'L5.1.5'],
  // L5.1.5 sign bands on E4 confidence (0 to 100): a sign shows when confidence is below its band.
  ['hotSeat.band.process_to_results', 55, 0, 100, 'confidence', 'assumption', 'L5.1.5'],
  ['hotSeat.band.owner_talks_to_players', 45, 0, 100, 'confidence', 'assumption', 'L5.1.5'],
  ['hotSeat.band.vote_of_confidence', 40, 0, 100, 'confidence', 'assumption', 'L5.1.5'],
  ['hotSeat.band.demanded_staff_change', 35, 0, 100, 'confidence', 'assumption', 'L5.1.5'],
  ['hotSeat.band.no_extension', 30, 0, 100, 'confidence', 'assumption', 'L5.1.5'],
  ['hotSeat.band.gm_stops_consulting', 25, 0, 100, 'confidence', 'assumption', 'L5.1.5'],
  // L5.2.2 / L5.2.4 general manager.
  ['gm.toleranceZeroAtTrust', 20, 0, 100, 'trust', 'bible', 'L5.2.4'],
  ['gm.toleranceOneRoundAtTrust', 80, 0, 100, 'trust', 'bible', 'L5.2.4'],
  ['gm.unplayedPickPerMonth', -2, -20, 0, 'trust', 'bible', 'L5.2.2'],
  ['gm.evalHit', 1, 0, 5, 'trust', 'bible', 'L5.2.3'],
  ['gm.evalMiss', -1, -5, 0, 'trust', 'bible', 'L5.2.3'],
  ['gm.evalSeasonCap', 5, 0, 20, 'trust', 'bible', 'L5.2.3'],
  // L5.2.6 late-season request chance per week once a flag is set.
  ['late.baseWeekly', 0.2, 0, 1, 'probability', 'assumption', 'L5.2.6'],
  // L5.3.1 obligations.
  ['obligation.allowanceBase', 1, 0, 10, 'count', 'bible', 'L5.3.1'],
  ['obligation.allowanceScale', 3, 0, 10, 'count', 'bible', 'L5.3.1'],
  ['obligation.presidentMemory', -2, -20, 0, 'strength', 'bible', 'L5.3.1'],
  ['obligation.ownerMemory', -1, -20, 0, 'strength', 'bible', 'L5.3.1'],
  // L5.3.3 standing read: familiarity below this gives a vague line (L1.1.1 range at under 30).
  ['standing.vagueBelowFamiliarity', 30, 0, 100, 'familiarity', 'bible', 'L1.1.1'],
  ['standing.wTrust', 1, 0, 5, 'ratio', 'assumption', 'L5.3.3'],
  ['standing.wRespect', 0.5, 0, 5, 'ratio', 'assumption', 'L5.3.3'],
  ['standing.wResults', 0.5, 0, 5, 'ratio', 'assumption', 'L5.3.3'],
  ['standing.wUnreturned', 0.25, 0, 5, 'ratio', 'assumption', 'L5.3.3'],
  ['standing.wRefusals', 0.2, 0, 5, 'ratio', 'assumption', 'L5.3.3'],
  ['standing.threshold', 0.25, 0, 5, 'ratio', 'assumption', 'L5.3.3'],
  // L5.4.2 president and board.
  ['president.backBase', 0.5, 0, 1, 'probability', 'bible', 'L5.4.2'],
  ['president.backSlope', 0.4, 0, 1, 'probability', 'bible', 'L5.4.2'],
  ['president.backMin', 0.1, 0, 1, 'probability', 'bible', 'L5.4.2'],
  ['president.backMax', 0.9, 0, 1, 'probability', 'bible', 'L5.4.2'],
  ['board.approvalUsd', 1_000_000, 0, 100_000_000, 'USD', 'bible', 'L5.4.2'],
  // T9.1.1 rule 2: president involvement rises with buyout size and any compliance case.
  ['president.involveBase', 0.05, 0, 1, 'probability', 'assumption', 'T9.1.1'],
  ['president.involvePerTenMillion', 0.1, 0, 1, 'probability', 'assumption', 'T9.1.1'],
  ['president.involveCompliance', 0.3, 0, 1, 'probability', 'assumption', 'T9.1.1'],
  // L5.4.3 booster mood.
  ['booster.rivalryWeight', 2, 1, 5, 'ratio', 'bible', 'L5.4.3'],
  ['booster.resultStep', 4, 0, 20, 'mood', 'assumption', 'L5.4.3'],
  ['booster.accessStep', 2, 0, 20, 'mood', 'assumption', 'L5.4.3'],
  ['booster.accessHalfAfter', 4, 1, 50, 'events', 'assumption', 'T9.3.1'],
  // L5.4.6 donor share of a buyout, 0 to 50% by mood and donor base.
  ['booster.buyoutShareMax', 0.5, 0, 1, 'ratio', 'bible', 'L5.4.6'],
  // T9.1.1: an athletic director meets weekly in season.
  ['ad.largeRequestUsd', 250_000, 0, 10_000_000, 'USD', 'assumption', 'T9.1.1'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g48.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf,
    constrainedBy: basis === 'bible'
      ? `${leaf} acceptance (starting value, Assumption in the bible)`
      : `${leaf} acceptance (module assumption, needs research)`,
    status: 'starting',
  })),
};

const BY_NAME = new Map(PARAMS.params.map((p) => [p.name, p.value] as const));

export function param(name: string): number {
  const v = BY_NAME.get(`${MODULE}.${name}`);
  if (v === undefined) throw new Error(`bosses: unknown param ${name}`);
  return v;
}

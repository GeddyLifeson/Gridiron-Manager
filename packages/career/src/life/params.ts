// Design constants of the life module (G-53: bible E7, E8, S9.2, S9.3). Game build plan section 2:
// PARAMS with basis "bible" (the leaf states the number as a starting value; the bible marks every one
// of them as an unsourced Assumption) or "assumption" (the leaf names the parameter but gives no
// number, so this module chose it). None of these is a real-world fact; real-world numbers live in
// facts.json and are read through facts.ts.
import type { ParamFile, TuningParam } from '@gm/schema';
import tablesJson from './tables.json' with { type: 'json' };

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

const MODULE = 'career.life';

const ROWS: readonly Row[] = [
  // E7.1.1 the week
  ['hoursPerDay', 24, 24, 24, 'h', 'bible', 'E7.1.1'],
  ['quartersPerHour', 4, 4, 4, 'count', 'bible', 'E7.1.1'],
  ['fixedNeedsHours', 1.5, 0, 6, 'h/day', 'bible', 'E7.1.1'],
  ['commuteHours', 0.5, 0, 3, 'h/day', 'assumption', 'E7.1.1'],
  ['defaultSleepHours', 7, 0, 24, 'h/night', 'bible', 'E7.1.1'],
  ['sleepFloorHours', 4, 0, 24, 'h/night', 'bible', 'E7.1.1'],
  // E7.4.1 sleep debt
  ['sleepNeedHours', 7.5, 7, 9, 'h/night', 'bible', 'E7.4.1'],
  ['sleepRepayMaxPerNight', 2, 0, 8, 'h/night', 'bible', 'E7.4.1'],
  ['sleepDebtCap', 40, 0, 200, 'h', 'bible', 'E7.4.1'],
  ['sleepBand.tired', 5, 0, 200, 'h', 'bible', 'E7.4.1'],
  ['sleepBand.wornDown', 12, 0, 200, 'h', 'bible', 'E7.4.1'],
  ['sleepBand.exhausted', 24, 0, 200, 'h', 'bible', 'E7.4.1'],
  ['travelDebtHours', 1, 0, 8, 'h', 'bible', 'E7.4.1'],
  ['travelZoneShift', 3, 1, 12, 'h', 'bible', 'E7.4.1'],
  // E7.4.2 what overwork costs
  ['infoDelay.wornDown', 3, 0, 30, 's', 'bible', 'E7.4.2'],
  ['infoDelay.exhausted', 6, 0, 30, 's', 'bible', 'E7.4.2'],
  ['halftimeLoss.wornDown', 1, 0, 5, 'count', 'bible', 'E7.4.2'],
  ['halftimeLoss.exhausted', 2, 0, 5, 'count', 'bible', 'E7.4.2'],
  ['exhaustedFixedNeedsHours', 2.5, 0, 6, 'h/day', 'bible', 'E7.4.2'],
  // E7.3.2 checking delegated work
  ['replaceShareThreshold', 0.3, 0, 1, 'ratio/season', 'bible', 'E7.3.2'],
  // The week as a bill (plans/head-coach-nuance.md item 4, proposed MA-85): uninvited asks and skipped work. Every
  // size here is chosen; the plan's research top-up is owed before any of them is sourced.
  ['ask.yesStanding', 1, 0, 10, 'points', 'assumption', 'item 4 (a yes earns a little standing with the asker); size chosen here'],
  ['ask.noShare', 1, 0, 1, 'ratio', 'assumption', 'item 4 (a no costs the standing at stake); whole share chosen here'],
  ['ask.delegateShare', 0.4, 0, 1, 'ratio', 'assumption', 'item 4 (sending someone in his place costs part of it); size chosen here'],
  ['ask.ownerScale', 2, 1, 5, 'ratio', 'assumption', 'item 4 (the owner remembers a no longest, S4); size chosen here'],
  ['debt.lagWeeks.room', 3, 1, 12, 'weeks', 'assumption', 'item 4 ("a room he never met slips" weeks later); lag chosen here'],
  ['debt.lagWeeks.plan', 1, 0, 4, 'weeks', 'assumption', 'item 4 (a game plan he did not review has a hole on game day); lag chosen here'],
  ['debt.lagWeeks.people', 4, 1, 12, 'weeks', 'assumption', 'item 4 (a one-on-one skipped shows up as a problem he hears late); lag chosen here'],
  ['debt.perHour', 1, 0, 5, 'points/h', 'assumption', 'item 4: size of a debt per skipped hour; chosen here'],
  ['bill.overloadPerHour', 0.01, 0, 0.05, 'ratio/h', 'assumption', 'item 4 with E7.4.2 (overwork costs): quality lost per weekly work hour over the heavy band; size chosen here'],
  ['bill.reviewShare', 0.15, 0, 1, 'ratio', 'assumption', 'item 4 with E7.3.2: hours a head coach spends checking a delegated block, as a share of doing it; chosen here'],
  // E8.1.1 sustained load
  ['loadWindowWeeks', 12, 1, 52, 'weeks', 'bible', 'E8.1.1'],
  ['heavyWindowWeeks', 52, 1, 104, 'weeks', 'bible', 'E8.1.1'],
  ['heavyWorkHours', 90, 40, 168, 'h/week', 'bible', 'E8.1.1'],
  ['heavySleepHours', 5.5, 0, 12, 'h/night', 'bible', 'E8.1.1'],
  ['loadBand.heavy', 75, 0, 168, 'h/week', 'bible', 'E8.1.1'],
  ['loadBand.veryHeavy', 90, 0, 168, 'h/week', 'bible', 'E8.1.1'],
  // E8.2.1 the yearly check-up
  ['checkupHours', 2, 0, 8, 'h', 'bible', 'E8.2.1'],
  ['worsenHeavyWeeks', 20, 0, 52, 'weeks', 'bible', 'E8.2.1'],
  ['worsenHeavyWeeksHigh', 35, 0, 52, 'weeks', 'bible', 'E8.2.1'],
  ['worsenChance', 0.25, 0, 1, 'probability/yr', 'bible', 'E8.2.1'],
  ['worsenChanceHigh', 0.5, 0, 1, 'probability/yr', 'bible', 'E8.2.1'],
  ['ageStep1', 55, 0, 120, 'years', 'bible', 'E8.2.1'],
  ['ageStep1Add', 0.05, 0, 1, 'probability/yr', 'bible', 'E8.2.1'],
  ['ageStep2', 65, 0, 120, 'years', 'bible', 'E8.2.1'],
  ['ageStep2Add', 0.1, 0, 1, 'probability/yr', 'bible', 'E8.2.1'],
  ['improveHeavyWeeks', 8, 0, 52, 'weeks', 'bible', 'E8.2.1'],
  ['improveChance', 0.5, 0, 1, 'probability/yr', 'bible', 'E8.2.1'],
  // E8.2.2 the physician's warning
  ['warningDeliveryWeeks', 4, 0, 12, 'weeks', 'bible', 'E8.2.2'],
  ['warningReviewWeeks', 12, 1, 52, 'weeks', 'bible', 'E8.2.2'],
  ['warningSleepTarget', 6, 0, 12, 'h/night', 'bible', 'E8.2.2'],
  ['warningWorkTarget', 80, 0, 168, 'h/week', 'bible', 'E8.2.2'],
  // E8.2.3 health events
  ['eventHazardPerWeek', 0.005, 0, 1, 'probability/week', 'bible', 'E8.2.3'],
  ['eventHazardHeavyHours', 100, 0, 168, 'h/week', 'bible', 'E8.2.3'],
  ['eventHazardHeavyMultiplier', 2, 1, 10, 'ratio', 'bible', 'E8.2.3'],
  ['eventWeeksMin', 2, 0, 52, 'weeks', 'bible', 'E8.2.3'],
  ['eventWeeksMax', 16, 0, 52, 'weeks', 'bible', 'E8.2.3'],
  ['seasonAwayWeeks', 52, 1, 104, 'weeks', 'assumption', 'E8.2.3'],
  // E8.3.1 the household
  ['school.primary', 5, 0, 30, 'years', 'bible', 'E8.3.1'],
  ['school.secondary', 14, 0, 30, 'years', 'bible', 'E8.3.1'],
  ['school.grown', 18, 0, 30, 'years', 'bible', 'E8.3.1'],
  ['school.finalYears', 2, 0, 6, 'years', 'bible', 'E8.3.1'],
  // E8.3.2 time at home and satisfaction
  ['homeTarget.inSeason', 14, 0, 168, 'h/week', 'bible', 'E8.3.2'],
  ['homeTarget.offSeason', 30, 0, 168, 'h/week', 'bible', 'E8.3.2'],
  ['homeRatioCap', 1.2, 0.1, 5, 'ratio', 'bible', 'E8.3.2'],
  ['homeDriftRate', 0.05, 0, 1, 'ratio/week', 'bible', 'E8.3.2'],
  ['inSeasonDriftScale', 0.5, 0, 1, 'ratio', 'bible', 'E8.3.2'],
  ['apartRatioCap', 0.5, 0, 1, 'ratio', 'bible', 'E8.3.2'],
  ['tierDropPenalty', 5, 0, 50, 'points', 'bible', 'E8.3.2'],
  ['tierDropWeeks', 52, 1, 104, 'weeks', 'bible', 'E8.3.2'],
  ['housingStabilityMax', 3, 0, 20, 'points', 'bible', 'E8.3.2'],
  ['breakTogetherBonus', 5, 0, 50, 'points', 'bible', 'E8.3.2'],
  ['conversationBelow', 25, 0, 100, 'points', 'bible', 'E8.3.2'],
  ['separationBelow', 15, 0, 100, 'points', 'bible', 'E8.3.2'],
  ['strainWindowWeeks', 52, 1, 104, 'weeks', 'bible', 'E8.3.2'],
  ['separationWarnings', 2, 1, 10, 'count', 'bible', 'E8.3.2'],
  ['satisfactionStart', 60, 0, 100, 'points', 'assumption', 'E8.3.2'],
  // E8.3.3 life events
  ['eventAttendGain.min', 2, 0, 50, 'points', 'bible', 'E8.3.3'],
  ['eventAttendGain.max', 5, 0, 50, 'points', 'bible', 'E8.3.3'],
  ['eventMissLoss.min', 3, 0, 50, 'points', 'bible', 'E8.3.3'],
  ['eventMissLoss.max', 8, 0, 50, 'points', 'bible', 'E8.3.3'],
  ['eventInSeasonShare', 0.34, 0, 1, 'ratio', 'bible', 'E8.3.3'],
  ['eventNoticeDaysMin', 3, 0, 60, 'days', 'bible', 'E8.3.3'],
  ['eventNoticeDaysMax', 21, 0, 60, 'days', 'bible', 'E8.3.3'],
  ['parentCareAge', 75, 40, 120, 'years', 'assumption', 'E8.3.3'],
  ['parentCareChancePerYear', 0.1, 0, 1, 'probability/yr', 'assumption', 'E8.3.3'],
  ['parentDeathAge', 85, 40, 120, 'years', 'assumption', 'E8.3.3'],
  ['parentDeathChancePerYear', 0.08, 0, 1, 'probability/yr', 'assumption', 'E8.3.3'],
  ['illnessChancePerYear', 0.15, 0, 1, 'probability/yr', 'assumption', 'E8.3.3'],
  ['weddingChancePerYear', 0.1, 0, 1, 'probability/yr', 'assumption', 'E8.3.3'],
  ['partPresenceShare', 0.5, 0, 1, 'ratio', 'assumption', 'E8.3.3'],
  ['birthHoursMin', 24, 0, 168, 'h', 'bible', 'E8.3.3'],
  ['birthHoursMax', 72, 0, 168, 'h', 'bible', 'E8.3.3'],
  ['weddingOfCoachHours', 16, 0, 168, 'h', 'assumption', 'E8.3.3'],
  // E8.4.1 relocation
  ['moveAllPenalty', 6, 0, 50, 'points', 'bible', 'E8.4.1'],
  ['moveTiePenalty', 4, 0, 50, 'points', 'bible', 'E8.4.1'],
  ['moveThirdPenalty', 5, 0, 50, 'points', 'bible', 'E8.4.1'],
  ['moveCountWindowYears', 5, 1, 20, 'years', 'bible', 'E8.4.1'],
  ['moveCountForPenalty', 3, 1, 20, 'count', 'bible', 'E8.4.1'],
  ['moveRecoveryWeeks', 52, 1, 104, 'weeks', 'bible', 'E8.4.1'],
  ['moveHomeRegionBonus', 5, 0, 50, 'points', 'bible', 'E8.4.1'],
  ['visitWindow.offSeason', 36, 0, 168, 'h/week', 'assumption', 'E8.4.1'],
  ['visitWindow.inSeason', 8, 0, 168, 'h/week', 'assumption', 'E8.4.1'],
  // E7.7.2 and S9.2.1 required hours (S9.2.1 is the owner of the numbers; see rungs.ts)
  ['offseasonRequiredRatio', 0.6, 0, 1, 'ratio', 'assumption', 'S9.2.1'],
  ['dayJobHours', 40, 0, 80, 'h/week', 'bible', 'E7.7.2'],
];

// E7.2.1 task costs and S9.2.1 rung hours are tables in tables.json; they are tuning values too, so
// each one is also a PARAMS row (cost.<task> and its long option; rung.<n>.min and .max).
const TABLE_ROWS: readonly Row[] = [
  ...tablesJson.tasks.flatMap((t): Row[] => {
    const basis = 'assumption' in t && t.assumption ? 'assumption' : 'bible';
    const out: Row[] = [[`cost.${t.id}`, t.hours, 0, 24, 'h/unit', basis, t.leaf]];
    if ('hoursLong' in t && typeof t.hoursLong === 'number') out.push([`cost.${t.id}.long`, t.hoursLong, 0, 24, 'h/unit', basis, t.leaf]);
    return out;
  }),
  ...tablesJson.rungs.flatMap((r): Row[] => [
    [`rung.${r.rung}.min`, r.min, 0, 168, 'h/week', 'bible', 'S9.2.1'],
    [`rung.${r.rung}.max`, r.max, 0, 168, 'h/week', 'bible', 'S9.2.1'],
  ]),
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g53.1',
  params: [...ROWS, ...TABLE_ROWS].map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf,
    constrainedBy: basis === 'bible' ? `${leaf} acceptance (bible starting value, needs research)` : `${leaf} acceptance (assumption, needs research)`,
    status: 'starting',
  })),
};

const VALUES = new Map(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value] as const));

/** Read one design constant by its short name; throws on an unknown name. */
export function param(name: string): number {
  const v = VALUES.get(name);
  if (v === undefined) throw new Error(`life: unknown parameter ${name}`);
  return v;
}

/** Quarter hours per hour (E7.1.1 rule 7). All hour arithmetic in this module runs on whole quarters. */
export const Q: number = param('quartersPerHour');
/** Hours to whole quarter hours, rounded to the nearest quarter. */
export function toQ(hours: number): number { return Math.round(hours * Q); }
/** Whole quarter hours to hours. */
export function fromQ(q: number): number { return q / Q; }

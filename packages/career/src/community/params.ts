// Design constants of community and league relations (L8.1, L8.3 to L8.5). Every value is a starting
// value the bible states (basis "bible", all marked Assumption in L8) or one this module chose where a
// leaf names a parameter without a number (basis "assumption"). None is a real-world fact: L8 marks
// the processes themselves Unverified (clip submissions, documentaries, clinics) and every size an
// Assumption. Rule values (conference discipline, documentary eligibility) are read by key.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

export const MODULE = 'career.community';

const ROWS: readonly Row[] = [
  // L8.1.1 community events.
  ['events.perMonthInSeason', 1, 0, 10, 'count', 'bible', 'L8.1.1'],
  ['events.perMonthOffseason', 2, 0, 10, 'count', 'bible', 'L8.1.1'],
  ['events.monthsPerYear', 12, 12, 12, 'count', 'assumption', 'L8.1.1'],
  ['events.noRequestHoursBeforeKickoff', 24, 0, 72, 'h', 'bible', 'L8.1.1'],
  ['events.minMinutes', 60, 15, 600, 'min', 'assumption', 'L8.1.1'],
  ['events.maxMinutes', 240, 15, 600, 'min', 'assumption', 'L8.1.1'],
  ['events.attendFanMood', 0.5, 0, 10, 'mood', 'bible', 'L8.1.1'],
  ['events.attendMemory', 2, 0, 20, 'memory', 'bible', 'L8.1.1'],
  ['events.playerCharityMemory', 6, 0, 20, 'memory', 'bible', 'L8.1.1'],
  ['events.playerCharityHalfLifeWeeks', 52, 1, 520, 'weeks', 'bible', 'L8.1.1'],
  ['events.declineMemory', -1, -20, 0, 'memory', 'bible', 'L8.1.1'],
  ['events.declineOwnerThirdMemory', -4, -20, 0, 'memory', 'bible', 'L8.1.1'],
  ['events.ownerDeclineCount', 3, 1, 20, 'count', 'bible', 'L8.1.1'],
  ['events.standInShare', 0.5, 0, 1, 'ratio', 'bible', 'L8.1.1'],
  ['foundation.notability', 10, 0, 100, 'points', 'assumption', 'L8.1.1'],
  // L8.3.1 clip submissions.
  ['clips.maxPerGame', 5, 0, 20, 'count', 'bible', 'L8.3.1'],
  ['clips.honestShare', 0.85, 0, 1, 'probability', 'bible', 'L8.3.1'],
  ['clips.qcMinutesEach', 10, 0, 60, 'min', 'bible', 'L8.3.1'],
  // L8.3.2 rule changes and points of emphasis.
  ['rules.awarenessStart', 20, 0, 100, 'awareness', 'bible', 'L8.3.2'],
  ['rules.officialsMeetingGain', 15, 0, 100, 'awareness', 'bible', 'L8.3.2'],
  ['rules.crewPracticeGain', 10, 0, 100, 'awareness', 'bible', 'L8.3.2'],
  ['rules.ignoredHazardRise', 0.2, 0, 1, 'ratio', 'bible', 'L8.3.2'],
  ['rules.emphasisEarlyFactor', 1.2, 1, 3, 'ratio', 'bible', 'L8.3.2'],
  ['rules.emphasisFadeWeeks', 9, 1, 26, 'weeks', 'assumption', 'L8.3.2'],
  ['rules.skippedStaffAdviceError', 0.1, 0, 1, 'probability', 'bible', 'L8.3.2'],
  ['rules.skippedStaffAdviceGames', 4, 0, 20, 'count', 'bible', 'L8.3.2'],
  // L8.3.3 league assignments.
  ['doc.publicShareStandard', 0.3, 0, 1, 'probability', 'bible', 'L8.3.3'],
  ['doc.publicShareMinimal', 0.1, 0, 1, 'probability', 'bible', 'L8.3.3'],
  ['doc.publicShareOpen', 0.3, 0, 1, 'probability', 'assumption', 'L8.3.3'],
  ['doc.minimalOwnerMemory', -3, -20, 0, 'memory', 'bible', 'L8.3.3'],
  ['doc.openFanMood', 3, 0, 20, 'mood', 'bible', 'L8.3.3'],
  // L8.4.2 compliance responses.
  ['case.selfReportWindowDays', 14, 0, 90, 'days', 'bible', 'L8.4.2'],
  ['case.foundLaterMajorChance', 0.3, 0, 1, 'probability', 'bible', 'L8.4.2'],
  ['case.minimiseAddedPenaltyChance', 0.25, 0, 1, 'probability', 'bible', 'L8.4.2'],
  // L8.4.3 clinics.
  ['clinic.speakTie', 20, 0, 100, 'strength', 'bible', 'L8.4.3'],
  ['clinic.visitTie', 30, 0, 100, 'strength', 'bible', 'L8.4.3'],
  ['clinic.listenerTie', 5, 0, 100, 'strength', 'assumption', 'L8.4.3'],
  ['clinic.highSchoolFamiliarity', 3, 0, 20, 'familiarity', 'bible', 'L8.4.3'],
  ['clinic.speakSampleShare', 0.25, 0, 1, 'ratio', 'assumption', 'L8.4.3'],
  ['clinic.baseInvitations', 1, 0, 20, 'count', 'assumption', 'L8.4.3'],
  ['clinic.topUnitExtraInvitations', 3, 0, 20, 'count', 'assumption', 'L8.4.3'],
  ['clinic.topUnitRankShare', 0.25, 0, 1, 'ratio', 'assumption', 'L8.4.3'],
  // L8.5.1 interviews.
  ['interview.truthHarmsBossStanding', -15, -100, 0, 'standing', 'bible', 'L8.5.1'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g50.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf,
    constrainedBy: basis === 'bible'
      ? `${leaf} acceptance (starting value, Assumption in the bible)`
      : `${leaf} acceptance (module assumption, needs research)`,
    status: 'starting',
  })),
};

const VALUES = new Map(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value] as const));

/** Read one design constant by its short name; throws on an unknown name. */
export function param(name: string): number {
  const v = VALUES.get(name);
  if (v === undefined) throw new Error(`community: unknown parameter ${name}`);
  return v;
}

// Design constants of the crisis engine (L9.1, L9.3 to L9.5). Every value is a starting value the bible
// states (basis "bible", all marked Assumption in L9) or one this module chose where the leaf names a
// parameter without a number (basis "assumption"). None is a real-world fact. Real-world rates (the
// arrest rate, the NCAA major-case rate, case length) are not here: they live in the G-32 catalogue
// (`packages/football-content/data/crises/catalogue.json`) with fact rows, and the engine reads them
// from the catalogue passed in. Pacing and warning lead times are also catalogue values.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

export const MODULE = 'career.crisis';

const ROWS: readonly Row[] = [
  // L9.1.1 severity. Off-field outcome classes onto the 1 to 5 scale (module choice: the bible gives the
  // classes and the scale but no mapping). minor 1..2, serious 3..4, grave 5.
  ['severity.minorMax', 2, 1, 5, 'severity', 'assumption', 'L9.1.1'],
  ['severity.seriousMin', 3, 1, 5, 'severity', 'assumption', 'L9.1.1'],
  ['severity.seriousMax', 4, 1, 5, 'severity', 'assumption', 'L9.1.1'],
  ['severity.grave', 5, 1, 5, 'severity', 'assumption', 'L9.1.1'],
  // L9.1.1 "Severity sets ... whether the owner or athletic director is told at once".
  ['severity.upstairsAtOnce', 4, 1, 5, 'severity', 'assumption', 'L9.1.1'],
  // X4 notability written per severity point (X4 owns the final score; this is the crisis's input).
  ['notability.perSeverity', 20, 0, 20, 'points', 'assumption', 'L9.1.1'],
  // L9.1.3 channel chances.
  ['warning.councilTrustDivisor', 100, 1, 100, 'trust', 'bible', 'L9.1.3'],
  ['warning.councilMeetingWindowDays', 14, 1, 60, 'days', 'bible', 'L9.1.3'],
  ['warning.openDoorTrustFloor', 40, 0, 100, 'trust', 'bible', 'L9.1.3'],
  ['warning.openDoorTrustSpan', 60, 1, 100, 'trust', 'bible', 'L9.1.3'],
  ['warning.medicalHealthShare', 0.9, 0, 1, 'probability', 'bible', 'L9.1.3'],
  ['warning.reporterTopBandsShare', 0.5, 0, 1, 'probability', 'bible', 'L9.1.3'],
  ['warning.reporterBandFloor', 4, 1, 5, 'band', 'bible', 'L9.1.3'],
  ['warning.reportUpMin', 0.05, 0, 1, 'probability', 'bible', 'L9.1.3'],
  ['warning.reportUpMax', 0.95, 0, 1, 'probability', 'bible', 'L9.1.3'],
  // L9.3.1 timing through clocks, the L1.1.2 "told before he found out" memory rule.
  ['memory.toldBefore', 5, 0, 20, 'memory', 'bible', 'L1.1.2'],
  ['memory.foundOut', -10, -30, 0, 'memory', 'bible', 'L1.1.2'],
  // L9.2.9 team illness: the catalogue gives outbreaks per season; weeks over which one season's chance is spread.
  ['illness.seasonWeeks', 26, 1, 52, 'weeks', 'assumption', 'L9.2.9'],
  // L9.4.1 smoothing: no more than this share of a window's entries is announced on one day.
  ['portal.maxShareAnnouncedPerDay', 0.25, 0.01, 1, 'ratio', 'assumption', 'L9.4.1'],
  // L9.4.4 booster revolt.
  ['booster.grantMoodGain', 10, 0, 50, 'mood', 'bible', 'L9.4.4'],
  ['booster.tookOrdersMemory', -8, -30, 0, 'memory', 'bible', 'L9.4.4'],
  ['booster.eventMoodMin', 1, 0, 10, 'mood', 'bible', 'L9.4.4'],
  ['booster.eventMoodMax', 2, 0, 10, 'mood', 'bible', 'L9.4.4'],
  // L9.5.2 something you witnessed.
  ['witness.tellBossStanding', 1, 0, 20, 'standing', 'bible', 'L9.5.2'],
  ['witness.refuseOrderStanding', -10, -50, 0, 'standing', 'bible', 'L9.5.2'],
  ['witness.overHeadStanding', -25, -100, 0, 'standing', 'assumption', 'L9.5.2'],
  ['witness.victimMemory', 25, 0, 50, 'memory', 'bible', 'L9.5.2'],
  ['witness.wrongAccusedMemory', -10, -50, 0, 'memory', 'assumption', 'L9.5.2'],
  ['witness.wrongRecipientMemory', -3, -50, 0, 'memory', 'assumption', 'L9.5.2'],
  ['witness.lowConfidence', 0.5, 0, 1, 'probability', 'assumption', 'L9.5.2'],
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
  if (v === undefined) throw new Error(`crisis: unknown parameter ${name}`);
  return v;
}

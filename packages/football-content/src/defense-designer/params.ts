// Design constants of the defensive call designer (G-91, bible G2 and O3.2). Every value is a starting value
// a G2 leaf states (basis "bible"; the bible marks each one an Assumption or a setting) or one this module
// chose where the leaf names a quantity without a number (basis "assumption"). None is a real-world fact:
// the sourced usage facts in G2.2.1 (nickel share, dime on third and long) are calibration targets for K3
// and J15, not inputs. Rule values (hash marks, field width) are read by key (keys.ts).
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

export const MODULE = 'content.defenseDesigner';

const ROWS: readonly Row[] = [
  // G2.1.2 field/boundary fallback: ball within this distance of the midline counts as "in the middle".
  ['declare.middleBandYd', 2, 0, 20, 'yd', 'bible', 'G2.1.2'],
  // G2.2.2 starting depths.
  ['front.offBallLbDepthYd', 4.5, 1, 10, 'yd', 'bible', 'G2.2.2'],
  ['front.overhangWidthYd', 1, 0, 5, 'yd', 'bible', 'G2.2.2'],
  ['front.overhangDepthYd', 2, 0, 6, 'yd', 'bible', 'G2.2.2'],
  // Shade offset of a lineman on a blocker's shoulder, and the gap spacing: design values for the board.
  ['front.shadeYd', 0.5, 0, 1.5, 'yd', 'assumption', 'G2.2.2'],
  ['front.linemanDepthYd', 1, 0.5, 2, 'yd', 'assumption', 'G2.2.2'],
  // G2.2.3 box: defenders inside this lateral margin outside the end men and this depth.
  ['fits.boxMarginYd', 2, 0, 6, 'yd', 'assumption', 'G2.2.3'],
  ['fits.boxDepthYd', 8, 3, 12, 'yd', 'assumption', 'G2.2.3'],
  // G2.3.1 stunt timing.
  ['stunt.looperDelayS', 0.3, 0.1, 0.6, 's', 'bible', 'G2.3.1'],
  ['stunt.gapOpenWindowS', 0.5, 0, 2, 's', 'bible', 'G2.3.1'],
  ['speed.defaultYdS', 7, 3, 11, 'yd/s', 'assumption', 'G2.3.1'],
  ['speed.backpedalYdS', 5.5, 2, 9, 'yd/s', 'assumption', 'G2.4.1'],
  // G2.4.1 hole map: grid cell, depth covered, and reach of a zone defender.
  ['holes.cellYd', 3, 1, 10, 'yd', 'assumption', 'G2.4.1'],
  ['holes.maxDepthYd', 24, 5, 40, 'yd', 'assumption', 'G2.4.1'],
  ['holes.reachYd', 6, 1, 15, 'yd', 'assumption', 'G2.4.1'],
  // G2.4.2 divider (one published rule set, 1 of 3): inside the top of the numbers by ball position.
  ['divider.farHashInsideTopYd', 5, 0, 15, 'yd', 'bible', 'G2.4.2'],
  ['divider.middleInsideNumbersYd', 1, 0, 15, 'yd', 'bible', 'G2.4.2'],
  ['divider.nearHashInsideBottomYd', 0, 0, 15, 'yd', 'bible', 'G2.4.2'],
  // G2.4.3 travel corner.
  ['matchup.travelBaseS', 0.6, 0, 3, 's', 'bible', 'G2.4.3'],
  // G2.5.2 motion answer times.
  ['motion.switchS', 0.4, 0, 3, 's', 'bible', 'G2.5.2'],
  ['motion.spinS', 1.2, 0, 4, 's', 'bible', 'G2.5.2'],
  ['motion.bumpS', 0.8, 0, 3, 's', 'bible', 'G2.5.2'],
  // G2.5.3 tempo timing.
  ['tempo.callerDecisionS', 2, 0, 10, 's', 'bible', 'G2.5.3'],
  ['tempo.relayBandS', 2, 0, 10, 's', 'bible', 'G2.5.3'],
  ['tempo.relaySignalS', 3, 0, 10, 's', 'bible', 'G2.5.3'],
  ['tempo.alignS', 2, 0, 10, 's', 'bible', 'G2.5.3'],
  ['tempo.checkWithMeS', 2, 0, 10, 's', 'bible', 'G2.5.3'],
  ['tempo.repeatPenaltyZ', 0.3, 0, 2, 'z', 'bible', 'G2.5.3'],
  // G2.6.1 disguise: time the defense has before a route threatens a zone, and pre-snap time by move moment.
  ['disguise.routeThreatS', 1, 0, 4, 's', 'assumption', 'G2.6.1'],
  ['disguise.lateCadenceS', 1, 0, 4, 's', 'assumption', 'G2.6.1'],
  ['disguise.earlyS', 3, 0, 10, 's', 'assumption', 'G2.6.1'],
  // G2.7.1 teaching load warning: share of the package's knowledge capacity.
  ['validate.teachingLoadWarnShare', 0.85, 0, 2, 'ratio', 'assumption', 'G2.7.1'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g91.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf,
    constrainedBy: basis === 'bible'
      ? `${leaf} acceptance (starting value, Assumption or setting in the bible; coach review Q5)`
      : `${leaf} acceptance (module assumption where the leaf names no number; needs calibration)`,
    status: 'starting',
  })),
};

const VALUES = new Map(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value] as const));

/** Read one design constant by its short name; throws on an unknown name. */
export function param(name: string): number {
  const v = VALUES.get(name);
  if (v === undefined) throw new Error(`defense-designer: unknown parameter ${name}`);
  return v;
}

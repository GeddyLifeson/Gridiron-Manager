// Design constants of the coaching skills record (G-54: bible E9, S8). Game build plan section 2: tuning
// constants are PARAMS with basis `bible` (the leaf states the number as a starting value) or `assumption`
// (the leaf names the idea but gives no number). This module states no real-world fact and reads no
// league-rule value, so it has no fact rows and an empty RULE_KEYS.
//
// None of these numbers is a property of a coach. They are windows, thresholds on the user's own logged
// hours, and the position of the E9.1.3 case 3 constant on a caller's scale.
import type { ParamFile, RuleKeyManifest, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

export const MODULE = 'career.record';

const ROWS: readonly Row[] = [
  // E9.1.3 rule 3: the case 3 constant is the middle of the scale the AI parameter uses. Open question in the
  // leaf ("median AI coach or slightly below"): one value for everyone, starting at the middle.
  ['userTermPosition', 0.5, 0, 1, 'share of the AI scale', 'bible', 'E9.1.3'],
  // E9.3.4 outputs: `studied_film_of` is written after 10 hours on one team in a season.
  ['studiedFilmHours', 10, 1, 100, 'hours', 'bible', 'E9.3.4'],
  // E9.4.5 rule 1 (H6.6.2): a recommendation's outcome window is 4 weeks or season end.
  ['recommendationWindowDays', 28, 7, 120, 'days', 'bible', 'E9.4.5'],
  // E9.4.5 rule 1: draft and recruit grades close after the player's second season.
  ['prospectWindowSeasons', 2, 1, 5, 'seasons', 'bible', 'E9.4.5'],
  // E9.3.1 rule 2: what leaves with a coach is what he had access to for at least one full season.
  ['accessSeasonsToKeep', 1, 1, 3, 'seasons', 'bible', 'E9.3.1'],
  // E9.1.2 "Your record" tab: the leaf's example line uses 3 seasons; the tab lets the user choose a window.
  ['defaultWindowSeasons', 3, 1, 40, 'seasons', 'assumption', 'E9.1.2'],
  // E9.1.2 / E9.4.3: a season-year has this many day slots, matching the label engine (N2.8).
  ['daysPerSeasonYear', 365, 360, 366, 'days', 'assumption', 'E9.1.2'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g54.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf,
    constrainedBy: basis === 'bible' ? `${leaf} acceptance (bible starting value, needs research)` : `${leaf} acceptance (assumption, needs research)`,
    status: 'starting',
  })),
};

const VALUES = new Map(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value] as const));

/** Read one design constant by its short name; throws on an unknown name. */
export function param(name: string): number {
  const v = VALUES.get(name);
  if (v === undefined) throw new Error(`record: unknown parameter ${name}`);
  return v;
}

/** This module reads no league or college rule value (game build plan section 2). */
export const RULE_KEYS: RuleKeyManifest = [];

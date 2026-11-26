// Design constants of the game plan and call sheet module (G-68, game build plan section 2). Every value
// is a starting value a G6 or G7 leaf states (basis "bible"; the bible marks each one an Assumption or a
// tuning knob) or one this module chose where the leaf names a quantity without a number (basis
// "assumption"). None is a real-world fact: the sourced G6 and G7 facts (sheet sizes, script lengths, calls
// per box) anchor these knobs. The one real-world table, expected snaps by situation (G7.2.3), lives in
// reference.ts with its source and status.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

export const MODULE = 'content.gameplan';

const ROWS: readonly Row[] = [
  // G6.1.1 looks board.
  ['looks.wilsonZ', 1.2815515655446004, 0, 4, 'z', 'bible', 'G6.1.1'], // two-sided 80% interval
  ['looks.countsOnlyBelow', 5, 1, 50, 'plays', 'bible', 'G6.1.1'],
  ['looks.recentGames', 4, 1, 20, 'games', 'bible', 'G6.1.1'],
  ['looks.recentWeight', 1, 0, 5, 'ratio', 'assumption', 'G6.1.1'],
  ['looks.olderWeight', 0.5, 0, 5, 'ratio', 'assumption', 'G6.1.1'],
  ['looks.callerHistoryWeight', 0.3, 0, 1, 'ratio', 'assumption', 'G6.1.1'],
  // G6.1.2 themes.
  ['themes.min', 3, 0, 20, 'themes', 'bible', 'G6.1.2'],
  ['themes.max', 5, 1, 20, 'themes', 'bible', 'G6.1.2'],
  // G6.2.1 menu stages.
  ['menu.cull', 100, 1, 1000, 'plays', 'bible', 'G6.2.1'],
  ['menu.practicedMin', 30, 1, 500, 'plays', 'bible', 'G6.2.1'],
  ['menu.practicedMax', 60, 1, 500, 'plays', 'bible', 'G6.2.1'],
  ['menu.thirdDownCallsMin', 2, 0, 50, 'calls', 'bible', 'G6.2.1'],
  ['menu.thirdDownCallsMax', 6, 0, 50, 'calls', 'bible', 'G6.2.1'],
  ['menu.normalDownCallsMin', 6, 0, 50, 'calls', 'bible', 'G6.2.1'],
  ['menu.normalDownCallsMax', 10, 0, 50, 'calls', 'bible', 'G6.2.1'],
  ['menu.unansweredRate', 0.2, 0, 1, 'ratio', 'assumption', 'G6.2.1'],
  // G6.2.2 new for this week.
  ['install.newShareMax', 0.2, 0, 1, 'ratio', 'bible', 'G6.2.2'],
  ['install.newPlaysMax', 8, 0, 100, 'plays', 'bible', 'G6.2.2'],
  ['install.knownConceptShare', 1 / 3, 0, 1, 'ratio', 'bible', 'G6.2.2'],
  // G6.2.3 sequences.
  ['sequence.minCalls', 2, 2, 10, 'calls', 'bible', 'G6.2.3'],
  ['sequence.maxCalls', 4, 2, 10, 'calls', 'bible', 'G6.2.3'],
  // G6.3.1 matchups.
  ['matchup.thinSeen', 3, 1, 50, 'times', 'bible', 'G6.3.1'],
  // G6.3.2 protection.
  ['protection.maxRushers', 3, 0, 20, 'players', 'bible', 'G6.3.2'],
  ['protection.maxPressures', 6, 0, 50, 'pressures', 'bible', 'G6.3.2'],
  // G6.4.1 defensive menu.
  ['defense.normalDownMin', 3, 0, 50, 'calls', 'bible', 'G6.4.1'],
  ['defense.normalDownMax', 6, 0, 50, 'calls', 'bible', 'G6.4.1'],
  ['defense.thirdDownPerBucket', 2, 0, 50, 'calls', 'bible', 'G6.4.1'],
  ['defense.scoringAreaMin', 3, 0, 50, 'calls', 'bible', 'G6.4.1'],
  ['defense.scoringAreaMax', 5, 0, 50, 'calls', 'bible', 'G6.4.1'],
  // G6.4.2 emphasis dials.
  ['emphasis.steps', 2, 1, 5, 'steps', 'bible', 'G6.4.2'],
  ['emphasis.unpracticedShare', 0.5, 0, 1, 'ratio', 'bible', 'G6.4.2'],
  // G6.5.2 contingencies.
  ['contingency.maxPerSide', 4, 0, 20, 'plans', 'bible', 'G6.5.2'],
  ['contingency.rainChance', 0.4, 0, 1, 'probability', 'bible', 'G6.5.2'],
  ['contingency.windMph', 20, 0, 80, 'mph', 'bible', 'G6.5.2'],
  ['contingency.defaultRepsPerCall', 2, 0, 20, 'reps', 'assumption', 'G6.5.2'],
  // G7.1.2 layout.
  ['layout.cols', 24, 1, 100, 'cells', 'bible', 'O3.4.2'],
  ['layout.rows', 16, 1, 100, 'cells', 'bible', 'O3.4.2'],
  ['layout.pageLongIn', 17, 1, 40, 'in', 'bible', 'G7.1.2'],
  ['layout.pageShortIn', 11, 1, 40, 'in', 'bible', 'G7.1.2'],
  ['layout.minTextPt', 7, 1, 30, 'pt', 'bible', 'G7.1.2'],
  ['layout.lineSpacing', 1.2, 1, 3, 'ratio', 'assumption', 'G7.1.2'],
  ['layout.denseEntries', 120, 1, 1000, 'entries', 'bible', 'G7.1.2'],
  ['layout.tooDenseEntries', 200, 1, 1000, 'entries', 'bible', 'G7.1.2'],
  ['layout.maxPresses', 3, 1, 5, 'presses', 'bible', 'G7.1.2'],
  // G7.2.2 catalogue.
  ['catalogue.coverShare', 0.8, 0, 1, 'ratio', 'bible', 'G7.2.2'],
  ['catalogue.tier1Snaps', 3, 0, 60, 'snaps', 'bible', 'G7.2.2'],
  ['catalogue.tier2Snaps', 0.5, 0, 60, 'snaps', 'bible', 'G7.2.2'],
  // G7.2.3 expected snaps.
  ['snaps.teamMinGames', 4, 1, 20, 'games', 'bible', 'G7.2.3'],
  ['snaps.deepFactor', 3, 1, 10, 'ratio', 'bible', 'G7.2.3'],
  ['snaps.deepPlus', 2, 0, 10, 'entries', 'bible', 'G7.2.3'],
  // G7.3.2 reduction.
  ['size.repRatio', 1, 0.1, 10, 'ratio', 'bible', 'G7.3.2'],
  ['size.sheetMin', 80, 1, 1000, 'calls', 'bible', 'G7.3.2'],
  ['size.sheetMax', 150, 1, 1000, 'calls', 'bible', 'G7.3.2'],
  ['size.boxScanMax', 12, 1, 100, 'entries', 'bible', 'G7.3.2'],
  ['size.tier1BoxMin', 2, 0, 20, 'entries', 'bible', 'G7.3.2'],
  ['size.qbDislikePenalty', 0.03, 0, 1, 'ratio', 'bible', 'G7.3.2'],
  // G7.4 scripts.
  ['script.target', 15, 1, 60, 'calls', 'bible', 'G7.4.1'],
  ['script.warnBelow', 8, 1, 60, 'calls', 'bible', 'G7.4.1'],
  ['script.warnAbove', 30, 1, 60, 'calls', 'bible', 'G7.4.1'],
  ['script.secondHalfMin', 3, 0, 20, 'calls', 'bible', 'G7.4.2'],
  ['script.secondHalfMax', 5, 0, 20, 'calls', 'bible', 'G7.4.2'],
  // G7.5.1 must-calls.
  ['must.touchMin', 3, 0, 40, 'touches', 'bible', 'G7.5.1'],
  ['must.touchMax', 8, 0, 40, 'touches', 'bible', 'G7.5.1'],
  ['must.lateFourthS', 480, 0, 900, 's', 'bible', 'G7.5.1'],
  // G7.5.3 head coach card.
  ['card.readS', 1, 0, 10, 's', 'bible', 'G7.5.3'],
  ['card.kneelPlayS', 2, 0, 10, 's', 'assumption', 'G7.5.3'],
  ['card.snapMarginS', 1, 0, 10, 's', 'assumption', 'G7.5.3'],
  ['card.fieldGoalLineMake', 0.5, 0, 1, 'probability', 'assumption', 'G7.5.3'],
  // G7.6.2 audibles.
  ['audible.max', 6, 0, 30, 'calls', 'bible', 'G7.6.2'],
  // G7.7 defensive and special teams sheets.
  ['dsheet.stressLine', 0.4, 0, 1, 'ratio', 'bible', 'G7.7.1'],
  ['dsheet.stressMinSnaps', 4, 1, 50, 'snaps', 'bible', 'G7.7.1'],
  ['stsheet.alertsMax', 5, 0, 30, 'lines', 'bible', 'G7.7.2'],
  ['stsheet.fakesPerUnit', 2, 0, 10, 'calls', 'bible', 'G7.7.2'],
  // G7.8.1 versions.
  ['version.backupReadiness', 60, 0, 100, 'readiness', 'bible', 'G7.8.1'],
  ['version.backupMinCalls', 20, 0, 200, 'calls', 'bible', 'G7.8.1'],
  // G7.9.1 review.
  ['review.lowReadiness', 50, 0, 100, 'readiness', 'assumption', 'G7.9.1'],
  ['review.tellMinEntries', 3, 1, 50, 'entries', 'assumption', 'G7.9.1'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g68.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf,
    constrainedBy: basis === 'bible'
      ? `${leaf} acceptance (starting value, Assumption in the bible; coach review Q5)`
      : `${leaf} acceptance (module assumption where the leaf names no number; needs calibration)`,
    status: 'starting',
  })),
};

const VALUES = new Map(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value] as const));

/** Read one design constant by its short name; throws on an unknown name. */
export function param(name: string): number {
  const v = VALUES.get(name);
  if (v === undefined) throw new Error(`gameplan: unknown parameter ${name}`);
  return v;
}

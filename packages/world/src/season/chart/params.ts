// Tuning constants of the scripted chart caller (contract decision D-20, D-09). The chart caller stands
// in for coach AI (K4, K5) until phase 5 so the phase 1 gate can run 10,000 games. None of these numbers
// is a real-world fact: every one is `basis: 'assumption'`, a starting mix a module author chose, and
// names the J15 or T12 decision-rate rows that will judge it. The rows they name are themselves
// provisional (1 of 3 or 2 of 3), so fitting the chart to them proves nothing about real coaches; the
// chart only has to produce a plausible play mix for outcome rows to be measured against.
import type { ParamFile, TuningParam } from '@gm/schema';

const p = (name: string, value: number, min: number, max: number, unit: string, leaf: string, constrainedBy: string): TuningParam => ({
  name, value, min, max, unit, belongsTo: 'calibration.chart', basis: 'assumption', leaf, constrainedBy, status: 'starting',
});

/**
 * Share of plays that are pass plays (attempts and sacks; scrambles count as runs) by down and whole yards to go
 * (1 to 2, 3 to 5, 6 to 9, 10, 11 to 15, 16 and over), measured from nflverse play-by-play, regular seasons 2022 to
 * 2024 (100,820 pass and run plays; computed by the project, research/tuning/down-distance.md; 1 of 3).
 */
export const PASS_DOWN_NAMES = ['d1', 'd2', 'd3', 'd4'] as const;
export const PASS_TOGO_NAMES = ['t1_2', 't3_5', 't6_9', 't10', 't11_15', 't16'] as const;
export const PASS_TOGO_UPPER = [2, 5, 9, 10, 15] as const;
const PASS_SHARE: readonly (readonly number[])[] = [
  [0.254, 0.346, 0.344, 0.481, 0.607, 0.754],
  [0.338, 0.460, 0.622, 0.659, 0.764, 0.794],
  [0.381, 0.810, 0.878, 0.900, 0.866, 0.805],
  [0.383, 0.873, 0.893, 0.966, 0.867, 0.937],
];

/**
 * How the score and the quarter move the run-pass mix: pass plays called over the pass plays the down-and-distance
 * table expects, same source and seasons. Rows are the first and third quarters, the second quarter, and the fourth
 * quarter; columns are the offense's margin (17 or more behind, 9 to 16 behind, 4 to 8 behind, within 3, 4 to 8
 * ahead, 9 to 16 ahead, 17 or more ahead). Overtime reads the fourth-quarter row.
 */
export const PASS_PHASE_NAMES = ['q13', 'q2', 'q4'] as const;
export const PASS_MARGIN_NAMES = ['behind17', 'behind9', 'behind4', 'within3', 'ahead4', 'ahead9', 'ahead17'] as const;
/** Upper edge of each margin column but the last, inclusive, in points. */
export const PASS_MARGIN_UPPER = [-17, -9, -4, 3, 8, 16] as const;
const PASS_GAME_RATIO: readonly (readonly number[])[] = [
  [1.104, 0.980, 0.958, 0.948, 0.936, 0.915, 0.864],
  [1.217, 1.096, 1.048, 1.037, 1.071, 1.064, 1.110],
  [1.291, 1.360, 1.183, 0.973, 0.714, 0.600, 0.480],
];

/**
 * Fourth-down go shares measured from nflverse play-by-play, regular seasons 2022 to 2024 (11,776 fourth downs that
 * ended in a run, pass, punt or field goal try; computed by the project, research/tuning/fourth-down.md; 1 of 3).
 * Rows are yards from the goal line (1 to 3, 4 to 10, 11 to 20, 21 to 30, 31 to 37, 38 to 45, 46 to 50, 51 to 60,
 * 61 to 70, 71 and over); columns are whole yards to go (1, 2, 3, 4 to 5, 6 to 10, 11 and over). A cell that cannot
 * happen (more to go than the goal line allows) is 0. The chart reads the cell as its chance of going for it.
 */
export const FOURTH_ZONE_NAMES = ['z1_3', 'z4_10', 'z11_20', 'z21_30', 'z31_37', 'z38_45', 'z46_50', 'z51_60', 'z61_70', 'z71'] as const;
export const FOURTH_ZONE_UPPER = [3, 10, 20, 30, 37, 45, 50, 60, 70] as const;
export const FOURTH_TOGO_NAMES = ['t1', 't2', 't3', 't4_5', 't6_10', 't11'] as const;
export const FOURTH_TOGO_UPPER = [1, 2, 3, 5, 10] as const;
const FOURTH_GO: readonly (readonly number[])[] = [
  [0.91, 0.51, 0.36, 0, 0, 0],
  [0.75, 0.58, 0.25, 0.15, 0.11, 0],
  [0.78, 0.44, 0.21, 0.13, 0.07, 0.07],
  [0.77, 0.51, 0.29, 0.19, 0.11, 0.06],
  [0.91, 0.54, 0.48, 0.24, 0.13, 0.09],
  [0.92, 0.76, 0.65, 0.52, 0.16, 0.08],
  [0.82, 0.57, 0.34, 0.18, 0.11, 0.11],
  [0.66, 0.29, 0.14, 0.12, 0.09, 0.09],
  [0.43, 0.14, 0.11, 0.08, 0.07, 0.05],
  [0.17, 0.08, 0.08, 0.07, 0.04, 0.03],
];

export const PARAMS: ParamFile = {
  module: 'calibration.chart',
  version: '1',
  params: [
    // Run or pass by down and distance: `PASS_SHARE` below, times one scale fitted to the league pass-play share
    // (J15.3.2 situation.dropbackShare 57.6%). A called pass that ends in a scramble counts as a run in the table.
    ...PASS_DOWN_NAMES.flatMap((d, di) => PASS_TOGO_NAMES.map((t, ti) => p(`chart.passShare.${d}.${t}`, PASS_SHARE[di]![ti]!, 0, 1, 'share', 'J15.3.2', 'situation.passPlayShare'))),
    p('chart.passShare.scale', 1.091, 0.5, 2, 'ratio', 'J15.3.2', 'situation.passPlayShare'),
    // Score and quarter: `PASS_GAME_RATIO` below multiplies the down-and-distance share.
    ...PASS_PHASE_NAMES.flatMap((ph, pi) => PASS_MARGIN_NAMES.map((m, mi) => p(`chart.passShare.game.${ph}.${m}`, PASS_GAME_RATIO[pi]![mi]!, 0, 3, 'ratio', 'J15.3.2', 'situation.neutralPassRate'))),
    // Near the goal line offenses run more: 25% of plays snapped at the 1 and 43% at the 2 are passes
    // (nflverse 2022 to 2024, computed by the project; 1 of 3). These replace the down-and-distance share there.
    p('chart.passShare.goalLine1', 0.25, 0, 1, 'share', 'J15.5.1', 'rush.touchdownPerCarry'),
    p('chart.passShare.goalLine2', 0.43, 0, 1, 'share', 'J15.5.1', 'rush.touchdownPerCarry'),
    // Pass play family mix, shares of pass calls (J15.8.1 rows)
    p('chart.pass.playActionShare', 0.208, 0, 1, 'share', 'J15.8.1', 'scheme.playActionShare'),
    p('chart.pass.screenShare', 0.0929, 0, 1, 'share', 'J15.8.1', 'scheme.screenShareOfAttempts'),
    p('chart.pass.quickShare', 0.3, 0, 1, 'share', 'J15.8.1', 'pass.airYardsPerAttempt'),
    p('chart.pass.rpoShare', 0.0543, 0, 1, 'share', 'J15.8.1', 'scheme.rpoShareOfPassPlays'),
    p('chart.shotgunShare', 0.699, 0, 1, 'share', 'J15.3.2', 'situation.shotgunShare'),
    // Motion before the snap (J15.8.1: 41.6% of pass plays, 44% of all plays, which leaves 47.3% of runs)
    p('chart.motion.passShare', 0.416, 0, 1, 'share', 'J15.8.1', 'scheme.motion.shareOfPasses'),
    p('chart.motion.runShare', 0.473, 0, 1, 'share', 'J15.8.1', 'scheme.motion.shareOfPlays'),
    // Tempo. Shares read from nflverse 2022 to 2024 (engine-game flow/pace-facts.json): no-huddle is 0.08 of plays outside
    // the last two minutes of a half and outside a late deficit, 0.29 when trailing by nine or more in the fourth quarter;
    // inside two minutes 0.68 of first-half plays and 0.78 to 0.90 of plays by a trailing team come with no huddle.
    p('chart.noHuddleShare', 0.0747, 0, 1, 'share', 'J15.3.2', 'situation.noHuddleShare'),
    p('chart.noHuddle.trailingLateShare', 0.3, 0, 1, 'share', 'J15.3.2', 'situation.noHuddleShare'),
    p('chart.noHuddle.trailingLateMargin', 9, 1, 40, 'points', 'J15.3.2', 'situation.noHuddleShare'),
    p('chart.hurry.clockTenths', 1200, 0, 9000, 'tenths_s', 'J15.3.2', 'game.scrimmagePlays'),
    p('chart.hurry.share', 0.75, 0, 1, 'share', 'J15.3.2', 'situation.noHuddleShare'),
    // Charged timeouts with the clock running late in a half (J15.2.1 game.timeoutsUsed)
    p('chart.timeout.clockTenths', 1200, 0, 9000, 'tenths_s', 'J15.2.1', 'game.timeoutsUsed'),
    p('chart.timeout.offenseShare', 0.819, 0, 1, 'share', 'J15.2.1', 'game.timeoutsUsed'),
    p('chart.timeout.defenseTrailingShare', 1, 0, 1, 'share', 'J15.2.1', 'game.timeoutsUsed'),
    p('chart.timeout.defenseFirstHalfShare', 0.409, 0, 1, 'share', 'J15.2.1', 'game.timeoutsUsed'),
    // Personnel (J15.8.1 scheme.personnelShare rows); the remainder after these is 11 personnel
    p('chart.personnel.p12', 0.235, 0, 1, 'share', 'J15.8.1', 'scheme.personnelShare(12)'),
    p('chart.personnel.p21', 0.063, 0, 1, 'share', 'J15.8.1', 'scheme.personnelShare(21)'),
    p('chart.personnel.p13', 0.037, 0, 1, 'share', 'J15.8.1', 'scheme.personnelShare(13)'),
    p('chart.personnel.p22', 0.02, 0, 1, 'share', 'J15.8.1', 'scheme.personnelShare(22)'),
    p('chart.personnel.p10', 0.008, 0, 1, 'share', 'J15.8.1', 'scheme.personnelShare(10)'),
    // Run direction (J15.5.1 rush.directionShare rows); right takes the remainder
    p('chart.run.leftShare', 0.38, 0, 1, 'share', 'J15.5.1', 'rush.directionShare(left)'),
    p('chart.run.middleShare', 0.256, 0, 1, 'share', 'J15.5.1', 'rush.directionShare(middle)'),
    // Fourth down (J15.3.2 situation.fourthDown.* rows; T12.4.1 for college)
    // Share of fourth downs on which the offense goes for it, by field zone and yards to go: `FOURTH_GO` below.
    ...FOURTH_ZONE_NAMES.flatMap((z, zi) => FOURTH_TOGO_NAMES.map((t, ti) => p(`chart.fourth.go.${z}.${t}`, FOURTH_GO[zi]![ti]!, 0, 1, 'share', 'J15.3.2', 'situation.fourthDown.share(go)'))),
    // When it does not go: a field goal up to the sure distance, a falling share of field goals from there to the
    // longest distance tried, and otherwise a punt (or a go from where a punt gains nothing).
    // One scale on the table, fitted to the league go share (J15.3.2 19.4%): the chart also goes when trailing late.
    p('chart.fourth.goScale', 0.853, 0, 2, 'ratio', 'J15.3.2', 'situation.fourthDown.share(go)'),
    p('chart.fourth.fieldGoalSureKickYd', 54.5, 20, 70, 'yd', 'J15.6.1', 'situation.fourthDown.share(fieldGoal)'),
    p('chart.fourth.fieldGoalMaxKickYd', 61, 20, 75, 'yd', 'J15.6.1', 'decision.fieldGoalAttempts50plusPerGame'),
    p('chart.fourth.puntMinYardsToGoal', 36, 0, 100, 'yd', 'J15.3.2', 'situation.fourthDown.share(punt)'),
    p('chart.fourth.trailingLateGoShare', 0.71, 0, 1, 'share', 'J15.3.2', 'situation.fourthDown.share(go)'),
    // Line of scrimmage to kick distance: the play-by-play convention of J9.4.1 (snap plus hold depth plus end zone).
    { name: 'chart.fourth.kickDistanceAddYd', value: 17, min: 17, max: 17, unit: 'yd', belongsTo: 'calibration.chart', basis: 'bible', leaf: 'J9.4.1', constrainedBy: 'kick.fieldGoalPct(0,99)', status: 'frozen' },
    p('chart.fourth.trailingLateTenths', 3000, 0, 9000, 'tenths_s', 'J15.3.2', 'situation.fourthDown.share(go)'),
    // Tries and kickoffs
    p('chart.try.twoPointShare', 0.0985, 0, 1, 'share', 'J15.6.1', 'game.twoPointAttempts'),
    p('chart.onside.trailingLateTenths', 1800, 0, 9000, 'tenths_s', 'J15.6.1', 'game.kickoffs'),
    // Kneel-downs: leading in the last period with this little clock left
    p('chart.kneel.clockTenths', 1200, 0, 9000, 'tenths_s', 'J15.3.2', 'game.scrimmagePlays'),
    // Defense (J15.8.1 coverage shares, J15.4.2 rusher counts); cover 3 and 4 rushers take the remainder
    p('chart.cover.cover1', 0.31, 0, 1, 'share', 'J15.8.1', 'scheme.coverageShare(cover1)'),
    p('chart.cover.cover2', 0.17, 0, 1, 'share', 'J15.8.1', 'scheme.coverageShare(cover2)'),
    p('chart.cover.cover4', 0.11, 0, 1, 'share', 'J15.8.1', 'scheme.coverageShare(cover4)'),
    p('chart.cover.cover0', 0.06, 0, 1, 'share', 'J15.8.1', 'scheme.coverageShare(cover1)'),
    p('chart.cover.cover6', 0.09, 0, 1, 'share', 'J15.8.1', 'scheme.coverageShare(cover4)'),
    p('chart.cover.twoMan', 0.04, 0, 1, 'share', 'J15.8.1', 'scheme.coverageShare(cover1)'),
    p('chart.rush.three', 0.06, 0, 1, 'share', 'J15.4.2', 'pressure.byRushers.pressureRate(3,3)'),
    p('chart.rush.five', 0.2, 0, 1, 'share', 'J15.4.2', 'pressure.byRushers.pressureRate(5,5)'),
    p('chart.rush.six', 0.05, 0, 1, 'share', 'J15.4.2', 'pressure.byRushers.pressureRate(6,6)'),
    p('chart.rush.seven', 0.01, 0, 1, 'share', 'J15.4.2', 'pressure.byRushers.pressureRate(7,11)'),
    // Box count: six, eight and nine take these shares and seven the remainder. The mix is the reference resolver's
    // `resolverRef.run.boxShare.*` (the real mix of boxes on runs its by-box shift is centred on), so the two agree.
    p('chart.box.six', 0.4666, 0, 1, 'share', 'J15.5.1', 'rush.byBox.yardsPerCarry(6)'),
    p('chart.box.eight', 0.1389, 0, 1, 'share', 'J15.5.1', 'rush.byBox.yardsPerCarry(8)'),
    p('chart.box.nine', 0.0371, 0, 1, 'share', 'J15.5.1', 'rush.byBox.yardsPerCarry(9)'),
  ],
};

/**
 * College tables in the same shapes as the pro ones above, computed from cfbfastR play-by-play (CFBD-sourced), FBS
 * against FBS, regular seasons 2022 to 2025 (2,998 games, 396,263 run and pass plays, 45,949 fourth downs), by
 * research/tuning/college/cfbfastr_tables.py; 1 of 3. Plays follow the T12.3.1 pass.rate definition (rush or pass, no
 * kneels, spikes or no-plays). Fourth-down cells with fewer than ten plays are cells that cannot happen and read 0, as
 * in the pro table.
 */
const COLLEGE_PASS_SHARE: readonly (readonly number[])[] = [
  [0.129, 0.256, 0.289, 0.448, 0.476, 0.563],
  [0.293, 0.386, 0.514, 0.536, 0.624, 0.664],
  [0.209, 0.627, 0.772, 0.805, 0.787, 0.703],
  [0.267, 0.799, 0.862, 0.877, 0.855, 0.862],
];
const COLLEGE_PASS_GAME_RATIO: readonly (readonly number[])[] = [
  [1.068, 1.024, 0.994, 0.977, 0.948, 0.937, 0.911],
  [1.152, 1.099, 1.070, 1.036, 1.025, 1.028, 1.105],
  [1.208, 1.376, 1.189, 0.959, 0.657, 0.542, 0.522],
];
const COLLEGE_FOURTH_GO: readonly (readonly number[])[] = [
  [0.94, 0.65, 0.58, 0, 0, 0],
  [0.84, 0.62, 0.29, 0.20, 0.13, 0],
  [0.83, 0.60, 0.39, 0.26, 0.12, 0.11],
  [0.90, 0.71, 0.52, 0.35, 0.17, 0.10],
  [0.97, 0.87, 0.81, 0.68, 0.42, 0.19],
  [0.96, 0.86, 0.69, 0.56, 0.31, 0.15],
  [0.89, 0.67, 0.47, 0.36, 0.14, 0.09],
  [0.76, 0.36, 0.20, 0.16, 0.10, 0.07],
  [0.55, 0.19, 0.12, 0.09, 0.07, 0.05],
  [0.29, 0.10, 0.07, 0.05, 0.05, 0.04],
];
/** Fitted on 4,000 college games so the measured pass rate and fourth-down go rate land on T12.3.1 and T12.4.1 (Assumptions). */
const COLLEGE_PASS_SCALE = 1.03;
const COLLEGE_GO_SCALE = 0.853;

function collegeChart(): Record<string, number> {
  const out: Record<string, number> = {};
  PASS_DOWN_NAMES.forEach((d, di) => PASS_TOGO_NAMES.forEach((t, ti) => { out[`chart.passShare.${d}.${t}`] = COLLEGE_PASS_SHARE[di]![ti]!; }));
  PASS_PHASE_NAMES.forEach((ph, pi) => PASS_MARGIN_NAMES.forEach((m, mi) => { out[`chart.passShare.game.${ph}.${m}`] = COLLEGE_PASS_GAME_RATIO[pi]![mi]!; }));
  FOURTH_ZONE_NAMES.forEach((z, zi) => FOURTH_TOGO_NAMES.forEach((t, ti) => { out[`chart.fourth.go.${z}.${t}`] = COLLEGE_FOURTH_GO[zi]![ti]!; }));
  out['chart.passShare.scale'] = COLLEGE_PASS_SCALE;
  out['chart.fourth.goScale'] = COLLEGE_GO_SCALE;
  return out;
}

/**
 * Chart values that differ by level. College offenses play faster: the college snap-to-snap gap after an in-bounds
 * play averages 33.3 s against 37.3 s in the pro game (cfbfastR 2023 to 2024, nflverse 2022 to 2024). No source
 * charts college no-huddle plays, so the share is the mix of the two pro tempo gaps that gives the college mean:
 * an Assumption (engine-game flow/pace-facts.json). College run-pass mix and fourth-down choices read the college
 * tables above.
 */
export const CHART_LEVEL_OVERRIDES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  college: { ...collegeChart(), 'chart.noHuddleShare': 0.6, 'chart.noHuddle.trailingLateShare': 0.75 },
};

/** The chart overrides of a run: the level's values, then every `chart.*` name of the run's own overrides (CR-G87-5). */
export function chartOverrides(level: string, overrides: Readonly<Record<string, number>> = {}): Record<string, number> {
  const out: Record<string, number> = { ...(CHART_LEVEL_OVERRIDES[level] ?? {}) };
  for (const [k, v] of Object.entries(overrides)) if (k.startsWith('chart.')) out[k] = v;
  return out;
}

/** Parameter lookup for the chart, with optional overrides (a tuning run passes its own values). */
export function chartParams(overrides: Readonly<Record<string, number>> = {}): (name: string) => number {
  const table = new Map(PARAMS.params.map((x) => [x.name, x.value]));
  for (const [k, v] of Object.entries(overrides)) {
    if (!table.has(k)) throw new Error(`unknown chart parameter ${k}`);
    table.set(k, v);
  }
  return (name: string) => {
    const v = table.get(name);
    if (v === undefined) throw new Error(`unknown chart parameter ${name}`);
    return v;
  };
}

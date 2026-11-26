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

export const PARAMS: ParamFile = {
  module: 'calibration.chart',
  version: '1',
  params: [
    // Run or pass by down and distance (J15.3.2 rows situation.passPlayShare, situation.firstAnd10.*)
    p('chart.passShare.down1', 0.5, 0, 1, 'share', 'J15.3.2', 'situation.firstAnd10PassRate.dropbacks'),
    p('chart.passShare.down2Short', 0.45, 0, 1, 'share', 'J15.3.2', 'situation.passPlayShare'),
    p('chart.passShare.down2Long', 0.62, 0, 1, 'share', 'J15.3.2', 'situation.passPlayShare'),
    p('chart.passShare.down3Short', 0.45, 0, 1, 'share', 'J15.3.2', 'situation.passPlayShare'),
    p('chart.passShare.down3Long', 0.88, 0, 1, 'share', 'J15.3.2', 'situation.passPlayShare'),
    p('chart.passShare.down4Short', 0.45, 0, 1, 'share', 'J15.3.2', 'situation.passPlayShare'),
    p('chart.passShare.down4Long', 0.85, 0, 1, 'share', 'J15.3.2', 'situation.passPlayShare'),
    p('chart.shortYardsToGo', 3, 1, 10, 'yd', 'J15.3.2', 'situation.conversion(3,1,2)'),
    // Pass play family mix, shares of pass calls (J15.8.1 rows)
    p('chart.pass.playActionShare', 0.22, 0, 1, 'share', 'J15.8.1', 'scheme.playActionShare'),
    p('chart.pass.screenShare', 0.09, 0, 1, 'share', 'J15.8.1', 'scheme.screenShareOfAttempts'),
    p('chart.pass.quickShare', 0.3, 0, 1, 'share', 'J15.8.1', 'pass.airYardsPerAttempt'),
    p('chart.pass.rpoShare', 0.05, 0, 1, 'share', 'J15.8.1', 'scheme.rpoShareOfPassPlays'),
    p('chart.shotgunShare', 0.65, 0, 1, 'share', 'J15.3.2', 'situation.shotgunShare'),
    // Tempo. Shares read from nflverse 2022 to 2024 (engine-game flow/pace-facts.json): no-huddle is 0.08 of plays outside
    // the last two minutes of a half and outside a late deficit, 0.29 when trailing by nine or more in the fourth quarter;
    // inside two minutes 0.68 of first-half plays and 0.78 to 0.90 of plays by a trailing team come with no huddle.
    p('chart.noHuddleShare', 0.07, 0, 1, 'share', 'J15.3.2', 'situation.noHuddleShare'),
    p('chart.noHuddle.trailingLateShare', 0.3, 0, 1, 'share', 'J15.3.2', 'situation.noHuddleShare'),
    p('chart.noHuddle.trailingLateMargin', 9, 1, 40, 'points', 'J15.3.2', 'situation.noHuddleShare'),
    p('chart.hurry.clockTenths', 1200, 0, 9000, 'tenths_s', 'J15.3.2', 'game.scrimmagePlays'),
    p('chart.hurry.share', 0.75, 0, 1, 'share', 'J15.3.2', 'situation.noHuddleShare'),
    // Charged timeouts with the clock running late in a half (J15.2.1 game.timeoutsUsed)
    p('chart.timeout.clockTenths', 1200, 0, 9000, 'tenths_s', 'J15.2.1', 'game.timeoutsUsed'),
    p('chart.timeout.offenseShare', 0.5, 0, 1, 'share', 'J15.2.1', 'game.timeoutsUsed'),
    p('chart.timeout.defenseTrailingShare', 1, 0, 1, 'share', 'J15.2.1', 'game.timeoutsUsed'),
    p('chart.timeout.defenseFirstHalfShare', 0.25, 0, 1, 'share', 'J15.2.1', 'game.timeoutsUsed'),
    // Personnel (J15.8.1 scheme.personnelShare rows); the remainder after these is 11 personnel
    p('chart.personnel.p12', 0.2, 0, 1, 'share', 'J15.8.1', 'scheme.personnelShare(12)'),
    p('chart.personnel.p21', 0.07, 0, 1, 'share', 'J15.8.1', 'scheme.personnelShare(21)'),
    p('chart.personnel.p13', 0.05, 0, 1, 'share', 'J15.8.1', 'scheme.personnelShare(13)'),
    p('chart.personnel.p22', 0.03, 0, 1, 'share', 'J15.8.1', 'scheme.personnelShare(22)'),
    p('chart.personnel.p10', 0.02, 0, 1, 'share', 'J15.8.1', 'scheme.personnelShare(10)'),
    // Run direction (J15.5.1 rush.directionShare rows); right takes the remainder
    p('chart.run.leftShare', 0.38, 0, 1, 'share', 'J15.5.1', 'rush.directionShare(left)'),
    p('chart.run.middleShare', 0.24, 0, 1, 'share', 'J15.5.1', 'rush.directionShare(middle)'),
    // Fourth down (J15.3.2 situation.fourthDown.* rows; T12.4.1 for college)
    p('chart.fourth.goMaxYardsToGo', 2, 0, 10, 'yd', 'J15.3.2', 'situation.fourthDown.goRate(0,2)'),
    p('chart.fourth.goMaxYardsToGoal', 60, 0, 100, 'yd', 'J15.3.2', 'situation.fourthDown.share(go)'),
    p('chart.fourth.fieldGoalMaxKickYd', 55, 20, 70, 'yd', 'J15.6.1', 'situation.fourthDown.share(fieldGoal)'),
    p('chart.fourth.puntMinYardsToGoal', 40, 0, 100, 'yd', 'J15.3.2', 'situation.fourthDown.share(punt)'),
    // Line of scrimmage to kick distance: the play-by-play convention of J9.4.1 (snap plus hold depth plus end zone).
    { name: 'chart.fourth.kickDistanceAddYd', value: 17, min: 17, max: 17, unit: 'yd', belongsTo: 'calibration.chart', basis: 'bible', leaf: 'J9.4.1', constrainedBy: 'kick.fieldGoalPct(0,99)', status: 'frozen' },
    p('chart.fourth.goShortShare', 0.6, 0, 1, 'share', 'J15.3.2', 'situation.fourthDown.goRate(0,2)'),
    p('chart.fourth.trailingLateTenths', 3000, 0, 9000, 'tenths_s', 'J15.3.2', 'situation.fourthDown.share(go)'),
    // Tries and kickoffs
    p('chart.try.twoPointShare', 0.08, 0, 1, 'share', 'J15.6.1', 'game.twoPointAttempts'),
    p('chart.onside.trailingLateTenths', 1800, 0, 9000, 'tenths_s', 'J15.6.1', 'game.kickoffs'),
    // Kneel-downs: leading in the last period with this little clock left
    p('chart.kneel.clockTenths', 1200, 0, 9000, 'tenths_s', 'J15.3.2', 'game.scrimmagePlays'),
    // Defense (J15.8.1 coverage shares, J15.4.2 rusher counts); cover 3 and 4 rushers take the remainder
    p('chart.cover.cover1', 0.3, 0, 1, 'share', 'J15.8.1', 'scheme.coverageShare(cover1)'),
    p('chart.cover.cover2', 0.13, 0, 1, 'share', 'J15.8.1', 'scheme.coverageShare(cover2)'),
    p('chart.cover.cover4', 0.14, 0, 1, 'share', 'J15.8.1', 'scheme.coverageShare(cover4)'),
    p('chart.cover.cover0', 0.03, 0, 1, 'share', 'J15.8.1', 'scheme.coverageShare(cover1)'),
    p('chart.cover.cover6', 0.05, 0, 1, 'share', 'J15.8.1', 'scheme.coverageShare(cover4)'),
    p('chart.cover.twoMan', 0.02, 0, 1, 'share', 'J15.8.1', 'scheme.coverageShare(cover1)'),
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
 * Chart values that differ by level. College offenses play faster: the college snap-to-snap gap after an in-bounds
 * play averages 33.3 s against 37.3 s in the pro game (cfbfastR 2023 to 2024, nflverse 2022 to 2024). No source
 * charts college no-huddle plays, so the share is the mix of the two pro tempo gaps that gives the college mean:
 * an Assumption (engine-game flow/pace-facts.json).
 */
export const CHART_LEVEL_OVERRIDES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  college: { 'chart.noHuddleShare': 0.6, 'chart.noHuddle.trailingLateShare': 0.75 },
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

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
    p('chart.noHuddleShare', 0.1, 0, 1, 'share', 'J15.3.2', 'situation.noHuddleShare'),
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
    p('chart.box.base', 7, 4, 9, 'count', 'J15.5.1', 'rush.byBox.yardsPerCarry(7)'),
  ],
};

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

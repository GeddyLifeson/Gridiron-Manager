// Tuning constants and rule keys of the reference resolver (J1.6.3, build plan WP-08, contract D-09).
//
// Every number the resolver uses is a row here. `basis: 'bible'` means the named leaf states the value;
// the leaf's own status applies (build plan section 4: only points per game and the pressure ordering
// are Verified, every other J15 row is PROVISIONAL). `basis: 'assumption'` means no bible leaf states
// the value: it was chosen or fitted for this module and is not a football fact. Rows that come from a
// research file but not from a bible leaf are marked assumption and name the file in the comment.
import type { ParamFile, ParamTable, RuleKeyManifest, TuningParam } from '@gm/schema';

export const REFERENCE_RESOLVER_VERSION = '0.2.0';
/** Parameter names are `resolverRef.<group>.<name>`. */
export const PREFIX = 'resolverRef';

type Basis = 'bible' | 'assumption';
const rows: TuningParam[] = [];
function add(name: string, value: number, min: number, max: number, unit: string, basis: Basis, leaf: string, constrainedBy: string): void {
  rows.push({ name: `${PREFIX}.${name}`, value, min, max, unit, belongsTo: 'resolver.reference', basis, leaf, constrainedBy, status: 'starting' });
}
const bible = (name: string, value: number, min: number, max: number, unit: string, leaf: string, constrainedBy: string) => add(name, value, min, max, unit, 'bible', leaf, constrainedBy);
const assume = (name: string, value: number, min: number, max: number, unit: string, leaf: string, constrainedBy: string) => add(name, value, min, max, unit, 'assumption', leaf, constrainedBy);

// --- Rating shift (J1.6.3). The leaf states 0.1 and calls it an Assumption. ---
bible('rating.shiftSdPerZ', 0.1, 0, 0.5, 'sd_per_z', 'J1.6.3', 'Q1.7.3 rating-response sweep');

// --- League volumes used to turn per-game foul counts into per-play chances. ---
bible('volume.playsPerGame', 124.2, 100, 150, 'count', 'J15.2.1', 'game.scrimmagePlays');
bible('volume.dropbackShare', 0.576, 0.4, 0.7, 'ratio', 'J15.3.2', 'play.dropbackShare');
bible('volume.puntsPerGame', 8.0, 4, 12, 'count', 'J15.6.1', 'kick.puntsPerGame');
bible('volume.kickoffsPerGame', 10.1, 6, 14, 'count', 'J15.6.1', 'kick.kickoffsPerGame');

/** Box-count rows: six or fewer defenders in the box, seven, eight, nine or more. */
export const RUN_BOX_NAMES = ['box6', 'box7', 'box8', 'box9'] as const;

// --- Runs. Source: research/play-calibration/reference-resolver-gaps.md (nflverse play-by-play and
// participation, 2022 to 2024 regular seasons, 39,801 designed runs; one collection, so 1 of 3). ---
// The gain table is the gain of a designed run (scrambles and kneel-downs out) with the goal line taken
// away: a touchdown run counts as "at least this far" (product-limit estimate), because the resolver cuts
// the gain at the goal line itself. Real gains are whole yards and the game reports whole yards between
// the nearest yard lines, so each value is the point where the whole-yard distribution, spread evenly over
// each yard (gain g covers g - 0.5 to g + 0.5), reaches the probability. J15.5.1 prints eight whole-yard
// quantiles of all carries; reading those as exact points put the curve half a yard low and made a quarter
// of carries end at or behind the line (real: 18.5% of designed runs).
export const RUN_QUANTILE_PROBS = [0.01, 0.025, 0.05, 0.10, 0.15, 0.20, 0.25, 0.35, 0.50, 0.65, 0.75, 0.85, 0.90, 0.95, 0.975, 0.99] as const;
export const RUN_QUANTILE_NAMES = ['q01', 'q025', 'q05', 'q10', 'q15', 'q20', 'q25', 'q35', 'q50', 'q65', 'q75', 'q85', 'q90', 'q95', 'q975', 'q99'] as const;
const RUN_Q = [-4.27, -2.89, -1.69, -0.44, 0.11, 0.64, 1.11, 1.95, 3.16, 4.57, 5.95, 8.24, 10.38, 14.52, 20.16, 32.68];
RUN_QUANTILE_NAMES.forEach((n, i) => assume(`run.${n}`, RUN_Q[i]!, -10, 60, 'yd', 'J15.5.1', 'rush.gainQuantiles'));
// Below the first and above the last probability: a straight line down to `floorYd` (set so the lowest 1%
// averages the measured -5.9 yd) and an exponential tail whose mean is the measured mean beyond the last value.
assume('run.floorYd', -7.5, -15, -4.3, 'yd', 'J15.5.1', 'rush.gainQuantiles');
assume('run.tailMeanYd', 16.8, 2, 30, 'yd', 'J15.5.1', 'rush.gainQuantiles');
// Box count moves the mean by the by-box row minus the average of the by-box rows over the real mix of
// boxes on designed runs (six or fewer, seven, eight, nine or more), so a defense that calls the real mix
// leaves the table's mean where it is. The shares are measured; the four J15.5.1 rows are the bible's.
bible('run.ypcBox6', 4.87, 3, 7, 'yd', 'J15.5.1', 'rush.yardsPerCarryByBox');
bible('run.ypcBox7', 4.26, 3, 7, 'yd', 'J15.5.1', 'rush.yardsPerCarryByBox');
bible('run.ypcBox8', 3.84, 2, 7, 'yd', 'J15.5.1', 'rush.yardsPerCarryByBox');
bible('run.ypcBox9', 2.41, 1, 7, 'yd', 'J15.5.1', 'rush.yardsPerCarryByBox');
[0.4666, 0.3574, 0.1389, 0.0371].forEach((v, i) => assume(`run.boxShare.${RUN_BOX_NAMES[i]!}`, v, 0, 1, 'ratio', 'J15.5.1', 'rush.yardsPerCarryByBox'));
bible('run.fumbleLostShare', 0.0068, 0, 0.05, 'ratio', 'J15.5.1', 'rush.fumbleLostPerCarry');
assume('run.outOfBoundsShare', 0.08, 0, 0.5, 'ratio', 'J15.3.2', 'clock.elapsedPerPlay');

// --- Dropbacks (J15.4.1, J15.4.2). Index r3..r7 is the number of rushers; 7 means seven or more. ---
export const RUSHER_NAMES = ['r3', 'r4', 'r5', 'r6', 'r7'] as const;
// J15.4.2 prints these sack rates; its verification note says they did not reproduce (Unverified).
[0.045, 0.064, 0.085, 0.100, 0.084].forEach((v, i) => bible(`pass.sackShare.${RUSHER_NAMES[i]!}`, v, 0, 0.3, 'ratio', 'J15.4.2', 'pass.sackRateByRushers'));
[0.202, 0.267, 0.359, 0.440, 0.488].forEach((v, i) => bible(`pass.pressureShare.${RUSHER_NAMES[i]!}`, v, 0, 0.9, 'ratio', 'J15.4.2', 'pass.pressureRateByRushers'));
bible('pass.sackShareAll', 0.069, 0, 0.2, 'ratio', 'J15.4.1', 'pass.sackRate');
bible('pass.sackLossMeanYd', 6.6, 2, 12, 'yd', 'J15.4.1', 'pass.sackLossMean');
assume('pass.sackLossSdYd', 3, 0.5, 8, 'yd', 'J15.4.1', 'pass.sackLossMean');
bible('pass.fumbleLostPerDropback', 0.008, 0, 0.05, 'ratio', 'J15.4.1', 'pass.fumbleLostPerDropback');
bible('pass.scrambleShare', 0.049, 0, 0.2, 'ratio', 'J15.4.1', 'pass.scrambleRate');
bible('pass.scrambleMeanYd', 7.5, 2, 15, 'yd', 'J15.4.1', 'pass.scrambleYards');
bible('pass.completionAll', 0.646, 0.4, 0.8, 'ratio', 'J15.4.1', 'pass.completionPct');
// J15.4.2 prints 40.9%; its verification note gives 49.0% under another base (Unverified).
bible('pass.completionUnderPressure', 0.409, 0.2, 0.7, 'ratio', 'J15.4.2', 'pass.completionUnderPressure');
bible('pass.throwawayPerDropback', 0.037, 0, 0.15, 'ratio', 'J15.4.1', 'pass.throwawayRate');
bible('pass.dropPerDropback', 0.034, 0, 0.15, 'ratio', 'J15.4.1', 'pass.dropRate');
bible('pass.timeToThrowS', 2.68, 1.5, 4, 's', 'J15.4.1', 'pass.timeToThrow');
// Depth-of-target bands of J15.4.1: behind the line, 0, 1 to 5, 6 to 10, 11 to 15, 16 to 20, 21 to 30, 31 and over.
export const DEPTH_BAND_NAMES = ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'] as const;
/**
 * Air-yard range of each band, low edge and width; the last band is open and uses `pass.deepTailMeanYd`.
 * Air yards are reported to the whole yard, so a band of whole yards a to b is drawn from a - 0.5 to b + 0.5.
 */
export const DEPTH_BAND_LOW = [-6.5, -0.5, 0.5, 5.5, 10.5, 15.5, 20.5, 30.5] as const;
export const DEPTH_BAND_WIDTH = [6, 1, 5, 5, 5, 5, 10, 0] as const;
[0.787, 0.699, 0.743, 0.628, 0.566, 0.520, 0.372, 0.291].forEach((v, i) => bible(`pass.completion.${DEPTH_BAND_NAMES[i]!}`, v, 0, 1, 'ratio', 'J15.4.1', 'pass.completionByDepth'));
[0.007, 0.007, 0.011, 0.021, 0.034, 0.044, 0.058, 0.081].forEach((v, i) => bible(`pass.interception.${DEPTH_BAND_NAMES[i]!}`, v, 0, 0.3, 'ratio', 'J15.4.1', 'pass.interceptionByDepth'));
// Share of attempts by depth band, yards after the catch by band and the deep tail are measured, not
// bible rows: research/play-calibration/reference-resolver-gaps.md (nflverse, 2022 to 2024, 53,994 attempts
// with a charted depth; 1 of 3). The shares replace a fit to five J15.4.1 rows that put 24% of passes behind
// the line (real 18%) and 14% at 1 to 5 yards (real 30%).
[0.1796, 0.0423, 0.2998, 0.1829, 0.1159, 0.0776, 0.0623, 0.0398].forEach((v, i) => assume(`pass.depthShare.${DEPTH_BAND_NAMES[i]!}`, v, 0, 1, 'ratio', 'J15.4.1', 'pass.airYardsPerAttempt'));
assume('pass.deepTailMeanYd', 8.7, 1, 20, 'yd', 'J15.4.1', 'pass.airYardsPerAttempt');
// Mean yards after the catch by band with the goal line taken away (yards after the catch over the
// completions that did not score), because the resolver cuts the run at the goal line itself. One mean for
// every depth (the J15.4.1 5.2) gave passes behind the line 1.5 yards per attempt against 4.5 real.
[9.24, 6.91, 4.44, 3.52, 3.71, 4.87, 7.00, 9.61].forEach((v, i) => assume(`pass.yacMeanYd.${DEPTH_BAND_NAMES[i]!}`, v, 0, 20, 'yd', 'J15.4.1', 'pass.yacPerCompletion'));
// Number of equal exponential stages summed for the yards after the catch: 1 is an exponential, 2 has
// fewer very short runs. Behind the line 2 gives 14% of completions a loss (real 13%); 1 gave 28%.
[2, 1, 1, 1, 1, 1, 1, 1].forEach((v, i) => assume(`pass.yacStages.${DEPTH_BAND_NAMES[i]!}`, v, 1, 4, 'count', 'J15.4.1', 'pass.completedGainQuantiles'));
// --- Screens, play action and coverage (J15.8.1 rows, one charting source each, 1 of 3). ---
// A screen is thrown behind the line and completed at its own rate. The other passes take the rest of the
// behind-the-line band, so the depth shares and the band's completion rate stay on their rows over all attempts.
bible('volume.screenShareOfAttempts', 0.096, 0, 0.5, 'ratio', 'J15.8.1', 'scheme.screen.shareOfAttempts');
bible('pass.screenCompletion', 0.851, 0, 1, 'ratio', 'J15.8.1', 'scheme.screen.completionPct');
// Play action gains 7.29 yards per dropback against 5.79 without it. The resolver has no route depth by play
// family, so the difference is carried by the yards after the catch: this factor on play action, and the factor
// on every other pass that keeps the average where it is at the real play-action share. Fitted, not measured.
bible('volume.playActionShare', 0.215, 0, 1, 'ratio', 'J15.8.1', 'scheme.playAction.share');
assume('pass.playActionYacFactor', 1.4, 0.5, 3, 'ratio', 'J15.8.1', 'scheme.playAction.yardsPerDropback');
// Coverage family: completion multiplier and yards-after-catch multiplier, each divided by its average over
// `pass.coverageShare.*` so a defense that calls that mix leaves the league rows where they are. The J15.8.1
// completion rows (cover 1 54.7%, cover 2 68.3%, cover 3 67.0%, cover 4 64.8%, man 54.5%, zone 66.3%) leave out
// screens and average below the J15.4.1 rate over all attempts, so they cannot all hold at once with it. The
// values here keep the rows' order and gaps and are fitted until the simulated rates by coverage are as near the
// rows as the overall rate allows (research/tuning/down-distance.md, "Coverage"); cover 0 and 2-man take the man
// value, cover 6 a zone value. Fewer completions against man are longer ones: the yards-after-catch factors are
// fitted to the yards per dropback rows (man 5.98). Fitted, not measured.
export const COVERAGE_NAMES = ['cover0', 'cover1', 'two_man', 'cover2', 'cover3', 'cover4', 'cover6'] as const;
[0.596, 0.596, 0.596, 0.695, 0.682, 0.660, 0.675].forEach((v, i) => assume(`pass.coverageCompletion.${COVERAGE_NAMES[i]!}`, v, 0.3, 0.9, 'ratio', 'J15.8.1', 'scheme.coverage.completionPct'));
[1.3, 1.3, 1.3, 1, 1, 1, 1].forEach((v, i) => assume(`pass.coverageYacFactor.${COVERAGE_NAMES[i]!}`, v, 0.3, 3, 'ratio', 'J15.8.1', 'scheme.coverage.yardsPerDropback'));
// Mix the factors are centred on: the J15.8.1 shares (cover 1 31%, cover 3 22%, cover 2 17%, cover 4 11%); the
// 19% the leaf does not split is an Assumption (cover 6 9%, cover 0 6%, 2-man 4%), as in the calibration chart.
[0.06, 0.31, 0.04, 0.17, 0.22, 0.11, 0.09].forEach((v, i) => assume(`pass.coverageShare.${COVERAGE_NAMES[i]!}`, v, 0, 1, 'ratio', 'J15.8.1', 'scheme.coverage.share'));

// --- Down. Offenses throw shorter and safer on early downs and to the line to gain on third down, and defenses
// rush the passer hardest on third down. nflverse 2022 to 2024 (computed by the project, research/tuning/
// down-distance.md; 1 of 3), first to fourth down: completion 67.3%, 67.0%, 59.9%, 52.9%; sacks per pass play 5.3%,
// 5.8%, 10.5%, 7.3%; air yards per attempt 7.52, 6.94, 8.84, 10.72. The three factors are fitted until the simulated
// rates by down are the measured ones: a multiplier on the completion chance, a multiplier on the sack chance, and a
// tilt of the depth mix (each band's share is multiplied by exp(tilt x band number); 0 leaves the mix alone). ---
export const DOWN_NAMES = ['d1', 'd2', 'd3', 'd4'] as const;
[1.034, 1.017, 0.914, 0.879].forEach((v, i) => assume(`pass.downCompletionFactor.${DOWN_NAMES[i]!}`, v, 0.3, 2, 'ratio', 'J15.3.2', 'situation.thirdDownConversion'));
[0.705, 0.77, 1.378, 1.023].forEach((v, i) => assume(`pass.downSackFactor.${DOWN_NAMES[i]!}`, v, 0.2, 3, 'ratio', 'J15.3.2', 'situation.thirdDownConversion'));
[-0.0021, -0.0382, 0.0988, 0.279].forEach((v, i) => assume(`pass.downDepthTilt.${DOWN_NAMES[i]!}`, v, -1, 1, 'ratio', 'J15.3.2', 'situation.thirdDownConversion'));

// On third and fourth down a share of passes are thrown to the line to gain: the depth is the distance to go plus up
// to `pass.sticksPastYd`, when that distance is between the two limits. The air yards by distance to go on third
// down are measured (3 to 5 to go 8.2, 6 to 9 to go 9.7, 10 to go 10.9; same source); the share is fitted to them.
assume('pass.sticksShare', 0.35, 0, 1, 'ratio', 'J15.3.2', 'situation.thirdDownConversion');
assume('pass.sticksPastYd', 3, 0, 10, 'yd', 'J15.3.2', 'situation.thirdDownConversion');
assume('pass.sticksMinYd', 2, 0, 10, 'yd', 'J15.3.2', 'situation.thirdDownConversion');
assume('pass.sticksMaxYd', 12, 5, 40, 'yd', 'J15.3.2', 'situation.thirdDownConversion');

// --- Near the goal line. Source: nflverse play-by-play, regular seasons 2022 to 2024 (815 games), computed by
// the project (research/tuning/goal-line.md); one collection, so 1 of 3. Bands are whole yards from the goal
// line at the snap: 1, 2, 3, 4 to 5, 6 to 10, 11 to 15, 16 to 20, 21 to 30, 31 and over. ---
export const GOAL_BAND_NAMES = ['g1', 'g2', 'g3', 'g4_5', 'g6_10', 'g11_15', 'g16_20', 'g21_30', 'g31'] as const;
/** Upper edge of each band but the last, inclusive, in whole yards to the goal line. */
export const GOAL_BAND_UPPER = [1, 2, 3, 5, 10, 15, 20, 30] as const;
// Completion rate of attempts snapped in each band (0.561, 0.526, 0.493, 0.511, 0.514, 0.580, 0.629, 0.648, 0.663):
// the defense has less field to cover. The resolver multiplies the completion chance by the band's rate over the
// league rate. The values are fitted until the simulated rate of each band is the measured one (the depth mix and
// the down factors move it too), so they sit a little under the measured rates.
[0.553, 0.512, 0.483, 0.498, 0.513, 0.57, 0.619, 0.648, 0.661].forEach((v, i) => assume(`pass.goalCompletion.${GOAL_BAND_NAMES[i]!}`, v, 0.2, 0.9, 'ratio', 'J15.3.2', 'situation.touchdownPerPlay'));
// Designed runs score on 57.9%, 44.8%, 37.3%, 22.1%, 11.6%, 6.0%, 3.4% and 1.6% of carries from those bands.
// The open-field gain table reaches the goal line far more often, so a gain forward is multiplied by this factor,
// fitted until the simulated touchdown share of each band is the measured one.
[0.271, 0.505, 0.672, 0.653, 0.773, 0.917, 0.99, 0.898, 1].forEach((v, i) => assume(`run.goalScale.${GOAL_BAND_NAMES[i]!}`, v, 0.1, 1.5, 'ratio', 'J15.3.2', 'situation.touchdownPerPlay'));

// A share of catches break into the open: their run after the catch is drawn with the long mean, and the others
// with a mean lowered so the band's mean stays on its row. One exponential put the 99th percentile of completed
// gains at 43 yards against 49 (J15.4.1 quantile row). Fitted to that row, not measured.
assume('pass.yacBreakawayShare', 0.03, 0, 0.3, 'ratio', 'J15.4.1', 'pass.completedGainQuantiles');
assume('pass.yacBreakawayMeanYd', 25, 5, 60, 'yd', 'J15.4.1', 'pass.completedGainQuantiles');
assume('pass.breakupShare', 0.4, 0, 1, 'ratio', 'J15.4.1', 'pass.contestedTargets');
assume('pass.outOfBoundsShare', 0.15, 0, 0.6, 'ratio', 'J15.3.2', 'clock.elapsedPerPlay');
// Returns of turnovers (nflverse 2022 to 2024, computed by the project; 1 of 3): 9.0% of 1,235 interceptions and
// 7.3% of 754 fumbles lost on runs and passes were returned for a touchdown; the other interception returns average 8.96 yd.
assume('pass.interceptionReturnMeanYd', 8.96, 0, 30, 'yd', 'J15.7.2', 'drive.opponentTouchdownShare');
assume('pass.interceptionReturnTdShare', 0.090, 0, 0.5, 'ratio', 'J15.7.2', 'drive.opponentTouchdownShare');
assume('turnover.fumbleReturnTdShare', 0.073, 0, 0.5, 'ratio', 'J15.7.2', 'drive.opponentTouchdownShare');
assume('rpo.passShare', 0.5, 0, 1, 'ratio', 'J1.6.3', 'play.dropbackShare');
assume('kneel.lossYd', 1, 0, 3, 'yd', 'J15.5.1', 'rush.yardsPerCarryOfficial');

// --- Place kicks (J15.6.1, J9.4.1). Bands are kick distance in yards. ---
export const FG_BAND_NAMES = ['d0_29', 'd30_39', 'd40_44', 'd45_49', 'd50_54', 'd55'] as const;
/** Upper edge of each band but the last, exclusive. */
export const FG_BAND_UPPER = [30, 40, 45, 50, 55] as const;
[0.977, 0.936, 0.835, 0.743, 0.742, 0.593].forEach((v, i) => bible(`fg.make.${FG_BAND_NAMES[i]!}`, v, 0, 1, 'ratio', 'J15.6.1', 'kick.fieldGoalByDistance'));
bible('fg.holdDepthYd', 7, 6, 9, 'yd', 'J9.4.1', 'kick.fieldGoalByDistance');
bible('fg.operationS', 1.3, 1, 2, 's', 'J9.4.1', 'kick.operationTime');
// J11.7.1 prints 95.4%; the build plan (section 7) says to use the J15 row.
bible('try.kickMake', 0.951, 0.8, 1, 'ratio', 'J15.6.1', 'kick.extraPoint');
assume('fg.missWideMaxYd', 6, 0.5, 15, 'yd', 'J9.4.2', 'kick.fieldGoalByDistance');

// --- Punts (J15.6.1, J9.4.3, J9.5.1). ---
bible('punt.grossMeanYd', 47.3, 35, 55, 'yd', 'J15.6.1', 'kick.puntGross');
assume('punt.grossSdYd', 7, 1, 15, 'yd', 'J9.5.1', 'kick.puntGross');
bible('punt.kickDepthYd', 14, 12, 16, 'yd', 'J9.4.3', 'kick.puntBlocked');
bible('punt.hangS', 4.4, 3.5, 5.2, 's', 'J9.5.1', 'kick.puntHang');
assume('punt.operationS', 2.0, 1.6, 2.6, 's', 'J9.4.3', 'kick.puntBlocked');
bible('punt.blockedShare', 0.0046, 0, 0.03, 'ratio', 'J15.6.1', 'kick.puntBlocked');
bible('punt.touchbackShare', 0.074, 0, 0.3, 'ratio', 'J15.6.1', 'kick.puntTouchback');
// A punt that would carry inside `pinZoneYd` of the goal line becomes a touchback with the chance
// `touchbackWhenReached` and is otherwise placed between `pinMinYd` and `pinMaxYd` from the goal line.
// 0.22 gives about 7.4% touchbacks on punt spots spread evenly from the kicking team's 15 to the
// opponent's 40. That spread is generated, not measured: refit on the spots real games produce (WP-13).
assume('punt.pinZoneYd', 8, 0, 20, 'yd', 'J15.6.1', 'kick.puntTouchback');
assume('punt.touchbackWhenReached', 0.22, 0, 1, 'ratio', 'J15.6.1', 'kick.puntTouchback');
assume('punt.pinMinYd', 3, 0.5, 10, 'yd', 'J15.6.1', 'kick.puntInside20');
assume('punt.pinMaxYd', 14, 5, 25, 'yd', 'J15.6.1', 'kick.puntInside20');
// Outcome mix and return average: research/special-teams-rates.md (2022 to 2024, n=6,509). Not in a bible leaf.
assume('punt.returnedShare', 0.430, 0, 1, 'ratio', 'J9.5.2', 'kick.puntOutcomeMix');
assume('punt.fairCatchShare', 0.279, 0, 1, 'ratio', 'J9.5.2', 'kick.puntOutcomeMix');
assume('punt.outOfBoundsShare', 0.094, 0, 1, 'ratio', 'J9.5.2', 'kick.puntOutcomeMix');
assume('punt.downedShare', 0.119, 0, 1, 'ratio', 'J9.5.2', 'kick.puntOutcomeMix');
assume('punt.returnMeanYd', 9.44, 3, 20, 'yd', 'J9.5.2', 'kick.puntReturnAverage');
assume('punt.returnFloorYd', -2, -8, 0, 'yd', 'J9.5.2', 'kick.puntReturnAverage');
// nflverse 2022 to 2024 (6,509 punts, computed by the project; 1 of 3): the receiving team lost a fumble on 1.23% of
// punts and scored on 0.40%; over the returned punts of this table that is 3.1% and 1.0%.
assume('punt.returnFumbleLostShare', 0.031, 0, 0.3, 'ratio', 'J15.2.1', 'game.turnovers');
assume('punt.returnTdShare', 0.010, 0, 0.2, 'ratio', 'J15.3.1', 'drive.result.opponentTouchdown');

// --- Free kicks (J9.6.1, J9.6.2). The touchback share is rule-set dependent: 21.0% is the 2025 season, the
// only one played under the kickoff format of the 2026 pro rule set. A college table needs its own value. ---
bible('kickoff.touchbackShare', 0.21, 0, 0.9, 'ratio', 'J9.6.1', 'kick.kickoffTouchback');
// research/special-teams-rates.md: out of bounds 1.35% (2025, status Conflict), average return 25.95 yd (2025).
assume('kickoff.outOfBoundsShare', 0.0135, 0, 0.1, 'ratio', 'J9.6.1', 'kick.kickoffOutOfBounds');
assume('kickoff.catchMaxYd', 8, 0, 20, 'yd', 'J9.6.1', 'kick.kickoffStartYardline');
assume('kickoff.returnMinYd', 10, 0, 20, 'yd', 'J9.6.1', 'kick.kickoffReturnAverage');
assume('kickoff.returnTailMeanYd', 15.95, 5, 30, 'yd', 'J9.6.1', 'kick.kickoffReturnAverage');
assume('kickoff.outOfBoundsYd', 30, 5, 60, 'yd', 'J9.6.1', 'kick.kickoffOutOfBounds');
assume('kickoff.hangS', 4.0, 3, 5, 's', 'J9.6.1', 'kick.kickoffStartYardline');
// research/special-teams-rates.md: kicking team recovers 5.4% of onside kicks (2022 to 2024, n=149; 9.6% in 2025, n=52).
assume('onside.recoveryShare', 0.054, 0, 0.5, 'ratio', 'J9.6.2', 'kick.onsideRecovery');
assume('onside.travelYd', 12, 10, 20, 'yd', 'J9.6.2', 'kick.onsideRecovery');

// --- Fouls (J15.7.1). Per-game values are accepted penalties, both teams. `committedPerAccepted` scales them
// up to committed acts, because officiating (B11) misses some and coaches decline some. ---
// (per-type committed-per-accepted ratios are declared after the foul table below)
assume('foul.pointOfAttackShare', 0.5, 0, 1, 'ratio', 'J10.1.1', 'foul.acceptedPerGame');

/** When in a play a foul type can happen in this resolver. */
export type FoulWindow =
  | 'pre_snap_dead'   // kills the play before the snap
  | 'at_snap'         // at the snap; the play runs on
  | 'scrimmage'       // any live scrimmage play
  | 'dropback'        // any play that is a dropback
  | 'pass_attempt'    // a forward pass was thrown
  | 'throwaway'       // an incomplete pass thrown away
  | 'kick_return'     // a punt or free kick that was returned
  | 'after_play';     // after the ball is dead

export interface FoulRow {
  /** Set when the catalogue splits this stat type by the side that fouls: the id used for each side. `id` then only names the rate. */
  readonly bySide?: { readonly snapping: string; readonly opposing: string };
  /** Catalogue id (D-06): the rule key is `foul.<id>.exists`. WP-01 owns the catalogue; rename here if it differs. */
  readonly id: string;
  readonly when: FoulWindow;
  /** 'snapping' is the team that snaps or kicks, 'opposing' the other, 'either' is an even draw. */
  readonly by: 'snapping' | 'opposing' | 'either';
  /** Accepted penalties per game, both teams (J15.7.1). */
  readonly perGame: number;
}

/** The 22 types J15.7.1 lists. Ids follow the bible where it names one (dpi, opi, def_holding, illegal_contact, ineligible_downfield_pass, intentional_grounding). */
export const FOUL_ROWS: readonly FoulRow[] = [
  { id: 'false_start', when: 'pre_snap_dead', by: 'snapping', perGame: 2.30 },
  { id: 'offensive_holding', when: 'scrimmage', by: 'snapping', perGame: 2.25 },
  { id: 'dpi', when: 'pass_attempt', by: 'opposing', perGame: 0.98 },
  { id: 'def_holding', when: 'dropback', by: 'opposing', perGame: 0.69 },
  { id: 'unnecessary_roughness', when: 'after_play', by: 'either', perGame: 0.60 },
  { id: 'delay_of_game', when: 'pre_snap_dead', by: 'snapping', perGame: 0.59 },
  { id: 'offside', when: 'at_snap', by: 'opposing', perGame: 0.54 },
  { id: 'roughing_passer', when: 'pass_attempt', by: 'opposing', perGame: 0.35 },
  { id: 'neutral_zone_infraction', when: 'pre_snap_dead', by: 'opposing', perGame: 0.33 },
  { id: 'face_mask', when: 'scrimmage', by: 'opposing', perGame: 0.30 },
  { id: 'illegal_formation', when: 'at_snap', by: 'snapping', perGame: 0.29 },
  { id: 'illegal_contact', when: 'dropback', by: 'opposing', perGame: 0.26 },
  { id: 'opi', when: 'pass_attempt', by: 'snapping', perGame: 0.25 },
  { id: 'ineligible_downfield_pass', when: 'pass_attempt', by: 'snapping', perGame: 0.25 },
  { id: 'illegal_use_of_hands', when: 'scrimmage', by: 'either', perGame: 0.22, bySide: { snapping: 'illegal_use_of_hands_offense', opposing: 'illegal_use_of_hands_defense' } },
  { id: 'illegal_block_in_back', when: 'kick_return', by: 'opposing', perGame: 0.19 },
  { id: 'intentional_grounding', when: 'throwaway', by: 'snapping', perGame: 0.16 },
  { id: 'too_many_on_field', when: 'at_snap', by: 'opposing', perGame: 0.15 },
  { id: 'illegal_shift', when: 'at_snap', by: 'snapping', perGame: 0.15 },
  { id: 'encroachment', when: 'pre_snap_dead', by: 'opposing', perGame: 0.12 },
  { id: 'unsportsmanlike', when: 'after_play', by: 'either', perGame: 0.11 },
  { id: 'taunting', when: 'after_play', by: 'either', perGame: 0.06 },
];
for (const f of FOUL_ROWS) bible(`foul.perGame.${f.id}`, f.perGame, 0, 5, 'count', 'J15.7.1', `foul.perGame.${f.id}`);
const FOUL_IDS = FOUL_ROWS.map((f) => f.id);
/** Fitted committed-per-accepted ratio by foul type; a type not listed takes 1.2. */
const FOUL_RATIO: Readonly<Record<string, number>> = {
  false_start: 0.845, offensive_holding: 2.522, dpi: 3.534, def_holding: 4.054,
  unnecessary_roughness: 1.816, delay_of_game: 0.846, offside: 1.478, roughing_passer: 2.077, neutral_zone_infraction: 0.852, face_mask: 1.636,
  illegal_formation: 0.974, illegal_contact: 4.152, opi: 1.94, ineligible_downfield_pass: 1.98, illegal_use_of_hands: 2.527,
  illegal_block_in_back: 3.368, intentional_grounding: 1.777, too_many_on_field: 1.458, illegal_shift: 0.917, encroachment: 0.837, unsportsmanlike: 1.664, taunting: 1.625,
};
// One ratio does not fit every type: the crew sees nearly every foul before the snap and misses many in coverage
// (B11.3.1 detection families), and the eligible plays of a game are not the J15 volumes exactly. Each type has its
// own ratio, fitted until the accepted count per game is the J15.7.1 row. Fitted, not measured.
for (const id of FOUL_IDS) assume(`foul.committedPerAccepted.${id}`, FOUL_RATIO[id] ?? 1.2, 0.2, 10, 'ratio', 'J15.7.1', `foul.perGame.${id}`);

// --- Live duration of a play. No bible leaf gives these; they only fill `liveDurationTenths`. ---
assume('time.snapToHandoffS', 0.8, 0.3, 2, 's', 'J11.4.1', 'clock.elapsedPerPlay');
assume('time.carryBaseS', 1.5, 0.5, 4, 's', 'J11.4.1', 'clock.elapsedPerPlay');
assume('time.carryPerYardS', 0.13, 0.05, 0.3, 's_per_yd', 'J11.4.1', 'clock.elapsedPerPlay');
assume('time.sackS', 4.2, 2, 7, 's', 'J11.4.1', 'clock.elapsedPerPlay');
assume('time.flightBaseS', 0.4, 0.1, 1, 's', 'J9.1.1', 'clock.elapsedPerPlay');
assume('time.flightPerYardS', 0.045, 0.02, 0.1, 's_per_yd', 'J9.1.1', 'clock.elapsedPerPlay');
assume('time.kneelS', 2.0, 1, 4, 's', 'J11.4.1', 'clock.elapsedPerPlay');
assume('time.spikeS', 1.5, 1, 3, 's', 'J11.4.1', 'clock.elapsedPerPlay');

// --- Cosmetic geometry (lateral placement of spots; no rule or rate depends on it) and player cost. ---
assume('geom.runLateralYd', 6, 0, 20, 'yd', 'J1.1.2', 'none: placement only');
assume('geom.passLateralYd', 15, 0, 26, 'yd', 'J1.1.2', 'none: placement only');
assume('geom.dropbackDepthYd', 7, 3, 12, 'yd', 'J1.1.2', 'none: placement only');
assume('delta.energyPerPlay', 0.004, 0, 0.05, 'ratio', 'D10.1.1', 'D10 freshness across a drive');

/** The module's parameter file (D-09). The integrator merges it into the game's ParamTable. */
export const PARAMS: ParamFile = { module: 'resolver.reference', version: REFERENCE_RESOLVER_VERSION, params: rows };

/**
 * The rule keys this module reads: only whether each foul type exists at the level (D-06). Everything
 * else that depends on the rules (field size, spots, the kind of play) arrives in the play input.
 */
export function foulRowIds(f: FoulRow): readonly string[] { return f.bySide ? [f.bySide.snapping, f.bySide.opposing] : [f.id]; }
export const RULE_KEYS: RuleKeyManifest = FOUL_ROWS.flatMap(foulRowIds).map((id) => ({
  key: `foul.${id}.exists`,
  type: 'boolean' as const,
  meaning: `Whether the foul "${id}" exists in this rule set (B8.1.1 catalogue).`,
  ownerLeaf: 'B8.1.2',
  readBy: ['resolver-reference/resolver'],
}));

/** A ParamTable over this module's own file, for tests and for use before the merged table exists. */
export function referenceParamTable(overrides: Readonly<Record<string, number>> = {}): ParamTable {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.name, r.value);
  for (const k of Object.keys(overrides)) {
    const full = k.startsWith(`${PREFIX}.`) ? k : `${PREFIX}.${k}`;
    if (!map.has(full)) throw new Error(`unknown reference resolver parameter ${k}`);
    map.set(full, overrides[k]!);
  }
  return {
    version: REFERENCE_RESOLVER_VERSION,
    num(name: string): number {
      const v = map.get(name);
      if (v === undefined) throw new Error(`unknown parameter ${name}`);
      return v;
    },
    has: (name: string) => map.has(name),
  };
}

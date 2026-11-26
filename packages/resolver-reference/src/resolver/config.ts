// Parameter values read once per ParamTable and the tables derived from them (J1.6.3).
// The result is memoised by the identity of the ParamTable object, which the contract hands in as
// read-only. Nothing here depends on a play, so the memo cannot change a result.
import type { DeterministicMath, ParamTable } from '@gm/schema';
import {
  PREFIX, RUN_QUANTILE_NAMES, RUN_QUANTILE_PROBS, RUN_BOX_NAMES, RUSHER_NAMES, DEPTH_BAND_NAMES, FG_BAND_NAMES, FOUL_ROWS,
  GOAL_BAND_NAMES, GOAL_BAND_UPPER, COVERAGE_NAMES, DOWN_NAMES,
  type FoulRow, type FoulWindow,
} from './params.ts';

export interface FoulChance { readonly row: FoulRow; readonly p: number }

export interface Config {
  readonly shiftSdPerZ: number;
  readonly run: {
    readonly q: readonly number[]; readonly floor: number; readonly tailMean: number;
    /** Standard deviation of the base gain distribution, derived from the table. */
    readonly sd: number;
    /** Mean of the base gain distribution, derived from the table. */
    readonly baseMean: number;
    /** Yards the mean moves at each box-count row: the row minus the rows' average over the real mix of boxes. */
    readonly boxShift: readonly number[];
    readonly fumbleLost: number; readonly oob: number;
    /** Multiplier on a gain forward by goal band (yards from the goal line at the snap). */
    readonly goalScale: readonly number[];
  };
  readonly pass: {
    readonly sack: readonly number[]; readonly pressure: readonly number[];
    /** Completion multipliers by rusher index when the passer is pressured and when he is not. */
    readonly pressuredFactor: number; readonly cleanFactor: readonly number[];
    readonly sackLossMean: number; readonly sackLossSd: number; readonly fumbleGivenSack: number;
    readonly scramble: number; readonly scrambleMean: number;
    readonly depthShare: readonly number[]; readonly completion: readonly number[]; readonly interception: readonly number[];
    readonly deepTailMean: number;
    /** Yards after the catch by depth band: mean and number of exponential stages. */
    readonly yacMean: readonly number[]; readonly yacStages: readonly number[];
    readonly throwawayGivenIncomplete: number; readonly dropGivenIncomplete: number; readonly breakup: number;
    readonly oob: number; readonly intReturnMean: number; readonly intReturnTd: number; readonly timeToThrow: number;
    /** Completion multiplier by goal band: the band's completion rate over the league rate. */
    readonly goalCompletion: readonly number[];
    /** Screens: chance that a pass that is not a screen is thrown at each depth band, and the completion rates of a screen and of the other passes behind the line. */
    readonly depthShareNoScreen: readonly number[]; readonly screenCompletion: number; readonly behindLineCompletionNoScreen: number;
    /** Yards-after-catch multipliers with and without play action. */
    readonly playActionYac: number; readonly noPlayActionYac: number;
    /** By down (index 0 is first down): completion and sack multipliers and the depth mix of a pass that is not a screen. */
    readonly downCompletion: readonly number[]; readonly downSack: readonly number[]; readonly downDepthShare: readonly (readonly number[])[];
    /** Third and fourth down: share of passes thrown to the line to gain, how far past it, and the distances to go it applies to. */
    readonly sticksShare: number; readonly sticksPast: number; readonly sticksMin: number; readonly sticksMax: number;
    /** Share of catches that break into the open and the mean of their run after the catch. */
    readonly yacBreakaway: number; readonly yacBreakawayMean: number;
    /** Completion and yards-after-catch multipliers by coverage family name, centred on the real mix of coverages. */
    readonly coverageCompletion: Readonly<Record<string, number>>; readonly coverageYac: Readonly<Record<string, number>>;
  };
  /** Share of fumbles lost on a run or pass that the recovering team returns for a touchdown. */
  readonly fumbleReturnTd: number;
  readonly rpoPassShare: number;
  readonly kneelLoss: number;
  readonly fg: { readonly make: readonly number[]; readonly holdDepth: number; readonly operation: number; readonly tryMake: number; readonly missWideMax: number };
  readonly punt: {
    readonly grossMean: number; readonly grossSd: number; readonly kickDepth: number; readonly hang: number; readonly operation: number;
    readonly blocked: number; readonly pinZone: number; readonly touchbackWhenReached: number; readonly pinMin: number; readonly pinMax: number;
    /** Weights: returned, fair catch, out of bounds, downed. */
    readonly outcome: readonly number[];
    readonly returnMean: number; readonly returnFloor: number; readonly returnFumbleLost: number; readonly returnTd: number;
  };
  readonly kickoff: {
    readonly touchback: number; readonly oob: number; readonly catchMax: number; readonly returnMin: number;
    readonly returnTailMean: number; readonly oobYd: number; readonly hang: number;
  };
  readonly onside: { readonly recovery: number; readonly travel: number };
  readonly fouls: Readonly<Record<FoulWindow, readonly FoulChance[]>>;
  readonly foulPointOfAttack: number;
  readonly time: {
    readonly snapToHandoff: number; readonly carryBase: number; readonly carryPerYard: number; readonly sack: number;
    readonly flightBase: number; readonly flightPerYard: number; readonly kneel: number; readonly spike: number;
  };
  readonly geom: { readonly runLateral: number; readonly passLateral: number; readonly dropbackDepth: number };
  readonly energyPerPlay: number;
}

/** Goal band of a snap `yardsToGoal` from the goal line attacked: whole yards, the public yard-line convention. */
export function goalBand(yardsToGoal: number): number {
  const yd = Math.max(1, Math.round(yardsToGoal));
  let band = 0;
  while (band < GOAL_BAND_UPPER.length && yd > GOAL_BAND_UPPER[band]!) band++;
  return band;
}

/** Top probability of the quantile table; above it the gain follows an exponential tail. */
const TOP = RUN_QUANTILE_PROBS[RUN_QUANTILE_PROBS.length - 1]!;

/**
 * Run gain at cumulative probability u (0 to 1): straight lines between the J15.5.1 quantiles, a
 * straight line from the floor to the first one, and an exponential tail above the last.
 */
export function runQuantile(cfg: Pick<Config['run'], 'q' | 'floor' | 'tailMean'>, u: number, math: DeterministicMath): number {
  const q = cfg.q;
  if (u >= TOP) {
    const rest = (1 - u) / (1 - TOP);
    return q[q.length - 1]! + (rest > 0 ? -cfg.tailMean * math.log(rest) : 0);
  }
  let p0 = 0;
  let v0 = cfg.floor;
  for (let i = 0; i < q.length; i++) {
    const p1 = RUN_QUANTILE_PROBS[i]!;
    const v1 = q[i]!;
    if (u < p1) return v0 + ((u - p0) / (p1 - p0)) * (v1 - v0);
    p0 = p1; v0 = v1;
  }
  return v0;
}

/** Steps of the midpoint rule used to take the mean and spread of the run table. */
const MOMENT_STEPS = 4000;

const cache = new WeakMap<ParamTable, Config>();

export function configFor(params: ParamTable, math: DeterministicMath): Config {
  const hit = cache.get(params);
  if (hit) return hit;
  const n = (name: string) => params.num(`${PREFIX}.${name}`);

  const runTable = { q: RUN_QUANTILE_NAMES.map((k) => n(`run.${k}`)), floor: n('run.floorYd'), tailMean: n('run.tailMeanYd') };
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < MOMENT_STEPS; i++) {
    const v = runQuantile(runTable, (i + 0.5) / MOMENT_STEPS, math);
    sum += v; sumSq += v * v;
  }
  const baseMean = sum / MOMENT_STEPS;
  const sd = math.sqrt(Math.max(0, sumSq / MOMENT_STEPS - baseMean * baseMean));

  const ypcBox = RUN_BOX_NAMES.map((k) => n(`run.ypc${k[0]!.toUpperCase()}${k.slice(1)}`));
  const boxShare = RUN_BOX_NAMES.map((k) => n(`run.boxShare.${k}`));
  let boxTotal = 0;
  let boxMean = 0;
  for (let i = 0; i < ypcBox.length; i++) { boxTotal += boxShare[i]!; boxMean += boxShare[i]! * ypcBox[i]!; }
  boxMean = boxTotal > 0 ? boxMean / boxTotal : ypcBox[1]!;
  const boxShift = ypcBox.map((v) => v - boxMean);

  const sack = RUSHER_NAMES.map((k) => n(`pass.sackShare.${k}`));
  const pressure = RUSHER_NAMES.map((k) => n(`pass.pressureShare.${k}`));
  const sackAll = n('pass.sackShareAll');
  const scramble = n('pass.scrambleShare');
  const completionAll = n('pass.completionAll');
  const completion = DEPTH_BAND_NAMES.map((k) => n(`pass.completion.${k}`));
  const interception = DEPTH_BAND_NAMES.map((k) => n(`pass.interception.${k}`));
  const depthShare = DEPTH_BAND_NAMES.map((k) => n(`pass.depthShare.${k}`));
  // Under pressure the completion chance is scaled by (rate under pressure / overall rate). The clean
  // pocket factor is then set so the two average back to 1 at each rusher count, which keeps the overall
  // completion rate on its own target whatever the pressure rows say.
  const pressuredFactor = n('pass.completionUnderPressure') / completionAll;
  const cleanFactor = RUSHER_NAMES.map((_, i) => {
    const ps = Math.min(sack[i]!, pressure[i]!);
    const w = (pressure[i]! - ps) / (1 - ps);
    return w < 1 ? (1 - w * pressuredFactor) / (1 - w) : 1;
  });
  // Share of attempts that fall incomplete, from the depth rows: used to turn the two per-dropback
  // charting rates into shares of incompletions.
  let incompleteShare = 0;
  let depthTotal = 0;
  for (let i = 0; i < depthShare.length; i++) {
    depthTotal += depthShare[i]!;
    incompleteShare += depthShare[i]! * (1 - completion[i]! - interception[i]!);
  }
  incompleteShare = depthTotal > 0 ? incompleteShare / depthTotal : 0;
  const attemptsPerDropback = 1 - sackAll - scramble;
  const ofIncompletions = (perDropback: number) => {
    const denom = attemptsPerDropback * incompleteShare;
    return denom > 0 ? Math.min(1, perDropback / denom) : 0;
  };

  // Screens sit in the first depth band (behind the line).
  const screenShare = n('volume.screenShareOfAttempts');
  const screenCompletion = n('pass.screenCompletion');
  const behindShare = depthTotal > 0 ? depthShare[0]! / depthTotal : 0;
  const screenOfBehind = Math.min(screenShare, behindShare);
  const depthShareNoScreen = depthShare.map((v, i) => (i === 0 ? Math.max(0, behindShare - screenOfBehind) : v / (depthTotal || 1)));
  const behindLineCompletionNoScreen = behindShare > screenOfBehind
    ? Math.min(1, Math.max(0, (behindShare * completion[0]! - screenOfBehind * screenCompletion) / (behindShare - screenOfBehind))) : completion[0]!;
  // Play action and coverage: factors centred on the real mix.
  const paShare = n('volume.playActionShare');
  const playActionYac = n('pass.playActionYacFactor');
  const noPlayActionYac = paShare < 1 ? Math.max(0, (1 - paShare * playActionYac) / (1 - paShare)) : 1;
  let covTotal = 0, covCompletion = 0, covYac = 0;
  for (const k of COVERAGE_NAMES) {
    const w = n(`pass.coverageShare.${k}`);
    covTotal += w; covCompletion += w * n(`pass.coverageCompletion.${k}`); covYac += w * n(`pass.coverageYacFactor.${k}`);
  }
  const coverageCompletion: Record<string, number> = {};
  const coverageYac: Record<string, number> = {};
  for (const k of COVERAGE_NAMES) {
    coverageCompletion[k] = covCompletion > 0 ? (n(`pass.coverageCompletion.${k}`) * covTotal) / covCompletion : 1;
    coverageYac[k] = covYac > 0 ? (n(`pass.coverageYacFactor.${k}`) * covTotal) / covYac : 1;
  }

  // Fouls: accepted per game to committed per eligible play.
  const plays = n('volume.playsPerGame');
  const dropbacks = plays * n('volume.dropbackShare');
  const puntOutcome = [n('punt.returnedShare'), n('punt.fairCatchShare'), n('punt.outOfBoundsShare'), n('punt.downedShare')];
  const puntOutcomeTotal = puntOutcome[0]! + puntOutcome[1]! + puntOutcome[2]! + puntOutcome[3]!;
  const kickoffTouchback = n('kickoff.touchbackShare');
  const kickoffOob = n('kickoff.outOfBoundsShare');
  const returns = n('volume.puntsPerGame') * (1 - n('punt.touchbackShare')) * (puntOutcomeTotal > 0 ? puntOutcome[0]! / puntOutcomeTotal : 0)
    + n('volume.kickoffsPerGame') * (1 - kickoffTouchback - kickoffOob);
  const eligible: Record<FoulWindow, number> = {
    pre_snap_dead: plays, at_snap: plays, scrimmage: plays, after_play: plays,
    dropback: dropbacks, pass_attempt: dropbacks * attemptsPerDropback,
    throwaway: dropbacks * n('pass.throwawayPerDropback'), kick_return: returns,
  };
  const fouls: Record<FoulWindow, FoulChance[]> = {
    pre_snap_dead: [], at_snap: [], scrimmage: [], dropback: [], pass_attempt: [], throwaway: [], kick_return: [], after_play: [],
  };
  for (const row of FOUL_ROWS) {
    const base = eligible[row.when];
    fouls[row.when].push({ row, p: base > 0 ? Math.min(1, (n(`foul.perGame.${row.id}`) * n(`foul.committedPerAccepted.${row.id}`)) / base) : 0 });
  }

  const cfg: Config = {
    shiftSdPerZ: n('rating.shiftSdPerZ'),
    run: {
      ...runTable, sd, baseMean, boxShift,
      fumbleLost: n('run.fumbleLostShare'), oob: n('run.outOfBoundsShare'),
      goalScale: GOAL_BAND_NAMES.map((k) => n(`run.goalScale.${k}`)),
    },
    pass: {
      sack, pressure, pressuredFactor, cleanFactor,
      sackLossMean: n('pass.sackLossMeanYd'), sackLossSd: n('pass.sackLossSdYd'),
      fumbleGivenSack: sackAll > 0 ? Math.min(1, n('pass.fumbleLostPerDropback') / sackAll) : 0,
      scramble, scrambleMean: n('pass.scrambleMeanYd'),
      depthShare, completion, interception,
      deepTailMean: n('pass.deepTailMeanYd'),
      yacMean: DEPTH_BAND_NAMES.map((k) => n(`pass.yacMeanYd.${k}`)),
      yacStages: DEPTH_BAND_NAMES.map((k) => Math.max(1, Math.round(n(`pass.yacStages.${k}`)))),
      throwawayGivenIncomplete: ofIncompletions(n('pass.throwawayPerDropback')),
      dropGivenIncomplete: ofIncompletions(n('pass.dropPerDropback')),
      breakup: n('pass.breakupShare'), oob: n('pass.outOfBoundsShare'),
      intReturnMean: n('pass.interceptionReturnMeanYd'), intReturnTd: n('pass.interceptionReturnTdShare'), timeToThrow: n('pass.timeToThrowS'),
      goalCompletion: GOAL_BAND_NAMES.map((k) => (completionAll > 0 ? n(`pass.goalCompletion.${k}`) / completionAll : 1)),
      depthShareNoScreen, screenCompletion, behindLineCompletionNoScreen,
      playActionYac, noPlayActionYac, coverageCompletion, coverageYac,
      downCompletion: DOWN_NAMES.map((k) => n(`pass.downCompletionFactor.${k}`)), downSack: DOWN_NAMES.map((k) => n(`pass.downSackFactor.${k}`)),
      downDepthShare: DOWN_NAMES.map((k) => { const tilt = n(`pass.downDepthTilt.${k}`); return depthShareNoScreen.map((v, i) => v * math.exp(tilt * i)); }),
      sticksShare: n('pass.sticksShare'), sticksPast: n('pass.sticksPastYd'), sticksMin: n('pass.sticksMinYd'), sticksMax: n('pass.sticksMaxYd'),
      yacBreakaway: n('pass.yacBreakawayShare'), yacBreakawayMean: n('pass.yacBreakawayMeanYd'),
    },
    fumbleReturnTd: n('turnover.fumbleReturnTdShare'),
    rpoPassShare: n('rpo.passShare'),
    kneelLoss: n('kneel.lossYd'),
    fg: {
      make: FG_BAND_NAMES.map((k) => n(`fg.make.${k}`)), holdDepth: n('fg.holdDepthYd'), operation: n('fg.operationS'),
      tryMake: n('try.kickMake'), missWideMax: n('fg.missWideMaxYd'),
    },
    punt: {
      grossMean: n('punt.grossMeanYd'), grossSd: n('punt.grossSdYd'), kickDepth: n('punt.kickDepthYd'), hang: n('punt.hangS'),
      operation: n('punt.operationS'), blocked: n('punt.blockedShare'), pinZone: n('punt.pinZoneYd'),
      touchbackWhenReached: n('punt.touchbackWhenReached'), pinMin: n('punt.pinMinYd'), pinMax: n('punt.pinMaxYd'),
      outcome: puntOutcome, returnMean: n('punt.returnMeanYd'), returnFloor: n('punt.returnFloorYd'),
      returnFumbleLost: n('punt.returnFumbleLostShare'), returnTd: n('punt.returnTdShare'),
    },
    kickoff: {
      touchback: kickoffTouchback, oob: kickoffOob, catchMax: n('kickoff.catchMaxYd'), returnMin: n('kickoff.returnMinYd'),
      returnTailMean: n('kickoff.returnTailMeanYd'), oobYd: n('kickoff.outOfBoundsYd'), hang: n('kickoff.hangS'),
    },
    onside: { recovery: n('onside.recoveryShare'), travel: n('onside.travelYd') },
    fouls,
    foulPointOfAttack: n('foul.pointOfAttackShare'),
    time: {
      snapToHandoff: n('time.snapToHandoffS'), carryBase: n('time.carryBaseS'), carryPerYard: n('time.carryPerYardS'), sack: n('time.sackS'),
      flightBase: n('time.flightBaseS'), flightPerYard: n('time.flightPerYardS'), kneel: n('time.kneelS'), spike: n('time.spikeS'),
    },
    geom: { runLateral: n('geom.runLateralYd'), passLateral: n('geom.passLateralYd'), dropbackDepth: n('geom.dropbackDepthYd') },
    energyPerPlay: n('delta.energyPerPlay'),
  };
  cache.set(params, cfg);
  return cfg;
}

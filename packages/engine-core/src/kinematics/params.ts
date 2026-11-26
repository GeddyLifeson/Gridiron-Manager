// Kinematics tuning constants (J2). Every value here is a starting value from the bible leaf named,
// or an Assumption the bible leaves open. None is a measured football fact; J2.7 fits them.
import type { ParamFile, ParamTable } from '@gm/schema';
import { defineParams, type ParamRow } from '../tick/param-util.ts';

const FIT = 'J2.7.1 drill reproduction', GAME = 'J2.7.2 game-speed comparison', NONE = 'none yet: flagged for J6.8.1 review';

const ROWS: readonly ParamRow[] = [
  ['padsFactor', 0.97, 0.9, 1, 'ratio', 'bible', 'J2.2.1', GAME],
  ['tauMinS', 0.1, 0.05, 0.5, 's', 'assumption', 'J2.2.1', FIT],
  ['tauMaxS', 3, 1.5, 5, 's', 'assumption', 'J2.2.1', FIT],
  ['vMaxSanityMinYps', 6.5, 5, 8.5, 'yd/s', 'assumption', 'J2.2.1', FIT],
  ['vMaxSanityMaxYps', 12.5, 11.5, 14, 'yd/s', 'assumption', 'J2.2.1', FIT],
  ['aLatBaseYps2', 9.5, 7, 12, 'yd/s^2', 'bible', 'J2.2.2', FIT],
  ['aLatPerZYps2', 1.0, 0, 2, 'yd/s^2', 'bible', 'J2.2.2', FIT],
  ['aLatMinYps2', 7, 5, 9, 'yd/s^2', 'bible', 'J2.1.3', FIT],
  ['aLatMaxYps2', 12, 10, 15, 'yd/s^2', 'bible', 'J2.1.3', FIT],
  ['aBrakeBaseYps2', 8.0, 6, 11, 'yd/s^2', 'bible', 'J2.2.2', FIT],
  ['aBrakePerZYps2', 0.8, 0, 2, 'yd/s^2', 'bible', 'J2.2.2', FIT],
  ['pivotSpeedYps', 1.5, 0.5, 3, 'yd/s', 'bible', 'J2.1.3', FIT],
  ['cut45', 0.85, 0.5, 1, 'ratio', 'bible', 'J2.1.3', FIT],
  ['cut90', 0.55, 0.3, 1, 'ratio', 'bible', 'J2.1.3', FIT],
  ['cut135', 0.30, 0.1, 1, 'ratio', 'bible', 'J2.1.3', FIT],
  ['cut180', 0.15, 0.05, 1, 'ratio', 'bible', 'J2.1.3', FIT],
  ['cutPerZ', 0.04, 0, 0.1, 'ratio', 'bible', 'J2.1.3', FIT],
  ['runSpeedFrac', 0.8, 0.6, 1, 'ratio', 'bible', 'J2.3.1', GAME],
  ['runALatMult', 1.15, 1, 1.5, 'ratio', 'bible', 'J2.3.1', GAME],
  ['gazeFreeDeg', 90, 60, 130, 'deg', 'bible', 'J2.3.1', NONE],
  ['gazeSpeedCost', 0.05, 0, 0.2, 'ratio', 'bible', 'J2.3.1', NONE],
  ['backpedalBase', 0.58, 0.4, 0.7, 'ratio', 'bible', 'J2.3.2', GAME],
  ['backpedalPerZ', 0.03, 0, 0.08, 'ratio', 'bible', 'J2.3.2', GAME],
  ['backpedalCap', 0.70, 0.6, 0.8, 'ratio', 'bible', 'J2.3.2', GAME],
  ['transitionBaseS', 0.30, 0.1, 0.5, 's', 'bible', 'J2.3.2', GAME],
  ['transitionPerZS', 0.05, 0, 0.1, 's', 'bible', 'J2.3.2', GAME],
  ['transitionFloorS', 0.12, 0.05, 0.3, 's', 'bible', 'J2.3.2', GAME],
  ['shuffleBase', 0.50, 0.3, 0.65, 'ratio', 'bible', 'J2.3.3', GAME],
  ['shufflePerZ', 0.04, 0, 0.08, 'ratio', 'bible', 'J2.3.3', GAME],
  ['shuffleCap', 0.65, 0.5, 0.8, 'ratio', 'bible', 'J2.3.3', GAME],
  ['breakdownFloor', 0.40, 0.2, 0.7, 'ratio', 'bible', 'J2.3.4', 'J6.6 tackle contests'],
  ['reachedRadiusYd', 0.1, 0.02, 0.3, 'yd', 'bible', 'J2.1.1', 'none: structural'],
  ['throughRadiusYd', 0.6, 0.2, 1.5, 'yd', 'bible', 'J2.5.1', 'J2.5.1 break-depth test'],
  ['waypointClipYd', 1, 0, 3, 'yd', 'bible', 'J2.5.1', 'none: structural'],
  ['hipTurnRateRadPs', 8, 3, 15, 'rad/s', 'assumption', 'J2.1.1', NONE],
  ['fatigueMoveCost', 0.0010, 0, 0.005, 'per tick', 'bible', 'J2.4.1', 'D10 snap-share targets'],
  ['fatigueEngagedCost', 0.0012, 0, 0.005, 'per tick', 'bible', 'J2.4.1', 'D10 snap-share targets'],
  ['fatigueRefWeightLb', 230, 180, 300, 'lb', 'bible', 'J2.4.1', 'D10 snap-share targets'],
  ['fatigueStaminaPerZ', 0.08, 0, 0.2, 'ratio', 'bible', 'J2.4.1', 'D10 snap-share targets'],
  ['fatigueStaminaMin', 0.7, 0.5, 1, 'ratio', 'bible', 'J2.4.1', 'D10 snap-share targets'],
  ['fatigueStaminaMax', 1.3, 1, 1.6, 'ratio', 'bible', 'J2.4.1', 'D10 snap-share targets'],
  ['fatigueVMaxLoss', 0.10, 0, 0.3, 'ratio', 'bible', 'J2.4.1', 'D10 snap-share targets'],
  ['fatigueAccelLoss', 0.20, 0, 0.5, 'ratio', 'bible', 'J2.4.1', 'D10 snap-share targets'],
  ['fatiguePlayCap', 0.15, 0.05, 0.4, 'ratio', 'bible', 'J2.4.1', 'D10 snap-share targets'],
  ['pursuitQBase', 0.6, 0.2, 1, 'ratio', 'bible', 'J2.5.2', 'J2.5.2 pursuit test'],
  ['pursuitQPerZ', 0.12, 0, 0.3, 'ratio', 'bible', 'J2.5.2', 'J2.5.2 pursuit test'],
  ['pursuitQMin', 0.2, 0, 0.6, 'ratio', 'bible', 'J2.5.2', 'J2.5.2 pursuit test'],
  ['pursuitQMax', 1.0, 0.6, 1, 'ratio', 'bible', 'J2.5.2', 'J2.5.2 pursuit test'],
  ['trafficLookaheadYd', 1.5, 0.5, 3, 'yd', 'bible', 'J2.5.3', 'J2.5.3 spacing test'],
  ['trafficAvoidGain', 1.0, 0, 3, 'ratio', 'assumption', 'J2.5.3', 'J2.5.3 spacing test'],
  ['washSpeedLoss', 0.30, 0, 0.6, 'ratio', 'bible', 'J2.5.3', 'J2.5.3 spacing test'],
  ['minSpacingFrac', 0.5, 0.3, 1, 'ratio', 'bible', 'J2.5.3', 'J2.5.3 spacing test'],
  ['downRadiusFrac', 0.6, 0.3, 1, 'ratio', 'assumption', 'J2.5.3', 'J2.5.3 spacing test'],
  ['pickDelayBaseS', 0.25, 0.1, 0.4, 's', 'bible', 'J2.5.3', 'J2.5.3 mesh test'],
  ['pickDelayPerZS', 0.05, 0, 0.1, 's', 'bible', 'J2.5.3', 'J2.5.3 mesh test'],
  ['pickDelayNoiseS', 0.08, 0, 0.2, 's', 'bible', 'J2.5.3', 'J2.5.3 mesh test'],
  ['pickDelayMinS', 0.1, 0, 0.2, 's', 'bible', 'J2.5.3', 'J2.5.3 mesh test'],
  ['pickDelayMaxS', 0.4, 0.2, 0.8, 's', 'bible', 'J2.5.3', 'J2.5.3 mesh test'],
  ['pickCrossYd', 0.5, 0.2, 1.5, 'yd', 'bible', 'J2.5.3', 'J2.5.3 mesh test'],
  ['blindsideDeg', 100, 70, 150, 'deg', 'bible', 'J2.6.1', 'J10 injury and fumble hazards'],
  ['hitEnergyScale', 1, 0.01, 100, 'ratio', 'assumption', 'J2.6.1', 'J6.6: a league-typical open-field tackle is 1.0'],
];

export const PARAMS: ParamFile = defineParams('kinematics', '0.1.0', ROWS);

export type KinParams = Readonly<Record<string, number>>;

/** Resolve once per play, never inside the tick. Property names are the row names above. */
export function kinParams(t: ParamTable): KinParams {
  const out: Record<string, number> = {};
  for (const row of ROWS) out[row[0]] = t.num(`kinematics.${row[0]}`);
  return out;
}

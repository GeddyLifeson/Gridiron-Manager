// Ball carrier model tuning constants (bible J8, work package WP-21).
//
// Basis 'bible' means J8 (or J6.6 for the contact window) states the number as a starting value; J8
// itself calls every one of them a starting value or Assumption to be fitted. Basis 'assumption'
// means this module's author chose the number because the leaf gives a direction and no size.
// NO ROW HERE IS A MEASURED FOOTBALL FACT. The measured rates J8 cites (rushing quantiles, explosive
// run rates, yards after catch, screen gains) are TARGETS that constrain these rows through
// calibration (J15, Q2); they are named in `constrainedBy` and never typed into the model as outputs.
import type { ParamFile, ParamTable, RuleKeyManifest } from '@gm/schema';
import { defineParams, type ParamRow } from '../tick/param-util.ts';

const VISION = 'J8.1.1 acceptance (vision 70 takes the cutback at least twice as often as vision 30)';
const READ = 'J8.2.1 acceptance (85% correct read at vision 60); rushing direction 38/26/36 (1 of 3)';
const QUANT = 'J8.2.2 rushing quantiles -2, 0, 1, 3, 6, 11, 14, 29 and mean 4.52 (1 of 3; mean Conflict)';
const EXPLOSIVE = 'J8.5.1 runs of 10+ yd 11.7%, 20+ yd 2.5% (1 of 3)';
const MOVES = 'J8.3.1 acceptance (missed tackles rise with elusiveness in space and power head-on); no measured target (R37)';
const SECURE = 'J8.4.1 acceptance (ball-security instruction lowers fumbles and yards slightly)';
const CLOCK = 'J8.4.2 acceptance (85% in bounds when the rule is set and practiced)';
const SLIDE = 'J8.4.3 acceptance (QB hits per scramble fall by half with protection on)';
const YAC = 'J8.6.1 mean yards after catch 5.2 (1 of 3); depth table in research/play-calibration';
const RETURN = 'J8.6.2 punt return average 9.4 yd (2 of 3); fair catch share (open question)';
const SCREEN = 'J8.3.2 acceptance; screens 5.46 yd per attempt (1 of 3)';
const TACKLE = 'J6.6.1 acceptance (rushing quantiles and yards after catch)';
const STRUCT = 'none: structural';

const ROWS = [
  // J8.1.1 look-ahead
  ['look.lanes', 11, 9, 13, 'count', 'bible', 'J8.1.1', VISION],
  ['look.fanDeg', 150, 120, 180, 'deg', 'bible', 'J8.1.1', VISION],
  ['look.horizonBaseS', 0.7, 0.4, 1.0, 's', 'bible', 'J8.1.1', VISION],
  ['look.horizonPerZS', 0.15, 0, 0.3, 's/z', 'bible', 'J8.1.1', VISION],
  ['look.horizonMinS', 0.4, 0.2, 0.6, 's', 'bible', 'J8.1.1', VISION],
  ['look.horizonMaxS', 1.3, 1.0, 1.6, 's', 'bible', 'J8.1.1', VISION],
  ['look.accountBase', 3, 2, 4, 'count', 'bible', 'J8.1.1', VISION],
  ['look.accountPerZ', 1, 0, 2, 'count/z', 'bible', 'J8.1.1', VISION],
  ['look.accountMin', 2, 1, 3, 'count', 'bible', 'J8.1.1', VISION],
  ['look.accountMax', 6, 4, 8, 'count', 'bible', 'J8.1.1', VISION],
  ['look.noiseBaseYd', 1.5, 0.5, 3, 'yd', 'bible', 'J8.1.1', VISION],
  ['look.noisePerZYd', 0.3, 0, 0.6, 'yd/z', 'bible', 'J8.1.1', VISION],
  ['look.noiseFloorYd', 0.3, 0.1, 0.6, 'yd', 'bible', 'J8.1.1', VISION],
  ['look.gainPerYd', 1.0, 0.5, 1.5, 'score/yd', 'bible', 'J8.1.1', QUANT],
  ['look.threatYd', 3.0, 1, 6, 'yd', 'bible', 'J8.1.1', QUANT],
  ['look.crowdYd', 0.5, 0, 1.5, 'yd', 'bible', 'J8.1.1', QUANT],
  ['look.crowdRadiusYd', 1.0, 0.5, 2, 'yd', 'bible', 'J8.1.1', QUANT],
  // A defender "can reach the path" when he gets within this distance of a projected point no later than the carrier does.
  ['look.reachYd', 1.0, 0.5, 2, 'yd', 'assumption', 'J8.1.1', QUANT],
  ['look.pathSamples', 4, 2, 8, 'count', 'assumption', 'J8.1.1', STRUCT],
  // Half-angle of the vision cone around his heading; defenders outside it are not counted.
  ['look.coneHalfDeg', 100, 70, 135, 'deg', 'assumption', 'J8.1.1', VISION],
  ['look.screenS', 0.4, 0.2, 0.6, 's', 'bible', 'J8.1.1', VISION],
  // A low-vision back behind the line misses defenders the line screens: the depth band that counts as "behind the line".
  ['look.screenDepthYd', 1.0, 0, 3, 'yd', 'assumption', 'J8.1.1', VISION],
  // Projection: a hard cut keeps cos(angle) of his speed, floored here (J2.1.3 cut cost, simplified for scoring only).
  ['look.cutKeepMin', 0.35, 0.1, 0.6, 'share of speed', 'assumption', 'J8.1.1', VISION],
  // A lane that crosses the sideline ends there; it loses this much more (the yards and the play given up) unless the plan wants him out.
  ['look.outOfBoundsYd', 0, -2, 6, 'yd', 'assumption', 'J8.4.2', CLOCK],
  // J8.3.2: chance a blocker ahead makes the block on a threat he can reach first (open-field blocking against shedding).
  ['block.beta0', 0.4, -1, 2, 'logit', 'assumption', 'J8.3.2', SCREEN],
  ['block.perZ', 0.6, 0, 1.5, 'logit/z', 'assumption', 'J8.3.2', SCREEN],
  // Steering: the intent's target sits this far along the chosen heading.
  ['look.aimYd', 5, 2, 10, 'yd', 'assumption', 'J8.1.1', STRUCT],

  // J8.2.1 track and read
  ['read.pressS', 0.45, 0.2, 0.9, 's', 'assumption', 'J8.2.1', READ],
  ['read.pressPerZ', 0.1, 0, 0.3, 'ratio/z', 'bible', 'J8.2.1', READ],
  ['read.designedBonusYd', 3.0, 0.5, 6, 'yd', 'assumption', 'J8.2.1', READ],
  ['read.fadeS', 0.5, 0.2, 1.0, 's', 'bible', 'J8.2.1', READ],
  // Penetration: a free defender this close in the backfield before the read ends the press at once.
  ['read.penetrationYd', 2.0, 1, 4, 'yd', 'assumption', 'J8.2.1', READ],
  ['read.recogBeta0', 1.4, 0, 3, 'logit', 'assumption', 'J8.2.1', READ],
  ['read.recogPerZ', 0.8, 0, 2, 'logit/z', 'assumption', 'J8.2.1', READ],
  ['read.recogKnowledge', 0.6, 0, 2, 'logit per unit knowledge', 'assumption', 'J8.2.1', READ],

  // J8.2.2 style and instructions
  ['style.tempBaseYd', 0.8, 0.4, 1.5, 'yd', 'bible', 'J8.2.2', QUANT],
  ['style.tempPerZYd', 0.15, 0, 0.3, 'yd/z', 'bible', 'J8.2.2', QUANT],
  ['style.tempMinYd', 0.2, 0.1, 0.4, 'yd', 'bible', 'J8.2.2', QUANT],
  ['style.bounceYd', 0.5, 0, 1.5, 'yd per tenth of a second', 'bible', 'J8.2.2', QUANT],
  ['style.bounceCreativityPerZ', 0.2, 0, 0.5, 'ratio/z', 'bible', 'J8.2.2', QUANT],
  ['style.bounceMaxEdgeTenths', 10, 3, 20, 'tenths of a second', 'assumption', 'J8.2.2', QUANT],
  // A lane counts as "outside" when it is at least this far off straight upfield.
  ['style.outsideDeg', 40, 25, 60, 'deg', 'assumption', 'J8.2.2', READ],
  ['style.shortYardageYd', 3.0, 1, 6, 'yd', 'assumption', 'J8.2.2', QUANT],
  ['style.sticksYd', 4.0, 1, 8, 'yd', 'assumption', 'J8.2.2', QUANT],

  // J8.3.1 moves
  ['move.windowMinS', 0.3, 0.2, 0.4, 's', 'bible', 'J8.3.1', MOVES],
  ['move.windowMaxS', 0.5, 0.4, 0.7, 's', 'bible', 'J8.3.1', MOVES],
  ['move.tempYd', 0.5, 0.2, 1.0, 'yd', 'bible', 'J8.3.1', MOVES],
  ['move.beta0', 0.0, -1, 1, 'logit', 'assumption', 'J8.3.1', MOVES],
  ['move.beta1', 0.6, 0.2, 1.2, 'logit/z', 'assumption', 'J8.3.1', MOVES],
  ['move.brokeDown', -0.8, -2, 0, 'logit', 'assumption', 'J8.3.1', MOVES],
  ['move.room', 0.6, 0, 1.5, 'logit', 'assumption', 'J8.3.1', MOVES],
  ['move.winYd', 3.0, 1, 6, 'yd', 'assumption', 'J8.3.1', MOVES],
  ['move.cutCostYd', 1.0, 0, 2, 'yd', 'assumption', 'J8.3.1', MOVES],
  ['move.spinCostYd', 1.0, 0, 2, 'yd', 'assumption', 'J8.3.1', MOVES],
  ['move.spinS', 0.3, 0.2, 0.5, 's', 'bible', 'J8.3.1', MOVES],
  ['move.spinFumble', 0.5, 0, 1.5, 'logit', 'assumption', 'J8.3.1', MOVES],
  ['move.stiffArmFumble', 0.4, 0, 1.5, 'logit', 'assumption', 'J8.3.1', MOVES],
  ['move.stiffArmCostYd', 0.3, 0, 1, 'yd', 'assumption', 'J8.3.1', MOVES],
  ['move.armPerIn', 0.05, 0, 0.15, 'z per inch of height', 'assumption', 'J8.3.1', MOVES],
  ['move.shoulderMomentum', 0.25, 0, 0.6, 'ratio', 'assumption', 'J8.3.1', MOVES],
  ['move.shoulderYd', 1.0, 0, 2, 'yd', 'assumption', 'J8.3.1', MOVES],
  ['move.shoulderPerZYd', 0.6, 0, 1.5, 'yd/z', 'assumption', 'J8.3.1', MOVES],
  ['move.speedThroughYd', 3.0, 0, 6, 'yd', 'assumption', 'J8.3.1', MOVES],
  ['move.hurdleYd', 1.0, 0, 3, 'yd', 'assumption', 'J8.3.1', MOVES],
  ['move.hurdleCostYd', 2.0, 0.5, 4, 'yd', 'assumption', 'J8.3.1', MOVES],
  // Room to cut: open space within this many yards to either side counts as full room.
  ['move.roomYd', 3.0, 1.5, 5, 'yd', 'assumption', 'J8.3.1', MOVES],

  // J8.4.1 traffic and ball security
  ['secure.trafficYd', 2.0, 1, 3, 'yd', 'bible', 'J8.4.1', SECURE],
  ['secure.trafficCount', 2, 2, 3, 'count', 'bible', 'J8.4.1', SECURE],
  ['secure.coverZ', 0.6, 0, 1.5, 'z', 'assumption', 'J8.4.1', SECURE],
  ['secure.instructionZ', 0.4, 0, 1.0, 'z', 'assumption', 'J8.4.1', SECURE],
  // Covering the ball costs him the speed of a two-hand carry.
  ['secure.instructionSpeed', 0.97, 0.9, 1, 'share of speed', 'assumption', 'J8.4.1', SECURE],
  // A hit counts as the "typical" hit of J2.6.1 at this energy (reduced mass in lb times closing speed squared).
  ['secure.typicalHitEnergy', 4000, 1000, 10000, 'lb yd2/s2', 'assumption', 'J6.7.1', SECURE],
  ['secure.maxHitEnergyRel', 4, 2, 8, 'ratio', 'assumption', 'J6.7.1', SECURE],

  // J8.4.2 situation rules
  ['aware.beta0', 1.5, 0, 3, 'logit', 'bible', 'J8.4.2', CLOCK],
  ['aware.perZ', 0.6, 0, 1.5, 'logit/z', 'bible', 'J8.4.2', CLOCK],
  ['aware.practiced', 0.8, 0, 2, 'logit', 'bible', 'J8.4.2', CLOCK],
  ['aware.doNotScoreBeta0', 0.5, -1, 2, 'logit', 'assumption', 'J8.4.2', CLOCK],
  ['aware.sidelineTermYd', 6, 2, 12, 'yd', 'assumption', 'J8.4.2', CLOCK],
  ['aware.sidelineZoneYd', 3, 1, 5, 'yd', 'bible', 'J8.4.2', CLOCK],
  // "Get down short of the goal line": he goes down this far short.
  ['aware.downShortYd', 1, 0.5, 2, 'yd', 'bible', 'J8.4.2', CLOCK],
  // Clock-killing carrier goes down in bounds when a tackler is this close in time.
  ['aware.goDownS', 0.4, 0.2, 0.8, 's', 'assumption', 'J8.4.2', CLOCK],

  // J8.4.3 slides
  ['slide.threatS', 0.6, 0.3, 1.0, 's', 'bible', 'J8.4.3', SLIDE],
  ['slide.leverageYd', 2, 1, 3, 'yd', 'bible', 'J8.4.3', SLIDE],
  ['slide.competeBeta0', 0, -2, 2, 'logit', 'assumption', 'J8.4.3', SLIDE],
  ['slide.competePerZ', 0.8, 0, 2, 'logit/z', 'assumption', 'J8.4.3', SLIDE],

  // J8.6.1 after the catch
  ['yac.turnMinS', 0.2, 0.1, 0.3, 's', 'bible', 'J8.6.1', YAC],
  ['yac.turnMaxS', 0.5, 0.4, 0.7, 's', 'bible', 'J8.6.1', YAC],
  // In stride: moving within this angle of upfield at the catch.
  ['yac.inStrideDeg', 45, 20, 70, 'deg', 'assumption', 'J8.6.1', YAC],
  ['yac.inStrideMinYps', 3, 1, 6, 'yd/s', 'assumption', 'J8.6.1', YAC],

  // J8.6.2 returns
  ['ret.fairCatchS', 0.8, 0.4, 1.2, 's', 'bible', 'J8.6.2', RETURN],
  // A kicked ball can be caught at or below this height.
  ['ret.catchHeightYd', 1.2, 0.8, 1.6, 'yd', 'assumption', 'J8.6.2', RETURN],
  ['ret.touchGapYd', 0.3, 0.1, 0.6, 'yd', 'assumption', 'J8.6.2', STRUCT],
  ['ret.muffBeta0', -4.0, -6, -2, 'logit', 'assumption', 'J8.6.2', RETURN],
  ['ret.muffPerZ', -0.5, -1.5, 0, 'logit/z', 'assumption', 'J8.6.2', RETURN],
  ['ret.muffCrowd', 0.6, 0, 1.5, 'logit', 'assumption', 'J8.6.2', RETURN],
  ['ret.callSideYd', 1.5, 0, 4, 'yd', 'assumption', 'J8.6.2', RETURN],

  // J6.6.1 contact (the carrier module runs the tackle contest on bodies)
  ['tackle.windowS', 0.3, 0.2, 0.5, 's', 'bible', 'J6.6.1', TACKLE],
  ['tackle.contactGapYd', 0.15, 0, 0.4, 'yd', 'assumption', 'J6.6.1', STRUCT],
  ['tackle.missDownS', 0.8, 0.3, 1.5, 's', 'assumption', 'J6.6.1', EXPLOSIVE],
  ['tackle.brokenDownS', 0.4, 0.1, 1.0, 's', 'assumption', 'J6.6.1', EXPLOSIVE],
  // Square approach: angle quality is the cosine of the angle between the tackler's velocity and the line to the carrier, mapped to 0 to 1.
  ['tackle.breakdownYps', 4.0, 2, 6, 'yd/s', 'assumption', 'J2.3.4', TACKLE],
  ['tackle.standingAngleQuality', 0.8, 0.5, 1, 'angle quality', 'assumption', 'J6.6.1', TACKLE],
  ['tackle.momentumRatioMax', 3, 1.5, 6, 'ratio', 'assumption', 'J2.6.1', TACKLE],
  ['tackle.sidelineYd', 1.0, 0.5, 2, 'yd', 'bible', 'J6.6.1', CLOCK],
  ['tackle.secondHitterYd', 1.5, 0.5, 3, 'yd', 'assumption', 'J6.7.1', SECURE],
  // Fumble launch: the ball leaves at this share of the carrier's velocity.
  ['fumble.launchShare', 0.5, 0, 1, 'ratio', 'assumption', 'J6.7.2', STRUCT],
  ['fumble.launchUpYps', 1.0, 0, 3, 'yd/s', 'assumption', 'J6.7.2', STRUCT],
  ['fumble.handHeightYd', 1.0, 0.6, 1.4, 'yd', 'assumption', 'J6.7.2', STRUCT],
  // A loose ball can be gathered at or below this height.
  ['recover.heightYd', 0.6, 0.2, 1.2, 'yd', 'assumption', 'J6.7.2', STRUCT],
  // Below this ball speed a recovery is a fall on it; above, a scoop.
  ['recover.retryS', 0.3, 0.1, 0.8, 's', 'assumption', 'J6.7.2', STRUCT],
  ['recover.fallBelowYps', 2.0, 0.5, 5, 'yd/s', 'assumption', 'J6.7.2', STRUCT],
] as const satisfies readonly ParamRow[];

export type CarrierParamName = (typeof ROWS)[number][0];
export type CarrierParams = Readonly<Record<CarrierParamName, number>>;

export const PARAMS: ParamFile = defineParams('carrier', '0.1.0', ROWS);

/** Resolve once per play, never inside the tick. */
export function carrierParams(t: ParamTable): CarrierParams {
  const out: Record<string, number> = {};
  for (const row of ROWS) out[row[0]] = t.num(`carrier.${row[0]}`);
  return out as CarrierParams;
}

/** Rule keys read. None yet: the dead-ball rules for slides and contact are applied by B3 to the events this module emits. */
export const RULE_KEYS: RuleKeyManifest = [];

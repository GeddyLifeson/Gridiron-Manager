// J1.1.1 field frame, J1.1.2 play frame, J1.1.3 landmarks. Every dimension is read from the rule set
// by key; the engine holds no level check and no literal field dimension.
import type { AttackDir, FieldGeometry, FieldSide, PlayFrame, RuleSet } from '@gm/schema';
import { OPTIONAL_RULE_KEYS, type FieldParams } from './params.ts';

/** Unit conversion (J1.2.1: 1 yd = 3 ft). Arithmetic, not a field dimension. */
const FT_PER_YD = 3;
const HALF = 0.5;

/** J1.1.1: built once per game from `field.*` keys. */
export function fieldGeometry(rules: RuleSet): FieldGeometry {
  const endZoneYd = rules.num('field.end_zone_depth_ft') / FT_PER_YD;
  const goalToGoalYd = rules.num('field.goal_to_goal_yd');
  const widthYd = rules.num('field.width_ft') / FT_PER_YD;
  const hashYd = rules.num('field.hash_from_sideline_ft') / FT_PER_YD;
  const centreY = widthYd * HALF;
  const halfPostYd = (rules.num('field.goal_width_ft') / FT_PER_YD) * HALF;
  return {
    lengthYd: goalToGoalYd + endZoneYd + endZoneYd,
    widthYd,
    goalLineWestX: endZoneYd,
    goalLineEastX: endZoneYd + goalToGoalYd,
    hashSouthY: hashYd,
    hashNorthY: widthYd - hashYd,
    centreY,
    uprightSouthY: centreY - halfPostYd,
    uprightNorthY: centreY + halfPostYd,
    crossbarHeightYd: rules.num('field.crossbar_height_ft') / FT_PER_YD,
  };
}

/** Yard-line name of a field x (J1.1.1): the west team's 0 to 50, then the east team's 50 to 0. */
export interface YardLineName { readonly half: 'west' | 'east' | 'midfield'; readonly yardLine: number }

export function yardLineName(g: FieldGeometry, x: number): YardLineName {
  const mid = (g.goalLineWestX + g.goalLineEastX) * HALF;
  if (x === mid) return { half: 'midfield', yardLine: mid - g.goalLineWestX };
  return x < mid ? { half: 'west', yardLine: x - g.goalLineWestX } : { half: 'east', yardLine: g.goalLineEastX - x };
}

export function xOfYardLine(g: FieldGeometry, name: YardLineName): number {
  return name.half === 'east' ? g.goalLineEastX - name.yardLine : g.goalLineWestX + name.yardLine;
}

/**
 * J1.1.2: the play frame for a ball spot. `lineToGainX` and the goal line are converted to play-frame px.
 * On a kickoff or free kick the caller passes the restraining line as the spot; on a try, the try spot.
 */
export function playFrame(g: FieldGeometry, p: FieldParams, ballX: number, ballY: number, attackDir: AttackDir, lineToGainX: number | null): PlayFrame {
  const goalX = attackDir === 1 ? g.goalLineEastX : g.goalLineWestX;
  const goalLinePx = (goalX - ballX) * attackDir + 0;
  const fromCentre = ballY - g.centreY;
  let fieldSide: FieldSide = 'middle';
  if (fromCentre > p.middleToleranceYd || fromCentre < -p.middleToleranceYd) {
    // The wide side is away from the nearer sideline. North is the offense's left when it attacks east.
    const wideIsNorth = fromCentre < 0;
    fieldSide = wideIsNorth === (attackDir === 1) ? 'left' : 'right';
  }
  return {
    originX: ballX, originY: ballY, attackDir, fieldSide,
    lineToGainPx: lineToGainX === null ? goalLinePx : (lineToGainX - ballX) * attackDir + 0,
    goalLinePx,
  };
}

/** J1.1.3 landmark names. `divider` is derived: halfway between two landmarks. */
export const LANDMARK_NAMES = ['sideline', 'numbersBottom', 'numbersTop', 'hash', 'uprightNear', 'uprightFar', 'middle'] as const;
export type LandmarkName = (typeof LANDMARK_NAMES)[number];
export type LandmarkSide = 'left' | 'right';

function fromSidelineYd(g: FieldGeometry, rules: RuleSet, name: LandmarkName, known: readonly string[]): number | null {
  switch (name) {
    case 'sideline': return 0;
    case 'hash': return g.hashSouthY;
    case 'middle': return g.centreY;
    case 'uprightNear': return g.uprightSouthY;
    case 'uprightFar': return g.uprightNorthY;
    case 'numbersBottom':
    case 'numbersTop': {
      const key = name === 'numbersBottom' ? OPTIONAL_RULE_KEYS[0]! : OPTIONAL_RULE_KEYS[1]!;
      return known.includes(key) ? rules.num(key) / FT_PER_YD : null;
    }
  }
}

/**
 * J1.1.3: the play-frame `py` of a landmark on the offense's left or right. Landmarks are measured
 * from the sideline of the side asked for, so `uprightNear` is the upright nearer that sideline and
 * `uprightFar` the other. Resolved at the snap. Null when the rule set has no value for the landmark
 * (the yard-line numbers until their offsets are sourced): the content lint then fails the play
 * rather than the engine guessing.
 */
export function landmarkPy(name: LandmarkName, side: LandmarkSide, frame: PlayFrame, g: FieldGeometry, rules: RuleSet): number | null {
  const d = fromSidelineYd(g, rules, name, rules.keys());
  if (d === null) return null;
  // The offense's left is north (high y) when it attacks east, south when it attacks west.
  const north = (side === 'left') === (frame.attackDir === 1);
  const y = north ? g.widthYd - d : d;
  return (y - frame.originY) * frame.attackDir + 0;
}

/** J1.1.3 `divider(a, b)`. */
export function dividerPy(a: number, b: number): number { return (a + b) * HALF; }

/** J1.1.3 edge case: a route aiming point past the end line is cut at the end line minus the margin. Play-frame px in and out. */
export function clipPxToEndLine(px: number, frame: PlayFrame, g: FieldGeometry, p: FieldParams): number {
  const endZoneYd = g.goalLineWestX;
  const limit = frame.goalLinePx + endZoneYd - p.landmarkEndLineMarginYd;
  return px > limit ? limit : px;
}

/** J1.4.1: body circle radius from weight. */
export function bodyRadiusYd(weightLb: number, p: FieldParams): number {
  return p.bodyRadiusBaseYd + p.bodyRadiusPerLbYd * weightLb;
}

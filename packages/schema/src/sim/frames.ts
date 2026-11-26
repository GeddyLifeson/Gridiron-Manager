// Simulation contract, part 3: coordinate frames (J1.1.1 field frame, J1.1.2 play frame).
// Field frame: x runs the length of the field from the west end line (x = 0), y runs the width from
// the south sideline (y = 0). Yards. Play frame: origin at the ball's spot at the snap, px toward the
// goal the offense attacks, py to the offense's left. Angles are radians, 0 along +x of the frame in
// use, positive counter-clockwise (J1.2.1).
import type { AttackDir } from './primitives.ts';

export interface FieldPoint { readonly x: number; readonly y: number }
export interface PlayPoint { readonly px: number; readonly py: number }

/**
 * Field geometry built once per game from the rule set (J1.1.1, P1.3.3). Every number comes from
 * `field.*` rule keys; no engine module holds a literal field dimension. The builder
 * (`fieldGeometry(rules)`) lives in @gm/engine-core (WP-09) and is handed to officiating and the
 * resolvers through their inputs.
 */
export interface FieldGeometry {
  /** End line to end line, in yards. */
  readonly lengthYd: number;
  /** Sideline to sideline, in yards. */
  readonly widthYd: number;
  /** x of the west and east goal lines. */
  readonly goalLineWestX: number;
  readonly goalLineEastX: number;
  /** y of the inbounds lines (hash marks), from key `field.hash_from_sideline_ft`. */
  readonly hashSouthY: number;
  readonly hashNorthY: number;
  readonly centreY: number;
  /** Goal posts stand in the plane of each end line (J1.1.1). Heights are yards. */
  readonly uprightSouthY: number;
  readonly uprightNorthY: number;
  readonly crossbarHeightYd: number;
}

/** Which side of the ball is the wide side (J1.1.2). 'left' and 'right' are the offense's left and right. */
export type FieldSide = 'left' | 'right' | 'middle';

/**
 * The play frame (J1.1.2). After a change of possession during a play the frame does not flip.
 * The transform is a translation plus, for an offense attacking west, a rotation by 180 degrees.
 * It is exact: multiplication by +1 or -1 only.
 */
export interface PlayFrame {
  readonly originX: number;
  readonly originY: number;
  readonly attackDir: AttackDir;
  /** Wide side of the field from the ball; 'middle' within 1 yd of centre (starting value, J1.1.2). */
  readonly fieldSide: FieldSide;
  /** Line to gain and goal line in the play frame. The line of scrimmage is px = 0. */
  readonly lineToGainPx: number;
  readonly goalLinePx: number;
}

export function toPlay(f: PlayFrame, p: FieldPoint): PlayPoint {
  // Adding 0 turns a negative zero into zero, so hashes of converted points never differ by sign of zero.
  return { px: (p.x - f.originX) * f.attackDir + 0, py: (p.y - f.originY) * f.attackDir + 0 };
}

export function toField(f: PlayFrame, p: PlayPoint): FieldPoint {
  return { x: f.originX + p.px * f.attackDir, y: f.originY + p.py * f.attackDir };
}

/** Yards from field x to the goal line a team attacks. Negative means in or past that end zone. */
export function yardsToGoal(g: FieldGeometry, x: number, attackDir: AttackDir): number {
  return attackDir === 1 ? g.goalLineEastX - x : x - g.goalLineWestX;
}

/** Yards from a team's own goal line to field x. This is the "ball on" of a play-by-play row. */
export function yardsFromOwnGoal(g: FieldGeometry, x: number, attackDir: AttackDir): number {
  return attackDir === 1 ? x - g.goalLineWestX : g.goalLineEastX - x;
}

/** Field x of a spot a given number of yards from the goal a team attacks. */
export function xAtYardsToGoal(g: FieldGeometry, yards: number, attackDir: AttackDir): number {
  return attackDir === 1 ? g.goalLineEastX - yards : g.goalLineWestX + yards;
}

// Field helpers shared by the clock, series and scrimmage modules. Positions are field-frame yards
// (contract decision D-03). Every dimension comes from the FieldGeometry built from `field.*` keys.
import { otherSide, yardsFromOwnGoal, yardsToGoal, type AttackDir, type FieldGeometry, type RulingContext, type Side } from '@gm/schema';

/** Direction `side` attacks on this play. The situation gives the direction of the team that snaps. */
export function attackDirOf(ctx: RulingContext, side: Side): AttackDir {
  const d = ctx.situation.attackDir;
  if (side === ctx.situation.offense) return d;
  return d === 1 ? -1 : 1;
}

/** Field x of the goal line a team attacks, and of the one it defends. */
export function attackedGoalX(g: FieldGeometry, dir: AttackDir): number { return dir === 1 ? g.goalLineEastX : g.goalLineWestX; }
export function ownGoalX(g: FieldGeometry, dir: AttackDir): number { return dir === 1 ? g.goalLineWestX : g.goalLineEastX; }

/** Field x of a spot `yards` out from a team's own goal line. */
export function xAtYardsFromOwnGoal(g: FieldGeometry, yards: number, dir: AttackDir): number {
  return dir === 1 ? g.goalLineWestX + yards : g.goalLineEastX - yards;
}

/** Signed yards from `fromX` to `toX` along a direction of attack. Positive is forward. */
export function forwardYards(fromX: number, toX: number, dir: AttackDir): number { return (toX - fromX) * dir + 0; }

/** The forward point of the ball is on, above or behind the plane of the goal line the team attacks (B7.2.1). */
export function reachedAttackedGoal(g: FieldGeometry, x: number, dir: AttackDir): boolean { return yardsToGoal(g, x, dir) <= 0; }

/**
 * Some part of the ball is on or behind the team's own goal line (B7.5.1: the ball is in the end zone
 * until the entire ball is in the field of play). `x` is the forward point, so the rear point is one
 * ball length behind it.
 */
export function inOwnEndZone(g: FieldGeometry, x: number, dir: AttackDir, ballLengthYd: number): boolean {
  return yardsFromOwnGoal(g, x, dir) <= ballLengthYd;
}

/** The side that defends the end zone a loose ball lies in, or null when the ball is in the field of play. */
export function endZoneOwner(g: FieldGeometry, x: number, ctx: RulingContext): Side | null {
  const off = ctx.situation.offense;
  const offDir = ctx.situation.attackDir;
  if (x <= g.goalLineWestX) return offDir === 1 ? off : otherSide(off);
  if (x >= g.goalLineEastX) return offDir === 1 ? otherSide(off) : off;
  return null;
}

/** Lateral placement for the next snap (B3.3.3 rules 1 and 2): between the inbounds lines, or on the nearer one. */
export function inboundsY(g: FieldGeometry, y: number): number {
  if (y < g.hashSouthY) return g.hashSouthY;
  if (y > g.hashNorthY) return g.hashNorthY;
  return y;
}

/** The same spot seen from the other end after a change of goals (B1.1.3, J11.8.1). Exact: one subtraction per axis. */
export function mirrorSpot(g: FieldGeometry, x: number, y: number): { x: number; y: number } {
  return { x: g.lengthYd - x + 0, y: g.widthYd - y + 0 };
}

// Culture strength (L2.4.1): one hidden team value for how strongly players hold each other to the coach's
// standard. It builds over months and cannot be bought with one speech. Winning does not enter directly.
import { cp } from './params.ts';

export interface StrengthInputs {
  /** Influence-weighted mean buy-in (L1.6.1), 0 to 100. */
  readonly weightedBuyIn: number;
  /** Consistency of discipline (L3.3.1), 0 to 100. */
  readonly consistency: number;
  /** Mean room cohesion (L2.1.2), 0 to 100. */
  readonly meanCohesion: number;
  /** Share of snaps returning, 0 to 1. */
  readonly continuityShare: number;
  /** Head coach's seasons with the team. */
  readonly coachSeasons: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** target = 0.35 buy-in + 0.30 consistency + 0.15 cohesion + 0.10 continuity + 0.10 tenure (capped at 4 seasons). */
export function strengthTarget(i: StrengthInputs): number {
  const max = cp('strength.max');
  const tenure = (Math.min(i.coachSeasons, cp('strength.tenureCapSeasons')) / cp('strength.tenureCapSeasons')) * max;
  return clamp(
    cp('strength.w.buyIn') * i.weightedBuyIn
      + cp('strength.w.consistency') * i.consistency
      + cp('strength.w.cohesion') * i.meanCohesion
      + cp('strength.w.continuity') * clamp(i.continuityShare, 0, 1) * max
      + cp('strength.w.tenure') * tenure,
    0, max,
  );
}

/** One week: culture moves 8 percent of the way to its target (L2.4.1), so it never moves more than 8 points. */
export function stepStrength(current: number, i: StrengthInputs): number {
  return current + cp('strength.weeklyShare') * (strengthTarget(i) - current);
}

/** A new head coach starts at 40 or the old value times 0.6, whichever is lower (L2.4.1). */
export function newCoachStrength(old: number): number {
  return Math.min(cp('strength.newCoachStart'), old * cp('strength.newCoachKeep'));
}

/** A mid-season interim coach inherits culture times 0.8 (L2.4.1 edge case). */
export function interimStrength(old: number): number {
  return old * cp('strength.interimKeep');
}

/**
 * A logged L9 crisis may move culture past the weekly limit (L2.4.1 acceptance). The crisis event id is
 * required so every larger move is traceable to the log.
 */
export function crisisShock(current: number, delta: number, crisisEventId: number): number {
  if (!Number.isInteger(crisisEventId) || crisisEventId <= 0) throw new Error('people.culture: a culture shock needs a logged L9 crisis event (L2.4.1)');
  return clamp(current + delta, 0, cp('strength.max'));
}

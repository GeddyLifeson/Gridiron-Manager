// The other side of a skill term (ruling of 2026-11-26: skill stays on one pro scale, and no term is measured
// against a "level of play"). A term that read one man's skill alone, such as a quarterback's read clock or a
// blocker's urge to hold, now reads it against the men who are testing it on this play: their own grades, on
// the same scale, with the same slope. Two rosters of the same skill then play the same game whatever that
// skill is, and a gap between them still shows at full size.
//
// These are engine truth, like every contest (J6): they set how hard a job is, and are never shown to the man
// doing it as knowledge of his opponent (Q1.4.1, K9).
import { BEHAVIORS, SLOTS_PER_TEAM, SLOT_COUNT, issToZ, type Behavior, type TickWorld } from '@gm/schema';

/** Bit mask of behavior codes, for `opposingZ`. */
export function behaviorMask(behaviors: readonly Behavior[]): number {
  let m = 0;
  for (const b of behaviors) m |= 1 << BEHAVIORS.indexOf(b);
  return m;
}

/** The pass rush as it is being run this tick. */
export const RUSHING = behaviorMask(['passRush', 'blitz', 'rushKick']);
/** The men in coverage this tick. */
export const COVERING = behaviorMask(['zoneDrop', 'manCover', 'deepZone', 'spy']);

/** The men running routes this tick. */
export const RECEIVING = behaviorMask(['route']);

/**
 * How fast a man sorts out the play in front of him: the two mental grades every player holds at his own
 * position's level (D4). The other side of a term that has no single opponent grade of its own (a read, a catch
 * made in space, the urge to foul). ASSUMPTION: no source says which grades test these; the choice keeps to
 * grades that mean the same thing at every position.
 */
export const READING = ['play_recognition', 'processing_speed'] as const;

/** One man's mean z over `attrs`, less his fatigue and injury penalties (J6.1.1). A missing grade counts as 50. */
export function bodyZ(w: TickWorld, slot: number, attrs: readonly string[]): number {
  const a = w.slots[slot]!.player.attributes, pl = w.players;
  let sum = 0;
  for (let i = 0; i < attrs.length; i++) sum += issToZ(a[attrs[i]!] ?? 50);
  return sum / attrs.length - pl.dFatigueZ[slot]! - pl.dInjuryZ[slot]!;
}

/**
 * Mean z over `attrs` of the men opposite `slot` whose behavior this tick is in `mask`. When none of them is
 * (a call with no rusher, a kick), the mean of their whole eleven. Slots are read in order (J13.3.2).
 */
export function opposingZ(w: TickWorld, slot: number, mask: number, attrs: readonly string[]): number {
  const from = slot < SLOTS_PER_TEAM ? SLOTS_PER_TEAM : 0, to = from + SLOTS_PER_TEAM, pl = w.players;
  let sum = 0, n = 0, all = 0, nAll = 0;
  for (let s = from; s < to && s < SLOT_COUNT; s++) {
    if (w.slots[s] === undefined) continue;
    const z = bodyZ(w, s, attrs);
    all += z; nAll++;
    if ((mask & (1 << pl.behavior[s]!)) !== 0) { sum += z; n++; }
  }
  return n > 0 ? sum / n : nAll > 0 ? all / nAll : 0;
}

/**
 * Mean z over `attrs` of the whole eleven opposite `slot`, from the grades alone. For the pre-snap phase, where
 * nobody has a behavior yet, and for hazards that read the same value all play.
 */
export function opposingElevenZ(w: TickWorld, slot: number, attrs: readonly string[]): number {
  const from = slot < SLOTS_PER_TEAM ? SLOTS_PER_TEAM : 0, to = from + SLOTS_PER_TEAM;
  let sum = 0, n = 0;
  for (let s = from; s < to && s < SLOT_COUNT; s++) {
    const info = w.slots[s];
    if (info === undefined) continue;
    const a = info.player.attributes;
    for (let i = 0; i < attrs.length; i++) { sum += issToZ(a[attrs[i]!] ?? 50); n++; }
  }
  return n > 0 ? sum / n : 0;
}

// The life-realism defaults that are still open for Marlon (E7.4.2 open question, E8.2.3 open
// question, E8.3.2 open question). Each is one release-wide design switch, the same for every career
// and every AI coach, never a per-user difficulty setting (A3 one-difficulty ruling). A certified
// record names the switch set it ran under (E7.7.1 rule 2) through `realismKey`.
//
// What is NOT a switch: family health history or any other picked trait (E8.2.1 open question). The
// no-traits ruling of 2026-11-25 already answers it: health reads only hours, sleep and age.

export interface LifeRealism {
  /** E7.4.2 rules 1 and 2: a worn-down or exhausted coach gets sideline information a few seconds later
   *  and gets through fewer halftime items. Off: overwork matters only through E8. Rule 3 (slow work
   *  during the week) is about hours, not the game, and stays on. */
  readonly gameDayTiredness: boolean;
  /** E8.2.3: a warned coach who carries on can be forced to step away for weeks. Off: the consequence
   *  stops at the physician's warning, the tracker and the household's reaction. */
  readonly healthEvents: boolean;
  /** E8.3.2 rule 6: a household strained for years after two plain warnings may separate. Off: the
   *  floor is "strained" and the partner keeps asking for change. */
  readonly separation: boolean;
}

/** Defaults follow the bible as written (each leaf adopts the audit's recommendation). */
export const DEFAULT_LIFE_REALISM: LifeRealism = Object.freeze({
  gameDayTiredness: true,
  healthEvents: true,
  separation: true,
});

/** Stable short key for certified records and save headers, e.g. "life:t1h1s1". */
export function realismKey(r: LifeRealism): string {
  const b = (x: boolean) => (x ? '1' : '0');
  return `life:t${b(r.gameDayTiredness)}h${b(r.healthEvents)}s${b(r.separation)}`;
}

/** Who a life record belongs to. Imported real people (area U) have no E7 consequences beyond the
 *  computed sleep debt and no E8 state at all (E8 caution 3, E8.5.1 acceptance 3). */
export interface LifeSubject {
  readonly personId: number;
  /** True for a person imported from a real-people pack. */
  readonly imported: boolean;
}

/** Throws when an E8 record would be made for an imported person. Every E8 entry point calls it. */
export function assertGenerated(s: LifeSubject, what: string): void {
  if (s.imported) throw new Error(`life: no ${what} for imported person ${s.personId} (E8 caution 3)`);
}

/** Seeded draws come in from the caller (career may not import engine-core; an engine-core Stream fits). */
export interface LifeRandom {
  /** Uniform in [0, 1). */
  uniform(): number;
}

/** Whole number in [min, max] from one uniform draw. */
export function drawInt(rng: LifeRandom, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.min(max - min, Math.floor(rng.uniform() * (max - min + 1)));
}

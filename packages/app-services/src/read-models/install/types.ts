// The install board read model (O3.3.2 over G5, D9 and H1). Plain data only. Every knowledge number is the
// staff's estimate (G5.4.1), never true knowledge, and every projection uses nominal yields (G5.1.2). The
// mental-error figures are D9.4.1's chance evaluated at the staff's estimate, so they are as wrong as the
// estimate is; the screen says so.

export interface InstallLock { readonly allowed: boolean; readonly heldBy: string | null; readonly suggest: boolean }

/** One teaching period a card is given on its day (H3 practice period or H4 meeting). */
export interface PeriodRow { readonly kind: 'meeting' | 'film' | 'walkthrough' | 'practice'; readonly label: string; readonly minutes: number | null; readonly reps: number | null }

/** A card on the board: one install unit (G5.1.1). */
export interface InstallCard {
  readonly unitId: string;
  readonly label: string;
  readonly kind: 'part' | 'play';
  /** Learning units per position group (G5.1.1); the card's teaching load. */
  readonly groups: readonly { readonly group: string; readonly units: number }[];
  readonly load: number;
  readonly periods: readonly PeriodRow[];
  /** Prerequisites not scheduled on or before this card's day (G5.1.1). */
  readonly missing: readonly string[];
  /** Every slated player at the installed threshold by the staff's estimate (G5.1.1). */
  readonly installed: boolean;
  readonly alwaysUp: boolean;
  /** Why the card is in the tray: never placed, or its day was removed by a short week (O3.3.2 edge case). */
  readonly tray: 'unplaced' | 'day_removed' | null;
}

/** One position group's teaching load on a day against the G5.2.1 daily limit. */
export interface GroupLoad {
  readonly group: string;
  /** Distinct learning units scheduled for the group that day. */
  readonly units: number;
  readonly limit: number;
  /** Units past the limit, taught at the reduced yield (G5.2.1). */
  readonly over: number;
  /** Share of the nominal teaching lost on the over-limit units: 1 minus the over-limit yield. */
  readonly lostShare: number;
}

export interface DayColumn {
  readonly id: string;
  readonly label: string;
  readonly cards: readonly InstallCard[];
  readonly load: readonly GroupLoad[];
  /** Any group over the limit: the header turns to a warning (O3.3.2). */
  readonly overloaded: boolean;
}

/** A player behind the installed threshold on a unit, with D9.4 at his estimate. */
export interface Lagger {
  readonly player: number;
  readonly name: string;
  readonly position: string;
  readonly estimate: number;
  /** D9.4.1 chance of a knowledge error on his assignment per snap at the estimate (quiet stadium, no line change). */
  readonly errorChance: number;
  /** D9.4.1 processing delay in seconds at the estimate. */
  readonly delayS: number;
}

export interface GroupReadiness {
  readonly group: string;
  readonly players: number;
  /** G5.4.1 shown readiness: mean minus half the gap to the lowest. */
  readonly readiness: number;
  /** D9.6.1 weakest link: the lowest estimate. */
  readonly weakest: number;
  /** No slated player in the group has a staff estimate yet. */
  readonly unjudged: boolean;
  readonly laggers: readonly Lagger[];
}

export interface UnitReadiness { readonly unitId: string; readonly label: string; readonly installed: boolean; readonly groups: readonly GroupReadiness[] }

export interface InstallView {
  readonly teamId: number;
  readonly side: 'offense' | 'defense' | 'special_teams';
  readonly mode: 'week' | 'camp';
  readonly days: readonly DayColumn[];
  readonly tray: readonly InstallCard[];
  readonly readiness: readonly UnitReadiness[];
  /** Default install order respecting every prerequisite (G5.1.1); empty when a cycle is found. */
  readonly order: readonly string[];
  readonly orderProblem: string | null;
  readonly numbers: { readonly threshold: number; readonly dailyLimit: number; readonly overLimitYield: number; readonly shortWeek: boolean };
  readonly totals: { readonly placed: number; readonly unplaced: number; readonly installed: number };
  readonly locks: { readonly edit: InstallLock };
}

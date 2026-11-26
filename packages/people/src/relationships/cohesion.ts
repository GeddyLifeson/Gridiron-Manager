// Unit cohesion from snaps together (X7.3.1) and its capped contest input (X7.3.2), plus the reader that
// feeds D9.5.1 (pair cohesion 0 to 100, owned by the knowledge package).
//
// Counts keep game snaps and practice team reps apart, because X7.3.1 and D9.5.1 weight practice
// differently (a quarter here, 0.6 there; raised with the bible fixes thread). Each reader applies its own
// weight to the same raw counts, so the play log is counted once.
import type { CohesionRow, WorldDate } from '@gm/schema';
import { dayNumber } from './edges.ts';
import { rp } from './params.ts';

/** The units of X7.3.1 (starting list). */
export const COHESION_UNITS = ['ol', 'qb_center', 'qb_receiver', 'secondary'] as const;
export type CohesionUnit = (typeof COHESION_UNITS)[number];

/** Who was on the field (or in the team period) for one snap, by unit role. Missing roles count nothing. */
export interface SnapLineup {
  /** The five offensive linemen in the game. */
  readonly offensiveLine?: readonly number[];
  readonly quarterback?: number | null;
  readonly center?: number | null;
  /** Every eligible receiver on the field. */
  readonly receivers?: readonly number[];
  /** Every defensive back on the field. */
  readonly secondary?: readonly number[];
}

/** Raw counts for one pair in one unit. */
export interface PairCount {
  readonly unit: CohesionUnit;
  readonly a: number;
  readonly b: number;
  /** Game snaps together, this season plus carryover. */
  gameSnaps: number;
  /** Practice team reps together, this season plus carryover. */
  practiceReps: number;
  /** Last date the pair took a snap or rep together, for D9.5.1's in-season decay. */
  lastTogether: WorldDate;
}

const pairKey = (unit: CohesionUnit, a: number, b: number): string => `${unit}:${a}:${b}`;

function pairsOf(unit: CohesionUnit, l: SnapLineup): [number, number][] {
  const out: [number, number][] = [];
  const all = (ids: readonly number[]): void => {
    const s = [...new Set(ids)].sort((x, y) => x - y);
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) out.push([s[i]!, s[j]!]);
  };
  const ordered = (x: number, y: number): void => { if (x !== y) out.push(x < y ? [x, y] : [y, x]); };
  if (unit === 'ol' && l.offensiveLine) all(l.offensiveLine);
  if (unit === 'secondary' && l.secondary) all(l.secondary);
  if (unit === 'qb_center' && l.quarterback != null && l.center != null) ordered(l.quarterback, l.center);
  if (unit === 'qb_receiver' && l.quarterback != null && l.receivers) {
    for (const r of [...new Set(l.receivers)].sort((x, y) => x - y)) ordered(l.quarterback, r);
  }
  return out;
}

/** Pair counts of one team. Seasons roll with `rollSeason`. */
export class CohesionLedger {
  private readonly pairs = new Map<string, PairCount>();

  constructor(readonly teamId: number, public seasonYear: number) {}

  /** Count one snap (game) or one team rep (practice) for every unit pair in the lineup (X7.3.1). */
  record(lineup: SnapLineup, kind: 'game' | 'practice', date: WorldDate): void {
    for (const unit of COHESION_UNITS) {
      for (const [a, b] of pairsOf(unit, lineup)) {
        const k = pairKey(unit, a, b);
        let p = this.pairs.get(k);
        if (!p) { p = { unit, a, b, gameSnaps: 0, practiceReps: 0, lastTogether: date }; this.pairs.set(k, p); }
        if (kind === 'game') p.gameSnaps += 1; else p.practiceReps += 1;
        if (dayNumber(date) > dayNumber(p.lastTogether)) p.lastTogether = date;
      }
    }
  }

  get(unit: CohesionUnit, x: number, y: number): PairCount | undefined {
    return this.pairs.get(pairKey(unit, Math.min(x, y), Math.max(x, y)));
  }

  all(): PairCount[] {
    return [...this.pairs.values()].sort((p, q) => p.unit.localeCompare(q.unit) || p.a - q.a || p.b - q.b);
  }

  /** Close the season: counts carry over at 70 percent (X7.3.1). */
  rollSeason(nextYear: number): void {
    const keep = rp('cohesion.carryover');
    for (const p of this.pairs.values()) {
      p.gameSnaps *= keep;
      p.practiceReps *= keep;
    }
    this.seasonYear = nextYear;
  }

  /** G-00 `CohesionRow`s: shared snaps with practice at the X7.3.1 weight, rounded to whole snaps. */
  toRows(): CohesionRow[] {
    return this.all().map((p) => ({ teamId: this.teamId, seasonYear: this.seasonYear, unitKey: p.unit, a: p.a, b: p.b, snapsTogether: Math.round(sharedSnaps(p)) }));
  }
}

/** Shared snaps by X7.3.1: game snaps in full, practice team reps at a quarter. */
export function sharedSnaps(p: Pick<PairCount, 'gameSnaps' | 'practiceReps'>): number {
  return p.gameSnaps + rp('cohesion.practiceWeight') * p.practiceReps;
}

/** What D9.5.1 reads for a pair: raw counts and the last date together. D9.5.1 applies its own weights and curve. */
export interface D95PairInput {
  readonly unit: CohesionUnit;
  readonly a: number;
  readonly b: number;
  readonly gameSnaps: number;
  readonly practiceReps: number;
  readonly lastTogether: WorldDate;
}

export function d95Inputs(ledger: CohesionLedger): D95PairInput[] {
  return ledger.all().map((p) => ({ unit: p.unit, a: p.a, b: p.b, gameSnaps: p.gameSnaps, practiceReps: p.practiceReps, lastTogether: p.lastTogether }));
}

/**
 * The X7.3.2 contest modifier: a reduction of the assignment-error chance on two-teammate contests, rising
 * on a saturating curve that reaches 90 percent of its maximum at 800 shared snaps. The curve is
 * snaps / (snaps + h) with h set so that 800 gives 0.9 (the leaf names the saturation point, not the curve).
 * The maximum is 1.5 percentage points times the shipped switch, which is 0 until the X7.3.1 fact reaches
 * 2 of 3; `capOverride` exists for the test that states the band in advance.
 */
export function contestModifier(snaps: number, capOverride?: number): number {
  const at = rp('cohesion.contest.saturationSnaps');
  const share = rp('cohesion.contest.saturationShare');
  const h = (at * (1 - share)) / share;
  const cap = capOverride ?? rp('cohesion.contest.cap') * rp('cohesion.contest.shipped');
  const x = Math.max(0, snaps);
  return cap * (x / (x + h));
}

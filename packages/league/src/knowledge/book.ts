// The knowledge book: true knowledge per (player, item), stored as the value at the last touch, the peak
// and the day of the last rep or review. Decay (D9.3.1) is a closed form of the days since that touch, so
// reading a value on any day is exact and needs no daily tick (the fast path is the same model, A3 row 20).
//
// True knowledge is truth-class data: only the staff estimate (estimate.ts) may reach a read model (K9).
import type { DeterministicMath } from '@gm/schema';
import { DAYS_PER_WEEK } from '../calendar/date.ts';
import type { ItemCatalogue } from './items.ts';
import { clampK, num, type KnowledgeNumbers } from './params.ts';

export interface KnowledgeCell {
  /** True knowledge at `touched`. */
  value: number;
  /** Highest value reached. Sets the decay floor and the camp relearn region. */
  peak: number;
  /** Absolute calendar day (calendar/date.ts) of the last rep, review or gain. */
  touched: number;
}

/** A plain row for saving. Persisted shape to be registered by the schema integrator. */
export interface KnowledgeRow {
  readonly player: number;
  readonly item: string;
  readonly value: number;
  readonly peak: number;
  readonly touched: number;
}

const key = (player: number, item: string): string => `${player}|${item}`;

export class KnowledgeBook {
  private readonly cells = new Map<string, KnowledgeCell>();

  constructor(readonly n: KnowledgeNumbers, readonly math: DeterministicMath, readonly catalogue: ItemCatalogue) {}

  /** D9.3.1 floor for an item: a share of its peak, higher for families. */
  floor(item: string, peak: number): number {
    const it = this.catalogue.get(item);
    const share = it && it.level === 'family' ? num(this.n, 'decay.floorFamily') : num(this.n, 'decay.floorConcept');
    return peak * share;
  }

  /** D9.3.1: above the floor, 1.5 percent per week since the last touch, never below the floor. */
  decayed(item: string, c: KnowledgeCell, day: number): number {
    const weeks = Math.max(0, day - c.touched) / DAYS_PER_WEEK;
    const f = this.floor(item, c.peak);
    if (c.value <= f) return c.value;
    return Math.max(f, c.value * this.math.pow(1 - num(this.n, 'decay.weeklyRate'), weeks));
  }

  /** Raw true knowledge of one item on a day (zero when never taught). */
  raw(player: number, item: string, day: number): number {
    const c = this.cells.get(key(player, item));
    return c ? this.decayed(item, c, day) : 0;
  }

  /**
   * True knowledge as the play uses it: an uninstalled item reads zero (D9.1.1 acceptance), and a concept or
   * variation cannot exceed its family by more than the leaf's margin.
   */
  value(player: number, item: string, day: number): number {
    if (!this.catalogue.isInstalled(item)) return 0;
    const v = this.raw(player, item, day);
    const it = this.catalogue.get(item);
    if (!it || it.level === 'family' || it.level === 'terminology') return v;
    const fam = this.raw(player, this.catalogue.familyOf(item), day);
    return Math.min(v, fam + num(this.n, 'items.conceptOverFamilyMax'));
  }

  peak(player: number, item: string): number {
    return this.cells.get(key(player, item))?.peak ?? 0;
  }

  cell(player: number, item: string): Readonly<KnowledgeCell> | undefined {
    return this.cells.get(key(player, item));
  }

  /** Set a value on a day (gain, review or carryover). Peak follows. */
  set(player: number, item: string, value: number, day: number, peak?: number): void {
    const v = clampK(this.n, value);
    const old = this.cells.get(key(player, item));
    this.cells.set(key(player, item), { value: v, peak: Math.max(v, peak ?? 0, old?.peak ?? 0), touched: day });
  }

  /** D9.3.1 review: resets the timer and restores up to the leaf's points, never past the peak. */
  review(player: number, item: string, day: number): void {
    const c = this.cells.get(key(player, item));
    if (!c) return;
    const now = this.decayed(item, c, day);
    const back = Math.min(num(this.n, 'decay.reviewRestore'), Math.max(0, c.peak - now));
    this.set(player, item, now + back, day);
  }

  /** Effective knowledge for one assignment: the minimum over its items (D9.1.1). Empty list reads full. */
  effective(player: number, items: readonly string[], day: number): number {
    let k = num(this.n, 'scale.max');
    for (const i of items) k = Math.min(k, this.value(player, i, day));
    return k;
  }

  players(): number[] {
    const s = new Set<number>();
    for (const k of this.cells.keys()) s.add(Number(k.slice(0, k.indexOf('|'))));
    return [...s].sort((a, b) => a - b);
  }

  rows(): KnowledgeRow[] {
    const out: KnowledgeRow[] = [];
    for (const [k, c] of this.cells) {
      const at = k.indexOf('|');
      out.push({ player: Number(k.slice(0, at)), item: k.slice(at + 1), value: c.value, peak: c.peak, touched: c.touched });
    }
    return out.sort((a, b) => a.player - b.player || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
  }

  load(rows: readonly KnowledgeRow[]): void {
    for (const r of rows) this.cells.set(key(r.player, r.item), { value: r.value, peak: r.peak, touched: r.touched });
  }
}

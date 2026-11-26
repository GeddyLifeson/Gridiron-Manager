// D9.2.1 teaching units and the gain formula:
//   gain = base(mode) x units x (100 - k)/100 x learning rate x mode weight x attention x teacher
//          / (difficulty x crowding)
// applied unit by unit, so a block of n units is the closed form of n single units:
//   gap after = gap x (1 - r/100)^n with r = base x multipliers, gap = 100 - k.
// The result never rises past the mode's cap (meetings 60, walk-through 80, reps 100) but a value already
// above a cap is not lowered. Below the previous peak in camp the gain doubles (D9.3.1).
import type { DeterministicMath } from '@gm/schema';
import type { KnowledgeBook } from './book.ts';
import { num, type KnowledgeNumbers } from './params.ts';

export const MODES = ['meeting', 'film', 'walkthrough', 'fullSpeed', 'gameSnap'] as const;
export type TeachMode = (typeof MODES)[number];

/** Modes counted in minutes; the others in reps. */
export const MINUTE_MODES: ReadonlySet<TeachMode> = new Set(['meeting', 'film']);

/** One teaching event for one player on one item (H3 and H4 produce these). */
export interface TeachingEvent {
  readonly player: number;
  readonly position: string;
  readonly item: string;
  readonly mode: TeachMode;
  /** Minutes on the item (meeting, film) or reps (walk-through, full speed, game). */
  readonly amount: number;
  readonly day: number;
  /** Minutes already spent in this meeting before this item (G5.1.2 attention). */
  readonly meetingMinutesBefore?: number;
  /** True during the camp window (D9.3.1 relearn below peak). */
  readonly camp?: boolean;
  /** True when this event is the player's day over the G5.2.1 group limit. */
  readonly overDailyLimit?: boolean;
}

/** Per-player multipliers for a week (D4.4.1 learning rate and mode weights; D5, D10, D12 attention). */
export interface Learner {
  readonly learningRate: number;
  /** Mode weights scaled so an average player has 1.0 in each mode. */
  readonly modeWeight: Readonly<Partial<Record<TeachMode, number>>>;
  /** Buy-in, coachability and fatigue combined, 1.0 for an average attentive player. */
  readonly attention: number;
  /** New items for this player this week (crowding). */
  readonly newItemsThisWeek: number;
}

export const AVERAGE_LEARNER: Learner = { learningRate: 1, modeWeight: {}, attention: 1, newItemsThisWeek: 0 };

/** D9.2.1 crowding = 1 + (new items / divisor)^2. */
export function crowding(n: KnowledgeNumbers, newItems: number): number {
  const x = newItems / num(n, 'gain.crowdingDivisor');
  return 1 + x * x;
}

/** D9.2.1 teacher factor, clamped to the leaf's range. 1 is an average teacher. */
export function teacherFactor(n: KnowledgeNumbers, t: number): number {
  return Math.min(num(n, 'gain.teacherMax'), Math.max(num(n, 'gain.teacherMin'), t));
}

/** The mode's cap on what it alone can reach. */
export function modeCap(n: KnowledgeNumbers, mode: TeachMode): number {
  if (MINUTE_MODES.has(mode)) return num(n, 'gain.cap.meeting');
  if (mode === 'walkthrough') return num(n, 'gain.cap.walkthrough');
  return num(n, 'gain.cap.fullSpeed');
}

export function modeBase(n: KnowledgeNumbers, mode: TeachMode): number {
  return num(n, `gain.base.${mode}`);
}

/** Units of the formula: 5-minute blocks for meetings and film, reps otherwise. */
export function units(n: KnowledgeNumbers, mode: TeachMode, amount: number): number {
  return MINUTE_MODES.has(mode) ? amount / num(n, 'gain.minutesPerUnit') : amount;
}

/**
 * G5.1.2 attention in a long meeting: full until the attention limit, then the minutes past it count at a
 * reduced share. Returns the effective minutes.
 */
export function attentiveMinutes(n: KnowledgeNumbers, before: number, minutes: number): number {
  const limit = num(n, 'gain.attentionMinutes');
  const fresh = Math.max(0, Math.min(minutes, limit - before));
  return fresh + (minutes - fresh) * num(n, 'gain.attentionAfter');
}

/** The per-unit rate r (percent of the remaining gap closed per unit). */
export function unitRate(n: KnowledgeNumbers, e: TeachingEvent, l: Learner, difficulty: number, teacher: number): number {
  const mw = l.modeWeight[e.mode] ?? 1;
  return (modeBase(n, e.mode) * l.learningRate * mw * l.attention * teacherFactor(n, teacher))
    / (difficulty * crowding(n, l.newItemsThisWeek));
}

/**
 * The knowledge after a block of units from `k`. Exact closed form of unit-by-unit gain. `relearnPeak` above
 * `k` doubles the rate in camp for the part below the peak (handled by splitting at the peak).
 */
export function gainFrom(n: KnowledgeNumbers, math: DeterministicMath, k: number, rate: number, u: number, cap: number, relearnPeak = 0, relearn = 1): number {
  if (u <= 0 || rate <= 0 || k >= cap) return k;
  const max = num(n, 'scale.max');
  const step = (from: number, r: number, uu: number): number => max - (max - from) * math.pow(Math.max(0, 1 - r / max), uu);
  let at = k;
  let left = u;
  if (relearn > 1 && relearnPeak > at) {
    const r2 = rate * relearn;
    // Units needed to reach the peak at the doubled rate.
    const q = Math.max(0, 1 - r2 / max);
    const need = q <= 0 ? 0 : math.log((max - relearnPeak) / (max - at)) / math.log(q);
    if (!(need < left)) return Math.min(cap, step(at, r2, left));
    at = relearnPeak;
    left -= need;
  }
  return Math.min(cap, step(at, rate, left));
}

/** Apply one teaching event to the book. Returns the change in true knowledge. */
export function teach(book: KnowledgeBook, e: TeachingEvent, l: Learner, teacher = 1): number {
  const n = book.n;
  const before = book.raw(e.player, e.item, e.day);
  const minutes = MINUTE_MODES.has(e.mode) ? attentiveMinutes(n, e.meetingMinutesBefore ?? 0, e.amount) : e.amount;
  let u = units(n, e.mode, minutes);
  if (e.overDailyLimit) u *= num(n, 'install.overLimitYield');
  const diff = book.catalogue.difficulty(e.item, e.position);
  const rate = unitRate(n, e, l, diff, teacher);
  // Any contact with the item counts as a review first: it resets the decay timer and restores up to the
  // leaf's points (D9.3.1); the teaching gain then runs from there.
  const reviewed = MINUTE_MODES.has(e.mode) ? e.amount >= num(n, 'decay.reviewMinutes') : e.amount > 0;
  if (reviewed && book.cell(e.player, e.item)) book.review(e.player, e.item, e.day);
  const from = book.raw(e.player, e.item, e.day);
  const peak = book.peak(e.player, e.item);
  const final = gainFrom(n, book.math, from, rate, u, Math.max(from, modeCap(n, e.mode)), peak, e.camp ? num(n, 'gain.campRelearn') : 1);
  if (u > 0 || reviewed) book.set(e.player, e.item, final, e.day);
  return final - before;
}

// One accumulated stress value and its bands (X5.2.1, X5.2.3 rule 5). Stress carries strain forward so
// problems come from a sustained pattern: inflow from weighted unmet needs, capped event hits, and a decay
// scaled by `patience`. Bands are 250 wide with a 50-point hysteresis on the way down.
import { np } from './params.ts';
import type { NeedId } from './registry.ts';

export const STRESS_BANDS = ['settled', 'unsettled', 'unhappy', 'at_breaking_point'] as const;
export type StressBand = (typeof STRESS_BANDS)[number];

/** One contributor to stress in one update, kept for the final straw (X5.2.3 rule 7). */
export interface Contribution {
  /** `need:<id>` for need inflow, otherwise the event source id. */
  readonly source: string;
  readonly amount: number;
  /** Update index (weeks since the person's record began). */
  readonly week: number;
}

/** A stress event this update. Positive is a hit, negative a relief; each is capped at the single-event cap (X5.2.1 rule 2). */
export interface StressEvent { readonly source: string; readonly size: number }

/**
 * Per-person bookkeeping the engine needs beyond G-00's `PersonState` (CR-G23-1 asks for a home for it):
 * the update counter, weeks at the current band, recent contributions, pending talks and coping streaks.
 */
export interface StressMemo {
  readonly week: number;
  /** Consecutive updates in the current band (X5.2.3 rule 7 dwell). */
  readonly bandWeeks: number;
  /** Consecutive updates at `unsettled` or worse (X5.2.4 rule 3) and at `settled` (rule 5). */
  readonly strainedWeeks: number;
  readonly settledWeeks: number;
  /** Updates in which the band was held back after a lone event (X5.2.3 acceptance). */
  readonly heldWeeks: number;
  readonly recent: readonly Contribution[];
  readonly talks: readonly PendingTalk[];
}

export const EMPTY_MEMO: StressMemo = { week: 0, bandWeeks: 0, strainedWeeks: 0, settledWeeks: 0, heldWeeks: 0, recent: [], talks: [] };

export interface PendingTalk { readonly needId: NeedId; readonly week: number; readonly levelAtTalk: number }

/** Decay per week for a patience facet 0 to 100: 12 points scaled 0.5 to 1.5 (X5.2.1 rule 1). */
export function decayPerWeek(patience: number): number {
  const lo = np('needs.stress.decayScaleMin');
  const hi = np('needs.stress.decayScaleMax');
  const p = Math.min(100, Math.max(0, patience)) / 100;
  return np('needs.stress.decayPerWeek') * (lo + (hi - lo) * p);
}

export function capEvent(size: number): number {
  const cap = np('needs.stress.eventCap');
  return Math.max(-cap, Math.min(cap, size));
}

/** X5.2.1 rule 3: a dropped goal adds its intensity times 0.6, inside the cap. */
export function droppedGoalHit(intensity: number): StressEvent {
  return { source: 'goal_dropped', size: capEvent(intensity * np('needs.stress.droppedGoalFactor')) };
}

/**
 * X5.2.1 rule 5. `distance` is how far the order sits from the person's facet lean, -1 (fits fully) to +1
 * (fully against). Never for the user or a protected person: returns null.
 */
export function overruledHit(distance: number, who: { isUser: boolean; isProtected: boolean }): StressEvent | null {
  if (who.isUser || who.isProtected) return null;
  const d = Math.max(-1, Math.min(1, distance));
  const size = d > 0 ? d * np('needs.overruled.maxHit') : d * np('needs.overruled.maxRelief');
  return { source: d > 0 ? 'overruled_against_grain' : 'order_fits_grain', size: round1(size) };
}

export interface StressInput {
  readonly needLevels: Readonly<Record<NeedId, number>>;
  readonly weights: Readonly<Record<NeedId, number>>;
  readonly events: readonly StressEvent[];
  readonly patience: number;
  /** 1 in season; the offseason runs monthly (X5.2.1 edge case). */
  readonly weeks?: number;
}

export interface StressStep {
  readonly stress: number;
  readonly band: StressBand;
  readonly bandChanged: boolean;
  readonly memo: StressMemo;
  readonly inflow: number;
}

/** Band for a stress value, with the downward hysteresis (X5.2.3 rule 5). */
export function bandFor(stress: number, previous: StressBand): StressBand {
  const lines = [np('needs.band.unsettled'), np('needs.band.unhappy'), np('needs.band.breaking')];
  let up = 0;
  for (const l of lines) if (stress >= l) up += 1;
  const prevIdx = STRESS_BANDS.indexOf(previous);
  if (up >= prevIdx) return STRESS_BANDS[up]!;
  // Moving down needs stress 50 below the line, so bands do not flicker.
  let idx = prevIdx;
  while (idx > up && stress < lines[idx - 1]! - np('needs.band.downHysteresis')) idx -= 1;
  return STRESS_BANDS[idx]!;
}

/**
 * One stress update (X5.2.1 rule 1): stress += sum over needs (weight x level x 0.3) + event hits, then
 * stress -= decay. A band rise in an update whose only push was one event, with every need met, is held for
 * one update (assumption serving the X5.2.3 acceptance: no breakpoint on a week of one event and met needs).
 */
export function stepStress(stress: number, band: StressBand, memo: StressMemo, input: StressInput): StressStep {
  const weeks = input.weeks ?? 1;
  const week = memo.week + weeks;
  const contributions: Contribution[] = [];
  let inflow = 0;
  for (const [id, level] of Object.entries(input.needLevels)) {
    const w = input.weights[id] ?? 0;
    const add = w * level * np('needs.stress.inflowFactor') * weeks;
    if (add > 0) { inflow += add; contributions.push({ source: `need:${id}`, amount: round1(add), week }); }
  }
  let hits = 0;
  for (const e of input.events) {
    const s = capEvent(e.size);
    hits += s;
    if (s > 0) contributions.push({ source: e.source, amount: s, week });
  }
  const next = clampStress(stress + inflow + hits - decayPerWeek(input.patience) * weeks);
  let nextBand = bandFor(next, band);
  let heldWeeks = 0;
  const rising = STRESS_BANDS.indexOf(nextBand) > STRESS_BANDS.indexOf(band);
  const positiveEvents = input.events.filter((e) => e.size > 0).length;
  if (rising && inflow === 0 && positiveEvents <= 1 && memo.heldWeeks < np('needs.band.singleEventHoldWeeks')) {
    nextBand = band;
    heldWeeks = memo.heldWeeks + 1;
  }
  const changed = nextBand !== band;
  const keepFrom = week - np('needs.act.finalStrawWeeks');
  const strained = nextBand !== 'settled';
  return {
    stress: next,
    band: nextBand,
    bandChanged: changed,
    inflow: round1(inflow),
    memo: {
      week,
      bandWeeks: changed ? 1 : memo.bandWeeks + 1,
      strainedWeeks: strained ? memo.strainedWeeks + 1 : 0,
      settledWeeks: strained ? 0 : memo.settledWeeks + 1,
      heldWeeks,
      recent: [...memo.recent.filter((c) => c.week > keepFrom), ...contributions],
      talks: memo.talks,
    },
  };
}

/** Starting stress for a generated person: 0 to 200, never high at world creation (X5.2.3 rule 5, edge case). */
export function startingStress(draw: () => number): number {
  return Math.floor(draw() * (np('needs.band.startMax') + 1));
}

/** A talk alone (L1): a small one-time relief, recorded so it can be lost (X5.2.1 rule 4). */
export function recordTalk(memo: StressMemo, needId: NeedId, levelAtTalk: number): { memo: StressMemo; relief: StressEvent } {
  return { memo: { ...memo, talks: [...memo.talks, { needId, week: memo.week, levelAtTalk }] }, relief: { source: 'talk', size: -np('needs.talk.relief') } };
}

/**
 * Settles talks older than the window. If the need did not come down, the relief is lost and a penalty
 * applies: one event of relief plus penalty, inside the single-event cap.
 */
export function settleTalks(memo: StressMemo, needLevels: Readonly<Record<NeedId, number>>): { memo: StressMemo; events: StressEvent[] } {
  const due = memo.talks.filter((t) => memo.week - t.week >= np('needs.talk.weeks'));
  const events: StressEvent[] = [];
  for (const t of due) {
    if ((needLevels[t.needId] ?? 0) >= t.levelAtTalk) events.push({ source: 'talk_not_followed', size: capEvent(np('needs.talk.relief') + np('needs.talk.penalty')) });
  }
  return { memo: { ...memo, talks: memo.talks.filter((t) => !due.includes(t)) }, events };
}

function clampStress(x: number): number { return Math.round(Math.min(np('needs.stress.max'), Math.max(0, x))); }
function round1(x: number): number { return Math.round(x * 10) / 10; }

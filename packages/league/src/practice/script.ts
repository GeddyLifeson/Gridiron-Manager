// The practice script, scout cards and the scout team (H3.2.1, H3.2.2, H3.2.3).
import { P } from './params.ts';
import { repsInPeriod } from './practice.ts';
import type { Hash, Look, Period, Practice, Rep, ScoutCard, Script, Side, Unit } from './types.ts';
import { UNITS } from './types.ts';

// ---------------------------------------------------------------------------------------------
// H3.2.2 scout cards
// ---------------------------------------------------------------------------------------------

export type CardMatch = 'exact' | 'near' | 'none';

/** Three-level match between a practised look and what the opponent shows (H3.2.2). */
export function cardMatch(practised: Look, shown: Look): CardMatch {
  if (practised.ref === shown.ref) return 'exact';
  if (practised.family === shown.family) return 'near';
  return 'none';
}

/** Share of the practice gain that applies in the game for that match (starting 1.0, 0.5, 0). */
export function cardMatchFactor(m: CardMatch): number {
  return P(`card_match_${m}`);
}

/** H3.2.2 acceptance: every card links to a tag source or is marked as the coach's own. */
export function cardProblems(cards: readonly ScoutCard[]): string[] {
  return cards.filter((c) => !c.coachsOwn && c.sourceTags.length === 0).map((c) => c.id);
}

/** A fear card for a look not yet scouted (H2.2.3): the coach's own, no tags. */
export function fearCard(id: string, side: Side, look: Look): ScoutCard {
  return { id, side, look, sourceTags: [], coachsOwn: true, count: 0 };
}

// ---------------------------------------------------------------------------------------------
// H3.2.3 scout team
// ---------------------------------------------------------------------------------------------

/** One scout player imitating one opponent on the attributes that matter for the look (0 to 100 scale). */
export interface ScoutAssignment {
  readonly scoutId: string;
  readonly opponentId: string;
  readonly scoutAttrs: readonly number[];
  readonly opponentAttrs: readonly number[];
  /** Effort of the scout player, 0 to 1 (D5, D12). */
  readonly effort: number;
}

/** Closeness 0 to 1 on the key attributes: one minus the mean absolute gap on the 0-100 scale. */
export function closeness(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let gap = 0;
  for (let i = 0; i < n; i++) gap += Math.abs(a[i]! - b[i]!);
  const c = 1 - gap / n / P('scout_attribute_scale');
  return c < 0 ? 0 : c > 1 ? 1 : c;
}

export interface ScoutQuality {
  readonly factor: number;
  /** Assignment with the worst closeness, for the screen's "why" line (H3.2.3 edge case). */
  readonly weakest: string | null;
}

/**
 * Scout-team quality factor (H3.2.3): average closeness times effort, mapped into the starting range
 * 0.7 to 1.0. `organisation` is H3.6.2 rule 4's term (the GA's hidden parameter, or the share the user
 * lined up and briefed correctly), 1 when not modelled. No assignments gives the floor.
 */
export function scoutQuality(as: readonly ScoutAssignment[], organisation = 1): ScoutQuality {
  const lo = P('scout_factor_min');
  const hi = P('scout_factor_max');
  if (as.length === 0) return { factor: lo, weakest: null };
  let sum = 0;
  let worst = Number.POSITIVE_INFINITY;
  let weakest: string | null = null;
  for (const a of as) {
    const c = closeness(a.scoutAttrs, a.opponentAttrs);
    sum += c * Math.max(0, Math.min(1, a.effort));
    if (c < worst) { worst = c; weakest = a.opponentId; }
  }
  const q = (sum / as.length) * Math.max(0, Math.min(1, organisation));
  return { factor: lo + (hi - lo) * q, weakest };
}

// ---------------------------------------------------------------------------------------------
// H3.2.1 the script
// ---------------------------------------------------------------------------------------------

/** A plan item to rehearse: a call from the game plan with the card families it is meant to see. */
export interface PlanItem {
  readonly callId: string;
  readonly side: Side;
  readonly down: number;
  readonly distance: number;
}

const HASHES: readonly Hash[] = ['left', 'middle', 'right'];

/** Units by the starting split, rep by rep, by largest remainder so the shares hold exactly over the period. */
export function unitSequence(n: number, split: { first: number; second: number; third: number }): Unit[] {
  const shares = [split.first, split.second, split.third];
  const total = shares.reduce((a, b) => a + b, 0);
  const out: Unit[] = [];
  const given = [0, 0, 0];
  for (let k = 0; k < n; k++) {
    let best = 0;
    let bestGap = Number.NEGATIVE_INFINITY;
    for (let u = 0; u < UNITS.length; u++) {
      const gap = ((k + 1) * shares[u]!) / (total || 1) - given[u]!;
      if (gap > bestGap) { bestGap = gap; best = u; }
    }
    given[best] = given[best]! + 1;
    out.push(UNITS[best]!);
  }
  return out;
}

/**
 * The coordinator's draft (H3.2.1 rule 5, K6): reps rotate through the plan items for the side and pair
 * each with the side's cards in turn, so every item meets more than one look across the week (rule 3).
 */
export function draftScript(id: string, side: Side, per: Period, practice: Pick<Practice, 'environment'>, items: readonly PlanItem[], cards: readonly ScoutCard[]): Script {
  const n = repsInPeriod(per, practice);
  const mine = items.filter((i) => i.side === side);
  const looks = cards.filter((c) => c.side === side);
  const units = unitSequence(n, { first: P('split_first'), second: P('split_second'), third: P('split_third') });
  const reps: Rep[] = [];
  if (mine.length > 0 && looks.length > 0) {
    for (let k = 0; k < n; k++) {
      const it = mine[k % mine.length]!;
      const card = looks[(k + Math.floor(k / mine.length)) % looks.length]!;
      reps.push({ index: k + 1, callId: it.callId, cardId: card.id, hash: HASHES[k % HASHES.length]!, down: it.down, distance: it.distance, unit: units[k]! });
    }
  }
  return { id, side, reps, approved: false, drafted: true };
}

/** Script rows beyond what the period produces are not run (H3.2.1 acceptance: count = minutes x rate, rounded down). */
export function runnableReps(script: Script, per: Period, practice: Pick<Practice, 'environment'>): readonly Rep[] {
  return script.reps.slice(0, repsInPeriod(per, practice));
}

export interface Coverage {
  /** callId -> scripted reps this week. */
  readonly reps: Readonly<Record<string, number>>;
  readonly zero: readonly string[];
  readonly one: readonly string[];
  readonly more: readonly string[];
}

/** The counter of plan items with zero, one or more reps this week (H3.2.1 "What the user sees"). */
export function coverage(planCalls: readonly string[], scripts: readonly Script[]): Coverage {
  const reps: Record<string, number> = {};
  for (const c of planCalls) reps[c] = 0;
  for (const s of scripts) for (const r of s.reps) reps[r.callId] = (reps[r.callId] ?? 0) + 1;
  const zero: string[] = [];
  const one: string[] = [];
  const more: string[] = [];
  for (const c of planCalls) {
    const n = reps[c]!;
    (n === 0 ? zero : n === 1 ? one : more).push(c);
  }
  return { reps, zero, one, more };
}

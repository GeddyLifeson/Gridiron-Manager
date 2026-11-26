// Who takes each rep (H3.3.1), participation (H3.3.2) and the report label it implies.
import { P } from './params.ts';
import { periodType, repsInPeriod } from './practice.ts';
import { unitSequence } from './script.ts';
import type { DepthChart, Participation, ParticipationLabel, Period, Practice, RepSplit, Script, Side, Unit, UnitShape } from './types.ts';
import { UNITS } from './types.ts';

export const DEFAULT_SPLIT: RepSplit = { first: P('split_first'), second: P('split_second'), third: P('split_third'), overrides: {} };

/** H3.3.1 acceptance: shares per position per period sum to 100 percent. Returns the positions that do not. */
export function splitProblems(s: RepSplit): string[] {
  const out: string[] = [];
  if (s.first + s.second + s.third !== P('percent')) out.push('units');
  for (const [pos, o] of Object.entries(s.overrides)) {
    const sum = Object.values(o).reduce((a, b) => a + b, 0);
    if (sum > P('percent') || Object.values(o).some((v) => v < 0)) out.push(pos);
  }
  return out;
}

export interface RepSlot {
  readonly index: number;
  /** Null for group reps with no script. */
  readonly callId: string | null;
  readonly cardId: string | null;
  readonly unit: Unit;
}

export interface Taker { readonly personId: string; readonly position: string }

export interface RepAssignment {
  readonly period: number;
  readonly slot: RepSlot;
  readonly side: Side;
  readonly takers: readonly Taker[];
  /** Same-position players present who watched from behind (mental reps). */
  readonly watchers: readonly string[];
  /** A slot no healthy player could fill (H3.1.2 edge case: reduced reps, flagged). */
  readonly short: boolean;
}

export interface AssignContext {
  readonly depth: DepthChart;
  readonly shapes: Readonly<Record<Side, UnitShape>>;
  readonly split: RepSplit;
  readonly participation: ReadonlyMap<string, Participation>;
  /** Players out of the rest of the practice (pulled or injured). */
  readonly out: ReadonlySet<string>;
}

/** Mutable per-practice counters: how many reps each limited player has been assigned and has taken. */
export interface RepCounters { readonly assigned: Map<string, number>; readonly taken: Map<string, number> }
export function newCounters(): RepCounters { return { assigned: new Map(), taken: new Map() }; }

/** Positions a period works with: side names expand to the side's shape (H3.1.1 `groups`). */
export function periodPositions(per: Period, side: Side, shapes: Readonly<Record<Side, UnitShape>>): string[] {
  const shape = shapes[side];
  if (per.groups.includes(side)) return [...shape];
  return shape.filter((p) => per.groups.includes(p));
}

/** Sides a period involves, from its groups and its script. */
export function periodSides(per: Period, script: Script | undefined, shapes: Readonly<Record<Side, UnitShape>>): Side[] {
  if (script) return [script.side];
  const sides: Side[] = ['offense', 'defense', 'special_teams'];
  return sides.filter((s) => per.groups.includes(s) || shapes[s].some((p) => per.groups.includes(p)));
}

/** Rep slots for a period: script rows when there is one, else the split over the period's rep count. */
export function slotsFor(per: Period, script: Script | undefined, practice: Pick<Practice, 'environment'>, split: RepSplit): RepSlot[] {
  const n = repsInPeriod(per, practice);
  if (script) return script.reps.slice(0, n).map((r) => ({ index: r.index, callId: r.callId, cardId: r.cardId, unit: r.unit }));
  return unitSequence(n, split).map((unit, k) => ({ index: k + 1, callId: null, cardId: null, unit }));
}

function available(id: string, live: boolean, ctx: AssignContext, counters: RepCounters): boolean {
  if (ctx.out.has(id)) return false;
  const p = ctx.participation.get(id);
  if (!p || p.label === 'full') return true;
  if (p.label === 'did_not_participate') return false;
  if (live) return false; // Limited: no live periods (H3.3.2 rule 1).
  const share = (p.share ?? P('limited_share')) / P('percent');
  const c = counters.assigned.get(id) ?? 0;
  counters.assigned.set(id, c + 1);
  // Takes the rep when the running share steps up: exact over any run of reps.
  return Math.floor((c + 1) * share) > Math.floor(c * share);
}

/** Override player for this rep of a position, by largest remainder over the period (H3.3.1 per-position override). */
function overrideFor(pos: string, k: number, split: RepSplit): string | null {
  const o = split.overrides[pos];
  if (!o) return null;
  const ids = Object.keys(o).sort();
  let best: string | null = null;
  let bestGap = 0;
  for (const id of ids) {
    const share = o[id]! / P('percent');
    const gap = Math.floor((k + 1) * share) - Math.floor(k * share);
    if (gap > bestGap) { bestGap = gap; best = id; }
  }
  return best;
}

/**
 * Fill one rep: each slot of the unit's shape takes the depth-chart player for that unit (first team is
 * depth index 0, second 1, ...), a per-position override where one applies, and the next healthy player
 * on the depth chart when the listed one is out (H3.2.1 edge case: the replacement gets the gain).
 */
export function assignRep(per: Period, side: Side, slot: RepSlot, positions: readonly string[], ctx: AssignContext, counters: RepCounters): RepAssignment {
  const live = per.tempo === 'live';
  const used = new Set<string>();
  const takers: Taker[] = [];
  let short = false;
  const seen = new Map<string, number>();
  const unitIdx = UNITS.indexOf(slot.unit);
  for (const pos of positions) {
    const occ = seen.get(pos) ?? 0;
    seen.set(pos, occ + 1);
    const perUnit = positions.filter((p) => p === pos).length;
    const full = ctx.depth[pos] ?? [];
    // Override players take exactly their share of the position's reps; the rest follow the split among the others.
    const o = ctx.split.overrides[pos];
    const list = o ? full.filter((x) => !(x in o)) : full;
    const forced = occ === 0 ? overrideFor(pos, slot.index - 1, ctx.split) : null;
    const listed = forced ?? list[unitIdx * perUnit + occ];
    const order = listed ? [listed, ...full.filter((x) => x !== listed)] : [...full];
    let pick: string | null = null;
    for (const id of order) {
      if (used.has(id)) continue;
      if (available(id, live, ctx, counters)) { pick = id; break; }
    }
    if (!pick) { short = true; continue; }
    used.add(pick);
    counters.taken.set(pick, (counters.taken.get(pick) ?? 0) + 1);
    takers.push({ personId: pick, position: pos });
  }
  const watchers: string[] = [];
  for (const pos of new Set(positions)) {
    for (const id of ctx.depth[pos] ?? []) {
      if (used.has(id) || ctx.out.has(id)) continue;
      if (ctx.participation.get(id)?.label === 'did_not_participate') continue;
      if (!watchers.includes(id)) watchers.push(id);
    }
  }
  return { period: per.number, slot, side, takers, watchers, short };
}

/** Every rep of a practice, period by period, in a fixed order (H3.5.1 acceptance 1: same plan, same result). */
export function assignPractice(practice: Practice, scripts: ReadonlyMap<string, Script>, ctx: AssignContext, counters = newCounters()): RepAssignment[] {
  const out: RepAssignment[] = [];
  for (const per of practice.periods) {
    const script = per.scriptRef ? scripts.get(per.scriptRef) : undefined;
    const slots = slotsFor(per, script, practice, ctx.split);
    if (slots.length === 0) continue;
    for (const side of periodSides(per, script, ctx.shapes)) {
      const positions = periodPositions(per, side, ctx.shapes);
      for (const slot of slots) out.push(assignRep(per, side, slot, positions, ctx, counters));
    }
  }
  return out;
}

/** Reps per player for the week table (H3.3.1). */
export function repsPerPlayer(as: readonly RepAssignment[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of as) for (const t of a.takers) m.set(t.personId, (m.get(t.personId) ?? 0) + 1);
  return m;
}

/** The label the actual share implies (H3.3.2 rule 2): all normal reps Full, some Limited, none Did not participate. */
export function impliedLabel(taken: number, normal: number, sheet: ParticipationLabel): ParticipationLabel {
  if (normal <= 0) return sheet;
  if (taken >= normal) return 'full';
  return taken > 0 ? 'limited' : 'did_not_participate';
}

/** Normal reps per player: the same practice with everyone Full and nobody out. */
export function normalReps(practice: Practice, scripts: ReadonlyMap<string, Script>, ctx: AssignContext): Map<string, number> {
  return repsPerPlayer(assignPractice(practice, scripts, { ...ctx, participation: new Map(), out: new Set() }));
}

/** True when the period's type takes part in rep assignment at all. */
export function producesReps(per: Period): boolean {
  const k = periodType(per.type).kind;
  return k !== 'warmup' && k !== 'conditioning' && k !== 'individual';
}

// The AI's planned sheet (K3.4.2, G-74 `AiSheet`) as the K4 caller reads it (`CallingSheet`). CR-G74-2 and the
// G-58 `toCallingSheet` owed after PR 138: the box rules come from the G-68 standard catalogue
// (football-content gameplan), which coach-ai cannot import, so the join lives here.
import { calling, preparation } from '@gm/coach-ai';
import { gameplan } from '@gm/football-content';
import { sheetCallOf, type ContentBook, type SheetCallOpts } from './content.ts';

type AiSheet = preparation.AiSheet;
type BucketMatrix = preparation.BucketMatrix;
type CallingSheet = calling.CallingSheet;
type CallingBox = calling.SheetBox;
type CallingRule = calling.SituationRule;
type Rule = gameplan.SituationRule;

/** Two-minute boxes in the catalogue are "half seconds left at most 120" (G7.2.2). */
const TWO_MINUTE_S = 120;

/**
 * A G-68 situation rule as K4 bounds. K4 reads down, distance, yards to goal and the two-minute flag
 * (types.ts SituationRule); a rule on anything else (after a turnover, score, the last 5 seconds, a try)
 * cannot be said in those bounds and returns null, so its box falls to its parent (K4.1.1 rule 2).
 */
export function toCallingRule(rule: Rule): CallingRule | null {
  if (rule.anyOf.length !== 1) return null;
  const out: { -readonly [K in keyof CallingRule]: CallingRule[K] } = {};
  for (const c of rule.anyOf[0]!.all) {
    if (c.on === 'down') out.downs = [...c.in];
    else if (c.on === 'distance') { if (c.min !== undefined) out.minDistanceYd = c.min; if (c.max !== undefined) out.maxDistanceYd = c.max; }
    else if (c.on === 'yardsToGoal') { if (c.min !== undefined) out.minYardsToGoal = c.min; if (c.max !== undefined) out.maxYardsToGoal = c.max; }
    else if (c.on === 'halfSecondsLeft' && c.min === undefined && c.max === TWO_MINUTE_S) out.twoMinute = true;
    else return null;
  }
  return out;
}

/** K4.5.1: the opening script is not used on third and long, backed up or in the red zone. */
function scriptable(r: CallingRule, clock: boolean): boolean {
  if (clock) return false;
  if (r.maxYardsToGoal !== undefined && r.maxYardsToGoal <= 20) return false;
  if (r.minYardsToGoal !== undefined && r.minYardsToGoal >= 90) return false;
  const thirdOnly = r.downs !== undefined && r.downs.every((d) => d >= 3);
  return !(thirdOnly && r.minDistanceYd !== undefined && r.minDistanceYd >= 7);
}

/**
 * The sheet's look columns: the looks with the most scouted share over all boxes, up to the K4 limit with one
 * column kept for 'other', which stands for every look not kept.
 */
function sheetLooks(matrices: readonly BucketMatrix[], max: number): string[] {
  const share = new Map<string, number>();
  for (const m of matrices) m.looks.forEach((l, j) => { if (l !== preparation.OTHER_LOOK) share.set(l, (share.get(l) ?? 0) + m.shares[j]!); });
  const kept = [...share].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, max - 1).map(([l]) => l);
  return [...kept, preparation.OTHER_LOOK];
}

/** A box's payoff row on the sheet's columns. A column the box never scouted takes its 'other' value, or its share-weighted mean. */
function payoffRow(m: BucketMatrix, i: number, looks: readonly string[]): number[] {
  const row = m.a[i]!;
  const total = m.shares.reduce((s, x) => s + x, 0);
  const mean = total > 0 ? row.reduce((s, v, j) => s + v * m.shares[j]!, 0) / total : row.reduce((s, v) => s + v, 0) / Math.max(1, row.length);
  const otherAt = m.looks.indexOf(preparation.OTHER_LOOK);
  const kept = new Set(looks);
  return looks.map((l) => {
    if (l === preparation.OTHER_LOOK) {
      // 'other' on the sheet stands for this box's looks the sheet did not keep, weighted by their share.
      let w = 0; let v = 0;
      m.looks.forEach((ml, j) => { if (!kept.has(ml) || ml === preparation.OTHER_LOOK) { w += m.shares[j]!; v += row[j]! * m.shares[j]!; } });
      return w > 0 ? v / w : otherAt >= 0 ? row[otherAt]! : mean;
    }
    const j = m.looks.indexOf(l);
    return j >= 0 ? row[j]! : otherAt >= 0 ? row[otherAt]! : mean;
  });
}

export interface SheetJoin {
  readonly sheet: CallingSheet;
  /** Boxes whose situation K4 cannot express; the caller reaches their calls through the parent box. */
  readonly dropped: readonly string[];
}

export interface ToCallingSheetOptions {
  readonly book: ContentBook;
  /** Situation rules by catalogue id; default the G-68 standard catalogue. */
  readonly catalogue?: readonly gameplan.CatalogueRow[];
  readonly callOpts?: (callId: string) => SheetCallOpts;
  /** Look-column limit; default the K4 `mix.maxLooks` parameter. */
  readonly maxLooks?: number;
}

/** G-74 `AiSheet` to the K4 `CallingSheet`. Locked sheets keep the K3 stored mix; open sheets are locked here by K4.3.1. */
export function toCallingSheet(ai: AiSheet, o: ToCallingSheetOptions): SheetJoin {
  const rows = new Map((o.catalogue ?? gameplan.CATALOGUE).map((r) => [r.id, r]));
  const matrixOf = new Map(ai.matrices.map((m) => [m.bucketId, m]));
  const boxBySituation = new Map(ai.boxes.map((b) => [b.situationId, b]));
  const looks = sheetLooks(ai.matrices, o.maxLooks ?? calling.param('mix.maxLooks'));
  const calls: Record<string, calling.SheetCall> = {};
  const dropped: string[] = [];
  const rules = new Map<string, CallingRule>();
  for (const b of ai.boxes) {
    const row = rows.get(b.situationId);
    const r = row?.situation ? toCallingRule(row.situation) : null;
    if (r) rules.set(b.situationId, r); else dropped.push(b.situationId);
  }
  /** The nearest catalogue ancestor that has a box K4 can read. */
  const parentBox = (situationId: string): string | null => {
    let cur = rows.get(situationId)?.parentId ?? null;
    for (let i = 0; cur !== null && i < 32; i++) {
      const b = boxBySituation.get(cur);
      if (b && rules.has(cur)) return b.id;
      cur = rows.get(cur)?.parentId ?? null;
    }
    return null;
  };
  let anyStored = true;
  const boxes: CallingBox[] = [];
  for (const b of [...ai.boxes].sort((x, y) => x.priority - y.priority)) {
    const rule = rules.get(b.situationId);
    const m = matrixOf.get(b.situationId);
    if (!rule || !m) continue;
    const callIds: string[] = [];
    const payoff: Record<string, number[]> = {};
    const stored: Record<string, number> = {};
    for (const e of [...b.entries].sort((x, y) => x.rank - y.rank)) {
      const i = m.candidates.indexOf(e.callId);
      const sc = sheetCallOf(o.book, e.callId, o.callOpts?.(e.callId));
      if (i < 0 || !sc) continue;
      calls[e.callId] = sc;
      callIds.push(e.callId);
      payoff[e.callId] = payoffRow(m, i, looks);
      if (m.sigmaStar) stored[e.callId] = m.sigmaStar[i]!;
    }
    if (!m.sigmaStar) anyStored = false;
    const clock = rows.get(b.situationId)?.clock !== null && rows.get(b.situationId)?.clock !== undefined;
    boxes.push({
      bucketId: b.id, parentId: parentBox(b.situationId), rule, callIds, payoff, clock, scriptable: scriptable(rule, clock),
      ...(m.sigmaStar ? { storedMix: renormal(stored) } : {}),
    });
  }
  // K5 hands 'go.short' when the offense goes on fourth down (joinK5): it reads the short-yardage box first,
  // whatever the distance, so that box is repeated at the head of the order under the constraint rule.
  const short = boxes.find((b) => b.bucketId === boxBySituation.get('short_yardage')?.id) ?? boxes.find((b) => b.bucketId === boxBySituation.get('fourth_short')?.id);
  if (short) boxes.unshift({ ...short, bucketId: `${short.bucketId}:${calling.SHORT_YARDAGE_BOX}`, parentId: short.bucketId, rule: { constraintId: calling.SHORT_YARDAGE_BOX }, scriptable: false });
  const script = ai.script.flatMap((s) => {
    const sc = sheetCallOf(o.book, s.callId, o.callOpts?.(s.callId));
    if (!sc) return [];
    calls[s.callId] ??= sc;
    const r = rows.get(s.onlyIf)?.situation;
    const cr = r ? toCallingRule(r) : null;
    return [{ callId: s.callId, downs: cr?.downs ?? [1, 2, 3, 4], minDistanceYd: cr?.minDistanceYd ?? 0, maxDistanceYd: cr?.maxDistanceYd ?? 99 }];
  });
  const sheet: CallingSheet = {
    side: ai.unit, looks, calls, boxes, baseBoxByDown: baseBoxes(boxes), script,
    // G-74 sequence packages carry no trigger look and its contingencies another shape: not joined (DECISIONS.md).
    sequences: [], follows: [], contingencies: [],
  };
  return { sheet: anyStored && ai.lockedAt !== null ? sheet : calling.lockSheet(sheet), dropped: dropped.sort() };
}

/** Drops of candidates that are not in the book leave a stored mix that no longer sums to one. */
function renormal(mix: Record<string, number>): Record<string, number> {
  const t = Object.values(mix).reduce((s, x) => s + x, 0);
  return t > 0 ? Object.fromEntries(Object.entries(mix).map(([k, v]) => [k, v / t])) : mix;
}

/**
 * K4.1.1 rules 2 and 4: the base box per down is the broadest box for that down (no field-zone or clock
 * bound, the widest distance band); '0', the last resort, is the broadest box with the most calls.
 */
function baseBoxes(boxes: readonly CallingBox[]): Record<string, string> {
  const open = boxes.filter((b) => b.callIds.length > 0 && b.rule.minYardsToGoal === undefined && b.rule.maxYardsToGoal === undefined && b.rule.twoMinute === undefined && b.rule.constraintId === undefined);
  const span = (b: CallingBox) => (b.rule.maxDistanceYd ?? 99) - (b.rule.minDistanceYd ?? 0);
  const out: Record<string, string> = {};
  for (const d of [1, 2, 3, 4]) {
    const best = open.filter((b) => !b.rule.downs || b.rule.downs.includes(d)).sort((a, b) => span(b) - span(a) || (a.bucketId < b.bucketId ? -1 : 1))[0];
    if (best) out[String(d)] = best.bucketId;
  }
  const last = [...(open.length ? open : boxes.filter((b) => b.callIds.length > 0))].sort((a, b) => b.callIds.length - a.callIds.length || (a.bucketId < b.bucketId ? -1 : 1))[0];
  if (last) out['0'] = last.bucketId;
  return out;
}

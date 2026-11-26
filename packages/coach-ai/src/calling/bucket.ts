// K4.1.1 situation bucket and candidate list.
import { param } from './params.ts';
import type { CallingSheet, CallSituation, ManagementConstraint, SheetBox, SheetCall, SituationRule } from './types.ts';

export function ruleMatches(r: SituationRule, s: CallSituation, constraintId: string | undefined): boolean {
  if (r.constraintId !== undefined && r.constraintId !== constraintId) return false;
  if (r.downs && !r.downs.includes(s.down)) return false;
  if (r.minDistanceYd !== undefined && s.distanceYd < r.minDistanceYd) return false;
  if (r.maxDistanceYd !== undefined && s.distanceYd > r.maxDistanceYd) return false;
  if (r.minYardsToGoal !== undefined && s.yardsToGoal < r.minYardsToGoal) return false;
  if (r.maxYardsToGoal !== undefined && s.yardsToGoal > r.maxYardsToGoal) return false;
  if (r.twoMinute !== undefined && r.twoMinute !== s.insideTwoMinute) return false;
  return true;
}

export function boxById(sheet: CallingSheet, id: string | null | undefined): SheetBox | undefined {
  return id == null ? undefined : sheet.boxes.find((b) => b.bucketId === id);
}

export function baseBox(sheet: CallingSheet, down: number): SheetBox | undefined {
  return boxById(sheet, sheet.baseBoxByDown[String(down)]) ?? boxById(sheet, sheet.baseBoxByDown['0']) ?? sheet.boxes.find((b) => b.callIds.length > 0);
}

export interface CandidateList {
  /** The box whose rule matched: belief and self-scout are kept under this id. */
  readonly bucketId: string;
  /** The box the calls came from after the empty-box fallback. */
  readonly box: SheetBox;
  readonly calls: readonly SheetCall[];
  /** True when the list differs from the box's own list, so the stored mix must be renormalised or re-solved. */
  readonly changed: boolean;
}

export interface CandidateInputs {
  readonly sheet: CallingSheet;
  readonly situation: CallSituation;
  readonly constraint?: ManagementConstraint;
  /** Legal and available right now: personnel healthy and active (I6), formation legal on this hash, play installed. */
  readonly available: (call: SheetCall) => boolean;
  /** Tempo: only the tempo menu can be sent (I2.4.3, K4.4.1 rule 5). */
  readonly tempoOnly?: boolean;
  /** Box overrides from in-game adjustments (K4.5.3): bucket id to call ids. */
  readonly overrides?: ReadonlyMap<string, readonly string[]>;
}

/**
 * K4.1.1: the first matching box in sheet order, its parent when empty, candidates filtered by
 * legality and the K5 constraint, and the base box's top calls when fewer than 2 remain.
 * Returns an empty list only when no call on the whole sheet is available.
 */
export function candidatesFor(inp: CandidateInputs): CandidateList {
  const { sheet, situation: s } = inp;
  const idsOf = (b: SheetBox): readonly string[] => inp.overrides?.get(b.bucketId) ?? b.callIds;
  const matched = sheet.boxes.find((b) => ruleMatches(b.rule, s, inp.constraint?.id)) ?? baseBox(sheet, s.down);
  if (!matched) throw new Error('sheet has no boxes');
  let box = matched;
  const seen = new Set<string>();
  while (idsOf(box).length === 0 && !seen.has(box.bucketId)) {
    seen.add(box.bucketId);
    box = boxById(sheet, box.parentId) ?? baseBox(sheet, s.down) ?? box;
  }
  const ok = (c: SheetCall | undefined): c is SheetCall =>
    c !== undefined && inp.available(c) && (inp.constraint?.allows ? inp.constraint.allows(c) : true);
  const own = idsOf(box).map((id) => sheet.calls[id]);
  let calls = own.filter(ok);
  if (inp.tempoOnly) {
    const menu = calls.filter((c) => c.tempoMenu);
    const cap = sheet.side === 'defense' ? param('defense.tempoMenuCalls') : menu.length;
    if (menu.length > 0) calls = menu.slice(0, cap);
  }
  let changed = calls.length !== idsOf(box).length || box !== matched || inp.overrides?.has(box.bucketId) === true;
  if (calls.length < param('bucket.minCandidates')) {
    const base = baseBox(sheet, s.down);
    if (base) {
      const ranked = [...idsOf(base)].sort((x, y) => (base.storedMix?.[y] ?? 0) - (base.storedMix?.[x] ?? 0) || (x < y ? -1 : 1));
      let added = 0;
      for (const id of ranked) {
        if (added >= param('bucket.baseTopCalls')) break;
        const c = sheet.calls[id];
        if (ok(c) && !calls.includes(c)) { calls = [...calls, c]; added++; changed = true; }
      }
    }
  }
  if (calls.length < param('bucket.minCandidates')) {
    // Last resort: anything on the sheet that can be sent. A coach always has a call.
    for (const id of Object.keys(sheet.calls).sort()) {
      const c = sheet.calls[id];
      if (ok(c) && !calls.includes(c)) { calls = [...calls, c]; changed = true; if (calls.length >= param('bucket.minCandidates')) break; }
    }
  }
  return { bucketId: matched.bucketId, box, calls, changed };
}

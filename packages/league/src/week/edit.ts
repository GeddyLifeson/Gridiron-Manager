// Editing the week (H1.1.1 rule 4, H1.1.2, H1.4.1, H1.4.2, H1.5.5). The editor refuses only what
// cannot physically exist (one attendee in two places, an edit to a resolved block, a fixed block below
// coordinator). A block that breaks a hard limit opens the L8.2.5 warning and is placed when confirmed;
// each confirmed hard finding becomes one violation request for the compliance pipeline (G-28 commitAct).
import { clashAtom } from './atoms.ts';
import { allBlocks, withBlocks } from './build.ts';
import { checkWeek, findingKey, type LimitEnv } from './limits.ts';
import type { Block, Finding, LeaderRole, Week } from './types.ts';

/** Rungs as the week sees them (H1.5.5). Coordinator and head coach may move fixed blocks. */
export const RUNGS = ['student_assistant', 'graduate_assistant', 'quality_control', 'position_coach', 'coordinator', 'head_coach'] as const;
export type Rung = (typeof RUNGS)[number];
export function mayMoveFixed(rung: Rung): boolean { return RUNGS.indexOf(rung) >= RUNGS.indexOf('coordinator'); }

/** One confirmed hard finding, ready to become a compliance `Act` (classId and rule are G-28's inputs). */
export interface ViolationRequest {
  readonly classId: string;
  readonly ruleId: string;
  readonly blockId: string | null;
  readonly plain: string;
  readonly penalty: string;
  readonly weekId: string;
  readonly teamId: number;
}

export type PlaceResult =
  | { readonly kind: 'refused'; readonly reason: 'clash' | 'completed' | 'fixed' | 'unknown_block'; readonly detail: string }
  | { readonly kind: 'needs_confirm'; readonly warnings: readonly Finding[] }
  | { readonly kind: 'placed'; readonly week: Week; readonly soft: readonly Finding[]; readonly violations: readonly ViolationRequest[] };

export interface EditEnv extends LimitEnv { readonly rung: Rung }

function newFindings(before: Week, after: Week, env: LimitEnv): Finding[] {
  const had = new Set(checkWeek(before, env).map(findingKey));
  return checkWeek(after, env).filter((f) => !had.has(findingKey(f)));
}

function requests(week: Week, fs: readonly Finding[]): ViolationRequest[] {
  return fs.filter((f) => f.hardness === 'hard').map((f) => ({
    classId: f.classId, ruleId: f.ruleId, blockId: f.blockId, plain: f.plain, penalty: f.penalty, weekId: week.weekId, teamId: week.teamId,
  }));
}

/** Apply a change (blocks out, blocks in) through the same path as placing: refusals, warning, confirm. */
function apply(week: Week, removeIds: readonly string[], add: readonly Block[], env: EditEnv, confirm: boolean): PlaceResult {
  const current = allBlocks(week);
  for (const id of removeIds) {
    const b = current.find((x) => x.id === id);
    if (!b) return { kind: 'refused', reason: 'unknown_block', detail: id };
    if (week.completed.includes(id)) return { kind: 'refused', reason: 'completed', detail: id };
    if (b.fixed === true && !mayMoveFixed(env.rung)) return { kind: 'refused', reason: 'fixed', detail: id };
  }
  const kept = current.filter((b) => !removeIds.includes(b.id));
  for (const b of add) {
    if (week.completed.includes(b.id)) return { kind: 'refused', reason: 'completed', detail: b.id };
    if (!week.days.some((d) => d.day === b.start.day)) return { kind: 'refused', reason: 'unknown_block', detail: `day ${b.start.day} is outside the week` };
    for (const k of [...kept, ...add]) {
      if (k === b) continue;
      const atom = clashAtom(k, b);
      if (atom) return { kind: 'refused', reason: 'clash', detail: `${b.id} and ${k.id} both need ${atom}` };
    }
  }
  const after = withBlocks(week, [...kept, ...add]);
  const fresh = newFindings(week, after, env);
  const hard = fresh.filter((f) => f.hardness === 'hard');
  if (hard.length > 0 && !confirm) return { kind: 'needs_confirm', warnings: hard };
  return { kind: 'placed', week: after, soft: fresh.filter((f) => f.hardness === 'soft'), violations: requests(week, hard) };
}

/** Place a new block. `confirm` is the user's (or an AI coach's, K2.8.1) answer to the L8.2.5 warning. */
export function placeBlock(week: Week, block: Block, env: EditEnv, confirm = false): PlaceResult {
  if (allBlocks(week).some((b) => b.id === block.id)) return { kind: 'refused', reason: 'clash', detail: `id ${block.id} already exists` };
  return apply(week, [], [block], env, confirm);
}

/** Move or resize a block: remove and place as one change. */
export function changeBlock(week: Week, id: string, next: Omit<Block, 'id'>, env: EditEnv, confirm = false): PlaceResult {
  return apply(week, [id], [{ ...next, id }], env, confirm);
}

/** Remove a block. Removing a required media session is a skip (media.ts owns its events). */
export function removeBlock(week: Week, id: string, env: EditEnv): PlaceResult {
  return apply(week, [id], [], env, true);
}

/**
 * Hand a block to staff (H1.4.2). The leader becomes the K6 default; the head coach leaves the block
 * unless he chooses to attend, which costs his hours and adds the presence bonus (rule 2).
 */
export function delegateBlock(week: Week, id: string, attend: boolean, to: LeaderRole = 'staff_default'): Week {
  if (week.completed.includes(id)) throw new Error(`block ${id} is resolved and cannot be edited`);
  const blocks = allBlocks(week).map((b) => {
    if (b.id !== id) return b;
    const attendees = attend ? b.attendees : b.attendees.filter((g) => g !== 'head_coach');
    return { ...b, leader: to, attendees };
  });
  return withBlocks(week, blocks);
}

/** Fill a block's content (H1.1.1 rule 6: a block with no content at its start runs on defaults). */
export function setContent(week: Week, id: string, contentRef: string | null): Week {
  if (week.completed.includes(id)) throw new Error(`block ${id} is resolved and cannot be edited`);
  return withBlocks(week, allBlocks(week).map((b) => (b.id === id ? { ...b, contentRef } : b)));
}

/** Mark a block voluntary (H1.5.2 rule 2). Returns the week and whether it is a compliance risk (staff attend). */
export function markVoluntary(week: Week, id: string): { week: Week; risky: boolean } {
  let risky = false;
  const blocks = allBlocks(week).map((b) => {
    if (b.id !== id) return b;
    risky = b.attendees.some((g) => g === 'staff' || g === 'off_staff' || g === 'def_staff' || g === 'st_staff' || g === 'head_coach' || g === 'coordinators');
    return { ...b, voluntary: true, mandatory: false };
  });
  return { week: withBlocks(week, blocks), risky };
}

/**
 * Saving a template (H1.4.1): every edit is validated and the template always saves; findings are
 * shown as warnings. A mid-season routine change carries a one-week adjustment flag (rule 3).
 */
export function saveTemplate(sample: Week, env: LimitEnv, midSeason: boolean): { saved: true; warnings: readonly Finding[]; routineChange: boolean } {
  return { saved: true, warnings: checkWeek(sample, env), routineChange: midSeason };
}

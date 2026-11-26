// The coach's hours in the week (H1.4.2, H4.3.2) and the week summary (H1.4.3).
import { instantValue, type Instant } from '../calendar/date.ts';
import { involvesAtom } from './atoms.ts';
import { allBlocks } from './build.ts';
import { P } from './params.ts';
import type { Atom, Block, BlockType, Finding, Week } from './types.ts';

/** Minutes charged to a person for the blocks he leads or attends (H1.4.2 rule 1). E7 converts them to energy. */
export function minutesFor(week: Week, atom: Atom = 'head_coach'): number {
  return allBlocks(week).filter((b) => involvesAtom(b, atom)).reduce((s, b) => s + b.minutes, 0);
}

/** Per-day minutes for the same person, for the E7 hour budget. */
export function minutesByDay(week: Week, atom: Atom = 'head_coach'): Map<number, number> {
  const out = new Map<number, number>();
  for (const d of week.days) out.set(d.day, d.blocks.filter((b) => involvesAtom(b, atom)).reduce((s, b) => s + b.minutes, 0));
  return out;
}

/** Game-plan involvement levels and their weekly hours per unit (H4.3.2). */
export const INVOLVEMENT = ['author', 'editor', 'approver', 'hands_off'] as const;
export type Involvement = (typeof INVOLVEMENT)[number];
export function involvementHours(level: Involvement): number { return P(`involve_${level}_hours`); }

/** Attention bonus for players when the head coach attends a block he does not lead (H1.4.2 rule 2). */
export function presenceBonus(b: Block): number {
  return involvesAtom(b, 'head_coach') && b.leader !== 'head_coach' ? P('presence_attention_bonus') : 0;
}

/** Block types that run on content (a script, an agenda, a report). Others need none. */
const CONTENT_TYPES: readonly BlockType[] = ['practice', 'walkthrough', 'team_meeting', 'unit_meeting', 'position_meeting', 'staff_meeting'];

/** Blocks with no content at their start run on the leader's defaults and are "unplanned" (H1.1.1 rule 6). */
export function unplanned(week: Week, at?: Instant): Block[] {
  const t = at ? instantValue(at) : Number.POSITIVE_INFINITY;
  return allBlocks(week).filter((b) => CONTENT_TYPES.includes(b.type) && b.contentRef === null && instantValue(b.start) <= t);
}

export interface ReadinessItem { readonly playId: string; readonly estimate: number; readonly spread: number; readonly onSheet: boolean }

export interface WeekSummary {
  readonly unplanned: readonly string[];
  readonly hard: readonly Finding[];
  readonly soft: readonly Finding[];
  readonly coachMinutes: number;
  /** Plays on the sheet with the lowest staff readiness estimate first (H1.4.3 rule). */
  readonly risk: readonly ReadinessItem[];
  readonly lateDocuments: readonly string[];
}

/**
 * The week summary (H1.4.3). Readiness comes in as the staff's estimate with its spread (D9 through the
 * D6 staff-estimate rules), never the hidden true value; the summary only sorts it.
 */
export function weekSummary(week: Week, findings: readonly Finding[], readiness: readonly ReadinessItem[], lateDocuments: readonly string[]): WeekSummary {
  const risk = readiness.filter((r) => r.onSheet).sort((a, b) => a.estimate - b.estimate || (a.playId < b.playId ? -1 : 1));
  return {
    unplanned: unplanned(week).map((b) => b.id),
    hard: findings.filter((f) => f.hardness === 'hard'),
    soft: findings.filter((f) => f.hardness === 'soft'),
    coachMinutes: minutesFor(week),
    risk, lateDocuments,
  };
}

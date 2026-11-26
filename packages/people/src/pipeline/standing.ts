// A coach's standing with pro teams (T11.5.1). Regard is computed from logged history, never set: players he
// coached who were drafted, how they did against where they were picked, his accuracy with scouts (T11.2.1),
// network ties to pro staff (S6), and whether pro executives believe his system transfers (a belief with its own
// error, held by the AI executive). The same computation runs for AI coaches.
import { type AccuracyRecord } from './coach-reports.ts';
import { p } from './params.ts';
import { expectedStarter3, type TranslationGroup } from './translation.ts';

/** One player the coach had (in his room, unit or program by his job), drafted, with his pro record so far. */
export interface CoachedDraftee {
  readonly round: number;
  readonly group: TranslationGroup | null;
  readonly seasonsSinceDraft: number;
  readonly seasonsAsPrimaryStarter: number;
}

export interface RegardInput {
  readonly draftees: readonly CoachedDraftee[];
  readonly accuracy: AccuracyRecord;
  readonly networkTies: number;
  /** The judging executive's belief that the coach's system transfers to the pros (T11.5.1 rule 2). */
  readonly believesSystemTransfers: boolean;
}

export interface RegardBreakdown {
  readonly drafted: number;
  readonly againstSlot: number;
  readonly accuracy: number;
  readonly network: number;
  readonly system: number;
  /** 0 to 100, 50 neutral: `regard.pro_teams` (E5). */
  readonly total: number;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Did they arrive prepared? Each resolved draftee (three or more pro seasons) scores 1 if he became a three-year
 * starter, minus the T11.4.1 expected share at his round and group. A coach whose players are drafted high and
 * fail loses regard even while his college record is strong (edge case).
 */
export function againstSlotScore(draftees: readonly CoachedDraftee[]): number {
  let s = 0;
  for (const d of draftees) {
    if (d.seasonsSinceDraft < 3) continue;
    s += (d.seasonsAsPrimaryStarter >= 3 ? 1 : 0) - expectedStarter3(d.round, d.group);
  }
  return s;
}

/** `regard.pro_teams` with its parts, for the coach's record page (T11.5.1). */
export function proRegard(input: RegardInput): RegardBreakdown {
  const drafted = clamp(input.draftees.length * p('regard.perDraftedPlayer'), 0, p('regard.draftedCap'));
  const slotCap = p('regard.slotCap');
  const againstSlot = clamp(againstSlotScore(input.draftees) * p('regard.perSlotOutcome'), -slotCap, slotCap);
  const accCap = p('regard.accuracyCap');
  const accuracy = input.accuracy.count === 0 ? 0
    : clamp((p('report.priorErrorIss') - input.accuracy.meanAbsError) * p('regard.accuracyIssToPoints'), -accCap, accCap);
  const network = clamp(input.networkTies * p('regard.perNetworkTie'), 0, p('regard.networkCap'));
  const system = input.believesSystemTransfers ? p('regard.transferableSystem') : 0;
  const total = clamp(p('regard.neutral') + drafted + againstSlot + accuracy + network + system, 0, 100);
  return { drafted, againstSlot, accuracy, network, system, total };
}

/** College jobs a coach moves from, for rule 4. */
export type CollegeRole = 'head_coach' | 'coordinator' | 'position_coach';
export type ProEntryRole = 'head_coach' | 'coordinator' | 'position_coach' | 'assistant';

/**
 * Usual pro entry jobs (T11.5.1 rule 4): a college head coach enters as head coach or coordinator, a position
 * coach as position coach or assistant. A coordinator enters as coordinator or position coach (README P-06).
 */
export function usualProEntry(role: CollegeRole): readonly ProEntryRole[] {
  if (role === 'head_coach') return ['head_coach', 'coordinator'];
  if (role === 'coordinator') return ['coordinator', 'position_coach'];
  return ['position_coach', 'assistant'];
}

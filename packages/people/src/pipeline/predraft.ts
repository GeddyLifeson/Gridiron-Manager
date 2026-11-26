// All-star games, the combine, pro day and the draft (T11.2.2). The dated steps between a player's last
// college game and the draft. Dates come from the calendar (C4, league.calendar) by window, never from here;
// pick count comes from the pro league's rules (C7), never from here. This file orders the steps, picks the
// combine invites, and turns measured tests into evidence.
//
// `measure` is a TRUTH READER (like scouting.observe): it runs on the world side only. README CR-G39-3.
import type { WorldDate } from '@gm/schema';
import { evidenceItem, type Contributor, type EvidenceItem, type NormalSource } from '../scouting/index.ts';
import { p } from './params.ts';

/** The T11.2.2 rule 1 sequence. Each step is a calendar window id the calendar package dates. */
export const PREDRAFT_STEPS = ['season_end', 'early_entry_declaration', 'all_star_games', 'combine', 'pro_days', 'draft', 'undrafted_signing'] as const;
export type PredraftStep = (typeof PREDRAFT_STEPS)[number];

/** True when `a` comes before `b` in the sequence. */
export function stepBefore(a: PredraftStep, b: PredraftStep): boolean {
  return PREDRAFT_STEPS.indexOf(a) < PREDRAFT_STEPS.indexOf(b);
}

export interface InviteCandidate {
  readonly personId: number;
  /** Consensus board grade of the league's scouts (estimates only). */
  readonly consensusGrade: number;
}

/**
 * The combine invites a subset (T11.2.2 rule 2): the top `predraft.combineInvites` by consensus grade, ties by
 * person id. Everyone else is measured at a pro day.
 */
export function combineInvites(pool: readonly InviteCandidate[]): { readonly invited: number[]; readonly proDayOnly: number[] } {
  const sorted = [...pool].sort((a, b) => (b.consensusGrade - a.consensusGrade) || (a.personId - b.personId));
  const n = p('predraft.combineInvites');
  return { invited: sorted.slice(0, n).map((c) => c.personId), proDayOnly: sorted.slice(n).map((c) => c.personId) };
}

/**
 * A measured test in real units (T11.2.2 rule 3): small error, less than film estimates. An injured player who
 * skips testing returns null, and his band stays wide (edge case). Reads the true value: world side only.
 */
export function measure(trueValue: number, sd: number, rng: NormalSource, skipped: boolean): number | null {
  if (skipped) return null;
  return trueValue + rng.normal() * sd;
}

/** A measured 40-yard dash: unlike a school-reported time (scouting.reportedForty) it has no flattering bias. */
export function measureForty(trueFortyS: number, rng: NormalSource, skipped: boolean): number | null {
  return measure(trueFortyS, p('predraft.measuredFortySdS'), rng, skipped);
}

/**
 * Testing as ISS evidence for an attribute the drills bear on (D2 to D6): one workout-class item standing for
 * `predraft.testingSessions` sessions. `impliedIss` is the caller's mapping from the measured result.
 */
export function testingEvidence(input: {
  readonly attribute: string;
  readonly impliedIss: number;
  readonly date: WorldDate;
  readonly evaluator: Contributor;
  readonly skill: number;
  readonly estimateMean: number;
}): EvidenceItem {
  return evidenceItem({
    attribute: input.attribute, source: 'workout', units: p('predraft.testingSessions'), date: input.date,
    evaluator: input.evaluator, skill: input.skill, estimateMean: input.estimateMean, opponent: null,
  }, input.impliedIss);
}

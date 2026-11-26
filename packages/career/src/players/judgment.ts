// Respect from judgment the witness saw (L1.1.1: respect "moved by plans that work, teaching quality, game
// management he can see"; plans/head-coach-nuance.md item 5, credibility as the multiplier).
//
// A witness never reads the game's models (N4 is read by no in-world person). He forms his own read of a call
// he saw: the call's true edge plus an error whose size falls with his football knowledge (the I5.1.2 rule that
// estimate error is skill-based). He also sees how it turned out. A knowing witness (a coordinator, a veteran
// quarterback) goes mostly by his read; a witness who knows little goes more by the result. The read is centred
// on the truth, so over a season a coach who makes good calls that lose gains respect, and one who wins with bad
// calls gains less: luck washes out of the read, and the result term is the smaller one.
//
// Pure core: the caller passes the uniform draw from its engine-core stream (scope: witness, decision).
import { clamp } from './math.ts';
import { pp } from './params.ts';
import { applyEvent, type EventResult, type RelationshipRecord } from './record.ts';
import type { WorldDate } from '@gm/schema';

export type SeenResult = 'worked' | 'failed' | 'unclear';

export interface JudgmentSeen {
  /**
   * True value of the call against the best other option the head coach had, in WP points (N3 view): positive
   * when the call was the better one, negative when an option he passed on was better. The witness never sees it.
   */
  readonly edgeWp: number;
  /** How it turned out on the field, as the witness saw it. */
  readonly result: SeenResult;
  /** The witness's football knowledge, 0 to 1 (players: football IQ; staff: their calling or teaching knowledge). */
  readonly knowledge: number;
  /** Uniform draw in [0, 1) for the witness's read error. */
  readonly draw: number;
}

/** The witness's own read of the call's edge, in WP points: the truth plus his error. */
export function witnessRead(j: Pick<JudgmentSeen, 'edgeWp' | 'knowledge' | 'draw'>): number {
  const k = clamp(j.knowledge, 0, 1);
  const half = pp('judgment.readFloorWp') + (pp('judgment.readSpreadWp') - pp('judgment.readFloorWp')) * (1 - k);
  return j.edgeWp + (clamp(j.draw, 0, 1) * 2 - 1) * half;
}

/** Strength of the respect event: his read of the call, plus a smaller term for how it turned out. */
export function judgmentStrength(j: JudgmentSeen): number {
  const k = clamp(j.knowledge, 0, 1);
  const read = clamp(witnessRead(j) / pp('judgment.edgeScaleWp'), -1, 1);
  const resultShare = pp('judgment.resultWeightLow') + (pp('judgment.resultWeightHigh') - pp('judgment.resultWeightLow')) * k;
  const seen = j.result === 'worked' ? 1 : j.result === 'failed' ? -1 : 0;
  return (1 - resultShare) * read * pp('judgment.readStrength') + resultShare * seen * pp('judgment.resultStrength');
}

/** Apply a seen call to one witness's record of the head coach (event `judgment_seen`, respect only). */
export function seeJudgment(r: RelationshipRecord, j: JudgmentSeen, date: WorldDate, facets: Readonly<Record<string, number>>, eventId: number | null = null): EventResult {
  return applyEvent(r, { kind: 'judgment_seen', date, strength: judgmentStrength(j), eventId }, facets);
}

/**
 * The room's credibility for a talk (I10.2.1 `credibility`, 0 to 1): the mean respect of the players who heard it,
 * on the 0 to 1 scale. An empty room gives the neutral middle.
 */
export function roomCredibility(records: readonly Pick<RelationshipRecord, 'respect'>[]): number {
  if (records.length === 0) return 0.5;
  let sum = 0;
  for (const r of records) sum += clamp(r.respect, 0, pp('record.scaleMax'));
  return sum / records.length / pp('record.scaleMax');
}

/** A talk's or a day's `credibilityDelta` (0 to 1 scale, I10.2.1, I10.5.2) as respect points on each listener. */
export function respectFromCredibility(delta: number): number {
  return delta * pp('record.scaleMax');
}

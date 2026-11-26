// Storing estimates in the world contract (P3.2.3 PersonView, AttributeBelief).
// AttributeBelief holds `estimate` (ISS 0 to 100) and `confidence` (0 to 1), not a variance. Until the
// integrator adds a variance field (change request CR-G19-1 in README), confidence encodes variance
// invertibly: confidence = ref^2 / (ref^2 + variance), so the no-information prior (sd 12) reads 0.5
// (README S-02).
import type { PersonView } from '@gm/schema';
import type { Estimate } from './estimate.ts';
import { p } from './params.ts';

/** One stored belief (P3.2.3 AttributeBelief). */
export type AttributeBelief = PersonView['perAttribute'][string];

export function confidenceOf(variance: number): number {
  const r = p('belief.confidenceRefSd');
  return (r * r) / (r * r + variance);
}

export function varianceOf(confidence: number): number {
  if (!(confidence > 0)) throw new Error('confidence 0 has no finite variance');
  const r = p('belief.confidenceRefSd');
  return (r * r) * (1 - confidence) / confidence;
}

const clampIss = (x: number) => (x < 0 ? 0 : x > 100 ? 100 : x);

export function toBelief(e: Estimate): AttributeBelief {
  return {
    estimate: clampIss(e.mean),
    confidence: confidenceOf(e.variance),
    evidenceCount: Math.round(e.evidenceCount),
    // The date the stored variance is valid at, so a reader adds drift only from here (no double count).
    // Equal to the last evidence date unless the estimate was aged at a rollover (CR-G19-1 asks for both).
    lastUpdated: e.agedTo,
  };
}

/**
 * Reads a stored belief back as an estimate. Contributors are per view in the contract (`sourceStaffIds`),
 * so they come back on every attribute; evidence count 0 means a public prior.
 */
export function fromBelief(b: AttributeBelief, contributors: Estimate['contributors'] = []): Estimate {
  return {
    mean: b.estimate,
    variance: varianceOf(b.confidence),
    // The store keeps one variance (CR-G19-1); after a reload the noise part restarts from the shown band.
    noiseVariance: varianceOf(b.confidence),
    evidenceCount: b.evidenceCount,
    lastEvidence: b.evidenceCount > 0 ? b.lastUpdated : null,
    agedTo: b.lastUpdated,
    contributors: b.evidenceCount > 0 ? contributors : [],
    publicOnly: b.evidenceCount === 0,
  };
}

/** Builds an organisation's PersonView (P3.2.3) from its estimates. Holds no truth-class field. */
export function toPersonView(input: {
  readonly observerTeamId: number;
  readonly personId: number;
  readonly estimates: Readonly<Record<string, Estimate>>;
  readonly publicMeasurements?: Readonly<Record<string, number>>;
  readonly notes?: PersonView['notes'];
}): PersonView {
  const perAttribute: Record<string, AttributeBelief> = {};
  const staff = new Set<number>();
  for (const [k, e] of Object.entries(input.estimates)) {
    perAttribute[k] = toBelief(e);
    for (const c of e.contributors) staff.add(c.id);
  }
  return {
    observerTeamId: input.observerTeamId,
    observerPersonId: null,
    personId: input.personId,
    perAttribute,
    publicMeasurements: { ...(input.publicMeasurements ?? {}) },
    notes: [...(input.notes ?? [])],
    sourceStaffIds: [...staff].sort((a, b) => a - b),
  };
}

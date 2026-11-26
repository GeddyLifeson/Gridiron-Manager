// Starting numbers of the Q5 studies. None is a real-world fact: Q5.2.1 says no published accuracy of
// coaches reading real film was found, so the pass marks are Assumptions, and the sample sizes are the
// bible's own starting values (Q5.1.1, Q5.2.1, Q5.3.1, Q5.4.1, Q5.6.1). Coach reviewers change them
// after a pilot (Q5.2.1 open question); until then they are `status: 'starting'`.
import type { ParamFile, TuningParam } from '@gm/schema';

const p = (name: string, value: number, min: number, max: number, unit: string, leaf: string, constrainedBy: string): TuningParam => ({
  name, value, min, max, unit, belongsTo: 'validation', basis: 'bible', leaf, constrainedBy, status: 'starting',
});

export const PARAMS: ParamFile = {
  module: 'validation',
  version: '1',
  params: [
    // Q5.2.1 rule 1 and rule 4 (pass marks are labelled Assumptions in the leaf itself).
    p('validation.film.clipsPerLevel', 100, 1, 10000, 'count', 'Q5.2.1', 'rule 1 starting set'),
    p('validation.film.passCoverage', 0.8, 0, 1, 'share', 'Q5.2.1', 'rule 4 coverage family, disguise ended before snap (Assumption)'),
    p('validation.film.passConcept', 0.85, 0, 1, 'share', 'Q5.2.1', 'rule 4 protection or run concept (Assumption)'),
    p('validation.film.passReason', 0.7, 0, 1, 'share', 'Q5.2.1', 'rule 4 reason agreement (Assumption)'),
    p('validation.film.minReviewersPerLevel', 3, 1, 100, 'count', 'Q5.2.1', 'acceptance: at least 3 reviewers per level'),
    // Rule 5: a clip is "consistently misread" when at least this share of its reviewers got it wrong.
    // The leaf names the idea but no number; a simple majority is this module's starting choice.
    p('validation.film.misreadShare', 0.5, 0, 1, 'share', 'Q5.2.1', 'rule 5 consistent misread (module choice, majority)'),
    // Q5.1.1
    p('validation.review.clipsPerRound', 50, 1, 10000, 'count', 'Q5.1.1', 'at least 50 clips per round'),
    p('validation.review.reviewersPerSlice', 2, 1, 10, 'count', 'Q5.1.1', 'two reviewers per slice where possible'),
    // Q5.3.1
    p('validation.separation.minPerGroup', 10, 1, 10000, 'count', 'Q5.3.1', 'starting sample at least 10 per group (Assumption)'),
    // Q5.4.1
    p('validation.learning.hours', 20, 1, 1000, 'hours', 'Q5.4.1', 'starting value 20 hours between form A and form B'),
    // Q5.6.1 rule 1
    p('validation.reviewers.perLevel', 3, 1, 100, 'count', 'Q5.6.1', 'starting need 3 reviewers per level'),
  ],
};

/** Read one value by name. Throws on an unknown name, like ParamTable.num. */
export function param(name: string): number {
  const row = PARAMS.params.find((r) => r.name === name);
  if (!row) throw new Error(`validation: unknown param ${name}`);
  return row.value;
}

// The limits note (N4.5.1): fixed on the decision record page and on page one of every export, with
// the record's own numbers filled in. Text lives in the string table under these keys; the numbers
// travel beside them so the note is the same length on every export.
import type { DecisionRecordProfile } from './score.ts';
import { param } from './params.ts';

export interface LimitsNote {
  /** The fixed paragraph: not a measure of the person, seen by nobody in the game, calibrated to public data, what a game cannot measure, no real team endorsement. */
  readonly fixedKey: 'rating.limits.fixed';
  readonly sample: { readonly key: 'rating.limits.sample'; readonly decisions: number; readonly games: number; readonly mostlyPrior: readonly string[]; readonly shrinkageK: number };
  readonly modelUncertainty: { readonly key: 'rating.limits.model_uncertainty'; readonly bandWpPoints: number };
  readonly rosterAndChance: { readonly key: 'rating.limits.roster_and_chance' };
  readonly filmEvaluation: { readonly key: 'rating.limits.film_evaluation' };
  readonly versions: { readonly key: 'rating.limits.versions'; readonly gameVersion: string; readonly epModel: string; readonly wpModel: string; readonly reference: string };
  /** Q5 owns the transfer claim; the note changes only when Q5's evidence changes. */
  readonly transferStatus: 'unverified';
}

export function limitsNote(p: DecisionRecordProfile): LimitsNote {
  return {
    fixedKey: 'rating.limits.fixed',
    sample: {
      key: 'rating.limits.sample', decisions: p.scoredDecisions, games: p.games, shrinkageK: param('shrinkageK'),
      mostlyPrior: p.components.filter((c) => c.status === 'scored' && c.mostlyPrior).map((c) => c.id),
    },
    modelUncertainty: { key: 'rating.limits.model_uncertainty', bandWpPoints: param('lossBandWp') * 100 },
    rosterAndChance: { key: 'rating.limits.roster_and_chance' },
    filmEvaluation: { key: 'rating.limits.film_evaluation' },
    versions: { key: 'rating.limits.versions', ...p.versions },
    transferStatus: 'unverified',
  };
}

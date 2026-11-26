# Decision log (G-31, bible N3)

Every decision a coach makes (user or AI, same schema) with what he knew, the model's view, the outcome, and a hash chain over the whole career.

| File | Bible | What |
| --- | --- | --- |
| `types.ts` | N3.1.1 | Record, model views, truth views, outcomes, follow-ups, log entries |
| `catalogue.ts` | N3.2.1, N3.2.2 | All 35 decision types, owner leaves, which N3.3 view scores each |
| `information.ts` | N3.1.2 | Information set copied by value at confirmation; truth refused; "available, not viewed" |
| `record.ts` | N3.1.1, S3, N3.2.1 edge | Validation and attribution (own, suggestion taken, delegated, logged under the boss) |
| `model-view.ts` | N3.3.1 to N3.3.3 | Game-management classes, play-call foresight and predictability, no-model follow-up dates |
| `log.ts`, `chain.ts`, `sha256.ts` | N3.5.1 | Append-only log, SHA-256 hash chain, segments on version change, reload entries |
| `report.ts` | N3.4.1, N3.4.2, N3.2.1 acceptance | Game report data, patterns, coverage check |
| `grade.ts` | P3.3.2 | Maps a scored game decision to `world:DecisionGrade` |
| `dates.ts` | | Integer ISO day arithmetic (core reads no `Date`) |

## Using G-07 (win probability, PR 35)

`evaluateOptions(options, evaluate)` takes the evaluator as a function, so this module compiles without G-07. Pass `(o) => optionWp(wpModel, o, math)` from `../wp/`. Give each option its staff outcome chances (the staff's grades of his own players, D6, and the scouting view) and its truth chances (engine values). Set `sparse` on an option when any state it rolls into is sparse (`wp().sparse`), because `optionWp` does not return that flag yet.

## Readings the bible leaves open

- **Append-only and "filled later".** N3.1.1 says `model_view` and `outcome` are filled later; N3.5.1 says records are never edited. Both hold: views, outcomes and follow-ups are their own chain entries pointing at the decision, joined on read.
- **Range width.** N3.3.1 shows a range with no width. `models.decisions.rangeSe` (assumption) is 1.96 standard errors, the usual two-sided 95% interval.
- **Combined range.** The two options' half-widths added (the more cautious reading). Clearly right means the chosen option beats every other option by more than their combined range.
- **Sparse states** (N3.3.1 edge case) get at least `sparseMinHalfWidth` (assumption) and are never classed clearly wrong or clearly right.
- **Pattern beyond the range** (N3.4.2): the bucket's total cost is greater than the root of the summed squared margins.
- **Decision views.** Coin toss choice and clock mode are scored as game-management decisions, and the defensive call as a play call. The other game types and every weekly type have no model and get follow-up checks.
- **Certified signing** of the chain (N4) belongs to G-95. This module provides the chain, the segment entries (version, seed, settings) and the reload entry.

## Change requests to the integrator

- **CR-G31-1** Add `world:DecisionRecord` (the `DecisionRecord` shape in `types.ts`) and a `decisionLog` record table (append-only, key `seq`, leaf N3) to the world contract, so the save core stores the log. Until then `toDecisionGrade` fills the existing `decisionGrades` table.
- **CR-G31-2** Add `export * as decisions from './decisions/index.ts';` to `packages/models/src/index.ts`.
- **CR-G31-3** SHA-256 now has three copies (people, tools, models). One copy in `@gm/schema` or `engine-core`, importable by every core package, would remove two.

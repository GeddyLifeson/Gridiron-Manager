# Scouting estimates and grade display (G-19)

Bible: D6 (all leaves except the role label and flags, see below), X1.3.1 (no numbers for people values), O6.5.1 (every estimate shows a band and its metadata).

## Files

| File | Leaf | Reads truth? |
| --- | --- | --- |
| `params.ts` | every number, as a `ParamFile` | no |
| `estimate.ts` | D6.1.1 update rule, D6.4.3 floor, D6.4.4 drift | no |
| `prior.ts` | D6.4.1 priors | no |
| `evidence.ts` | D6.4.2 sources and noise, D6.4.5 competition discount, D6.4.3 user grades | no |
| `observe.ts` | D6.4.2 observation draw, D6.4.3 evaluator lean, D6.1.2 reported 40 | **yes, the only file** |
| `scales.ts` | D6.2.1 scales, legend, custom scale files, the setting record | no |
| `display.ts` | D6.1.1 band text, D6.1.2 measurables | no |
| `role.ts` | D6.2.2 role grade | no |
| `projection.ts` | D6.5.1 projection, D6.4.5 rule 5 | no |
| `belief.ts` | P3.2.3 storage in `PersonView` | no |
| `view.ts` | read model: grade cells with O6.5.1 metadata | no |

`observe.ts` runs on the world side (AI evaluators, staff reports). Screens reach only `view.ts`, `display.ts`, `scales.ts` and `belief.ts`; `test/scouting/no-truth.test.ts` proves none of them can reach `observe.ts` and that the read model's input has no truth-class field.

## Decisions

- **S-01 Floor on the shown band only.** D6.4.3's floor is applied to the shown variance. The D6.1.1 update runs on a separate noise variance, so the mean keeps converging on the true value with unbiased evidence (D6.1.1 acceptance) instead of turning into a short moving average once the floor binds.
- **S-02 Confidence encodes variance.** The world contract's `AttributeBelief` has `confidence` (0 to 1), not a variance. `confidence = 12^2 / (12^2 + variance)`: invertible, and the no-information prior reads 0.5. `lastUpdated` stores the date the variance is valid at. CR-G19-1 asks for real fields.
- **S-03 One snap tuning multiplier.** Under D6.1.1's rule the D6.4.2 table values miss D6.4.2's own tuning target by a factor of about 10 (18 ISS film noise halves a prior of 8 in about 20 snaps, not 250). D6.4.2 marks both the values and the target as design tuning, and its acceptance is the target. `noise.snapTuning = 2.85` multiplies every per-snap and per-rep source alike, so the table's ratios stay. Scenario in the test: prior sd 8, film by the position coach (skill 50), main attribute used on 60 percent of snaps.
- **S-04 Weak opponents.** D6.4.2's "noise doubled against a much weaker opponent" is taken as the D6.4.5 rule 3 form, the later and more specific leaf, so the two are not applied twice. Evaluators apply the cut in proportion to skill, and `observe.ts` adds a lean toward the dominance a low-skill evaluator sees (`opponent.weakScheduleLean`, assumption) so "staff who ignore this overrate players from weak schedules" happens.
- **S-05 Role grade variance.** D6.2.2 says "the weighted sum of the attribute variances". Taken literally (sum of w x variance), which with weights summing to 1 is never narrower than the independent case and stays honest when one evaluator's lean moves several attributes together.
- **S-06 Level jump.** D6.4.5 rule 5 "widened by 3 ISS per level" adds 3 ISS to the projection sd per level up.
- **S-07 Projection curve.** Until the development package (G-20) supplies the D7 curve, the share of the way to the ceiling is linear to age 27 (`projection.defaultPeakAge`, assumption). `project` takes a `curve` argument for the real one. A ceiling read below the current read means no growth, not decline.
- **S-08 Randomness.** `people` may not import `engine-core` (P1.2.1), so `observe.ts` takes any `{ normal(): number }`. The world loop passes a J13 `Stream`, which has that method.
- **S-09 Truth inputs are numbers.** The module never reads a `PersonRecord`; callers pass the true value of the attribute being observed, and population means for priors from the generator's census (G-17). That is why it does not wait for G-17.
- **S-10 Assigned grades only (ruling MA-48, Marlon 2026-11-26).** `formatGrade` needs who graded, when and what was watched, and shows confidence as a word ("thin look", "fair look", "well watched"; cut points are assumption rows `words.*`); the numeric band is carried as `bandText`/`low`/`high` for the tap and shown in the text only with `showBand`. `gradeCells` returns an `unwatched` cell, holding no number, for any attribute with no evidence (public prior only). The direction glyph is no longer drawn from a projection by default; a caller passes the evaluator's direction word.
- **S-11 Potential in words.** `project` stays as the internal projection (AI ranking, recruiting, boards). `potentialRead` turns it into what a card shows: a hunch from a phrase table keyed by hunch strength (projected minus current over the projected sd), hedged under age 21, plus an explanation from the two largest drivers (age, frame, trend, work), a direction word, a horizon, the evaluator's name and the date. The evaluator id picks the wording, so two evaluators can word the same player differently. The read holds no projected number or band.
- **S-12 UI lint.** `npm run lint` section "no projected number or range in the UI layer" (tools `lintUiProjection`) flags, in app-services, app-ui and the shells, any import or `scouting.` use of `project`, `Projection`, `band`, `halfWidth`, `arrowFor`, `hunchStrength`, `ceilingLookVariance`, `projectionLookSd`, `linearToPeak`, and any read of `projection.mean` or `projection.variance`.

## Not here

- **Role label (D6.3.1) and flags (D6.3.2).** They need the depth chart and scheme (M2, F1), injury history (D11) and effort grades (N1). They belong with the personnel package (G-57) or a follow-up package, which can call `roleGrade` and `project` from here.
- **D6.5.1 late-bloomer check and D6.4.5 draft-outcome table.** Both need D7 development (G-20) and a 30-year run (Q2); the correlation half of D6.5.1 is tested here.
- **D6.2.2 rank correlation 0.8 with on-field value.** Needs role weight tables from F1 and G content and the engine (Q calibration).

## Change requests to the integrator

- **CR-G19-1** `AttributeBelief` (schema `world/person.ts`): add `variance` (observer_estimate, ISS squared) and `lastEvidence` (date or null), and per-attribute contributor ids, so S-02's encoding and the per-view `sourceStaffIds` can retire.
- **CR-G19-2** `packages/people/src/index.ts`: add `export * as scouting from './scouting/index.ts';`.
- **CR-G19-4** `AttributeBelief`: keep the evidence count by kind (snaps, practices, workouts, interviews) and the grader ids per attribute, so a card can say "graded 214 snaps and 31 practices" and name the grader (D6.1.1, MA-48). Until then `gradeCells` reads the one count as "N looks" and takes `graderOf`/`watchedOf` from the caller.
- **CR-G19-3** For G-27 and the app shell: the D6.1.1 code check "the UI layer cannot import the true-value accessor" should list `scouting.observe`, `scouting.drawLeniency`, `scouting.drawPlayerOffset` and `scouting.reportedForty` as truth readers that no read model or screen may call.

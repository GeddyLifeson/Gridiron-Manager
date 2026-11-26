# G-99 Coach validation tooling (bible Q5)

The coach studies are deferred (Marlon, 2026-11-25 22:23 UTC: no coach reviewer for now). This folder
builds the tooling so they can run the day reviewers exist, and makes every output say what has not run.

| File | Leaf | What it does |
| --- | --- | --- |
| status.ts | Q5 header, Q5.6.1 | Deferral state per study, stand-in, release-note line. One switch: `coachReviewersAvailable`. |
| clips.ts | Q5.1.1, Q5.2.1 r1 | Clip truth, success/failure, seeded stratified sampler (nobody picks clips). |
| film.ts | Q5.2.1, G-63 | Blinds the film room's FilmRecord (overlays off) and pairs it with engine truth. Structural type, since headless may not import app-services. |
| blind-film.ts | Q5.2.1 | Answer sheet (fixed lists + cannot tell, one-line reason), checks, scoring, verdict, consistent misreads. |
| football-review.ts | Q5.1.1, Q5.6.1 r2b, Q6.1.2 | Findings form, slice gate, file review status, "Reviewed (2 coaches)", staff label. |
| skill-separation.ts | Q5.3.1 | Group means, interface-adjusted means, ordering check. |
| learning-test.ts | Q5.4.1 | Form checks (trace, equivalence, no game-only terms) and gain over control. |
| claims.ts | Q5.5.1 | Evidence level 0 to 3, allowed wording, forbidden wording. |
| report.ts | all | One deterministic text report. |
| params.ts | Q5 | Starting numbers; pass marks are Assumptions per Q5.2.1. |

## Module choices (not facts, flagged)
- Success/failure fallback when EPA is missing: first down or touchdown is success, turnover or sack is failure, else gain of at least 4 yards.
- "Consistently misread" (Q5.2.1 rule 5) = more than half of a clip's reviewers wrong, at least 2 reviewers.
- Interface control (Q5.3.1) = pooled least-squares adjustment on drill call time.

## Owed
- Integrator: barrel line `export * as validation from './validation/index.ts';` in packages/headless/src/index.ts; a `validation` subcommand in cli.ts once study data files have a home (outside the repo for reviewer details, Q5.6.1).
- Play explainer (Q2.6.1) must supply `PlayTruth.decisiveEvent` and both teams' calls; not built yet.
- N4 decision record score feeds `Participant.recordScore` when it exists.

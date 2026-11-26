# career/ladder (G-55)

Ladder rungs and the duty system. Bible: S1.3, S3 (S3.1.1 is the spine).

- `duties.json`: one row per S3 duty leaf (S3.2.1 to S3.7.1) with the S3.1.1 fields: tool, cadence, due slot in the H1.1.1 week (G-6 to G), hours, grader kind, consumer. S3.6.2 is split into side plan, play calling, staff management and hiring so each matrix row has a duty. Hours and due times are module starting values (Assumption).
- `matrix.json`: the S3.1.1 ownership matrix as written (O, R, B by band 1, 2, 3, 4-5, 6, 7, 8-9), with the two conditional cells (`O_or_R` play calling at rung 7, `by_power` personnel reports at 8-9), plus one row for S3.6.3 that the S3.1.1 table lacks (sent to the bible fixes thread).
- `ownership.ts`: a seat's duty list. The matrix decides the mark; G-25's `dutyIds` say what the seat performs; every R and B cell at the seat's band is added; a seat that leads a side or the program (S3.6.2, S3.7.1) owns every O family at its band; empty bands above push duties down (S3.1.1 edge case). `weekScreen` is the S3.1.1 week list.
- `grading.ts`: the truth, boss and mixed grading rules of each S3 leaf. Nothing raises a value on the coach (E9.1.3) and no setting changes a graded task (INDEX rule 9).
- `perform.ts`, `run.ts`: headless performance. A `TruthSource` (engine, H2, N1; `syntheticTruth` until they land) builds each task, a `Worker` (user or `aiWorker`, K6) submits, `gradeProduct` grades; `runStaffWeek` runs a whole staff and writes events.
- `enrolment.ts`, `keys.ts`: the S3.3.4 graduate assistant seat from rule keys (requested; absent key = no rule, so the pro coaching assistant has none).
- `paths.json`, `paths.ts`: S1.3.1 path targets (all 1 of 3, Unverified) and the 30-season check. Calibration targets only.
- `params.ts`: design constants with basis and leaf.

Not merged yet, coded against the contract: S4 boss judge (G-78, `BossJudge`), K6 AI accuracy (G-26 profiles), engine truth records (`TruthSource`), E7 hour budget (G-53 reads `hours`).

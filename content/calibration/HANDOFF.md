# WP-13 handoff (work stopped part way, 2026-11-26)

Done:
- `targets.pro_2026.json`: 287 pro target rows from bible J15 and Q2.1.1 (contract shape `CalibrationTargetFile`).
- `facts/measured-rate.json`: 277 fact rows, status computed from sources (6 Verified, 38 "2 of 3", 214 "1 of 3", 13 Unverified, 4 Conflict, 2 Assumption). `usedBy` is empty because the lint only fills it from rule-set files.
- `authoring/lib.py`, `authoring/pro.py`: the script that wrote both files (run `python3 -c "import pro"` in that folder; the emit step is in the commit message). It asserts each row's expected status.

Conventions used in the rows:
- `filter` is `<measure name>: <words>`. The measure name is what the harness must implement; `none` means not measurable from the contract yet; `ordering` rows list measure names lowest first in `value`. Measures take arguments in brackets, e.g. `kick.fieldGoalPct(40,49)`, and quantile points after `@`.
- A missing-source row has `value: []`, `factId: null`, tier `watch`.
- For a `rel` tolerance, `low` is an absolute floor (Q2.3.1 quantile rule). `poisson` rows use `value` as the relative floor.
- A source carries `value` only when it equals the row value exactly; a different `value` makes the row Conflict.

Not done:
- Nothing in `packages/headless/src/calibration/` yet: measures, tolerance and compare, report, batch runner, chart caller, tests.
- College file: convert the 58 records of `bible/_sources/calibration.college_top.v1.json` (T12 exists, so college rows have their own sources).
- Loader checks not yet run in TypeScript: `CalibrationTargetFile.parse`, `targetTierProblems`, fact value equals target value.

Contract change requests to send to the integrator:
- `DecisionView` does not show the snapping unit to the defence (needed to pick a return unit).
- `PlayByPlayRow` has no punt or kickoff result fields (distance, touchback, blocked, returned); `GameSummary` has no wind or roof.
- `CalibrationTarget.value` cannot be null for a missing row.
- The fact lint's `usedBy` check ignores calibration targets.

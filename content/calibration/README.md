# Calibration targets (WP-13)

Files:
- `targets.pro_2026.json`: 287 rows from bible J15 and Q2.1.1. Certify tier only on the Verified rows: points per team, total points, and the three rusher-count orderings.
- `targets.college_2026.json`: 86 rows from T12 (`bible/_sources/calibration.college_top.v1.json` and the T12 tables). No college row is filled from a pro value and none is certify. The 11 open rows of T12.7.1 have no fact row and print MISSING SOURCE.
- `facts/measured-rate.json` (repo root): the fact rows behind both files; status is computed from sources (Q6.1.2).
- `authoring/`: the script that wrote all three files. Regenerate with `python3 content/calibration/authoring/college.py` (it also rewrites the pro file from `pro.py`); it asserts each row's expected status.

Row conventions:
- `filter` is `<measure>: <words>`. The measure is implemented in `packages/headless/src/calibration/measures.ts`; `none` means not measurable from the contract yet (the report prints NOT MEASURABLE). Measures take arguments in brackets, e.g. `kick.fieldGoalPct(40,49)`, and quantile points after `@`. `ordering` rows list measure names lowest first in `value`.
- A missing-source row has `value: []`, `factId: null`, tier `watch`.
- `rel` tolerance: `low` is an absolute floor (Q2.3.1 quantile rule); the harness also widens to two real-data standard errors for rates (J15.1.2). `poisson` rows use `value` as the relative floor.
- A source carries `value` only when it equals the row value exactly; a different `value` makes the row Conflict.

Known gaps:
- College kickoff touchback rate: T12 prints Conflict (the one source disagrees with itself by season). The register computes 1 of 3 because there is one source. Watch tier either way.
- College sack rate: the script label says "per dropback", but its pro value equals sacks over attempts plus sacks, so the row uses that measure. Inferred, not confirmed from the script.

Contract change requests (for the integrator, plans/engine-build-plan.md section 6):
- `DecisionView` does not show the opposing coach which unit was sent out; the chart caller predicts it from the situation.
- `PlayByPlayRow` has no punt or kickoff result fields (distance, touchback, blocked, returned); `GameSummary` has no wind, roof, neutral-site or conference field. Those rows are `none` until then.
- `CalibrationTarget.value` cannot be null for a missing row (rows use `[]`).
- The fact lint's `usedBy` check ignores calibration targets, so `usedBy` stays empty on measured-rate rows.
- `PlayByPlayRow` has no explicit completion flag; the harness reads `resultType` (a completed pass that is then fumbled counts when it carries yards after catch). WP-07 should confirm.

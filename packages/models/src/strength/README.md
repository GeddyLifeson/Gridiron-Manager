# Team strength, decision chart, tracking and analytics access (G-71)

Bible: N2.4.1, N2.4.2, N2.5.1, N2.6.1, N2.7.1, N2.7.2 (and N2.1.2 rule 3 for the charted floor).

## Files

- `strength.ts`: N2.6.1. Weighted ridge regression, `points(s) = mu + O[s] - D[o] + home h/2`, special teams from net special-teams points when supplied. Prior weight fades 1 → 0.5 after 4 games → under 0.1 after 12 (`w(n) = 1/(1+(n/4)^2.5)`). Quarterback change shifts the offense term the same week. Rested-starters games weigh 0.25. Error bands from the posterior covariance; `predictMargin` for any matchup.
- `chart.ts`: N2.4.1. Fourth-down chart (yard line by distance) and two-point chart (lead by time) by the staff version of the N2.2.2 rule 4 search on G-07 `optionWp`. Outcome chances come from `ChartEstimates` (staff estimates only). Head coach edits are offsets with a reason, kept by the live recomputation (`chartCell` with the real score and clock), and logged via `editLog`.
- `variance.ts`: N2.4.2. Paired-simulation estimates per lever with standard error, "no clear effect" inside two standard errors, "no variance edge" under a 2-point gap, simulation count capped by the test-sim budget. The caller runs the simulations on staff estimates.
- `tracking.ts`: N2.5.1. Down-sampling to 10 Hz, game movement (distance, high-speed distance, sprints, top speed, accelerations), practice load from movement profiles, 7/28-day load ratio and flags, top-speed drop note, availability by program.
- `access.ts`: N2.7.1. Report staff-hours, capacity, on schedule / late / user builds / not available.
- `limits.ts`: N2.7.2. Confidence marks (solid, fair, thin) with reasons; `coachsCall` (owned here, applied by N3 and N4); the standing note's text ids.
- `views.ts`: plain-data views the read models in `app-services/src/read-models/analytics/` build from observed tables.

## Conventions

- A kickoff state is seen from the receiving team (G-07 / nflverse `posteam`).
- Nothing reads a true rating. The strength table is public information; the chart and variance brief use staff estimates.

## Named assumptions (not facts)

Every `assumption` row in `params.ts`, plus `ASSUMED_ANALYTICS_DUTY` (analytics seat duty id until G-55 publishes duties) and `ASSUMED_TRACKING_BY_BAND` (tracking by resource band until the `analytics_access.<level>` league-rules key exists).

## Not built here

- End-of-half timeout notes on the chart (needs the I5 clock model).
- Drive EPA with garbage time filtered as a strength input: `StrengthGame.epaPoints` accepts it, but `strengthView` reads final scores only until the play-row EPA pass exists (G-66 tendency store or a stats package).
- The 200-season and 10,000-game acceptance runs on the real engine: tested here on synthetic seasons and a toy game; rerun on engine batches when they exist.

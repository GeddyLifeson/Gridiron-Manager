# turnover: player aging and roster turnover in the off-screen world

Binds the G-81 loop's `development` (season point) and `moves` (weekly, acts on the first pass of a season) steps.
Fixes the PR 168 drift failure: before this, ages rose exactly one year per season because nobody joined or left a roster.

## What runs

- `developmentStep(binding)`: every active player in the world, rostered or in a pool, takes one `league.development.developYear`
  at his age for the season being entered (D1.1.1). Variation is uncapped (D7.4.2 ruling). Rostered players' D1.1.2 counters advance.
  The top half of each position's mix count on a roster gets starter reps (D7.7.1 role).
- `rosterMovesStep(binding)`, in C4 order: college eligibility ends (rule keys `eligibility.seasons_of_competition`,
  `eligibility.seasons_clock_years`) and the player joins the pro entry pool (X11.1.1); pro players and free agents may choose to
  retire (`development.retirementChance`, D8.4.1 path 2); free agency fills to the offseason limit minus the draft rounds (C8); the
  draft runs over the pro entry pool in the `league.draft.selectionOrder` order (C7.2.1) from last season's records; the rest form the
  undrafted pool (`cohorts.formUndraftedPool`) and are signed to `roster.offseason_limit`; the M6 cutdown keeps each position's mix count
  by grade, then the best of the rest; free agents unsigned for `career.jobCyclesBeforeLeaving` cycles leave football (X12.1.2, D8.4.1
  path 1). College programs then sign recruits at enrolment age, then walk-ons, to the limit (T4). Unsigned recruits leave the world's football.
- Every choice reads an observed grade (`people.scouting.observe`, D6.4.2), never the truth (K9).
- `SeasonSummary.records` (loop) holds each team's regular-season line for the draft order.

## Decisions

- TO-01. Policy is a port (`RosterPolicy.boardScore`). The default is grade plus a need bonus. The front office AI (`front-office` `gm`)
  binds here once its barrel exports it (CR-G76-1).
- TO-02. Redshirt: a first-season college player who is not a starter keeps the season once. Game counts need the statistics step
  (X3.4.1, unbound), so "not a starter" stands in for "played at most `eligibility.redshirt_max_games`". Without it the founding class
  spread echoed every four seasons in roster turnover.
- TO-03. A founding college player has no clock on record: his clock started at `age.collegeFirstYear` and every season since counted.
- TO-04. No early declarations (underclassmen, `draft.min_years_from_high_school`), transfers, trades, waivers claims, practice squads or
  contracts and the cap yet. Each is owed to its owner's binding (G-76 front office, C6 cap).
- TO-05. Retirement multipliers for major injury, lost starting job and contender interest stay at 1: the health (D11) and depth chart
  (M2) steps are unbound off-screen.

## Flagged (not triple verified)

All five tuning rows in `params.ts` are Assumptions (no source read). The pro mean roster age settles near 28 in the trimmed test world;
it needs checking against a sourced D8 age band before calibration.

## For the integrator

- World barrel: `export * as turnover from './turnover/index.ts';`, register `turnover.PARAMS`, pass `TURNOVER_EVENT_TYPES` to `createWorld`.
- Composition root: bind `development: turnover.developmentStep(b)` and `moves: turnover.rosterMovesStep(b)` with
  `b = { content, rule }`, where `rule(level, key)` reads the league rules then the rule set (as the world fixtures' `lookup` does).

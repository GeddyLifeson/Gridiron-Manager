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

- TO-01. Policy is a port (`RosterPolicy`: `boardScore`, `pick`, `cutdown`, `recruitOffers`). The default is grade plus a need bonus.
  `gmPolicy()` (front-office.ts) binds the front office AI; a hook that returns null leaves that choice to the default, 'pass' signs nobody.
- TO-02. Redshirt: a first-season college player who is not a starter keeps the season once. Game counts need the statistics step
  (X3.4.1, unbound), so "not a starter" stands in for "played at most `eligibility.redshirt_max_games`". Without it the founding class
  spread echoed every four seasons in roster turnover.
- TO-03. A founding college player has no clock on record: his clock started at `age.collegeFirstYear` and every season since counted.
- TO-04. No early declarations (underclassmen, `draft.min_years_from_high_school`), transfers, trades, waivers claims, practice squads or
  contracts and the cap yet. Each is owed to its owner's binding (G-76 front office, C6 cap).
- TO-05. Retirement multipliers for major injury, lost starting job and contender interest stay at 1: the health (D11) and depth chart
  (M2) steps are unbound off-screen.

- TO-06. `gmPolicy()`: one general manager per pro club, generated once from the world seed and club id (`generateGm`, arrangement
  `split`), never turned over off-screen. Draft picks use `buildBoard` over the rookie contract length (rule keys `rookie.length_*`,
  else the gm horizon), undrafted signings `undraftedBoard`, free agency `targets` (he passes when no free agent beats replacement),
  the cutdown `cutdown` with the position mix as minimums and this year's draft rounds. Views carry the observed grade and its evidence
  variance (`GradeContext.belief`), never the truth. The contribution table is a stand-in until the J14.6.1 batch runs: one
  `gm.winsPerIss` for every position, replacement level at the `gm.replacementQuantile` of the club's own roster (before the draft:
  his grade of the entry-pool prospect just past the expected picks at the position, the player he can have for nothing), slot weights
  from the mix (starters 1, depth `gm.depthSlotWeight`). The age curve is D8.2.1 read linearly (`ageCurve()`). The K7.2.1 baseline is
  the mean public grade of each club's starters (`GradeContext.publicGrade`, no evaluator lean).
- TO-07. No contracts or cap yet (TO-04): every cost is empty, so value equals surplus and `centsPerWin` never enters. Pressure is 0
  (K8.3.1 unbound). Projections are null (no D6.5.1 ceiling looks off-screen).
- TO-08. College signings: each program's K7.1.2 builder (from the seed, the club and its head coach) offers down its `recruitBoard`
  (value and `placeNeeds`; replacement at the low end of the class as it grades it) for `offersWanted(open, college.offersPerSignee)`
  offers. Recruits, best public grade first, take the offer from the program with the highest prestige plus their own noise
  (`recruit.prestigeNoiseSd`) that still has a place. This stands in for the full T4 week (`league.recruiting.aiProgramWeek`), which
  needs a RecruitingState, prospects with circles and preferences, and a calendar held in the world (owed, see the handoff).
- TO-09. Recruits carry no home region or sign chance off-screen yet, so `regionalFocus` and `hoursSplit` do not act.
- TO-10. `gm.raise` (K7.7.1) runs for `early_contact_player` before free agency (`RosterPolicy.earlyContact`, see
  `src/compliance/README.md`). The world now holds general managers (off-ladder seats), compliance state and a weekly compliance step.
  Other opportunities wait on their owning procedures off-screen: contracts and the cap (pay above cap, undisclosed terms, camp
  fines), medical reports (hidden injury), recruiting contacts and transfers (college). K7.6.1 staff searches
  (`career.staff.runSearch`) wait on coach turnover off-screen.

## Acceptance runs (K7, 10/30/50 seasons)

`test/turnover/acceptance.test.ts`, skipped unless `GM_WORLD_ACCEPTANCE=10,30,50`. Results on the trimmed test world are in the PR.
Not measurable yet: cap legality, contract sizes, trade counts (TO-04). Violations detected are now counted in the compliance state (TO-10), with no researched target. The undrafted share of pro
rosters depends on the size of the college world: the trimmed world sends too few players to the entry pool, so the number must be
read from a full-world run.

## Flagged (not triple verified)

All tuning rows in `params.ts` except `college.offersPerSignee` (bible K7.5.1, 2 of 3) are Assumptions (no source read). The pro mean roster age settles near 28 in the trimmed test world;
it needs checking against a sourced D8 age band before calibration.

## For the integrator

- World barrel: `export * as turnover from './turnover/index.ts';`, register `turnover.PARAMS`, pass `TURNOVER_EVENT_TYPES` to `createWorld`.
- Composition root: bind `development: turnover.developmentStep(b)` and `moves: turnover.rosterMovesStep(b)` with
  `b = { content, rule, policy: turnover.gmPolicy() }`, where `rule(level, key)` reads the league rules then the rule set (as the world
  fixtures' `lookup` does).
- J13.2.1 stream catalogue: `world.frontoffice.gm` (scope: club, or 'college', club, head coach) and `world.frontoffice.draw`
  (scope: kind, general manager, key) are new stream names (CR-G76-3).

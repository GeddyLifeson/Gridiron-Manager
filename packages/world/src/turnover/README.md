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

## Coach turnover (coaches.ts)

`coachMovesStep(b)` is the coach half of the K7 `moves` step; `movesStep(b, rosterMovesStep(b))` runs it first, then the roster
cycle (C4: coaching changes come before free agency and the draft).

- Every pass: each AI head coach's decider (`stakeholders.generateDecisionMaker`, from the seed, the team and its owner, or its
  athletic director at a college) updates confidence from the week's games (`stakeholders.updateConfidence`, K8.3.1), with the
  public pregame chance from the N2.6.1 strength fit (`models.strength`). A game that leaves confidence below 30 brings an
  emergency review (`stakeholders.review`, E4.3.1, E4.3.3). A firing names the senior assistant interim (`interim_named`).
- First pass of a season (the loop's results array has turned over): the season-end reading and the main review (E4.3.1);
  coordinators whose unit was below standard for `fire.seasonsBelowStandard` seasons are let go (`staff.aiFiresAssistant`,
  K7.6.1 rule 5); chair holders and pool coaches retire by `market.retireHazard` (E2.3.4 rule 4), pool coaches unsigned for
  `career.jobCyclesBeforeLeaving` cycles leave; deals that ran out renew. Head chairs are searched worst record first by the
  owner (`stakeholders.rankCandidates`/`runSearch`, K8.4.2); a hire who held a head chair elsewhere opens that one in turn. The
  new head coach offers chairs to former colleagues (`positions.decideFollow`, E2.3.4 rule 2) and reviews the staff he inherits
  (`positions.firingCascade`, X8.4.1). Every open chair is filled inside first or from the pool by his own ranking
  (`staff.rankCandidates`/`runSearch`, then `positions.fillVacancy`, K7.6.1, X8.4.2).
- Openings are counted by season, level, rung and reason (`coachOpenings`, E2.3.4 acceptance 1, 2 and 4). `coachEntrants(world)`
  sizes the `coach_staff_entry` cohort (E2.3.4 rule 5).
- State lives in `LiveWorld.systemState` under `world.turnover.coaches`; the step digest carries the head count and the sum of
  confidence so the pass hash covers it.

Decisions:

- TO-11. Candidates are seen through the public record only: the win share of the teams they served over `coach.recordSeasons`
  seasons, their rung and side, and seasons on the same staff (`coach.tieSeasons`, `coach.tiePerSeason`) standing in for X7 edges.
  No labels, references, interviews or scheme families yet (X2.2, X7, E2.4.3 and K2.5.2 are unbound off-screen).
- TO-12. No contracts or cap (TO-04): firing costs nothing (money factor 1), offers carry no pay, deals are lengths only
  (`contract.staffMaxYears`). Every head coach counts as hired by his general manager (GMs are never turned over, TO-06).
- TO-13. No health (E8) or wealth (E6.9.2) state off-screen: those retirement terms are 0. Imported people use age and years out only.
- TO-14. Not yet: lateral moves (E2.3.4 rule 1, needs the E2.5.2 situation judgment and pay), permission windows and tampering
  (C11, `early_contact_coach`), position coach grading below coordinators, the president forcing a college firing (K8.5.1).
- TO-15. The cohort runs at the season point, before the offseason's exits are known, so `coachEntrants` reads the larger of last
  offseason's exits, its bottom-rung demand, and the retirements the coming offseason expects. Players who left football in the
  last two seasons (up to `coach.formerPlayerMaxAge`) can start at rungs 0 to 2 (catalogue `job:outside.former_player`).
- TO-16. The user's own team and seat are left to the career module: the step never reviews, retires or fills for the user.
- TO-17. The career event types (market `coach_fired`, `coach_retired`; staff `staff_hired`, `staff_fired`; positions
  `interim_named`, `staff_released`, `staff_followed`, `job_opened`, `promoted_within`) are marked compactable, which the world
  registry refuses (X2.4.1 rule 4: career is never compacted). `COACH_EVENT_TYPES` registers them with `compactable: false`;
  the fix belongs in the career modules. They have min tier 1, so tier 2 and 3 teams record nothing (X13.1.1).

## Acceptance runs (K7, 10/30/50 seasons)

`test/turnover/acceptance.test.ts`, skipped unless `GM_WORLD_ACCEPTANCE=10,30,50`. Results on the trimmed test world are in the PR.
Not measurable yet: cap legality, contract sizes, trade counts (TO-04). Violations detected are now counted in the compliance state (TO-10), with no researched target. The undrafted share of pro
rosters depends on the size of the college world: the trimmed world sends too few players to the entry pool, so the number must be
read from a full-world run.

## Flagged (not triple verified)

All tuning rows in `params.ts` except `college.offersPerSignee` (bible K7.5.1, 2 of 3) are Assumptions (no source read). The pro mean roster age settles near 28 in the trimmed test world;
it needs checking against a sourced D8 age band before calibration.

## For the integrator

- Coach turnover: bind `moves: turnover.movesStep(b, turnover.rosterMovesStep(b))`, pass `turnover.COACH_EVENT_TYPES` to
  `createWorld` beside `TURNOVER_EVENT_TYPES`, and size the `coach_staff_entry` cohort with
  `openEntryChairs: turnover.coachEntrants(world)`. New stream names `world.turnover.coaches`, `world.turnover.coaches.decider`
  and `world.turnover.coaches.cascade` (J13.2.1). Saves must carry `LiveWorld.systemState` (G-83).

- World barrel: `export * as turnover from './turnover/index.ts';`, register `turnover.PARAMS`, pass `TURNOVER_EVENT_TYPES` to `createWorld`.
- Composition root: bind `development: turnover.developmentStep(b)` and `moves: turnover.rosterMovesStep(b)` with
  `b = { content, rule, policy: turnover.gmPolicy() }`, where `rule(level, key)` reads the league rules then the rule set (as the world
  fixtures' `lookup` does).
- J13.2.1 stream catalogue: `world.frontoffice.gm` (scope: club, or 'college', club, head coach) and `world.frontoffice.draw`
  (scope: kind, general manager, key) are new stream names (CR-G76-3).

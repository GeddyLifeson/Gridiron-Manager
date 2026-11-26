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
  variance (`GradeContext.belief`), never the truth. The contribution table is a stand-in until the J14.6.1 batch runs: 
  `gm.winsPerIss` weighted by position from the pay scale (TO-18), replacement level at the `gm.replacementQuantile` of the club's own roster (before the draft:
  his grade of the entry-pool prospect just past the expected picks at the position, the player he can have for nothing), slot weights
  from the mix (starters 1, depth `gm.depthSlotWeight`). The age curve is D8.2.1 read linearly (`ageCurve()`). The K7.2.1 baseline is
  the mean public grade of each club's starters (`GradeContext.publicGrade`, no evaluator lean).
- TO-07. With the contracts module in the world and `gmPolicy({ contracts })` bound: a player's cost to his own club is his contract's salary by league year, cutting him keeps his guaranteed salary as dead money, a free agent carries his C8.3.1 market years, guarantee share and minimum, and `centsPerWin` is `gm.goingRateCentsPerWin` over last market's free agent signings (average per year over the wins the signing club's general manager now expects of him this season; before any market, every active veteran contract read the same way). Without contracts every cost is empty, so value equals surplus and `centsPerWin` (1) never enters. Pressure is 0
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

## Keeping, cutting and re-signing veterans (2026-11-26)

Longer sourced contracts (PC-14) showed clubs cutting most veterans one season into multi-year deals, with one club's
cash at $375.8M against the $301.2M cap once the accelerated guarantees landed. Causes found and fixed:

- TO-18 (Assumption: the reading). The contribution table's wins per ISS point is `gm.winsPerIss` times a position weight
  from the sourced pay scale (`contracts.positionValueWeights`): the mean cap share the above-median players at a position are
  paid over the median player, over its roster-mix mean. QB about 3.2, LS about 0.04. Before this, a better quarterback was worth
  no more per grade point than a better guard, so every highly paid quarterback, receiver and edge looked overpaid. This stands in
  for the J14.6.1 table until the engine batch runs exist; the general managers' own `positionValues` still spread it.
- TO-19. At the cutdown (with contracts bound): this season's pay is spent either way, since the market has closed and PC-13
  spends the owner's budget on whoever is kept, so the cutdown weighs only later years' pay and guarantees. A player signed this
  cycle has no contract until the contract year opens after the cutdown, so he carries the deal he is about to sign (a pick or
  undrafted rookie: the rookie length at the minimum; anyone else: his C8.3.1 market line). Before this he looked free.
  The cap binds: `capState` gives this year's team salary if everyone is kept and what each cut changes it by (salary saved
  less every guaranteed salary still owed, which a release brings into this year, CBA Art. 13 s.6(d)(iv), read in the primary
  text, Rulebook only), and `gm.cutdown`'s repair pass (K7.4.1 rule 2) keeps a cut whose guarantees would break the cap.
- TO-20. After the cutdown the players just cut are free at once (C8.3.2; vested veterans in the real league, waiver claims for
  the rest, not split here). Clubs in the waiver order (worst record first, C5.5.1) sign one who beats the lowest-scored player
  they kept at his position by `roster.claimMargin` (K7.3.1 rule 3), priced at his market line, with cap room after the swap,
  and release that player. One signing per club per pass; a club that passes is done. He signs as a `free_agent`, so the
  contracts step counts his suitors and prices him by PC-12. The kept players and the new man are scored as at the cutdown
  (TO-19). Before this, every player cut waited a full year for the next market. The first version needed a limit of 2 a club
  (`street.signingsPerClub`); TO-31 removed it.
- TO-21 (Assumption: the cap of 4). A look at a rostered player, or at a veteran out of work, pools his seasons of film
  (one season's look for each of his credited seasons plus one, up to `grade.pooledSeasonsMax`), by the D6.1.1 precision-weighted
  update. At 4 the look's sd is half a one-season look's, about D6.4.1's prior sd of 6 for an established starter. Before this,
  each season was one fresh look with sd about 11, so a veteran rated a star one year looked ordinary the next.
- TO-22. A club's look updates the D6.4.1 prior instead of replacing it: prior mean the census mean at the position among the
  players rostered at the club's level (D6.4.1 `positionLevelMean`, a population average, never one player's value; split by
  TO-24), prior sd
  12, 8 or 6 by film (none, some, established). Lucky looks at undrafted players no longer beat known veterans by chance. The
  public look keeps no prior (it sets pay rank within a position, where a common prior would not reorder anyone of the same
  information).

### Second pass: clubs value, sign and re-sign on their own numbers (TO-23 to TO-31)

Tracing the veterans still cut showed that most were better than the players kept, both truly and by the club's own grade,
and lost on cost: the club had paid them far above its own value of them. Causes found and fixed, in the order found:

- TO-23 (D6.1.1). Pooled film is the same film: each season's look at a player is drawn once (its stream keyed by that season)
  and a pooled look is the mean of the seasons in the window, so next year's grade shares all but one season with this year's.
  TO-21 drew the whole pool afresh each year, which reshuffled near-equal players at every cutdown.
- TO-24 (D6.4.1, "unbiased across the population"). The prior mean is the position and level average of the population the
  public facts place a player in: a player with no credited pro season against the rostered players with none (the camp's
  rookies), anyone else against the rostered veterans. TO-22's single census graded every undrafted rookie near an average
  veteran.
- TO-25 (D6.4.2; Assumption: `grade.filmSnapsPerSeason` 300). A filmed player is graded snap by snap: his own club from its game
  film (`game_film`), another club from opponent film (`opponent_film`), the public from a charting service
  (`grading_service`), each over 300 snaps a season. It replaces the season-stats look (`grade.rosteredUnits`, removed), whose sd
  of 11 a season left a veteran's public percentile, and so his C8.3.1 price, mostly noise, and left clubs not knowing their own
  players.
- TO-26 (GM-18; Assumption: the reading). A player's wins above replacement follow the sourced pay scale's shape (PC-11): the cap
  share at his public percentile less the share at replacement, at the same average rate per ISS point between the 10th and 90th
  percentiles as the linear table (`ContributionTable.winsAbove`). One rate per point valued a star like two average players,
  so every contract on the real, steeper scale looked overpaid a year later.
- TO-27 (K7.2.2 rule 5). The going rate reads each signing with the league's estimate (the public grade), not the signing club's:
  the club that wins a player rates him highest, so its own estimate made every market contract look fair on the day it was
  signed. Cost and the rate are pay above the minimum for his credited seasons, the price of a player worth zero wins above
  replacement (TO-26 measures value from the same floor). The walk-away number is then pay above the minimum.
- TO-28 (Assumption: the reading). Replacement level is the `gm.replacementQuantile` of every rostered player at the position
  in the league, as the club grades them. Read from the club's own few players, the lowest-graded at each position was
  replacement by definition, worth nothing, and any pay made him a cut.
- TO-29 (K7.4.2 rule 1, bible). A club signs a free agent only if his market price (PC-11, before suitors) is within its
  walk-away number. Signing the most valuable player at any price paid stars whatever the market asked.
- TO-30 (K7.4.1 rule 3, bible). Before the market opens each club decides on its players whose contracts ran out: one whose
  re-signing price (the scale share, PC-13) is above its walk-away number goes to free agency (`released`, reason
  `contract_expired`). Before this every expiring player stayed at the price the contracts step set, whatever the club thought.
- TO-31. No count limits street signings: each must beat the kept player by `roster.claimMargin` after dead money, at the market
  price within the cap (TO-20). With TO-23 to TO-30 in place, lifting the limit moved the all-tier rate from 32.0 to 30.7 percent.
- PC-15 (contracts README). After founding, new money is not scaled up to the owner's budget; a club with room front-loads its new
  multi-year deals, so later years cost less to keep.

Measured on the trimmed test world (8 pro clubs, eight offseasons,
`RELEASE_RATES=1 RELEASE_SEASONS=8 npx vitest run packages/world/test/contracts/tools/release-rates.test.ts`), against
OverTheCap 2011-2021 veteran deals of two or more years (facts/release-rates.json, F-release-0001..0006, 1 of 3). The cohort
is now each offseason's new deals; founding contracts (invented terms part way through) are left out.

| | PR 291 | First pass (TO-18 to TO-22) | Second pass | Real |
|---|---|---|---|---|
| Club-years over the cap | 1 of 48 | 0 | 0 of 64 | 0 |
| Gone one season in, pay tier 0-0.5 | 50.3% | 37.1% | 32.4% of 105 | 28.2% |
| 0.5-0.8 | 55.6% | 55.6% | 29.1% of 86 | 15.2% |
| 0.8-0.9 | 75.0% | 45.5% | 71.4% of 7 | 8.2% |
| 0.9-1 | 60.7% | 61.4% | 20.3% of 69 | 5.7% |
| All tiers | 55.6% | 49.1% | 29.2% | 19.4% |
| Top tier gone, signed again within the run | 28 of 49 | 22 of 42 | 9 of 14 | 77.3% within a year |

The first two columns used six offseasons with founding contracts in the cohort. The 0.8-0.9 tier holds a handful of deals in an
8-club world. Spotrac's count (The Ringer, free-agent deals 2011-2015, F-release-0007..0010) is higher than OverTheCap's because it
counts full seasons served (a player cut during his second season served one); the world, with no in-season cuts of veterans,
matches OverTheCap's count.

Still above real, most in the middle tier. What is left: low-paid veterans near replacement lose to young players whose projected
growth (D7 expectations in the horizon) outweighs a small salary, and the 8-club world prices the best of a handful of players at a
position as the league's best. Nothing here is tuned to hit the targets.

## Acceptance runs (K7, 10/30/50 seasons)

`test/turnover/acceptance.test.ts`, skipped unless `GM_WORLD_ACCEPTANCE=10,30,50`. Results on the trimmed test world are in the PR.
Cap legality is measured with contracts bound (TO-19, `release-rates.test.ts`). Not measurable yet: trade counts (TO-04). Violations detected are now counted in the compliance state (TO-10), with no researched target. The undrafted share of pro
rosters depends on the size of the college world: the trimmed world sends too few players to the entry pool, so the number must be
read from a full-world run.

## Flagged (not triple verified)

All tuning rows in `params.ts` except `college.offersPerSignee` (bible K7.5.1, 2 of 3) are Assumptions (no source read), `grade.pooledSeasonsMax` and `grade.filmSnapsPerSeason` included. TO-26 and TO-28 read the pay scale and the league's rostered players as value shape and replacement: Assumptions. TO-18 reads the market pay scale (1 of 3) as position value: an Assumption. The release targets (F-release-*) are 1 of 3 each: OverTheCap and Spotrac disagree by definition (see above), PFF agrees in shape. The pro mean roster age settles near 28 in the trimmed test world;
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

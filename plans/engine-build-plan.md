# Engine build plan (roadmap phases 1 to 4)

Scope: the simulation engine from the rules engine to a full game on the tick engine (R1 phases 1 to 4).
The shared contract is in code at `packages/schema/src/sim/` (15 files, exported from `@gm/schema`).
Engineers build against it. Only the integrator changes it (section 6).

Rules that bind every work package:

- Determinism (J13): no clock, platform random, locale or platform transcendental math in core packages. Random numbers come only from the `StreamSource` in the inputs; math only from `DeterministicMath`. `npm run lint` enforces the bans.
- No lighter simulation for saved results. The reference resolver (J1.6.3, J14) is for phases 1 and 2 and for cross-checks; its `mayProduceSavedResults` is false.
- Truth and observed values are separate types. Nothing of class `truth` reaches a decider or a read model (Q1.4.1, Q1.4.2).
- Illegal plays still run and draw flags. Validators report; they never repair or refuse. Ordered rule-breaking is marked `ordered` on the truth event (L8.2.5).
- One engine and one rule engine for both levels. No level word in a condition, no rule number in code: every rule value is read from the rule set by key, and each key cites a fact row (Q6).
- No coach points, experience points, skill trees, perks or picked traits. The play clock always runs.
- A real-world number comes from the bible, `packages/rules-data` or `facts/`. Any other number is a named tuning constant in the module's parameter file with `basis: 'assumption'`.
- Golden hashes change only in a commit that says why. No GitHub Actions. No keys, tokens or email addresses in any file.

## 1. Module order and dependency graph

| # | Module | Bible | Package | Phase | Needs |
|---|--------|-------|---------|-------|-------|
| 1 | Rule keys and fact rows | B12, B13, Q6 | rules-data, `facts/` | 1 | contract |
| 2 | Clock, series, dead ball, scoring | B1, B3, B5, B7 | officiating | 1 | contract (1 for real values) |
| 3 | Kicks, restarts, overtime | B6, B10, B13.6, B13.7 | officiating | 1 | contract |
| 4 | Foul catalogue and enforcement | B8, B4 | officiating | 1 | contract |
| 5 | Officials model and replay | B11, B9, B13.9 | officiating | 1 | contract |
| 6 | Game state machine and game flow | J11 | engine-game | 1 | contract (fakes), then 2 to 5, 8 |
| 7 | Statistics and play-by-play | D14, J11.9.1 | engine-game | 1 | contract |
| 8 | Reference resolver | J1.6.3, J14 | resolver-reference | 1 | contract |
| 9 | Calibration harness, targets, chart caller | J15, Q2 | headless, `content/calibration/` | 1 | contract, then 6 to 8 |
| 10 | Field model, kinematics, tick loop | J1, J2, P6.3.1 | engine-core | 2 | contract |
| 11 | Assignment language and legality | J4, B4.6.1, G1.5.1 | football-lang | 2 | contract |
| 12 | Perception | J3 | engine-core | 2 | contract, then 10 |
| 13 | Pre-snap phase | J5 | engine-core | 2 | 10, 11, 12 |
| 14 | Starter content (formations, base plays) | F, G1, G2 | football-content | 2 | 11 |
| 15 | Contest models | J6 | engine-core | 3 | contract |
| 16 | Player AI | K1 | engine-core | 3 | 10 to 13, 15 |
| 17 | Ball physics and kicking | J9 | engine-core | 3 | 10, 15 |
| 18 | Quarterback model | J7 | engine-core | 3 | 12, 15, 16, 17 |
| 19 | Ball carrier and tackling | J8 | engine-core | 3 | 15, 16 |
| 20 | Fouls and injuries from play | J10 | engine-core | 4 | 15, 16, 19 |
| 21 | Fatigue and substitution | D10, J11.5 | engine-game | 4 | 6 |
| 22 | Environment | J12 | engine-game | 4 | 6, 17 |
| 23 | Tick resolver assembly | J1.6.3 | engine-core | 4 | 10 to 20 |
| 24 | Fast simulation and diff runner | J14, Q1.3.2 | headless | 4 | 6, 23 |
| 25 | Full content set | F, G | football-content | 4 | 14, 23 |

Module numbers above are build order, not work package ids. Module to WP: 1 to 8 are WP-01 to WP-08; 9 is WP-13 (and WP-26 for the play level); 10 WP-09; 11 WP-10; 12 WP-11; 13 WP-14; 14 WP-15; 15 WP-12; 16 WP-19; 17 WP-16; 18 WP-20; 19 WP-21; 20 WP-22; 21 WP-18; 22 WP-17; 23 WP-23; 24 WP-24; 25 WP-25.

```
contract ─┬─ 1 rule keys ───────────────┐
          ├─ 2,3,4,5 officiating parts ─┼─ Officiating facade ─┐
          ├─ 8 reference resolver ──────┤                      ├─ 6 game flow ─ 9 calibration ─ PHASE 1 GATE
          ├─ 7 statistics ──────────────┘                      │
          ├─ 10 field/tick ─┬─ 12 perception ─┬─ 13 pre-snap ──┼─ PHASE 2 GATE
          ├─ 11 language ───┴─ 14 starter content             │
          └─ 15 contests ─┬─ 16 player AI ─┬─ 18 quarterback ──┼─ PHASE 3 GATE
                          ├─ 17 ball ──────┤                   │
                          └─ 19 carrier ───┴─ 20 fouls/injuries ─ 23 tick resolver ─┬─ 24 fast sim, diff
                                             21 fatigue, 22 environment ────────────┴─ 25 content ─ PHASE 4 GATE
```

## 2. Work packages

Rules for every work package (WP):

- **Owned paths.** A WP writes only inside its owned paths. Tests go in `packages/<pkg>/test/<module>/`, which the WP also owns.
- **Entry point.** Each module has its own `src/<module>/index.ts`. The WP never edits the package's `src/index.ts`, `package.json`, `packages/tools/package-map.json`, `golden/golden.json` or anything in `packages/schema`. The integrator adds one re-export line per module.
- **Rule keys.** A module that reads a rule value exports `RULE_KEYS: RuleKeyManifest` (`params.ts`) from its entry point, listing each key, type, unit and the bible leaf. WP-01 owns the values and the fact rows. Unit tests use a fixture rule set built in the test and marked as a fixture; the real-value cases of Q1.1.1 run after integration.
- **Tuning constants.** Each module exports `PARAMS: ParamFile` from `src/<module>/params.ts`. `basis` is `bible` with the leaf, or `assumption`. The integrator merges them into the `ParamTable`.
- **Officiating lint.** Source under `packages/officiating/src` may hold no numeric literal other than 0 and 1. Every other number is a rule key or a parameter.
- **Imports.** `resolver-reference` and `football-lang` import only `@gm/schema`. `officiating` adds `@gm/rules-data`. `engine-game` imports `@gm/engine-core` and `@gm/officiating` only and reads the contract as `import { Contract } from '@gm/engine-core'`. No deep imports.
- **Done means:** the acceptance check passes, and `npm run typecheck`, `npm run lint` and `npm test` pass on the WP branch.

### Wave 1: starts now, from the contract alone

**WP-01 Rule keys and fact rows.** Package rules-data.
- Owns: `packages/rules-data/data/**`, `packages/rules-data/src/**`, `packages/rules-data/test/**`, `facts/rule.json`.
- Bible: B12.1.1, B12.1.2, B13.1.2 to B13.12, B8.1 (catalogue), Q6.1.1, Q6.2.1, P4.7.1.
- Consumes: `RuleKeyManifest`, `FoulCatalogueRow`, `foulKey`. Produces: every key in both rule-set files, the foul catalogue as `foul.<id>.<field>` keys, a typed loader for `FoulCatalogueRow[]`.
- Tests: Q6.2.1 (every value cites a row of status "Rulebook only" or better), Q1.2.1.
- Acceptance: `npm run lint` fact-register step passes with the new keys; every key named in B12 and B13 exists for both levels; a key with no rule-book quote is listed in the WP report, not filled.
- Note: new keys change the golden `contentHash`. This WP does not touch `golden/golden.json`; the integrator regenerates it in the merge commit and says why.

**WP-02 Clock, series, dead ball, scoring.** Package officiating.
- Owns: `packages/officiating/src/clock/`, `src/series/`, `src/scrimmage/`, `packages/officiating/test/clock/`, `test/series/`, `test/scrimmage/`.
- Bible: B1.2 to B1.5, B3.1 to B3.4, B5 (passes, fumbles), B7 (scoring), B13.3, J11.3.2, J11.4, J11.8.1.
- Consumes: `PlayTruth`, `GameState`, `RuleSet`, `RulingContext`. Produces: `ClockRules`, `SeriesRules`, the scrimmage `BasicRuling` (plays with no `kick` event).
- Tests: Q1.1.1 cases for B1, B3, B5, B7; Q1.2.2 invariants on clock and down.
- Acceptance: each B-leaf acceptance case in its scope is a named test; the play clock runs in every state that B1 says it runs.

**WP-03 Kicks, restarts, overtime.** Package officiating.
- Owns: `packages/officiating/src/kick/`, `src/restart/`, `src/overtime/` and the matching `test/` folders.
- Bible: B1.1.2, B6, B7.3.1, B7.8.1, B10, B13.6, B13.7.1, J11.8.2.
- Consumes: as WP-02. Produces: the kick `BasicRuling` (plays with a `kick` event), `RestartRules`, `OvertimeRules`.
- Tests: Q1.1.1 cases for B6 and B10 under both rule sets.
- Acceptance: overtime runs to a result under each `overtime.format` value from a scripted play list; no branch on the level.

**WP-04 Foul catalogue and enforcement.** Package officiating.
- Owns: `packages/officiating/src/fouls/`, `test/fouls/`.
- Bible: B8.1 to B8.6, B4 (pre-snap fouls), B13.5, B13.8, B13.12.
- Consumes: `FoulRecord`, `FoulCatalogueRow`, `PlayOutcome`, `SeriesState`. Produces: `FoulRules` (enforcement options, offsetting, carried penalties).
- Tests: Q1.1.1 cases for B8; Q1.1.2 enforcement property tests in full.
- Acceptance: Q1.1.2 properties hold over generated plays for both rule sets.

**WP-05 Officials model and replay.** Package officiating.
- Owns: `packages/officiating/src/crew/`, `src/replay/`, `test/crew/`, `test/replay/`.
- Bible: B11.1 to B11.4, B9, B13.9.
- Consumes: `PlayTruth`, `OfficialsCrew`, `StreamSource` (stream `officials`). Produces: `CrewModel.perceive`, `ReplayRules`.
- Tests: Q1.1.1 cases for B9; determinism (same truth, crew and seed give the same seen record).
- Acceptance: with error rates at zero the seen record equals the truth record; replay reverses only reviewable rulings.

**WP-06 Game state machine and game flow.** Package engine-game.
- Owns: `packages/engine-game/src/flow/`, `test/flow/`.
- Bible: J11.1.1, J11.2.1, J11.3, J11.6.1, J11.7, J13.5.2, J14.1.1.
- Consumes: `Officiating`, `Resolver`, `Decider`, `GameInput`, `GameDeps`. Produces: `GameFlow` (`newGame`, `apply`, `advance`, `simulateGame`), the (phase, event) transition table as data.
- Tests: Q1.2.2 state invariants after every event; replay of the event log reproduces the final state hash; a game finishes with deciders that never answer.
- Acceptance: all of the above against fake `Officiating` and a fake `Resolver` built in the tests.

**WP-07 Statistics and play-by-play.** Package engine-game.
- Owns: `packages/engine-game/src/stats/`, `test/stats/`.
- Bible: D14.1.1, D14.2.1, J11.9.1, P3.1.1, P4.6.1.
- Consumes: `PlayRecord`, `DriveRecord`. Produces: `StatsModule` (`credits`, `playByPlay`, `summary`), the statistic catalogue as data, the column map to the public play-by-play names (taken from `research/nflverse_baselines.py` in the project files).
- Tests: box score equals the sum of credit rows; a play with `noPlay` carries no credits.
- Acceptance: both hold over hand-built play records covering each `PlayResultType`.

**WP-08 Reference resolver.** Package resolver-reference.
- Owns: `packages/resolver-reference/src/resolver/`, `test/resolver/`.
- Bible: J1.6.3, J14.1.1, R1.2.2.
- Consumes: `PlayInput` (stream `resolver` only). Produces: a `Resolver` with id `reference`; truth records that pass `playTruthProblems`.
- Tests: determinism; every play kind and kick kind returns a valid truth record; P6.1.1 resolver budget.
- Acceptance: 10,000 plays from generated situations, all valid, within budget. Its rate constants are parameters: J15 values where J15 gives one, otherwise `assumption`.

**WP-09 Field model, kinematics, tick loop.** Package engine-core.
- Owns: `packages/engine-core/src/field/`, `src/kinematics/`, `src/tick/`, and the matching `test/` folders.
- Bible: J1.1 to J1.5, J1.6.2, J2, P6.3.1.
- Consumes: `FieldGeometry`, `SimArrays`, `TickWorld`, `TickStage`, `MovementParams`. Produces: `fieldGeometry(rules)`, the movement model, the tick loop that runs registered stages in the J1.3.1 order, `TrajectoryRecord`.
- Tests: J2 movement acceptance cases; same inputs give the same trajectory hash; no allocation in the tick (P6.3.1).
- Acceptance: a single player runs each `PathPoint` kind inside the J2 limits.

**WP-10 Assignment language and legality validator.** Package football-lang.
- Owns: `packages/football-lang/src/lang/`, `src/legality/`, `test/lang/`, `test/legality/`.
- Bible: J4.1 to J4.4, J4.6, B4.6.1, G1.5.1, P4.2.2.
- Consumes: `Assignment`, `PerceivedView`, `RuleSet`. Produces: `FootballLang` (`compile`, `validateAssignments`, `checkAlignment`), the vocabulary data file.
- Tests: Q1.1.3 legality generators; Q1.2.1 content tests; a condition that names true state is refused.
- Acceptance: Q1.1.3 passes for both rule sets; an illegal formation returns findings of severity `warning` and still compiles.

**WP-11 Perception.** Package engine-core.
- Owns: `packages/engine-core/src/perception/`, `test/perception/`.
- Bible: J3.1 to J3.5.
- Consumes: `SimArrays`, `SlotInfo`, stream `perception`. Produces: `PerceivedView` built over a ring buffer of past ticks.
- Tests: Q1.4.1 (no true state of another player reachable from a view); delay and field-of-view cases of J3.
- Acceptance: views are built from a hand-filled `SimArrays`, so the WP does not wait for WP-09.

**WP-12 Contest models.** Package engine-core.
- Owns: `packages/engine-core/src/contest/`, `test/contest/`.
- Bible: J6.1 to J6.7.
- Consumes: `EffectiveZTerms`, `EngagementParams`, `EventContestParams`, stream `contest`. Produces: `ContestMath`.
- Tests: Q1.7.1 contest tests; Q1.7.3 rating-response sweeps at the contest layer.
- Acceptance: each contest type meets its J6 curve; win rate is monotonic in the rating gap.

**WP-13 Calibration harness, target tables, chart caller.** Package headless.
- Owns: `packages/headless/src/calibration/`, `packages/headless/test/calibration/`, `content/calibration/**`, `facts/measured-rate.json`.
- Bible: J15.1 to J15.10, Q2.1.1, Q2.3.1, Q6.3.1, J14.6.1.
- Consumes: `CalibrationTarget`, `GameSummary`, `PlayByPlayRow`, `Decider`. Produces: target files per rule set with fact rows; measures over summaries and play-by-play rows; the report of `TargetResult` rows (PROVISIONAL printed for every row that is not Verified); a scripted chart caller that implements `Decider` (it stands in for coach AI until phase 5).
- Tests: Q1.7.2 harness on fixture summaries; `targetTierProblems` on every row.
- Acceptance: each number in section 4 is a row with its true status; no college row is filled from a pro value.

### Wave 2: after the wave 1 merge (closes phase 1, opens phase 2)

| WP | Title | Owned paths | Bible | Consumes / produces | Tests and acceptance |
|----|-------|-------------|-------|---------------------|----------------------|
| WP-14 | Pre-snap phase | `packages/engine-core/src/presnap/`, `test/presnap/` | J5 | tick loop, `FootballLang`, stream `presnap` / alignment, shifts, motion, snap timing as `TickStage`s | J5 acceptance cases; play clock runs through the whole phase |
| WP-15 | Starter content | `packages/football-content/src/starter/`, `test/starter/` | F, G1.1.1, G2.1.1 | `Assignment` / formations and one base play per `OffensePlayKind` and `CoverageFamily` | Q1.2.1; every play compiles with no `error` finding; formation reference images |
| WP-16 | Ball physics and kicking | `packages/engine-core/src/ball/`, `test/ball/` | J9 | `BallState`, `Environment`, stream `ball` / flight, bounce, kick launch as `TickStage`s | J9 acceptance cases; Q1.7.1 for kick contests |
| WP-17 | Environment | `packages/engine-game/src/environment/`, `test/environment/` | J12 | streams `weather`, `gust`, `forecast`, `footing` / `Environment` per period, `environment_updated` events | J12 acceptance cases; neutral input gives `NEUTRAL_ENVIRONMENT` |
| WP-18 | Fatigue and substitution | `packages/engine-game/src/bench/`, `test/bench/` | D10, J11.5 | `GameDayState`, `PlayerDelta` / fatigue update, depth-chart substitution, `substitution` events | D10 acceptance cases; Q1.2.2 (never more than `substitution.max_players`, read by key) |

### Wave 3: after field, language, perception and contests are merged (phase 3)

| WP | Title | Owned paths | Bible | Consumes / produces | Tests and acceptance |
|----|-------|-------------|-------|---------------------|----------------------|
| WP-19 | Player AI | `packages/engine-core/src/player-ai/`, `test/player-ai/` | K1 | `PerceivedView`, `CompiledAssignment`, stream `mental` / `Intent` per tick, `mental_error` events | K1 acceptance cases; Q1.4.1 |
| WP-20 | Quarterback model | `packages/engine-core/src/qb/`, `test/qb/` | J7 | `PerceivedView`, `ContestMath`, ball module, stream `qb` / read, throw, scramble, `pass_release` and `pressure` events | Q3.2.1, Q3.2.2 items; Q1.7.3 |
| WP-21 | Ball carrier and tackling | `packages/engine-core/src/carrier/`, `test/carrier/` | J8 | `ContestMath`, stream `carrier` / path choice, `tackle_attempt`, `fumble` events | Q3.2.3 items; Q1.7.1 tackle contests |
| WP-22 | Fouls and injuries from play | `packages/engine-core/src/fouls-injuries/`, `test/fouls-injuries/` | J10 | contests, streams `foul`, `injury` / `foul_committed` (with `borderline`, `ordered`) and `injury` events | J10 acceptance cases; rates as parameters against J15.7 rows |

### Wave 4: assembly (phase 4)

| WP | Title | Owned paths | Bible | Consumes / produces | Tests and acceptance |
|----|-------|-------------|-------|---------------------|----------------------|
| WP-23 | Tick resolver | `packages/engine-core/src/tick-resolver/`, `test/tick-resolver/` | J1.6.3, J1.3.1 | all stages / a `Resolver` with id `tick`, `mayProduceSavedResults` true | `playTruthProblems` empty on every play; P6.1.1 play budget 50 ms; Q1.3.1 |
| WP-24 | Fast simulation and diff runner | `packages/headless/src/batch/`, `src/diff/`, matching `test/` | J14, Q1.3.2 | `GameFlow`, both resolvers / worker batch runs, first-divergence report | Q1.3.2; batch result is independent of worker count |
| WP-25 | Full content set | `packages/football-content/src/full/`, `test/full/` | F, G | starter content / the v1 play and coverage set | Q1.2.1, Q1.1.3, Q5.1.1 review list |
| WP-26 | Play-level calibration | `packages/headless/src/calibration-play/`, `test/calibration-play/` | J15.4 to J15.8, Q1.7.2 | `PlayByPlayRow` / play-layer measures and report | Q1.7.2 play level, both rule sets |

## 3. Integration order and gates

The integrator owns: `packages/schema/**`, every package `src/index.ts` and `package.json`, `packages/tools/**`, `golden/golden.json`, `packages/officiating/src/index.ts` (the `Officiating` facade), the merged `ParamTable`, and `test-results/`.

Merge order inside wave 1: WP-01 first (regenerate golden, say why in the commit). Then WP-02 to WP-05 in any order; reconcile each `RULE_KEYS` manifest against WP-01 and send missing keys back to WP-01. Then assemble the `Officiating` facade. Then WP-08, WP-07, WP-06 (swap its fakes for the real parts), WP-13. WP-09 to WP-12 merge whenever they are ready; nothing in phase 1 waits for them.

**Phase 1 gate (rules engine, reference resolver, game flow):**
- Q1.1.1 rule-case suite for B1 to B11 under both rule sets.
- Q1.1.2 enforcement property tests, in full.
- Q1.2.2 state invariants after every event of 10,000 games.
- Q1.7.2 at game level: 10,000 pro games with the reference resolver against J15 within Q2.3.1 tolerances. College rows are PROVISIONAL until T12 supplies targets.
- P6.1.1 reference-resolver budget. Q6.2.1 for every new key. Q1.3.1 golden hashes, regenerated with the reason.

**Phase 2 gate (field, movement, language, pre-snap):** needs WP-09, 10, 11, 14, 15.
- Q1.2.1 schema and content tests. Q1.1.3 legality generators, both rule sets.
- Formation reference images match. Step-through of a play tick by tick. P1.4.1.

**Phase 3 gate (contests, quarterback, carrier, ball):** needs WP-12, 16, 19, 20, 21.
- Q1.7.1 contest tests. Q1.7.3 rating-response sweeps. Q3.2.1 and Q3.2.2 battery items.
- Q1.7.2 at play level. The depth-band rows are PROVISIONAL until R3.2.1 measures them, so this gate cannot be called passed on those rows; the report must say so.
- P6.1.1 play budget of 50 ms. Q5.1.1 coach review of film.

**Phase 4 gate (full game on the tick engine):** needs WP-17, 18, 22 to 26.
- Q1.7.2 at play and game level with the tick resolver, both rule sets. Q3.2.3 run game items.
- Q1.3.2 diff runner between reference and tick resolvers on the same seeds. J10 and J15.7 foul and injury rows.
- Q1.3.1 golden hashes on every platform, changed only with a stated reason.

## 4. J15 rows that are provisional or unsourced

Only these are Verified: points per team per game (22.19), total points per game (44.4), and the shape (ordering) of pressure and sack rate by rusher count. Every other J15 row prints PROVISIONAL (Q6.3.1). Tolerances (J15.1.2, Q2.3.1) are Assumptions. The reference resolver's rating shift of 0.1 SD per z is an Assumption.

**2 of 3:** home margin; home win share; close-game shares; plays per game 124.2 (kneels and spikes excluded; the official count is 125.5); sacks per game 4.93; completion 64.6%; yards per attempt 7.06; interception rate 2.28%; sack rate 6.9%; yards per carry under three definitions (4.52, 4.37, 4.29); fourth-down conversion pooled 53.2%; neutral pass rate 57.3%; penalties per game for 2022 and 2023; some season kicking values; Questionable players who play 65.7%; wind effect on totals.

**1 of 3:** all drive rows (J15.3.1); most passing distribution and depth rows; rushing distribution rows; field goals by distance bin; punts; kickoffs; the per-type foul table; venue split; injuries; personnel, coverage and play-action shares (J15.8.1, tune or watch only); coach effect; overtime share 6.0% (rule-set dependent).

**Unverified or not reproduced:** first-and-10 pass rate (48.1 and 50.4); elapsed time per play (26.6 and 36.6 s; the body of J15.3.2 still prints the retired 25.6 and 35.9); sack rate levels by rusher count; completion under pressure (40.9% against 49.0%); 2025 kickoff touchback 20.7%; team penalty spread 0.30.

**Conflict:** SD of margin minus spread 12.59 (published 13.0 to 13.9; the acceptance band 12.0 to 13.5 is an Assumption); pressure rate level (about 29% from the feed flag, about 35% published); Doubtful players who play (0.7% against 5.9 to 6.9%).

**Watch tier only:** pooled penalties 11.8 (2024 trend); kickoff touchback 65.7% (rule-set dependent); pooled personnel shares; charting rates (drop 3.4%, throwaway 3.7%, time to throw 2.68 s).

**Missing (no number in the bible; the row exists with `factId: null`, tier `watch`, and prints MISSING SOURCE):** net punt; punt and kickoff return averages; kickoff return distributions; injury hazard per play by position; team-level spreads of tendencies; split-half reliabilities; second sources for timeouts, overtime and ties; every college target (T12); modern fourth-down attempt rates (R3.2.1); measured depth-band rates (R3.2.1).

## 5. Contract decisions

Where the bible leaves a shape open, the contract fixes it as follows.

- **D-01 Side.** A team in a game is `Side` 0 (home) or 1 (visitor). Pairs are tuples indexed by `Side`.
- **D-02 Clocks.** Game clock, play clock and durations are integer tenths of a second (J11.1.1). Tick time is seconds at 0.1 s.
- **D-03 Spots.** State and truth hold spots in field-frame yards (x along the field, y across). Play-frame values are derived with `toPlay` and `toField`, which only multiply by +1 or -1.
- **D-04 Truth holds physical events only.** The truth record says what happened; it never says "touchdown" or "first down". Officiating rules them. A score is `ball_across_goal_line_in_possession` plus a ruling.
- **D-05 Seen and called.** `CrewModel.perceive` returns the truth as the crew saw it; the rule parts then rule that seen record. The facade recomputes it from the same stream, so nothing extra is stored.
- **D-06 Fouls.** `FoulId` is a string. The catalogue is rule keys of the form `foul.<id>.<field>`. Uncalled fouls stay in the truth record.
- **D-07 Injected randomness and math.** `officiating` and `resolver-reference` may not import engine-core, so streams and math arrive as `StreamSource` and `DeterministicMath` in the inputs. Engine-core holds the only implementations (`streamSource`, `DMATH`).
- **D-08 Attributes.** Attribute ids are fixed strings (`ATTRIBUTE_IDS`). An attribute named in two position tables of D2 to D4 is stored once.
- **D-09 Tuning constants.** Each module has a `ParamFile`. Each row has a range, a unit, a basis (`bible` with leaf, or `assumption`) and the J15 rows that constrain it.
- **D-10 Target rows.** J15.1.1 and Q2.1.1 give different row formats. The contract merges them: the row holds definition, tier, tolerance and a `factId`; sources and status live in the fact register. No fact row means tier `watch`.
- **D-11 Lateral sign.** In the play frame `py` is positive to the offense's left. G1.1.1 stores authored plays positive to the right; the content loader negates once.
- **D-12 Wind direction.** `windDirDeg` is measured counter-clockwise from +x; 0 blows toward the east goal line. J12.1.1 says "toward the north goal", but J1.1.1 puts the goals west and east.
- **D-13 Calls.** A call names a family and may carry a content id (nullable), so the reference resolver runs before content exists.
- **D-14 Fourth down.** There is no fourth-down decision type. The decision is the unit sent out: an `OffenseCall` or a `KickCall`.
- **D-15 Coaching state.** `GameState` holds no coach tendencies or plan state until phase 5. Deciders see `DecisionView` only.
- **D-16 Detail events.** `detail` events carry a module-defined code for film and statistics. Officiating never reads them, so adding a code needs no contract change.
- **D-17 Play-by-play names.** `PlayByPlayRow` uses the repo's camelCase. WP-07 owns the map to the public column names.
- **D-18 Validators.** Persisted shapes are zod schemas with a visibility class on every field and a unit on every number, and are registered in `simSchemas()`. Tick state is TypeScript types over typed arrays, with no validator, because it is never saved (J13.5.2).
- **D-19 Rule keys.** Modules declare the keys they read; WP-01 alone adds values. The existing group name `substitution.*` is kept (B13.1.2 writes `sub`).
- **D-20 Phase 1 play calling.** Coach AI is phase 5, but the phase 1 gate needs 10,000 games. A scripted chart caller in the calibration harness implements `Decider` until then.

## 6. Changing the contract

1. The engineer writes the change request in the WP report: the type, the change, the leaf that needs it, and which other WPs it touches.
2. The engineer keeps working against a local type alias inside the WP's own folder. The WP never edits `packages/schema`.
3. The integrator makes the change in `packages/schema/src/sim/`, adds a decision line in section 5 if it settles an open shape, and tells every WP that consumes the type.
4. A change to a persisted shape (anything in `simSchemas()`) after the phase 1 merge needs a migration fixture (Q1.2.3).

## 7. Bible conflicts and gaps an engineer will meet

- **Rule-key inventory is incomplete.** B12.1.2 says the builder extracts the keys; only about 60 switch keys are named. B13.1.2's "groups in use" omits groups that B12.1.2 uses (score, series, deadball, enforce, dq, onside, faircatch, touchback, officials). WP-01 lists what it had to name.
- **J8 against J10.** Some B leaves cite J8 for foul candidates. J10 owns them.
- **Extra point rate.** J11.7.1 says 95.4%; J15.6.1 says 95.1%. Use the J15 row; flag it.
- **Feigned injury.** B13.3.4 and B1.5.2 say it is never offered. The ruling in A3 allows rule-breaking through L8.2.5. The contract allows it (`ordered` on the foul event); the offer is a phase 5 matter.
- **Overtime.** B5.6.2 and B10.2.1 disagree on the fumble rule in overtime's last two minutes. College overtime timeouts are status Conflict. WP-03 reads both from keys and reports the status.
- **Stream list.** J1.6.3 needs a `resolver` stream; J13.2.1 lists it. `distant` is retired and reserved.
- **Elapsed time per play.** The J15.3.2 body still prints retired numbers (section 4).
- **No machine attribute ids in D.** The contract names them (D-08); D2 to D4 should adopt the list.
- **Parameter and target file homes.** The bible names `content/...` paths that the repo does not have. WP-13 creates `content/calibration/`; module parameters live with the module (D-09).
- **Golden hash.** The golden `contentHash` covers the rule-set files, so WP-01 changes it. This is expected; the merge commit states it.
- **College targets.** None exist until T12. Every college calibration row is `watch` with no fact row.

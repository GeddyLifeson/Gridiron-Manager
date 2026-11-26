# Release gate checklist (G-100)

**Verdict: HOLD.** 2755 blocking checks are not PASS.

Commit `bf531871d555`. Generated 2026-11-26T04:04:16.580Z by `npx tsx scripts/release/gate.ts`. Bible: live from /mnt/project-files/bible, hash 07f8dab8da6b4882, 2513 leaves.

A check is PASS only when it was verified at this commit: an automated check that ran here, or a recorded verification with three independent confirmations (scripts/release/data/evidence.json). MISSING means the module or input does not exist yet; PENDING means it exists but nothing has verified it at this commit; STALE means the only evidence is from another commit.

- the bible changed since the snapshot (047eddde0d1d65c5 -> 07f8dab8da6b4882); the live bible was used. Refresh: gate.ts --refresh-bible
- scan reference files excluded from the text scans (they hold marks or hashes on purpose, checked by G-11 and G-18 tests): packages/football-content/data/world/blocked-terms.json, packages/football-content/data/names/real-name-guard.json
- mark scan reading of "case-blind": all-capital abbreviations of 2 to 4 letters match case-sensitively so ordinary words (sec, acc) stay usable; everything else is case-blind, with one-edit near spellings for words of 7+ letters that keep their first letter (shorter or first-letter edits matched real towns and surnames such as Solon, Penn Hills and Weisman)

## Summary

| Group | PASS | FAIL | MISSING | STALE | PENDING | NOT_APPLICABLE | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Release gate items (R1.2.10) | 3 | 3 | 3 | 0 | 3 | 0 | 12 |
| Q1.8.1 "Before a release" suites by platform | 0 | 0 | 61 | 5 | 0 | 0 | 66 |
| Earlier phase gates (R1.2.1 to R1.2.9) | 0 | 0 | 0 | 0 | 45 | 2 | 47 |
| Engine work packages (plans/engine-build-plan.md) | 0 | 0 | 6 | 0 | 20 | 0 | 26 |
| Game work packages (plans/game-build-plan.md) | 0 | 0 | 36 | 0 | 65 | 0 | 101 |
| Bible acceptance criteria (every leaf) | 0 | 2 | 651 | 0 | 1855 | 5 | 2513 |
| **All** | **3** | **5** | **757** | **5** | **1988** | **7** | **2765** |

## Release gate items (R1.2.10)

| Item | Status | Kind | Detail |
| --- | --- | --- | --- |
| Everything in the Q1.8.1 "Before a release" row passes, both rule sets (R1.2.10 item 1) | **MISSING** | automated | suites by platform: 61 MISSING, 5 STALE |
| Q4 full exploit search is clean on the release commit (R1.2.10 item 2) | **MISSING** | automated | exploit search module (packages/headless/src/exploit, G-86) does not exist yet |
| No rule value below "Rulebook only"; no Conflict row in use (R1.2.10 item 3, Q6.3.1) | **FAIL** | automated | 52 rule rows below Rulebook only, 6 Conflict rows: F-cap-0043 (1 of 3), F-cap-0044 (1 of 3), F-cap-0045 (1 of 3), F-cap-0046 (1 of 3), F-cap-0047 (1 of 3), F-cap-0048 (1 of 3), F-cap-0049 (1 of 3), F-cap-0050 (1 of 3) |
| Provisional fact list printed (R1.2.10 item 3, Q6.3.1) | **PASS** | automated | 2876 of 2951 rows are PROVISIONAL; list in PROVISIONAL.md, hash 104e4bcab7f9b465 |
| Marlon accepts the provisional list or holds the release (R1.2.10 item 3) | **PENDING** | tracked | waiting for Marlon's decision on list 104e4bcab7f9b465 |
| Q5 status stated; public wording matches the evidence level (Q5.5.1) (R1.2.10 item 4) | **MISSING** | tracked | coach validation tooling (packages/headless/src/validation, G-99) does not exist yet |
| Legal review done if the release is public (A6.5.1) (R1.2.10 item 5) | **PENDING** | tracked | commercial or personal release is an open decision (A3.3.1, Marlon); record either the review or the personal-build ruling |
| No team, school, league or event mark in the release (A6.2.2 scan) (R1.2.10 item 6, A6.2.2) | **FAIL** | automated | 432 hits in 1111 shipped files (no browser build present; source tree only) (214 in game content, 218 in source metadata (fact rows, calibration targets, citations)): content/calibration/college/extra-targets.json:22 FBS; content/calibration/college/extra-targets.json:27 FBS; content/calibration/college/extra-targets.json:46 FBS; content/calibration/college/extra-targets.json:51 FBS; content/calibration/targets.college_2026.json:14 FBS; and 427 more |
| No real person's name in the release (R1.2.10 item 6, A6.3) | **FAIL** | automated | 36 real full names in 1111 shipped files (no browser build present; source tree only) (4 in game content, 32 in source metadata (fact rows, calibration targets, citations)): packages/career/src/reputation/facts.json:24 Bill Belichick; packages/engine-core/src/hash.ts:1 Austin Appleby; packages/football-content/data/injuries/facts.json:735 Henry Ford; packages/football-content/data/names/surnames.json:1 Van Valkenburg; packages/football-content/data/world/reference-locations.json:3713 WILL ROGERS; and 31 more |
| No research path or raw dataset file in the release (A6.4.1 path check) (R1.2.10 item 6, A6.4.1) | **PASS** | automated | 0 research paths or raw dataset files in 1111 shipped files (no browser build present; source tree only) |
| No per-person source record in the release (A6.4.1 item 3) (R1.2.10 item 6, A6.4.1) | **PASS** | automated | 0 source-record ids or urls; 0 byte-identical copies of 438 research files (/mnt/project-files/research, /mnt/project-files/data/people) |
| No shipped file exceeds the similarity threshold against the people data (A6.4.1 item 4) (R1.2.10 item 6, A6.4.1) | **PENDING** | tracked | name, id and byte-copy checks run above; a per-record numeric similarity measure and its threshold are not defined in the bible yet (A6.4.1 gives no number) |

## Q1.8.1 "Before a release" suites by platform

| Suite | windows | linux | browser |
| --- | --- | --- | --- |
| Q1.1.1 Rule-case suite (both rule sets) | MISSING | MISSING | MISSING |
| Q1.1.2 Enforcement property tests (full) (both rule sets) | MISSING | MISSING | MISSING |
| Q1.1.3 Legality generators (both rule sets) | MISSING | MISSING | MISSING |
| Q1.2.1 Schema and content tests | STALE | STALE | MISSING |
| Q1.2.2 State invariant checks (both rule sets) | MISSING | MISSING | MISSING |
| Q1.2.3 Migration fixtures | MISSING | MISSING | MISSING |
| Q1.3.1 Golden-seed determinism (plays, games, season) (both rule sets) | STALE | STALE | STALE |
| Q1.3.2 Diff runner, reference against tick resolver (both rule sets) | MISSING | MISSING | MISSING |
| Q1.4.1 AI no-hidden-information test (both rule sets) | MISSING | MISSING | MISSING |
| Q1.4.2 No truth field in read models | MISSING | MISSING | MISSING |
| Q1.5.1 Contrast and greyscale checks | MISSING | MISSING | MISSING |
| Q1.5.2 Keyboard-only full game (both rule sets) | MISSING | MISSING | MISSING |
| Q1.5.3 Route crawl | MISSING | MISSING | MISSING |
| Q1.6.1 30-season career run (both rule sets) | MISSING | MISSING | MISSING |
| Q1.6.2 Imported-people protection run (both rule sets) | MISSING | MISSING | MISSING |
| Q1.6.4 Long-run stability of the world (both rule sets) | MISSING | MISSING | MISSING |
| Q1.7.1 Contest tests (both rule sets) | MISSING | MISSING | MISSING |
| Q1.7.2 Play, game and season runs against J15 (both rule sets) | MISSING | MISSING | MISSING |
| Q1.7.3 Rating-response sweeps (both rule sets) | MISSING | MISSING | MISSING |
| Q3.3.1 Decision-response battery report (both rule sets) | MISSING | MISSING | MISSING |
| Q4.1.1 Exploit search, full (Q4.1 to Q4.4) (both rule sets) | MISSING | MISSING | MISSING |
| P6.5.1 Benchmark suite | MISSING | MISSING | MISSING |

Details per suite and platform are in results.json. macOS is recorded as not tested (no machine, R1.2.1 item 1).

## Earlier phase gates (R1.2.1 to R1.2.9)

| Item | Status | Criterion | Detail |
| --- | --- | --- | --- |
| R1.2.1-1 | PENDING | Q1.3.1 passes for plays and games on the dummy game: same seed, same content hash, byte-identical state hash chain (P5.3.2) on Windows, Linux, and the browser build. macOS is reco… | no recorded verification at this commit |
| R1.2.1-2 | PENDING | A save written on one platform opens on the others (P1.4.1 acceptance). | no recorded verification at this commit |
| R1.2.1-3 | PENDING | Q1.2.1 schema tests pass. P1.2.2 lint passes with zero forbidden imports. | no recorded verification at this commit |
| R1.2.1-4 | PENDING | Every rule value in the two rule-set files points at a register row (Q6.2.1), and no rule row is below "Rulebook only" (Q6.3.1). | no recorded verification at this commit |
| R1.2.1-5 | PENDING | A schema scan finds no field for coach points, experience, skill trees, perks, or difficulty in any entity (A3.1.1 rows 8 to 10, A3.1.2). Q1.2.1's forbidden-key lint is this scan. | no recorded verification at this commit |
| R1.2.1-6 | NOT_APPLICABLE | If the gate fails on cross-engine math or on SQLite access in the desktop shell, the fallback in P1.4.1 is taken (Electron) and the gate is re-run. | contingency step, applies only if the gate fails |
| R1.2.2-1 | PENDING | Q1.1.1 passes: every rule case in both rule sets. Q1.1.2 enforcement property tests pass (full run). | no recorded verification at this commit |
| R1.2.2-2 | PENDING | Q1.7.2 game level: 10,000 simulated pro games meet the game-level targets in J15 within Q2.3.1 tolerances. College rows run and print, marked PROVISIONAL until T12 supplies target… | no recorded verification at this commit |
| R1.2.2-3 | PENDING | Q1.2.2 state invariants hold across those games. | no recorded verification at this commit |
| R1.2.2-4 | PENDING | P6.1.1: the reference resolver meets its game budget. | no recorded verification at this commit |
| R1.2.3-1 | PENDING | Q1.2.1 passes: every shipped play and call validates. Q1.1.3 legality generators pass under both rule sets. | no recorded verification at this commit |
| R1.2.3-2 | PENDING | Every shipped formation draws with the symbols in A4.4.1, checked against stored reference images. | no recorded verification at this commit |
| R1.2.3-3 | PENDING | A play can be stepped through with each player's assignment shown. | no recorded verification at this commit |
| R1.2.3-4 | PENDING | The interface framework choice is final before this phase starts (P1.4.1). | no recorded verification at this commit |
| R1.2.4-1 | PENDING | Q1.7.1 contest tests pass for every pass-game contest. | no recorded verification at this commit |
| R1.2.4-2 | PENDING | Q1.7.2 play level: passing targets by depth band match. The depth bands and their real rates must be measured first (R3.2.1). Until then the rows are PROVISIONAL and the gate cann… | no recorded verification at this commit |
| R1.2.4-3 | PENDING | Q3.2.1 pass game items and Q3.2.2 pressure and protection items pass in direction and ordering. | no recorded verification at this commit |
| R1.2.4-4 | PENDING | Q1.7.3 rating-response sweeps are monotonic for pass contests. | no recorded verification at this commit |
| R1.2.4-5 | PENDING | P6.1.1 play budget met. | no recorded verification at this commit |
| R1.2.4-6 | PENDING | Q5.1.1 football review has started on this build if reviewers exist (R2.2.2). If none exist, the gate records evidence level 0 (Q5.5.1) and does not block. | no recorded verification at this commit |
| R1.2.5-1 | PENDING | Q1.7.2 play level and game level pass with the tick engine in place of the reference resolver, both rule sets. | no recorded verification at this commit |
| R1.2.5-2 | PENDING | Q3.2.3 run game items pass. | no recorded verification at this commit |
| R1.2.5-3 | PENDING | Q1.3.2 diff runner: the tick engine and the reference resolver agree on game-level distributions within tolerance. The resolver is then kept for cross-check only (J1.6.3). It neve… | no recorded verification at this commit |
| R1.2.5-4 | PENDING | Foul and injury rates from play meet their J10 and J15 rows. | no recorded verification at this commit |
| R1.2.5-5 | PENDING | Q1.3.1 still passes on every platform. | no recorded verification at this commit |
| R1.2.6-1 | PENDING | Q4.1.1, Q4.1.2, Q4.2.1, Q4.2.2: the exploit search finds no dominant strategy and no information leak. | no recorded verification at this commit |
| R1.2.6-2 | PENDING | Q1.4.1 and Q1.4.2 pass: the AI and the screens read no hidden truth. | no recorded verification at this commit |
| R1.2.6-3 | PENDING | Q3.2.4 game management items pass. | no recorded verification at this commit |
| R1.2.6-4 | PENDING | AI decision rates (fourth down, two-point tries, timeouts) meet their J15 rows. The modern fourth-down rates must be measured first (R3.2.1). | no recorded verification at this commit |
| R1.2.6-5 | PENDING | Q1.5.2: a full game is played start to finish by keyboard alone. | no recorded verification at this commit |
| R1.2.6-6 | PENDING | A test proves no command or setting stops or slows the play clock during a game outside the rule book's own stoppages. | no recorded verification at this commit |
| R1.2.7-1 | PENDING | A full season is playable at the head coach seat at each level, start to final game. | no recorded verification at this commit |
| R1.2.7-2 | PENDING | Q1.7.2 season level passes. Q1.3.1 season replay passes on every platform. | no recorded verification at this commit |
| R1.2.7-3 | PENDING | Q3.2.5 preparation and tendency items pass. | no recorded verification at this commit |
| R1.2.7-4 | PENDING | Q1.5.1 and Q1.5.3 pass for every screen that exists. | no recorded verification at this commit |
| R1.2.7-5 | PENDING | P6.1.1 world-week budget met. | no recorded verification at this commit |
| R1.2.8-1 | PENDING | Q1.6.1: a 30-season headless career run completes with no invariant failure. | no recorded verification at this commit |
| R1.2.8-2 | PENDING | Q1.6.4: aging, roster turnover, talent distribution, and records stay stable across those seasons. | no recorded verification at this commit |
| R1.2.8-3 | PENDING | Q1.6.2: zero protected events on imported people. | no recorded verification at this commit |
| R1.2.8-4 | NOT_APPLICABLE | Q1.6.3 is retired: Marlon rejected the lighter tier C (A3.1.1 row 20). The full engine is used everywhere and the long-advance budget in P6.1.1 is measured with headless full-engi… | retired item |
| R1.2.8-5 | PENDING | Q1.2.3 migration fixtures pass. | no recorded verification at this commit |
| R1.2.8-6 | PENDING | Measured, not estimated: save size at season 30 (P5.4.1 target under 1 GB) and the time of a 20-season advance on the target machine (P6.2.1). | no recorded verification at this commit |
| R1.2.9-1 | PENDING | A scripted user policy completes a career from rung 0 at a college to pro head coach in a headless run, and a second policy is fired and rehired. Both replay identically (Q1.3.1). | no recorded verification at this commit |
| R1.2.9-2 | PENDING | Q3.2.6 career-scale items pass. Q4.3.1 career loop search finds no loop that advances a career without football results. | no recorded verification at this commit |
| R1.2.9-3 | PENDING | Every rung's duty list (S3) is reachable on screen (Q1.5.3 across O7). | no recorded verification at this commit |
| R1.2.9-4 | PENDING | No label, reputation word, or job offer can be traced to anything except logged events (X2). A test picks 1,000 labels at random and resolves each to its evidence rows. | no recorded verification at this commit |
| R1.2.9-5 | PENDING | Q2.5.1: the coach-effect band is reported. It is 1 of 3 and provisional, so it informs and does not block. | no recorded verification at this commit |

## Engine work packages (plans/engine-build-plan.md)

| Package | Status | Acceptance | Detail |
| --- | --- | --- | --- |
| WP-01 Rule keys and fact rows | PENDING | Tests: Q6.2.1 (every value cites a row of status "Rulebook only" or better), Q1.2.1. `npm run lint` fact-register step passes with the new keys; every key named in B12 and B13 exists for both levels;… | module present (4/4 owned paths); acceptance not verified at this commit |
| WP-02 Clock, series, dead ball, scoring | PENDING | Tests: Q1.1.1 cases for B1, B3, B5, B7; Q1.2.2 invariants on clock and down. each B-leaf acceptance case in its scope is a named test; the play clock runs in every state that B1 says it runs. | module present (6/6 owned paths); acceptance not verified at this commit |
| WP-03 Kicks, restarts, overtime | PENDING | Tests: Q1.1.1 cases for B6 and B10 under both rule sets. overtime runs to a result under each `overtime.format` value from a scripted play list; no branch on the level. | module present (4/4 owned paths); acceptance not verified at this commit |
| WP-04 Foul catalogue and enforcement | PENDING | Tests: Q1.1.1 cases for B8; Q1.1.2 enforcement property tests in full. Q1.1.2 properties hold over generated plays for both rule sets. | module present (2/2 owned paths); acceptance not verified at this commit |
| WP-05 Officials model and replay | PENDING | Tests: Q1.1.1 cases for B9; determinism (same truth, crew and seed give the same seen record). with error rates at zero the seen record equals the truth record; replay reverses only reviewable ruling… | module present (4/4 owned paths); acceptance not verified at this commit |
| WP-06 Game state machine and game flow | PENDING | Tests: Q1.2.2 state invariants after every event; replay of the event log reproduces the final state hash; a game finishes with deciders that never answer. all of the above against fake `Officiating`… | module present (2/2 owned paths); acceptance not verified at this commit |
| WP-07 Statistics and play-by-play | PENDING | Tests: box score equals the sum of credit rows; a play with `noPlay` carries no credits. both hold over hand-built play records covering each `PlayResultType`. | module present (2/2 owned paths); acceptance not verified at this commit |
| WP-08 Reference resolver | PENDING | Tests: determinism; every play kind and kick kind returns a valid truth record; P6.1.1 resolver budget. 10,000 plays from generated situations, all valid, within budget. Its rate constants are parame… | module present (2/2 owned paths); acceptance not verified at this commit |
| WP-09 Field model, kinematics, tick loop | PENDING | Tests: J2 movement acceptance cases; same inputs give the same trajectory hash; no allocation in the tick (P6.3.1). a single player runs each `PathPoint` kind inside the J2 limits. | module present (4/4 owned paths); acceptance not verified at this commit |
| WP-10 Assignment language and legality validator | PENDING | Tests: Q1.1.3 legality generators; Q1.2.1 content tests; a condition that names true state is refused. Q1.1.3 passes for both rule sets; an illegal formation returns findings of severity `warning` an… | module present (4/4 owned paths); acceptance not verified at this commit |
| WP-11 Perception | PENDING | Tests: Q1.4.1 (no true state of another player reachable from a view); delay and field-of-view cases of J3. views are built from a hand-filled `SimArrays`, so the WP does not wait for WP-09. | module present (2/2 owned paths); acceptance not verified at this commit |
| WP-12 Contest models | PENDING | Tests: Q1.7.1 contest tests; Q1.7.3 rating-response sweeps at the contest layer. each contest type meets its J6 curve; win rate is monotonic in the rating gap. | module present (2/2 owned paths); acceptance not verified at this commit |
| WP-13 Calibration harness, target tables, chart caller | PENDING | Tests: Q1.7.2 harness on fixture summaries; `targetTierProblems` on every row. each number in section 4 is a row with its true status; no college row is filled from a pro value. | module present (4/4 owned paths); acceptance not verified at this commit |
| WP-14 Pre-snap phase | PENDING | J5 acceptance cases; play clock runs through the whole phase | module present (2/2 owned paths); acceptance not verified at this commit |
| WP-15 Starter content | PENDING | Q1.2.1; every play compiles with no `error` finding; formation reference images | module present (2/2 owned paths); acceptance not verified at this commit |
| WP-16 Ball physics and kicking | PENDING | J9 acceptance cases; Q1.7.1 for kick contests | module present (2/2 owned paths); acceptance not verified at this commit |
| WP-17 Environment | PENDING | J12 acceptance cases; neutral input gives `NEUTRAL_ENVIRONMENT` | module present (2/2 owned paths); acceptance not verified at this commit |
| WP-18 Fatigue and substitution | PENDING | D10 acceptance cases; Q1.2.2 (never more than `substitution.max_players`, read by key) | module present (2/2 owned paths); acceptance not verified at this commit |
| WP-19 Player AI | PENDING | K1 acceptance cases; Q1.4.1 | module present (2/2 owned paths); acceptance not verified at this commit |
| WP-20 Quarterback model | MISSING | Q3.2.1, Q3.2.2 items; Q1.7.3 | module not built: packages/engine-core/src/qb/, packages/engine-core/test/qb/ |
| WP-21 Ball carrier and tackling | MISSING | Q3.2.3 items; Q1.7.1 tackle contests | module not built: packages/engine-core/src/carrier/, packages/engine-core/test/carrier/ |
| WP-22 Fouls and injuries from play | MISSING | J10 acceptance cases; rates as parameters against J15.7 rows | module not built: packages/engine-core/src/fouls-injuries/, packages/engine-core/test/fouls-injuries/ |
| WP-23 Tick resolver | MISSING | `playTruthProblems` empty on every play; P6.1.1 play budget 50 ms; Q1.3.1 | module not built: packages/engine-core/src/tick-resolver/, packages/engine-core/test/tick-resolver/ |
| WP-24 Fast simulation and diff runner | PENDING | Q1.3.2; batch result is independent of worker count | module present (1/3 owned paths); acceptance not verified at this commit; absent: packages/headless/src/batch/, packages/headless/src/diff/ |
| WP-25 Full content set | MISSING | Q1.2.1, Q1.1.3, Q5.1.1 review list | module not built: packages/football-content/src/full/, packages/football-content/test/full/ |
| WP-26 Play-level calibration | MISSING | Q1.7.2 play level, both rule sets | module not built: packages/headless/src/calibration-play/, packages/headless/test/calibration-play/ |

## Game work packages (plans/game-build-plan.md)

| Package | Status | Acceptance | Detail |
| --- | --- | --- | --- |
| G-00 World contract | PENDING | Every persisted world shape is a zod schema with a visibility class per field and a unit per number, registered in a `worldSchemas()` list; forbidden-key lint passes; one round-trip test per shape; a… | module present (1/1 owned paths); acceptance not verified at this commit |
| G-01 Save core: command log, snapshots, replay | PENDING | A save replays from its command log to the same state hash on Linux, Windows and browser; undo per P5.2; crash recovery test per P5.8 | module present (3/3 owned paths); acceptance not verified at this commit |
| G-02 Browser storage, exports, bug bundle | PENDING | Browser save survives reload and quota warnings; bug bundle replays in `headless` to the same hash | module present (2/2 owned paths); acceptance not verified at this commit |
| G-03 2D field and film renderer | PENDING | Draws a recorded play from a fixture `TrajectoryRecord` tick by tick at 60 fps on the minimum hardware (P6.2); markers match O6.3; step, scrub and replay controls | module present (1/1 owned paths); acceptance not verified at this commit |
| G-04 App shell, navigation, settings store, design tokens | PENDING | Screen map routes render; every screen reachable by keyboard (Q1.5.2 for the shell); tokens light and dark | module present (3/3 owned paths); acceptance not verified at this commit |
| G-05 Desktop shell | PENDING | Desktop build runs on Windows with native save files and the worker layout of P2.1; installer builds | module present (1/1 owned paths); acceptance not verified at this commit |
| G-06 Browser build | PENDING | Browser build loads offline after first visit and passes `gate:browser` in Chromium | module present (1/1 owned paths); acceptance not verified at this commit |
| G-07 Expected points, win probability, success rate | PENDING | Models fit from the nflverse baselines in project files; each published comparison number cites a fact row; deterministic output | module present (3/3 owned paths); acceptance not verified at this commit |
| G-08 Content pipeline, hot reload, text templates engine | PENDING | Content packs validate, hash and hot-reload in dev; illegal plays flagged, not refused (P4.2.2) | module present (2/2 owned paths); acceptance not verified at this commit |
| G-09 People pack format and validator | PENDING | Pack tables encode and decode; checksum verify; a pack with a protected-event row fails validation (A6.3.1) | module present (2/2 owned paths); acceptance not verified at this commit |
| G-10 League, cap, college and injury fact research | PENDING | Every league-rules key named in C5 to C8, C11, T5 to T7 has a value with fact rows; rows short of three sources print their status; nothing filled from memory | module present (5/5 owned paths); acceptance not verified at this commit |
| G-11 Generated places, teams and stadiums data | PENDING | Generated clubs and schools cover every slot of C1.1 and T2.1; no real name or mark (A6.2.2 scan); climate rows cite sources | module present (1/1 owned paths); acceptance not verified at this commit |
| G-12 Calendar engine | PENDING | A year rolls from January to January for both levels; every C4 and T3.2 window opens and closes on its rule key; time limits checked (C11.1 work-rule checker) | module present (1/1 owned paths); acceptance not verified at this commit |
| G-13 Schedule generator, pro and college | PENDING | Pro schedule follows the C2.1 opponent formula for every rotation year; college schedule meets T3.1; both verified against the patterns in team memory `schedule-patterns-audit` | module present (1/1 owned paths); acceptance not verified at this commit |
| G-14 Standings, tiebreakers, playoffs, rankings, bowls | PENDING | Each C3.2 tiebreaker step is a named test; brackets fill under both formats; draft order hand-off (C3.5) | module present (2/2 owned paths); acceptance not verified at this commit |
| G-15 Roster rules and transaction engine | PENDING | Every limit read by key; waivers, practice squad, reserve lists and cutdown as transactions with legal and illegal cases | module present (1/1 owned paths); acceptance not verified at this commit |
| G-16 Player contracts and cap accounting | PENDING | Cap charges, proration, cuts, tags and the rookie scale match hand-worked cases from C6; each figure cites a fact row | module present (1/1 owned paths); acceptance not verified at this commit |
| G-17 Person generator and attributes | PENDING | Generated populations match D2.5 position norms within stated tolerances; drift guards hold over 30 cohorts; truth and estimates separate | module present (1/1 owned paths); acceptance not verified at this commit |
| G-18 Names and backgrounds tables | PENDING | Name and hometown tables with frequency weights and sources; scan finds no real current player's full name | module present (1/1 owned paths); acceptance not verified at this commit |
| G-19 Scouting estimates and grade display | PENDING | Estimate bands narrow with evidence per D6.4; display scale configurable (default per D6.2); no true value reaches a read model | module present (1/1 owned paths); acceptance not verified at this commit |
| G-20 Development and aging | PENDING | Gain, plateau and decline curves per position meet D8.2; Q1.6.4 talent distribution stable over 30 headless seasons | module present (1/1 owned paths); acceptance not verified at this commit |
| G-21 Injury catalogue data | PENDING | Every catalogue row has body part, recovery range and fact rows | module present (1/1 owned paths); acceptance not verified at this commit |
| G-22 History event log and label engine | PENDING | Labels resolve to evidence rows; the R1.2.9 test (1,000 random labels each traced to log rows) passes on a generated history; size budget per X2.4 | module present (2/2 owned paths); acceptance not verified at this commit |
| G-23 Needs, stress and memory | PENDING | Stress accumulates and smooths per X5.3; short and permanent memory layers per X6; protected people respected (X5.5) | module present (2/2 owned paths); acceptance not verified at this commit |
| G-24 Relationships and culture | PENDING | Edges grow and decay from fit and shared history only; culture drift per X9.3; unit cohesion feeds D9.5 | module present (2/2 owned paths); acceptance not verified at this commit |
| G-25 Positions as data, job catalogue, succession | PENDING | Every rung 0 to 9 and staff chart slot is data; vacancies cascade per X8.4 | module present (1/1 owned paths); acceptance not verified at this commit |
| G-26 Coach AI profiles | PENDING | Generated coaches match K2.3 league calibration; profiles hold only demonstrated behaviour (K2.7); no forbidden keys | module present (1/1 owned paths); acceptance not verified at this commit |
| G-27 Observer filter and read models core | PENDING | Q1.4.1 and Q1.4.2 pass: no truth-class field reaches any read model or AI view; the K9.3 information audit runs as a test | module present (1/1 owned paths); acceptance not verified at this commit |
| G-28 Rule-breaking: act, log, detection, penalty | PENDING | One owner for acts by user and AI alike; each act logs, has a detection chance and a penalty from C11 and T9.5 rows | module present (1/1 owned paths); acceptance not verified at this commit |
| G-29 Coach record: creation, philosophy, notebook | PENDING | Creation is background choices with no point spend (E1); philosophy consistency ledger (E10.4); notebook resurfacing (E11.3) | module present (1/1 owned paths); acceptance not verified at this commit |
| G-30 Personal wealth | PENDING | Cash flow, tax, housing and investment cases from E6 with tax rows cited; the firewall rule (E6.12) holds | module present (1/1 owned paths); acceptance not verified at this commit |
| G-31 Decision log | PENDING | Every decision type in N3.2 recorded with the model's view; integrity checks of N3.5 | module present (1/1 owned paths); acceptance not verified at this commit |
| G-32 Crisis catalogue and media text templates | PENDING | Every catalogue row and template validates; no real person, no cause of death for retired people | module present (2/2 owned paths); acceptance not verified at this commit |
| G-33 Medical process between games | PENDING | Who decides what (D11.3); concussion protocol steps; report designations; return and re-injury rates as rows | module present (1/1 owned paths); acceptance not verified at this commit |
| G-34 Draft | PENDING | Order, picks, trades of picks, the event with a running pick clock, rookie contracts | module present (1/1 owned paths); acceptance not verified at this commit |
| G-35 Free agency and trades mechanics | PENDING | Free agent types and windows by key; trades legal by cap and roster rules | module present (1/1 owned paths); acceptance not verified at this commit |
| G-36 Recruiting | PENDING | Prospect pool, calendar, visits, offers, signing by T4 rules; class numbers meet T4.8 rows | module present (1/1 owned paths); acceptance not verified at this commit |
| G-37 College eligibility, transfers, player pay, the college player | PENDING | Eligibility clock, transfer window and tampering cases, budget division, draft declaration | module present (1/1 owned paths); acceptance not verified at this commit |
| G-38 College program, staff, boosters | PENDING | Budget, booster and staff-pay cases from T9 | module present (1/1 owned paths); acceptance not verified at this commit |
| G-39 College-to-pro pipeline | PENDING | College evidence feeds pro grades with translation rates as rows (T11.4) | module present (1/1 owned paths); acceptance not verified at this commit |
| G-40 College content and level priors | PENDING | System families and level priors file per T10.5 | module present (1/1 owned paths); acceptance not verified at this commit |
| G-41 College calibration targets | PENDING | Every T12 row present with true status; nothing copied from pro values | module present (2/2 owned paths); acceptance not verified at this commit |
| G-42 People import, shuffle and protection | PENDING | Q1.6.2: zero protected events on imported people; attribute estimates checked per U3.3; real career used as prior (X14.2) | module present (1/1 owned paths); acceptance not verified at this commit |
| G-43 Awards, records, halls, notability | PENDING | Awards and records computed from logs; notability keep line per X4.2 | module present (1/1 owned paths); acceptance not verified at this commit |
| G-44 Yearly cohorts and the news wire | PENDING | Cohort targets per X11.2 met each year; news items generated from log rows only | module present (2/2 owned paths); acceptance not verified at this commit |
| G-45 Locker room: leaders and discipline | PENDING | Team rules, enforcement and consistency; small coach share per discipline research; no culture effect on fumbles | module present (1/1 owned paths); acceptance not verified at this commit |
| G-46 Player relationships and morale effects | PENDING | Conversations, promises and honesty tracked; morale changes only through D12.5 channels | module present (1/1 owned paths); acceptance not verified at this commit |
| G-47 Staff structure, hiring staff, support people | PENDING | Hiring, managing and leaving per L4; tampering rules from C11.6 | module present (1/1 owned paths); acceptance not verified at this commit |
| G-48 Owner, GM and athletic director relations, business side | PENDING | Power arrangement decides who has final say (L5.2.1, college default T9.1.1) | module present (1/1 owned paths); acceptance not verified at this commit |
| G-49 Agents and families | PENDING | Holdouts and trade requests per L7.2; families as outside voices | module present (1/1 owned paths); acceptance not verified at this commit |
| G-50 Community, league relations, crisis engine | PENDING | Crisis rates from history (team memory: historical rates); protected people never get harmful events | module present (2/2 owned paths); acceptance not verified at this commit |
| G-51 Coach contract and negotiation | PENDING | Pay, guarantees, buyouts, control clauses and college contracts per E3 cases | module present (1/1 owned paths); acceptance not verified at this commit |
| G-52 Reputation and legacy | PENDING | Reputation held by observers and traceable to log rows (X2.3); coaching tree | module present (1/1 owned paths); acceptance not verified at this commit |
| G-53 Time, energy, health, family | PENDING | Weekly hour budget and delegation (E7.3); health events and relocation (E8) | module present (1/1 owned paths); acceptance not verified at this commit |
| G-54 Coaching skills record | PENDING | Descriptions drawn only from the demonstrated record; no skill points (E9.6 retired ideas) | module present (1/1 owned paths); acceptance not verified at this commit |
| G-55 Ladder rungs and the duty system | MISSING | Every rung's duty list exists as data and can be performed in a headless run | module not built: packages/career/src/ladder/ |
| G-56 Depth chart and roles | PENDING | Packages, rotations, special teams units, position battles per M2 | module present (1/1 owned paths); acceptance not verified at this commit |
| G-57 Roster needs, pro scouting, camp and cutdown | MISSING | Needs board, ready list, workouts, waiver review, camp plan and cutdown per M1, M3, M6 | module not built: packages/league/src/personnel/ |
| G-58 Coach AI play calling | MISSING | Q3 calling items; K4.7 exploit list holds; calls depend only on the decision view | module not built: packages/coach-ai/src/calling/ |
| G-59 Coach AI game management | MISSING | Fourth-down, try and timeout rates meet their J15 rows (modern rates measured first, R3.2.1); Q3.2.4 | module not built: packages/coach-ai/src/management/ |
| G-60 Game-day console: calling offense, defense, special teams | MISSING | A full game called by keyboard alone (Q1.5.2); play clock never stops outside rule-book stoppages (R1.2.6 gate item 6) | module not built: packages/app-ui/src/screens/game-calling/ |
| G-61 Game management and sideline screens | MISSING | Every I5 decision point prompts in time; sideline information is observed only | module not built: packages/app-ui/src/screens/game-management/ |
| G-62 Pregame, halftime, postgame | PENDING | Pregame timeline, toss, talk, halftime adjustments, postgame media flow per leaves | module present (2/2 owned paths); acceptance not verified at this commit |
| G-63 Film room and play viewer | MISSING | Cut-ups, tagging, player grades, corrections per N1 | module not built: packages/app-ui/src/screens/film/ |
| G-64 Scheme knowledge and install | MISSING | Knowledge gain and decay, install units, readiness feeding mental errors (D9.4) | module not built: packages/league/src/knowledge/ |
| G-65 Practice planning | MISSING | Periods, scripts, scout looks, reps; college limits read by key (PROVISIONAL rows flagged) | module not built: packages/app-ui/src/screens/practice/, packages/league/src/practice/ |
| G-66 Opponent scouting and self-scout | PENDING | Tendency tables from logged plays only; tells and predictability per G8 | module present (2/2 owned paths); acceptance not verified at this commit |
| G-67 Playbook manager and terminology | PENDING | Library, series, call strings and wristband codes per G3 and G4 | module present (1/2 owned paths); acceptance not verified at this commit; absent: packages/app-ui/src/screens/playbook/ |
| G-68 Game plan and call sheet | MISSING | Menu, matchups, sheet layout, script, wristband per G6 and G7; plan locks per G6.6 | module not built: packages/app-ui/src/screens/gameplan/, packages/football-content/src/gameplan/ |
| G-69 The week: schedule, meetings, documents, media, travel | PENDING | Normal and irregular weeks run; documents generated; travel and media obligations per leaves | module present (2/2 owned paths); acceptance not verified at this commit |
| G-70 Roster moves in season screens | PENDING | Weekly roster cycle and active list done on screen within the rules | module present (1/1 owned paths); acceptance not verified at this commit |
| G-71 Analytics screens and team strength | PENDING | Decision chart, tracking data views and team strength; staff access limits per N2.7 | module present (2/2 owned paths); acceptance not verified at this commit |
| G-72 Home and people screens | MISSING | Player card, roster, staff, relationship and owner screens show estimates only | module not built: packages/app-ui/src/screens/home/ |
| G-73 Interface test harness | PENDING | Keyboard-only and screen-reach tests runnable for every registered route | module present (2/2 owned paths); acceptance not verified at this commit |
| G-74 Coach AI preparation | MISSING | AI builds plans and sheets the same way the user does; Q3.2.5 items | module not built: packages/coach-ai/src/preparation/ |
| G-75 Staff AI on the user's team and simulating his week | MISSING | Staff act and advise when delegated; good staff means less work (K6.1) | module not built: packages/coach-ai/src/staff/ |
| G-76 Front office AI | MISSING | Needs and value, in-season and offseason moves, college roster building; no exploitable trade loop (Q4.3) | module not built: packages/front-office/src/gm/ |
| G-77 Owner, media, agent and fan models | PENDING | Confidence, firing and hiring decisions read results per K8.2; college AD, president, boosters | module present (1/1 owned paths); acceptance not verified at this commit |
| G-78 The boss and evaluations | MISSING | Trust, autonomy, work grades, overruling and promotion per S4 | module not built: packages/coach-ai/src/boss/ |
| G-79 Game day below head coach | MISSING | Every sideline and booth seat playable with its channels | module not built: packages/app-ui/src/screens/seats/, packages/career/src/seats/ |
| G-80 Job market, hiring and firing | MISSING | Openings, interviews, offers, hot seat and firing per leaves; offers trace to log rows | module not built: packages/career/src/market/ |
| G-81 World generation, history run, off-screen loop | MISSING | A new world builds with a pre-career history; the loop runs every system in one fixed order and replays to the same hash | module not built: packages/world/src/generation/, packages/world/src/loop/ |
| G-82 Fidelity tiers | MISSING | Tier boundaries set by measurement (X13.3); no visible seam; full engine for every game (A3.1.1 row 20) | module not built: packages/world/src/tiers/ |
| G-83 Save retention and migrations | MISSING | Migration fixtures pass; save size at season 30 measured against P5.4.1 | module not built: packages/store/src/retention/, packages/store/src/migrations/ |
| G-84 Legends browser and chronicle | MISSING | Pages, chronicle, trees and rivalries, records and search per X3 | module not built: packages/app-ui/src/screens/legends/ |
| G-85 Career screens by rung and the coach's own screens | MISSING | Every rung's duty list reachable on screen (R1.2.9 gate item 3) | module not built: packages/app-ui/src/screens/career/ |
| G-86 Exploit search | MISSING | No dominant strategy and no information leak found (R1.2.6 gate item 1) | module not built: packages/headless/src/exploit/ |
| G-87 Season runner and gate harnesses | MISSING | A season plays at the head coach seat at both levels; Q1.7.2 season level report; Q3 battery runner | module not built: packages/world/src/season/, packages/headless/src/season-gate/ |
| G-88 30-season run and stability | MISSING | 30 seasons with no invariant failure; stability measures; 20-season advance time measured | module not built: packages/headless/src/long-run/ |
| G-89 Scripted career runs and the career loop search | MISSING | Rung 0 to pro head coach run and a fired-and-rehired run both replay identically | module not built: packages/headless/src/career-run/ |
| G-90 Play designer and test bench | MISSING | Every G1 part editable; illegal plays run and draw flags; test bench runs on the tick resolver | module not built: packages/app-ui/src/screens/play-designer/ |
| G-91 Defensive call designer | MISSING | Fronts, pressures, coverages, checks and disguise per G2 | module not built: packages/app-ui/src/screens/defense-designer/ |
| G-92 Player designer | MISSING | Designed players pass the same drift guards as generated ones | module not built: packages/app-ui/src/screens/player-designer/ |
| G-93 Glossary content and links | MISSING | Every A4 term present with source; every on-screen term links | module not built: packages/football-content/data/glossary/ |
| G-94 Coaching school and teaching | MISSING | Lessons from the user's own patterns (N5.4); time slows only in practice tools | module not built: packages/app-ui/src/screens/school/, packages/app-services/src/teaching/ |
| G-95 Coaching rating, certified mode, exportable record | MISSING | Score computed per N4.2; certified save rejects tampering; export round-trips | module not built: packages/models/src/rating/, packages/store/src/certified/ |
| G-96 Modding and editors | MISSING | User content folder loads safely; bad packs refused with reasons | module not built: packages/app-ui/src/screens/editors/, packages/tools/src/editors/ |
| G-97 Performance pass and benchmarks | MISSING | Every P6.1 budget measured on the target machine and met or reported | module not built: packages/headless/src/bench/ |
| G-98 Accessibility, input and playback settings | MISSING | O5.5 accessibility checks; key map remapping; playback settings | module not built: packages/app-ui/src/screens/settings/ |
| G-99 Coach validation tooling | MISSING | Blind film test and skill separation runs produce the Q5 reports | module not built: packages/headless/src/validation/ |
| G-100 Release gate | PENDING | Name and mark scans clean; provisional fact list printed for Marlon; release row of Q1.8.1 runs on Windows, Linux, browser | this gate: passes when every other check passes on Windows, Linux and the browser at one commit |

## Bible acceptance criteria (every leaf)

Every leaf, one line each, is in BIBLE-CHECKLIST.md. By area:

| Area | PASS | FAIL | MISSING | STALE | PENDING | NOT_APPLICABLE | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 0 | 1 | 18 | 0 | 39 | 0 | 58 |
| B | 0 | 0 | 0 | 0 | 177 | 1 | 178 |
| C | 0 | 0 | 0 | 0 | 116 | 0 | 116 |
| D | 0 | 0 | 9 | 0 | 127 | 0 | 136 |
| E | 0 | 0 | 43 | 0 | 134 | 0 | 177 |
| F | 0 | 0 | 0 | 0 | 239 | 0 | 239 |
| G | 0 | 0 | 78 | 0 | 38 | 0 | 116 |
| H | 0 | 0 | 15 | 0 | 120 | 0 | 135 |
| I | 0 | 0 | 123 | 0 | 46 | 0 | 169 |
| J | 0 | 0 | 42 | 0 | 166 | 0 | 208 |
| K | 0 | 0 | 62 | 0 | 52 | 0 | 114 |
| L | 0 | 0 | 0 | 0 | 147 | 0 | 147 |
| M | 0 | 0 | 33 | 0 | 29 | 0 | 62 |
| N | 0 | 0 | 32 | 0 | 23 | 0 | 55 |
| O | 0 | 0 | 68 | 0 | 34 | 1 | 103 |
| P | 0 | 0 | 15 | 0 | 52 | 2 | 69 |
| Q | 0 | 1 | 21 | 0 | 32 | 1 | 55 |
| R | 0 | 0 | 1 | 0 | 65 | 0 | 66 |
| S | 0 | 0 | 56 | 0 | 21 | 0 | 77 |
| T | 0 | 0 | 0 | 0 | 84 | 0 | 84 |
| U | 0 | 0 | 0 | 0 | 32 | 0 | 32 |
| X | 0 | 0 | 35 | 0 | 82 | 0 | 117 |

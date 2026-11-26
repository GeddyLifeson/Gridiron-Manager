# Game plan and call sheet (G-68)

Bible: G6 (game plan builder), G7 (call sheet designer), O3.4 rules. Entry: `src/gameplan/index.ts`. Pure core code (P1.1.1). This package may import only `schema`, so everything owned elsewhere arrives injected: scouting rows (G-66 tendency store, structural `ScoutRow`), install capacity and readiness projection (G5, H1), alignment prediction (G2), decision-chart cells (models strength chart, N2.4.1), availability (H5).

| File | Leaves |
| --- | --- |
| `situations.ts` | G7.2.1 condition vocabulary, rules, focus, 5,000-state grid check (unmatched, shadowed); O3.4.2 coverage map |
| `reference.ts` | G7.2.3 expected snaps, team or league table, depth marks |
| `reference-pro-2024.ts` | Generated pro table (see below); built by `test/gameplan/build_reference.py` |
| `reference-college-2024.ts` | Generated college table (see below); built by `test/gameplan/build_reference_college.py` |
| `catalogue.ts` | G7.2.2 catalogue, tiers, coverage status, missing list; `catalogueEntries` and `downDistanceId` for G-74 |
| `sheet.ts` | G7.1.1 sheet object, round trip, templates; G7.1.2 layout, keys, density |
| `templates.ts` | Offense, defense (G7.7.1) and special teams (G7.7.2) templates; defensive focus with nearest personnel |
| `looks.ts` | G6.1.1 looks board (80% Wilson, counts only under 5, windows, caller history) |
| `plan.ts` | G6.1.2 themes; G6.2.1 menu, balance, unanswered looks, targets; G6.2.2 new for this week; G6.2.3 sequences |
| `matchups.ts` | G6.3.1 matchup hunting; G6.3.2 protection plan |
| `defense.ts` | G6.4.1 defensive menu checks and meters; G6.4.2 emphasis dials |
| `possession.ts` | G6.5.1 tempo tool and special teams plan; G6.5.2 contingencies |
| `review.ts` | G6.6.1 plan review, approval, edit share for L4 |
| `fill.ts` | G7.3.1 filling; G7.3.2 counter, reduction, cut log, use rate; G7.2.3 box snaps |
| `script.ts` | G7.4.1 script cursor, variety; G7.4.2 second-half openers |
| `gameday.ts` | G7.5.1 must-calls and touches; G7.5.2 notes; G7.7.1 stress highlight; G7.9.3 marks |
| `card.ts` | G7.5.3 head coach card: kneel-down table (rule keys), field goal line, edits, stale |
| `wristband.ts` | G7.6.1 band fill and checks (on G4.4.1 `buildBand`); G7.6.2 audibles and freedom |
| `versions.ts` | G7.8.1 versions; G7.9.1 review and lock; G7.9.2 / O3.4.3 print layout |
| `params.ts` | Every starting value (basis `bible` = Assumption in the bible, `assumption` = this module) |
| `keys.ts` | `clock.play_clock_s`, `timeout.per_half` (already in the dictionary) |

## The one real-world table

G7.2.3 expected snaps for the pro rule set: 2024 NFL regular season from the nflverse play-by-play release (https://github.com/nflverse/nflverse-data/releases/tag/pbp). Recomputed on 2026-11-26 and every bible figure reproduced (61.3 snaps, third down 12.6 = 3.6 + 3.2 + 3.4 + 2.4, red zone 9.5, fringe 12.1, last two minutes 7.3, no-huddle 7.5, drives 10.8). It is still one data set, so the status is **PROVISIONAL (1 of 3)**. In a career the table is rebuilt from the simulated league (`tableFromStates`).

College: 2024 FBS regular season, both teams FBS, from the cfbfastR play-by-play release (https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/cfbfastR_cfb_pbp), 752 games. Run and pass snaps with a down, kneels and spikes left out by play text: 65.6 a team game (first down 28.9, second 21.3, third 13.4, fourth 1.9, red zone 9.4), drives 12.8. **PROVISIONAL (1 of 3)**, fact F-measured-rate-0390: ESPN box scores and NCAA.com count kneel-downs and sit 0.5 to 1 play higher (F-measured-rate-0282), so they do not confirm the same definition. No no-huddle flag in the release, so `tempo` is unseen. `leagueReference(level)` picks the table.

## Readings

- A catalogue row is covered when one box's rule matches 80% of the row's grid states; the best box below that makes it "partly covered". A two-minute box therefore covers the last-play rows.
- First and long is first and 11 or more (the G7.2.3 table row), not the "15 or more" in the G7.2.2 list, so first and 11 to 14 is not left in a gap.
- Second and short is tier 1 (ruling MA-64: 3.4 expected snaps a game is above the tier 1 line).
- Last play of a half = 5 seconds or less; ranges 10 and in, 11 to 40, 41 and more (Assumptions).

Not built here: the screens (`gameplan` route, read model, commands), which follow in a separate PR.

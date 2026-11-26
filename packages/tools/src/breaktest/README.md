# Break test: the adversarial playtest

The playtest in `../playtest` plays a career the way a coach would. The break test tries to break the game at every
step and finds what the game is not tracking properly.

Run: `npx tsx packages/tools/src/breaktest/cli.ts [--targets a,b] [--seeds N] [--seed HEX] [--steps N] [--no-shrink] [--out DIR]`.
It writes `break-test.md` and `break-test.json` (default `test-results/breaktest/`, untracked).

## How a run works

- A **target** is one part of the game driven only through its public entry points (`BreakTarget` in `types.ts`).
- Each step picks a **mode**: `legal` (what a careful user does), `hostile` (garbage payloads, unknown commands, key
  mashing, firing a coach mid-week), `boundary` (NaN, Infinity, -0, 2^53, empty and 10,000-character strings, zero and
  negative times) or `out_of_order` (moves at the wrong moment, rapid time skips, bursts).
- Before the action the target's **oracle** says whether the game must refuse it. Accepting an illegal action and
  refusing a legal one are findings; so is a refusal that still changed the state.
- After every step the target's **invariants** run on the visible state.
- At random moments the rig **saves and reloads**; the state must hash the same after.
- Every run is **replayed** from the same seed and actions; any different state is a determinism finding.
- Each new finding is **shrunk** (delta debugging) to the shortest action list that still shows it.
- What a target cannot reach yet is reported as `unreachable`, never hidden.

## Targets

| Id | Drives | Checks after every step |
|---|---|---|
| `world-service` | `WorldService.run` (every screen command family, garbage payloads, time skips), close and reopen | calendar range and direction, header against world, competition names, log replay on reload |
| `cap` | G-16 cap module: sign, restructure, extend, pay cut, release, trade, year changes into history and past 2030 | proration sums to bonuses, whole non-negative cents, team salary = lines = contracts + dead money, release parts, restructure keeps total value |
| `observer` | G-27 filter on a row of every world table with planted truth marks, hostile shapes and odd observers | no planted mark reaches the output, no prototype pollution |
| `game-pro`, `game-college` | G-60 console on the real engine: careful coach, key mashing, bursts, odd waits, presses after the final | state schema, down, clocks, timeouts, score by period = score, nothing goes backwards, event schemas; at the end the game is played out and the playtest's full event-log check runs |
| `world-loop` | G-81 loop with real generation and turnover: weeks, season points out of order, season skips, head coaches fired mid-week | Q1.2.2 invariants (G-88 checker), records = box scores, history = games, champion = title game winner |

The world loop uses STAND-IN games and schedule until the season session binds the real ones (phase 2).

## Phase 2

Once the app root, the season session and the screens are on main: add a `season` target over `SeasonPlay` and an
`app` target over the composition root, point `cap` at the world's cap ledger, crawl live read models for observer
leaks, and run long at pro and college in the cloud. Findings go to `/mnt/project-files/plans/break-test-report.md`.

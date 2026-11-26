# @gm/world

Kind: core. Owns: World generation, the history run, the week and season runner, the off-screen loop. Bible categories: X10, X12. May import (P1.2.1): every other core package. As a core package it obeys P1.1.1: no wall clock, file system, network, display, locale, platform random or platform transcendental math; all randomness comes from `@gm/engine-core` streams.

Status: G-81 adds two modules and G-82 a third. They are not in the package entry point yet (the integrator adds the barrel lines); tests import the module indexes. `src/season/` (G-87) is the season runner and is exported as `season`.

- `src/generation/` (X10.1, X10.2, X10.4, U4.1): the setup record and world code, structures (competitions, conferences, places, teams, venues, resource bands, rivals), founding people and cultures, placement of imported people and of the user.
- `src/tiers/` (X13, P6.4): who is near the user (tiers 1 to 3 for teams, people and games), what is recorded for them, moves between tiers with the demotion hold, the no-seam checks, and the measurement protocol.
- `src/compliance/` (L8.2.5, K7.7.1): the rule-breaking pipeline's state in the live world, the weekly `compliance` step, general managers read from off-ladder seats, and early contact raised by the front office AI.
- `src/loop/` (X10.3, X12.1, X12.3): the weekly and season-point passes in one fixed order, the history run and its validator, leaving football, the cohort step, stop points and time control.

The loop owns the order, the dates, the streams, the event log and the pass hash. Each system is a port in `WorldSystems`. A step with no owner bound is `unbound(reason)` and is listed by `unboundSteps`, so a run can never pass off an unwired step as done. Games go through `GamePort`, which the integrator binds to the real engine; the request type has no lighter method (A3 row 20).

## Tiers (G-82)

Marlon's ruling (A3.1.1 row 20): no lighter simulation anywhere. A tier chooses what is recorded (film kept or re-simulable) and how a game is run (shown, or headless and first in a long advance). It never chooses how anything is resolved. `policyProblems` fails if any simulated system differs by tier, and `configProblems` refuses every measurement step that would lighten the simulation.

The X13 leaf was amended to match (MA-66): every system runs the same at every tier, nothing is derived or filled in at promotion, and a simulated game is promoted to film by re-simulation.

Wiring owed by the composition root: pass `TIER_EVENT_TYPES` to `createWorld`; call `recomputeTiers` between passes at the X13.1.1 rule 5 points with a `TierInputs` built from the schedule, boards, X7 edges, X6 memory and the K7 market slice; keep `TierState` in the save (`tierRows` gives the schema `TierRow`s). The timed measurement run needs a clock, so its runner belongs in `packages/headless` and hands its numbers to `buildReport` and `chooseShipping`. No measurement has been taken yet, so every line in `tiers/params.ts` is a starting value (X13.3.1 rule 6).

## Season runner (`src/season/`, G-87)

One step is one league week of the regular season or one postseason round. Inside a step every team with a game prepares in team-id order (the head coach seat runs its own week instead), the games are played in game-id order, and the results join the standings input. The runner owns no football number: counts come from the league-rules values, games from the game port.

- `createSeason`, `stepSeason`, `runSeason`: the state is plain data, so a season can be saved after any step and continued.
- `seededBracketPlan()`: division ranks, conference seeds and a bracket per conference (C3). `selectionPlan(input)`: conference standings and title games, committee ranking, selected field, national bracket, bowls (T3). Which one a competition uses is the caller's choice; neither branches on a level.
- `seatPort(source, driver)`: the head coach's week on the G-69 week model, run in "next decision" mode. A league week with no game has no week of its own; the next game's week is built with the bye shape.
- `aiPreparation(source, prepareTeamWeek)`: the K3 week for AI teams, with streams scoped [season, week, team].
- `summariseSeason`: team lines, player totals and the season hash (Q1.3.1).

Seeds: a game's seed comes from the season seed and the game id only; tie draws and committee noise are keyed by a label. Stream names: `season.game`, `season.tieDraw`, `season.committee`, `coachPrep.<name>`.

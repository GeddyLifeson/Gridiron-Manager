# @gm/world

Kind: core. Owns: World generation, the history run, the week and season runner, the off-screen loop. Bible categories: X10, X12. May import (P1.2.1): every other core package. As a core package it obeys P1.1.1: no wall clock, file system, network, display, locale, platform random or platform transcendental math; all randomness comes from `@gm/engine-core` streams.

Status: `src/season/` (G-87) is the season runner. World generation, the history run and the off-screen loop arrive with G-81.

## Season runner (`src/season/`, G-87)

One step is one league week of the regular season or one postseason round. Inside a step every team with a game prepares in team-id order (the head coach seat runs its own week instead), the games are played in game-id order, and the results join the standings input. The runner owns no football number: counts come from the league-rules values, games from the game port.

- `createSeason`, `stepSeason`, `runSeason`: the state is plain data, so a season can be saved after any step and continued.
- `seededBracketPlan()`: division ranks, conference seeds and a bracket per conference (C3). `selectionPlan(input)`: conference standings and title games, committee ranking, selected field, national bracket, bowls (T3). Which one a competition uses is the caller's choice; neither branches on a level.
- `seatPort(source, driver)`: the head coach's week on the G-69 week model, run in "next decision" mode. A league week with no game has no week of its own; the next game's week is built with the bye shape.
- `aiPreparation(source, prepareTeamWeek)`: the K3 week for AI teams, with streams scoped [season, week, team].
- `summariseSeason`: team lines, player totals and the season hash (Q1.3.1).

Seeds: a game's seed comes from the season seed and the game id only; tie draws and committee noise are keyed by a label. Stream names: `season.game`, `season.tieDraw`, `season.committee`, `coachPrep.<name>`.

# week-loop: the seat's game week and the film archive

H1.1.3 week runner for the head coach seat, on the app-services season session (`play.SeasonPlay`). Thread
"Build the week loop and opponent film", 2026-11-26.

## What it does
- `SeatWeekLoop.open(seasonPlay)` builds the coming step's week exactly as the runner's seat port does
  (world `season/seat.ts`: league week builder, template set, league deadlines) and runs it with the one
  H1.1.3 loop: `step('block' | 'decision' | 'day' | 'game')`, `choose`, `delegationPreview`, `toGameDay`.
- Each block is the week's work (see the header of week-loop.ts): self-scout, the opponent breakdown and staff
  report, the staff-drafted call sheets, install exposures and team reps, press sessions held, travel legs.
- `finish()` at game day gives the season the week's `SeatWeekRecord` (`setSeatWeek`), which the next step hands to
  the runner's `seatWeek` port; `consoleConfig(bindings)` gives the console the week's sheets.
- `SeasonPlay` films every game (`film`, a `FilmArchive`); `rebuildFilm(gameId)` plays a non-seat game again for its
  full play records and checks the final state hash.

## Choices (status words per A5)
- **Film format.** A full play record is about 1.4 MB of JSON a game (measured: pro week 1 game, 164 records,
  1,461,738 bytes). The archive keeps one charting row per scrimmage snap, the fields `tendencies.chartGame` reads,
  as zigzag varints in base64 with a string table: measured 6.2 KB a game pro, 6.7 KB college (3 steps, 48 and 201
  games), so about 1.7 MB a pro season and 6.0 MB a college season of 893 games. Lengths are kept in hundredths of a
  yard; success is marked before rounding. Exact film is rebuilt by replay, which costs one game simulation (about
  50 ms measured here).
- **The seat's own games** cannot be replayed (the user called them), so their archived rows come from the console's
  records; full seat film is the film room's (G-63). `SeasonPlay.replay` takes seat film from the save and checks
  every other replayed game's film against the saved film.
- **Opponent study** is the K3.1.1 builder (`preparation.buildScoutingReport`), the same report the AI staffs read
  (H2.5.1 "K3 produces and uses the same report"): H2.1.1 window (default 4 games), staff hours and late jobs,
  H2.1.2 charting error, H2.1.1 relevance weights. Week 1 has no film of the season (H2.1.1 rule 5) and says so.
- **Film exchange (H2.6.1)**: every earlier game is available by the coming week, at both levels. The college rule
  (conference games after 24 hours, non-conference last 3 by G-6, others broadcast only with a tagging penalty) is
  **not built**: `chartOpponent` has no per-tag accuracy offset. Owed.
- **Staff**: no staff people play yet (K6), so an average staff from params.ts does the work: 3 QC coaches at speed 1
  with 30 hours, tagging skill 0.5, preparation z 0, no disguise, no tell hours. All **Assumption**.
- **Hours before the plan day**: an advance-work head start of 24 hours (**Assumption**, H2.1.1 rule 2 states the
  head start but not its hours) plus the time from the week's first block to its first game-plan block.
- **Install (H1.2.2)**: one plan item per non-empty sheet box, taught on the practice day the G5.3.1 catalogue gives
  its situation; exposures are meetings, walkthroughs and practices from that day to the game. Nothing is carried
  over (**Assumption**: D9 knowledge is not in the season yet). Available team reps: practice minutes x 0.4 team share
  (**Assumption**) x the G-65 H3.2.1 rep rate for the block's contact.
- **True call names (N2.3.1 rule 2)**: charting passes no `chartValue`, so a charted concept is the play's own id.
  The concept-family map does not exist yet. Owed with the K3 harness.
- Post-game blocks of game day are not run by the week: the game and what follows it belong to area I.

## Owed
- App root (thread "Wire app root, Today and console"): call the loop from the career port's `advanceToGameDay`
  and take `consoleConfig` from it instead of the staff-only setup.
- Week screens (PR 261): read `view()`, `study`, `selfScout`, `install()`; the press conference reads the media reports.
- Worker (thread "Move week simulation to a worker"): `PackedGame` is plain data; a worker that plays the other games
  returns them with the outcomes and the session `put`s them in the archive.
- Career save (PR 281): keep `film` from `SeasonPlaySave`; H2.1.1 reads this season and last season only, so older
  seasons can be dropped from the save.
- Integrator: barrel line `export * as weekLoop` (carried here), `WEEK_LOOP_PARAMS` in the parameter registry.

# Season gate harnesses (G-87)

Bible leaves: R1.2.7 (phase 6 gate), Q1.7.2 season level, Q3.1 and Q3.3 (battery form and report), Q1.3.1 (season replay).

## Commands

Until the integrator wires them into `npm run headless`:

```
npx tsx packages/headless/src/season-gate/cli.ts season  --rules pro_2026 [--seat <team key>] [--seed <16 hex>]
npx tsx packages/headless/src/season-gate/cli.ts seasons --rules college_2026 [--seasons 1000] [--workers 8] [--out dir]
npx tsx packages/headless/src/season-gate/cli.ts battery [--rules pro_2026,college_2026] [--out file]
npx tsx packages/headless/src/season-gate/cli.ts gate    [--rules pro_2026,college_2026] [--seasons n] [--workers w] [--out dir]
```

`seasons` appends each finished season to `<out>/seasons.<rules>.<seed>.jsonl`; running it again continues the file. `gate` reads that file when it is there. A full Q1.7.2 run is 1,000 seasons per level (about 95 s a pro season and 5 minutes a college season on one cloud core), so it is a long run.

## What is real and what is not

- Schedules, league structure, calendars and league rules come from the shipped files and generators. Games run on the real game (`real-game/index.ts`).
- Teams are the real game's placeholder rosters, every attribute at one value: the "league of average teams" of Q1.7.2. Rows that need unequal teams (tier and upset rows) are measured but mean nothing until generated rosters are fed.
- Inputs no shipped file carries are in `data/college-provisional.json`. Each one in use is printed in every report, and gate item 1 holds while any is in use.
- The battery ships with no bindings: every item prints NOT RUN and the battery is INCOMPLETE. `battery/bindings.ts` lists what each leaf waits for.

## Open requests (integrator and owning threads)

- CR-G87-1: coach-ai barrel `preparation`, then bind `aiPreparation(source, preparation.prepareTeamWeek)` and build `TeamWeekInput` from the world.
- CR-G87-2: college league-rule keys with fact rows: `standings.tie_win_value`, `playoff.reseed`, `cfp.at_large_pool_rank`, `ranking.lower_division_wins_credited`, `ranking.schedule_standard_games`.
- CR-G87-3: `title_method` per conference in the college world data (T3.3.1).
- CR-G87-4: the bowl list with tie-ins (T3.6.1).
- CR-G87-5: `createRealGame` validates `chart.*` overrides and never hands them to the chart caller, so they change nothing.
- CR-G87-6: barrels: world `season` (added here because headless needs it), headless `seasonGate`; subcommands in `cli.ts`; `PARAMS` module `headless.seasonGate`; J13.2.1 stream rows `season.game`, `season.tieDraw`, `season.committee`, `season.schedule`, `season.priorRank`, `seasonGate.season`, `battery.pair`.
- CR-G87-7: the season runner does not call the schedule's flex step (C2.4), so the last pro week has no kickoff times.
- CR-G87-8: pro season target rows for the spread of team wins do not exist (Q1.7.2 names them); the report prints the spread with no row to judge it.

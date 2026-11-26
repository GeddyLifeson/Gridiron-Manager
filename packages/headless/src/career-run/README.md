# headless/career-run (G-89)

Scripted career runs and the career loop search. Bible: S10 (pacing), S10.3.1 (climb targets),
Q3.2.6 (career-scale items, the coach effect the stand-in season keeps), Q4.3.1 (career loop search).

A script is a policy (how well the coach works, at what pace, which offers he takes, which loop acts he tries)
plus a start and a length. `runCareer(script, seed)` runs one deterministic career and returns season rows,
X2-shaped record events and a hash. Same script and seed give the same hash.

| File | What | Bible |
|---|---|---|
| `pace.ts` | Week modes (full, key weeks, season summary), played weeks, held weeks, certified forces full, simulated grade = running mean minus 5, unplayed family = median AI coach with a wider spread, the simulated flag, 3 to 5 summary decision events | S10.1.1, N4 |
| `run.ts` | The runner: season work, stand-in results, owner judgment and firing, release, year out, offseason offers (each one a pause), the one-rung floor, the comeback scramble | S10.1.2, S10.3.1, E2.4.1, E2.7, S7 |
| `market-port.ts` | `MarketPort`: the slice of G-80 the run needs, and `standInMarket`, which copies G-80's formulas and starting values | E2.2.2, E2.4.1, E2.7.1, E2.7.2, S7.3.1 |
| `scripts.ts` | Perfect work, average work (the standard AI coach), rung 0 to pro head coach, fired and rehired (coordinator start, S10.2.1), and the greedy loop agents | S10.3.1, Q4.3.1 |
| `checks.ts` | Replay check, S10.3.1 climb check, Q4.3.1 loop search with memory ablation and a plain report | S10.3.1, Q4.3.1 |
| `params.ts` | Starting values. Pacing ones are the bible's; the stand-in season and offer model are this module's Assumptions | |

## What the checks show today (20 seeds, stand-in world)

- S10.3.1: perfect work reaches rung 7 in 8 to 14 years in 18 of 20 seeds; average work reaches rung 9 in 3 of 20.
- Rung 0 to pro head coach: 16 of 20 seeds within 30 seasons, in years 10 to 27 (S10.3.1 says 15 to 25, "not guaranteed").
- Fired and rehired: 17 of 20 seeds are fired from the first head job and hired again.
- Q4.3.1, 30 seasons: job hopping -5%, tanking -7%, staff raids +4%, recruiting flips +1% against the standard AI coach.
  With the AI memory switched off the same loops gain 4% to 13%, so the world answers each one. All under the 25% margin.

These are results of the stand-in model, not of the game world. They show the framework works. They are not
evidence that the game's world is tuned. That evidence comes when G-81 seasons replace the stand-in (CR-G89-3).

## Decisions (module choices, flagged)

1. **Yield** for Q4.3.1 is E2.2.2 job value summed over employed seasons. The leaf names "career outcomes" with
   no measure. This is the simplest one that counts both height and time.
2. **"The world responds"** is measured by ablation: the same loop is run with no AI person reading the logged
   history. A yield change of more than 2 points of edge counts as a response.
3. **Job hopping** as hirers read it is leaving after one season for a seat that is not a rung up. Climbing a rung
   a year is the perfect-work path and is not penalised.
4. **Fired and rehired** starts as a coordinator (S10.2.1 higher start) so the story fits a 20-season run, and
   plays the failing head job in full pace. Under key weeks, S10.1.1 rule 1 draws the unplayed weeks from his
   earlier good record, which hides the poor work.
5. **Out-of-work market value** uses his career mean results (the public record), not his last season.
6. **Pending loops**: contract traps (needs E3 talks with the G-76 front office AI), draft and trade input (G-76),
   money (E6 in the G-81 loop). They are listed in the report and fail no build, like Q4.3.2's pending rows.

## Facts

None. No football fact enters this module. Every number is a bible starting value or an Assumption in `params.ts`.
The S10.3.1 real average (first top-subdivision head job at 43.2 after 16.9 years, 1 of 3) is not used as a target here.

## Owed requests

- **CR-G89-1** (integrator) Barrel: `export * as careerRun from './career-run/index.ts';` in `packages/headless/src/index.ts`.
  When CR-G80-1 lands (`career.market` in the barrel), pass it as `market` and keep `standInMarket` only as a test double.
- **CR-G89-2** (integrator) A J13 stream name for career runs. This module uses `career-run` with scope `[scriptId, season, purpose]`.
- **CR-G89-3** (G-81 world loop) A headless "coach season" call that returns results, owner judgment and offers
  for one coach, so `run.ts` can take seasons from the world instead of the stand-in model. The runner's shape stays.
- **CR-G89-4** (G-85 career screens) The screens read the same `WeekMode` and held weeks. Nothing on screen
  should offer a pace the runner does not have.
- **CR-G89-5** (integrator, later) CLI subcommand `career-run` and `career-loops` writing the report to test-results.

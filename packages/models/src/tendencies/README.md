# Opponent scouting and self-scout (G-66; bible H2, G8, N2.3.1)

One store, one query, both directions: the user's own tables are built by the same function an opponent's staff uses on him (N2.3.1 rule 4). Every number comes from logged plays. Nothing here reads the opposing staff's true plan (K3) or a tagger's true accuracy (K9).

| File | Bible | What |
| --- | --- | --- |
| `types.ts` | N2.3.1 rule 1 | `ChartedPlay`: one row per play, situation and call keys |
| `record.ts` | P3.3.1, G8.1.1 | `chartGame`: play records to own-team rows (hash in the offense frame, after events, success) |
| `cuts.ts` | G8.1.1, H2.1.3, F10 | Cuts (down and distance buckets, field zone, personnel, formation, motion, hash, score, time, quarter, after event, caller) and measures (run or pass, kind, direction, concept, protection, pressure, coverage, shell, man or zone, front) |
| `stats.ts`, `table.ts` | H2.2.1, G8.1.1, N2.3.1 | `tendencyTable`: counts, weighted rate, n_eff, 90% Wilson interval, thin rows, counts-only cells, G8 bands, N2.3 strength mark, refs for cut-ups |
| `window.ts` | G8.1.1, H2.1.1, H2.1.3 | Self-scout windows, H2.1.1 relevance weights and caller change, breakdown jobs and late finish, cut-ups as saved queries |
| `charting.ts` | H2.1.2 | Opponent charting with tagging error on the four inferred tags; user corrections never re-rolled; recheck line in words |
| `exposure.ts` | G8.1.2 | Opponent breakdown window and the ranked exposed tendencies |
| `predict.ts` | G8.2.1 | Charted rows into the G-07 predictability index, per game and over a window |
| `tells.ts` | G8.3.1, G8.3.2 | Structural tells (85% line, 8 snaps), sheet scan, kept bait; player habits: find, false report, fix, relapse, film edge |
| `breakers.ts` | G8.4.1 to G8.4.3 | Breaker planner and dose, defensive mirror, breaker results, holds, plant counter |
| `report.ts` | G8.5.1, H2.2.2, H2.2.3 | Report cadence and cost, the author's ranking at his skill and hours, caller cards, unscouted looks |

Screens: `packages/app-ui/src/screens/scouting/` renders `football.self_scout` and `week.scouting_report` from a `ScoutingView`.

## Readings the bible leaves open (all named params)

- **Band range width (G8.1.1).** The leaf applies bands "to the range" without a width. H2.2.1's 90% Wilson range gives 18 of 20 a lower bound of 0.738, which fails the leaf's own acceptance (18 of 20 is strong). `band.rangeZ` = 1 (one standard error, lower bound 0.813) is this module's assumption; the displayed interval stays the 90% Wilson. Structural tells use the same range against 85%. Reported to the bible thread.
- **Perfect tagger (H2.1.2).** Rule 5's starting values top out at 0.80 + 0.15 = 0.95, but acceptance 3 wants a perfect tagger with no disguise fully correct. Skill 1 with zero disguise is treated as always right. Reported.
- **Two strength rules.** G8.1.1 bands (rate thresholds on the range) and N2.3.1's mark (gap from the team's own rate) are both computed and kept apart: `band` and `mark`.
- **Window conflicts.** G8.1.1 self-scout default: last 3 games. H2.1.1: last 4 games at 1.0 with 0.7, 0.4 and 0.5 for older rows. N2.3.1: last 4 plus same-opponent games at 0.5. Caller change: H2.1.1 says 0.3, N2.3.1 says 0.25; 0.3 is used. Reported.
- **Run or pass.** An RPO and a trick play are neither for the run-or-pass measure (they stay in the play-kind measure). For the predictability index an RPO is a run and a trick play is left out.
- **Pressure** is five or more rushers (`chart.pressureRushers`, assumption). Shell and man or zone come from the coverage family (F10).
- **Report noise (G8.5.1).** The leaf states the effect and the acceptance, not the size: perceived score = exposure score + normal noise, sd from 3 at skill 0 to 0.15 at skill 1, grown by the share of hours short.

## Not built here, and why

- H2.3 (opponent people, expected lineup, tells of opposing players), H2.4 (signals, inside knowledge), H2.5 (the report document and the coach's own film hours) and H2.6 (film exchange, college thin film, bought data): they need G-19 scouting views, E7 hours, area T film rules and K6 staff. G-69 (the week) and G-74 (coach AI preparation) are their homes or callers.
- The read model for the screens waits for the barrel line (CR-G66-1) and a read-model data schema in `@gm/schema` (CR-G27-4 says app-services cannot define one).
- Backfield set and splits are not in the call record yet (CR-G66-3).

## Requests to the integrator

- **CR-G66-1** Barrel line in `packages/models/src/index.ts`: `export * as tendencies from './tendencies/index.ts';`.
- **CR-G66-2** Route lines in the shell's route table for `football.self_scout` and `week.scouting_report` from `packages/app-ui/src/screens/scouting/` (`scoutingRoutes(source)`), once a read model supplies the source.
- **CR-G66-3** `backfieldSet` and receiver splits on `OffenseCall` (or the play content) so G8.1.1's backfield cut and G8.3.1's split tells can be charted.
- **CR-G66-4** A `world:ChartedPlay` table (or the CR-G31-1 decision-log table plus play records) so tendency rows persist across saves, and a `scouting` read-model data schema.

# Play-level calibration data (WP-26)

- `real-cells.pro_2026.json`: the cell suite of `../cells.ts` measured on real play-by-play. Built by
  `npx tsx packages/headless/src/calibration-play/run.ts baseline <dir> --totals footballdb=<csv> --totals nfl.com=<csv>`
  from the nflverse files `play_by_play_2022.csv.gz` to `play_by_play_2024.csv.gz`
  (https://github.com/nflverse/nflverse-data/releases/download/pbp/), regular season, retrieved 2026-11-26.
  815 games, 131,508 rows, 455 cells.
- `tolerances.json`: the J15.1.2 starting tolerances (status Assumption, owned by Q2) and the thin-cell cut-off.
- There is no college file. No college play-by-play collection has been read, so every college cell prints
  MISSING SOURCE. No college cell is filled from a pro value (Q2.1.1).

Status. Every cell is "1 of 3": one collection (nflverse). The status is computed from `sources`, not typed.
A second and third play-by-play collection would lift it; none is reachable from the cloud container.

What was checked three ways is the reader, not the cells. League totals from these rows by the official
definitions (rushing attempts with kneel-downs and scrambles, passing attempts with spikes, sacks) against
the two team-total collections in the project files (`adapterChecks` in the file):
- passing attempts and sacks: equal in all three seasons in all three collections;
- rushing attempts: equal in 2023; 3 short in 2022 and 1 short in 2024 (of about 14,700);
- rushing yards: equal in 2023; 39 short in 2022 and 60 short in 2024 (of about 65,000, under 0.1%).
The small rushing gaps are not explained yet (candidates: laterals and aborted snaps, which the public file
codes apart). They are well inside every tolerance.

Conventions read off the files (2023 regular season counts): `play_type` is pass for 19,740 rows (attempts and
all 1,410 sacks), run for 14,223 (all 1,035 counted scrambles), `qb_kneel` 428, `qb_spike` 67, `no_play` 4,370
(55% with a penalty, the rest timeouts, which are dropped). The 127 two-point tries are pass or run rows with an
empty down; they become `try` rows and are in no cell. That is why the attempt count here (53,996) is below the
J15.4.1 row's 54,266: that row counts every `play_type` pass row that is not a sack. `first_down` includes first
downs by penalty.

Not charted in the base public file, so no cell reads them: play action, motion, personnel, rushers, box count,
coverage, pressure, snap-to-snap time, expected points. The nflverse participation and FTN charting files hold
some of these and are the next source to add.

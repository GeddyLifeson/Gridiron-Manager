# Play-level calibration data (WP-26)

- `real-cells.pro_2026.json`: the cell suite of `../cells.ts` measured on real play-by-play. Built by
  `npx tsx packages/headless/src/calibration-play/run.ts baseline <dir> --totals footballdb=<csv> --totals nfl.com=<csv>`
  from the nflverse files `play_by_play_2022.csv.gz` to `play_by_play_2024.csv.gz`
  (https://github.com/nflverse/nflverse-data/releases/download/pbp/), regular season, retrieved 2026-11-26.
  815 games, 131,508 rows, 972 cells (455 on play-by-play alone plus 517 charted).
- `tolerances.json`: the J15.1.2 starting tolerances (status Assumption, owned by Q2) and the thin-cell cut-off.
- `real-cells.college_2026.json`: the same suite on college play-by-play, 389 cells. Built by
  `npx tsx packages/headless/src/calibration-play/run.ts college-baseline <dir> --retrieved <date>` from
  `play_by_play_2023.csv` to `play_by_play_2025.csv` of the sportsdataverse-data release `cfbfastR_cfb_pbp`
  (https://github.com/sportsdataverse/sportsdataverse-data/releases/download/cfbfastR_cfb_pbp/, no key),
  regular season, both teams top-subdivision: 2,264 games, about 299,000 rows. Seasons 2023 to 2025 are the
  ones the 2026 rule set is tuned on (T12.1.1: the 2023 clock change). Conventions are in `../college-row.ts`.
  Splits and measures the file cannot supply (air yards, charting, scrambles) are left out of the file and
  print MISSING SOURCE; no college cell is filled from a pro value (Q2.1.1).
- Reader check, college: an independent pandas implementation of the same rules gives the same league cells
  (pass share 0.49719, completion 61.12%, yards per attempt 7.280, yards per carry 5.141, carries of 10 or more
  14.36%, on 297,276 plays). The earlier research script (`research/college/college_baselines.py`) gets 49.8%,
  60.7%, 7.51, 5.15 and 14.5% on 2022 to 2025 because it keeps foul yards in the play's yards and includes 2022.

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

Charts (added 2026-11-26). The base file does not chart play action, motion, personnel, rushers, box count,
coverage or pressure. They come from two more nflverse releases, joined on game id and play id
(`pbp_participation_<year>.csv` and `ftn_charting_<year>.csv` under
https://github.com/nflverse/nflverse-data/releases/download/), read by `../charting.ts`. Definitions are the
nflreadr data dictionaries (`dictionary_participation`, `dictionary_ftn_charting`). Conventions read off the files:
a rusher count of 0 on a dropback, a box count of 0, and the values 44 and 45 are "not charted"; 2022 participation
rows hold NA outside pass plays; the personnel string lists only RB, TE and WR in 2022 and every position in 2023 and
2024; COVER_9, COMBO, BLOWN and PREVENT are `other`. A dropback is charted when both its rusher count and its pressure
flag are known. Coverage per season, and how the two charts agree (`chartChecks` in the file):
- 2022: dropbacks charted 17997 of 20210 (89.0%); carries with a box count 14329 of 14344; coverage on 17979 dropbacks; personnel on 32406 of 33649 pass and run plays; plays missing from the FTN file 0; FTN rusher count equals participation on 15435 of 20064 (76.9%), box count on 7905 of 14277 (55.4%).
- 2023: dropbacks charted 20598 of 20693 (99.5%); carries with a box count 14136 of 14178; coverage on 20610 dropbacks; personnel on 32625 of 33836 pass and run plays; plays missing from the FTN file 0; FTN rusher count equals participation on 20596 of 20598 (100.0%), box count on 14130 of 14136 (100.0%).
- 2024: dropbacks charted 19849 of 20116 (98.7%); carries with a box count 14270 of 14281; coverage on 20070 dropbacks; personnel on 32325 of 33335 pass and run plays; plays missing from the FTN file 0; FTN rusher count equals participation on 19844 of 19849 (100.0%), box count on 14216 of 14228 (99.9%).

Status of the charted cells (computed from `groups` in the file, never typed). Every group is "1 of 3":
- participation chart (rushers, pressure, coverage, box, personnel splits; pressure and rusher-share cells): one collection.
  FTN holds a second rusher and box count, but it equals the participation count on 99.9% of plays in 2023 and 2024,
  so those two files are one chart there and count once. Only 2022 differs (77% and 55% equal), and that year's
  participation file charts 89% of dropbacks. The disagreement is a finding for the owner of Q2: two charts, one season.
- FTN chart (play action and motion splits, `pass.playActionShare`, `play.motionShare`): one collection.
Cells outside these groups stay 1 of 3 on the play-by-play alone. The pressure flag is the feed's `was_pressure`
(29.9% of charted dropbacks over 2022 to 2024); every sack is flagged pressured. The simulated flag is the J6.2.5
definition, so the pressure cells compare two definitions until Q2 settles which one the engine targets
(the J15 conflict between the feed flag and the published definition is unresolved).

Still not charted anywhere in these files: snap-to-snap time, expected points.

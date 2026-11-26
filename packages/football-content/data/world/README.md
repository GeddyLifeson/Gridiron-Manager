# Generated world data (G-11)

Fictional clubs, schools, conferences, stadiums and rivalries in the real shape (C1.1, T2.1, T2.2), plus the real reference places their geography and climate are borrowed from (C1.4.2 rule 3, U4.1.1). No real team name, nickname, logo or mark; no image field exists (A6.2.1).

| File | Holds |
|---|---|
| `pro-league.json` | League, 2 conferences, 8 divisions, 32 clubs, 32 stadiums, listed extra rivalries. Division pairs are rivalry strength 1 by rule. |
| `college.json` | Levels table, 10 top-subdivision conferences (138 schools with 2 independents), 13 second-subdivision conferences (128 schools), school and stadium records, rivals (1 to 3 each), density check. |
| `reference-locations.json` | 72 real places with time zone, rounded coordinates, and a climate row citing NOAA NCEI 1991-2020 normals. |
| `blocked-terms.json` | A6.2.2 list (real marks only). PROVISIONAL: compiled by the project, each entry still needs its public-list source logged. |

## Status, stated plainly

- **Climate values.** All 72 reference locations hold NOAA NCEI 1991-2020 monthly normals (mean temperature, total precipitation, snowfall), read on 2026-11-26 from the NCEI Access Data Service (dataset `normals-monthly-1991-2020`), one station per request. Green Bay (USW00014898) was read earlier from the NCEI Summary of Monthly Normals PDF; its values match the Access Data Service row. Every other row carries a `crossCheck` text: the monthly precipitation and snowfall sums equal NCEI's own annual normals (`normals-annualseasonal-1991-2020`) to rounding, and the mean of the twelve monthly temperatures is within 0.6 F of the annual normal. That catches transcription errors but is the same NCEI series, so every row stays at status `Primary source read (1 of 3)` (one independence group).
- **Stations.** Each place uses the first-order airport or city station named in `climate.station` (ids start `USW`). Chicago uses O'Hare and Denver uses Denver-Stapleton, because Chicago Midway and Denver International have no snowfall normal. Seven stations with no snowfall normal at all (Los Angeles, San Diego, San Francisco, Sacramento, Phoenix, New Orleans, Tallahassee) carry `snowIn` of 0 by assumption, with a `snowNote` in the source; this equals the engine rule of no snow without a snowfall normal.
- **Still one source.** A second independent source (for example the NWS or a state climatologist) is not yet read for any place.
- **Coordinates, altitude, time zone** of reference locations are rounded from the named real place (`geoBasis: assumption`); replace from station metadata when the climate fetch runs.
- **Assumptions (named, no real-world number):** second-subdivision conference sizes (T2.1 gives only 128 teams in 13 conferences), school size, academic profile, football history level, stadium capacity and orientation, noise, wind exposure, surface split, market tier, rivalry strengths and extra pairs, club founding years.
- **Density.** School counts per region follow each region's share of 2025 roster home-state players (project file `college_roster_seasons_2010_2026.csv`, one source); conferences are fixed regional clusters so the match is approximate (`densityCheck`; Mountain over by 5, Southeast under by 9).
- **Not shipped here:** the lower-division pool and high school (people pools, G-81), generated people, team strength.
- Names were drawn once from a seeded generator and committed as data; the runtime generator (G-81) reads the same blocked-terms list.

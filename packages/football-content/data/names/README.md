# Names and hometowns (G-18)

Frequency tables for generated people's names and home towns (bible D13.5.1 to D13.5.3). Real names are read at build time and never stored: the tables hold counts per single name, and the collision guard holds one-way hashes.

| File | Holds |
|---|---|
| `first-names.json` | First-name counts of football players by 5-year birth cohort (1945-49 to 2005-09), by region and by international source; plus SSA boys' first names by cohort (public birth table). |
| `surnames.json` | Surname counts of football players by cohort, region and international source; plus the top 5,000 U.S. surnames (2000 Census). |
| `hometowns.json` | 50 states and DC: share of football players, region (the 9 world regions), real towns with player counts and mean coordinates; international countries. |
| `suffixes.json` | Jr., Sr., II to V counts by birth cohort among pro players. |
| `real-name-guard.json` | 40,707 one-way hashes of people playing, coaching or officiating now (D13.5.2). No name is stored. |
| `fact-rows.json` | Q6-shaped rows for every table; status is computed from sources (`computeStatus`). |
| `cross-checks.json`, `build-inputs.json` | Measured agreement between sources; SHA-256 of every input file. |
| `lib.ts` | Pure helpers: `foldToken`, `nameKey`, `guardHash` (cyrb53), `guardSet`, `cumulative`/`drawWeighted`. The only code here that the runtime may import. |
| `build/build-names.ts` | The builder (reads the people pack; not shipped). |

## How the generator should use them (G-81)

- Draw first name and surname independently, never as pairs (D13.5.1). First name: the cohort table for the birth year; weight it by region as `cohortCount x (regionCount / regionTotal) / (allCount / allTotal)`. A table flagged `thin` falls back to the national table.
- Surname: draw from `football` or `census` by the generator's own weight (the football table is real roster frequency, the census table fills the long tail).
- Hometown: draw the state by `shareOfKnownHome`, then a town by `players`. The players outside shipped towns (`players - townPlayers`) are drawn from the state only (generated town from the neighbouring towns, G-81's choice). High schools are invented, never listed here.
- Guard: after a draw, `guardSet(real-name-guard.json.packed).has(guardHash(first, last))` means a real current person; redraw the first name up to 10 times. **Finding:** for Smith, Johnson and Williams, 10 first-name redraws failed about 5 times in 100,000 draws (10 of 200,000), because most common first names already pair with those surnames among real players. The test's reference draw adds a last step, a fresh surname, and clears all of them. D13.5.2 needs that amendment (message sent to the integrator).
- The hash is the D13.5.2 hash set for current people only. The full-pack set (all 24,872 pro and 132,322 college names) is built by G-81 at build time from the pack, with the same `guardHash`.

## Sources and status (nothing filled from memory)

All inputs were read from files on 2026-11-26 and are pinned by SHA-256 in `build-inputs.json`.

| Table | Source | Status (computed) |
|---|---|---|
| Football first names, surnames | people pack: nflverse players register (24,872 pro) and cfbfastR/ESPN rosters (college players not matched to a pro row) | 2 of 3 each: two registers over different people, pooled |
| SSA first names | SSA baby names 1880 to 2008 via github.com/hadley/data-baby-names | 1 of 3 |
| Census surnames | 2000 Census list via github.com/fivethirtyeight/data `most-common-name/surnames.csv` | 1 of 3 |
| State shares, hometowns | cfbfastR/ESPN rosters 2010 to 2026 | 1 of 3 |
| Suffixes | nflverse register | 1 of 3 |
| Region of NJ, DE, NH, RI, ME, WY, HI, AK; construction constants | design choice | Assumption |

Nothing reaches Verified; the test fails if a row claims it. Agreement with outside tables (Spearman rank correlation, recomputed by the test from the shipped files): football surnames vs Census 2000, top 200: 0.83. Pro vs college surnames: 0.92. First names, football vs SSA boys 1980 on: 0.51; pro vs college in the same cohort: 0.56 (1990-94) and 0.65 (1995-99), lower than surnames because first-name fashion moves quickly and a roster name is the name a player uses (Chris, Nick). State players vs 2013 state population: 0.89 over 51 areas. Town players vs 2014 city population (2,273 matched cities): 0.47.

Not done, and why:
- Third sources for the football rows: the SSA and Census files have a different population, so they are comparisons, not confirmations. A second football source would be team staff or recruiting pages, which the build sandbox cannot reach.
- SSA data stops at 2008; younger cohorts use the newest table plus the drift rule (D13.5.1).
- Pro players have no home state in the pack, so region tables use college players only; cohorts before 1990 have national tables only (pro births, no home).
- The Census table is the 2000 list (`pctwhite` and other race columns exist in the source and are deliberately not copied).
- Whether a public birth-name table should replace football rosters for first names (bible D13.5.1 open question): measured above; kept both, the generator chooses.
- Not covered: nicknames, suffix assignment by cohort beyond the counts, international first-name tables for countries under 100 players (they fall into `other_international`), the lawyer's view on real town names (A6.5.1).

## Rebuild

```
curl -sL -o CACHE/baby-names.csv        https://raw.githubusercontent.com/hadley/data-baby-names/master/baby-names.csv
curl -sL -o CACHE/surnames.csv          https://raw.githubusercontent.com/fivethirtyeight/data/master/most-common-name/surnames.csv
curl -sL -o CACHE/state-population.csv  https://raw.githubusercontent.com/jakevdp/data-USstates/master/state-population.csv
curl -sL -o CACHE/2014_us_cities.csv    https://raw.githubusercontent.com/plotly/datasets/master/2014_us_cities.csv
npx tsx packages/football-content/data/names/build/build-names.ts PEOPLE_DIR CACHE
npx vitest run packages/football-content/test/names
```

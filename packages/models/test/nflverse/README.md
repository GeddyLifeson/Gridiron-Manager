# Bootstrap fit from nflverse play-by-play (G-07)

N2.2.1 rule 1 says the shipped expected points and win probability models are fitted to the game's own
simulated football. Until the engine produces training batches (Q area), the models ship a bootstrap fit
to real NFL play-by-play so every reader (N3.3, I5, K4, K5, G8) has working values. When engine batches
exist, `fitEpModel` and `fitWpModel` are run on them and these files are replaced.

Reproduce:

1. Download `play_by_play_2022.csv.gz`, `play_by_play_2023.csv.gz` and `play_by_play_2024.csv.gz` from
   https://github.com/nflverse/nflverse-data/releases/tag/pbp into an empty folder.
2. `python3 -I packages/models/test/nflverse/prepare.py <folder> <folder>/train.csv`
3. `npx tsx packages/models/test/nflverse/fit.ts <folder>/train.csv`

`fit.ts` trains on 2022 and 2023 and holds out 2024. It writes `src/ep/baseline-nflverse.json`,
`src/wp/baseline-nflverse.json` and `report.json` here. `report.test.ts` checks that the shipped files
match the report's hashes and that each comparison number cites a row in `facts/stats-models.json`.

What the report says (2026-11-26 fit), and what it does not:

- In sample, expected points class shares are within 1.4 points of observed in every yard-line decile.
  On the 2024 hold-out the worst decile gap is 7.3 points (own 1 to 10, 837 plays; other deciles 0.8 to
  2.8). Plays in a drive share one next score, so a single season is a small, clustered sample, and the
  2024 dynamic kickoff changed field position. The bible's 1-point check is for 20,000-game engine
  batches; `ep.test.ts` runs it on simulated games.
- Win probability is calibrated in sample (within about 4 points per band). On 2024 it is
  underconfident by up to 9 points in the middle bands: favourites won more often than in 2022-2023, and
  one season is about 270 games. Its Brier score (0.139) is lower than the nflfastR `wp` column on the
  same plays (0.160), but that column has no spread term, so this is not a like-for-like comparison.
- Kickoff values come from 2022-2023 kickoff rules. The 2026 rule set kicks off under different rules, so
  the kickoff state is the least trustworthy number here until an engine refit (N2.2.1 rule 3).
- Comparison numbers are 1 of 3 (one dataset) and print PROVISIONAL in the fact register.

# Decision record score and coaching record (G-95, bible N4)

A score of the user's logged decisions (N3) against the game's own EP and WP models and a fixed reference coach. It scores decisions, never the person; it is shown to the user only and read by no in-world person (N4 header, A3.1.1 rows 8 to 10). No points, XP, traits or stored ability: everything here is computed from the decision log on demand (Marlon's 2026-11-25 ruling).

| File | Bible | What |
| --- | --- | --- |
| `components.ts` | N4.1.1 | The 12 components, their unit, which decision types feed which component |
| `score.ts` | N4.2.1, N4.3.1 rule 6 | `profile()`: credit weights, the loss band, shrinkage, bootstrap range, calibration gate, season aggregates |
| `reference.ts` | N4.2.3 | Reference coach policy: starting go and kick rates, league median after a season, reference loss per decision |
| `roster.ts` | N4.2.2 | Actual result as a percentile of the reference runs, words, 80% range |
| `limits.ts` | N4.5.1 | The limits note with the record's own numbers |
| `record.ts` | N4.4.1, P5.7.2 | Coaching record: conditions, evidence (5 largest losses forced), all credited decisions, the chain with truth views redacted, `verifyRecord` |
| `stats.ts` | N4.2.1 rule 3 | Seeded integer draws (no platform random), shrinkage, bootstrap |
| `params.ts` | | Tuning values with basis and leaf |

The certified flag, copy counter, pack signatures, certified load checks and the record file are in `packages/store/src/certified/`.

## Readings the bible leaves open

- **Scale to 0 to 100.** N4.2.1 gives the unit (value lost per decision, foresight per call) and that the reference scores 50, but no conversion. Each sample is the decision's value minus the reference coach's value in the same situation; the shrunk mean is mapped by `scaleWp` / `scaleEp` / `scaleShare` (assumptions, Q5 to check) and clamped to 0 to 100.
- **Prior.** The prior of N4.2.1 rule 3 is the reference coach (difference 0, score 50).
- **Interval width.** 80%, the same as N4.2.2's roster interval.
- **Close call.** A loss counts only when the N3 class is `clearly_wrong` (interval of the edge excludes zero) and the edge is at least 1.5 WP points.
- **Reference rate for classes other than fourth downs.** N4.2.3 gives rates for fourth downs only; other clear game-management calls use the go rate (the more conservative number) until the league median replaces it.
- **Operation speed.** "Late call" has no cut in N4.1.1; `lateCallTenths` (5 s) is an assumption. Administrative fouls come in as external samples.
- **In-game adjustment.** One sample per game: the call value against the reference caller after the first quarter minus the value in it.
- **Components with no N3 view** (game planning, play design, film, player evaluation, teaching) take `ExternalSample`s from their owners (N1, N3.3.3 follow-ups, G7, G1, H3). Truth-scored ones show season aggregates only.
- **Exported chain.** Truth-view entries are exported as redacted stubs that keep seq, links and hash, so the chain still verifies and no truth leaves the save (P5.7.2).

## Switches waiting on Marlon (off)

- `showHeadline` (N4.1.1 open question: one headline number).
- `exportTrueRosterLine` (N4.1.1, N4.2.2: true-attribute roster line in the export for completed seasons).
- `allowPeoplePack` in store `certified` (P7.4.1: one locked people pack in certified careers).

## Facts

No new football fact is encoded. The calibration gate (0.01), loss band (1.5 points), reference rates (50%, 95%), shrinkage k (50), evidence counts (10 and 5), roster runs and word cuts are the bible's own starting values (Assumptions in N4). The research behind them (nflfastR model notes, Romer 2006, Brill, Yurko and Wyner, Berry and Fowler) is cited and statused in N4 itself; this module only sizes thresholds from it, so nothing here goes into `facts/`. The limits note says the transfer claim is Unverified (Q5).

## Change requests to the integrator

- **CR-G95-1** Header fields `careerId` (string) and `sessionCounter` (int) on `SaveHeader` (P8.1.2). Until then `store/certified/identity.ts` keeps them in a one-row table `certified_identity` in the save file.
- **CR-G95-2** Barrel lines: `export * as rating from './rating/index.ts';` in `packages/models/src/index.ts` and `export * as certified from './certified/index.ts';` in `packages/store/src/index.ts`.
- **CR-G95-3** Register `PARAMS` of `models.rating` and `store.certified` wherever module parameter files are collected.
- **CR-G95-4** Text keys `rating.component.*`, `rating.roster.*`, `rating.limits.*`, `certified.broken.*` in the string table (the English wording of the limits note is in N4.5.1).
- **Owed by others.** The decision log table in the save (CR-G31-1) so `openCertified` can check the stored chain; the reference runs of N4.2.2 (J14); the scenario packs of N4.3.2 (needs N5's scenario format, G-94); work-sample pages of N4.4.2 and the readable report layout (UI).

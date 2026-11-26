# G-20 Development and aging: decisions and open items

Module: `packages/league/src/development/` (bible D7, D8, T8.1, T8.2). Pure core: numbers from
`params.json` (ParamFile, every row `bible` with its leaf or `assumption`) and `tables.json`;
randomness from `RandomStream`s and math from `DeterministicMath` passed in by the caller
(league may not import engine-core, P1.2.1).

## Model in one paragraph

Every attribute moves weekly by D7.1.1 (gap to ceiling x saturating rep term x class rate x
development rate x age x work ethic x teaching x freshness x form, noise 15 percent). Fewer than 5
reps a week decays 0.15 percent a week to a floor of 85 percent of the peak; relearning below the
peak is fast. The body is separate: growth shares by effective age (D8.1.1, T8.1.1) times the aging
physical index (D8.2.1 curves x aging trait + heavy-load bump + noise), spread by the D8.3.1 weights
over drill times, play strength, explosiveness, stamina, durability, arm and leg strength and a
quarterback's mobility. The body shifts those values and lowers the ceiling training works toward;
technique and mental attributes never decline by age. Multi-week spans use the closed form of the
same weekly model, so headless runs are the full model, faster (A3 row 20).

## Decisions

- **G20-1 Hidden keys (W-10).** `dev.rate`, `dev.form`, `aging.trait`, `aging.index`, `aging.yearDelta`,
  `aging.heavyLoad`, `dev.surroundings`, `growth.maturityOffset`, `growth.disposition`, `growth.lateSpurtIn`,
  `growth.adultHeightIn`, `growth.adultWeightLb`, `growth.adult.<test>`, `peak.<attribute>`,
  `body.<attribute or test>`. `drawDevelopmentTraits` draws the parameters for G-17; anything
  missing falls back to neutral values, and adult drill targets are back-solved on first use.
- **G20-2 Speed lives in drill results.** The sim contract has no top-speed attribute; aging slows
  `tests.fortyS` (weight 1.05), `tenSplitS` (1.1), cone and shuttle (1.0) and lowers jumps (1.2).
- **G20-3 ISS per percent.** Converting a percent body change to ISS uses named assumptions from D2
  spreads (play strength 0.5, explosiveness 1.1, stamina, durability and mobility 1.0).
- **G20-4 Aging timing.** Half the yearly change applies at the rollover and one eighth in each of
  the four in-season months (D8.2.1 "one eighth each month in season").
- **G20-5 Exit split.** Choosing to retire is 0 at 27 rising to one third of the measured exit rate
  at 30 (the leaf does not say where the ramp ends). EDGE uses the DL column, long snappers the P column.
- **G20-6 Facet ids.** Work ethic is X1's `work_habits`; `love_of_football` is read if present
  (not in the X1 starting set) and neutral otherwise.

## Bible conflicts met (resolved toward the sourced value; owner to confirm)

1. **D8.1.1 weight table vs its own acceptance.** The table gives 91 to 99 percent from 18 to 22
   (8.8 percent gain); its acceptance and T8.1.1 say 4 to 7 percent. Used 94.5 to 100 percent.
2. **D8.1.1 speed table vs T8.1.1.** The table gives 93 percent at 16 and 97 at 18; T8.1.1 (one
   study, 1 of 3) says the 40 changes 0 to 0.05 s over college. Used 97.5 and 99.2 percent.
3. **D8.1.1 strength vs T8.1.1.** Strength from 18 follows T8.1.1 per group (linemen 18, receivers
   and backs 34 percent over four years, 60 percent in years 1 and 2); other groups 26 (assumption).
4. **T8.2.1 game snaps 3 to 1 vs D7.2.1 1.5.** Neither is sourced; the owning formula leaf D7.2.1
   wins. T8.1.1 itself says "Area D must accept these as D7 parameters (coordinator)".
5. **D7.5.1 "double k" vs its acceptance.** Double k restores only about a fifth of a lost skill in
   4 weeks; the acceptance wants it back near the peak in about 4. `decay.relearnMultiplier` = 20
   (fitted to the acceptance).
6. **D7.4.2 CV 0.3 to 0.5. Ruled by Marlon 2026-11-26: variation is uncapped,** because improvement
   comes down to more than the player. The form term is log-normal (mean 1, 8-week half-life, no
   bounds), the development rate is log-normal (mean 1, no 0.6 to 1.5 clamp), and a yearly
   surroundings multiplier (log-normal, mean 1, drawn at each rollover, hidden key
   `dev.surroundings`) stands for scheme fit, role, health and life around the player. The test now
   checks CV 0.3 to 0.5 (measured 0.38).

## Not here (other packages)

- D8.2.1 calibration against production (EPA, PPR points, sacks by age) needs the engine's
  statistics: WP-26 and Q2 fit the curve table with `deltaByAge` from `calibration.ts`.
- D8.4.1 "not wanted" exits come from K7 roster decisions (G-76); the stability test uses a stand-in.
- D7.6.1 position-change projections need G-17's correlated ceilings and D6 estimates (G-19).

## Requests to the integrator

- Barrel line in `packages/league/src/index.ts`: `export * as development from './development/index.ts';`
- World streams (J13.2.1 rows, owned by the world loop G-81): `development` scoped
  [seasonYear, step, personId] for windows and the rollover, `devTraits` [personId] for
  `drawDevelopmentTraits`.
- Fact rows for the D8.4.1 exit table and the D8.2.1 calibration table (1 of 3, PROVISIONAL), so the
  register prints their status; values are carried in `tables.json` with their source note.

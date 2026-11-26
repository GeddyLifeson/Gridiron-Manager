# G-26 Coach AI profiles: decisions, requests and what is owed

Bible: K2 (K2.1 to K2.7). Code: this folder. Tests: `packages/coach-ai/test/profile/`.

## Decisions
- **D-1 Plain TypeScript, no zod.** `coach-ai` may import only `engine-game`, `models` and `league` (P1.2.1) and no external module, so the record is plain types plus a hand-written strict validator (`validate.ts`).
- **D-2 Draws are injected.** `coach-ai` cannot import `engine-core`. Generation and change take a `Draws` source; an engine-core `Stream` fits it as is. Callers use `worldgen` (generation) and `careerDrift` (between seasons), J13.4.1.
- **D-3 `league`, not `level`.** The profile's competition field is named `league` because K2.7.1 rule 3 and the coaching forbidden-key list ban keys ending in `level`. Likewise the tempo field is `snapAtPlayClockS` (a key ending in `point` is banned).
- **D-4 `offenseRates.neutralPass` added.** K2.1.2 lists motion, play action, shotgun, screen, RPO and deep shot, but K4.3.7 reads "how often he runs" and K2.1.2 must reproduce the neutral pass rate, so the rate is a field.
- **D-5 Neutral pass target is 57.3%** (F-measured-rate-0068, PFF definition, 2 of 3). The 55.2% in K2.1.2 was retired by the J15.3.2 verification pass. The spread (true SD 4.7 points) is from Rk1 under a different definition (WP 20 to 80); used for spread only.
- **D-6 Full system on both sides.** A head coach stores full offense and defense rates with `primarySide`; K2.6.1 rule 3 blending of a preference is done by the reader (K4) with weight 0.3.
- **D-7 Templates centred per side.** Template leans are centred over the templates a person on that side can draw, and the individual draw takes the remaining variance, so each population's mean and SD equal its file. Correlations (K2.2.1 rule 4) are applied to the whole field.
- **D-8 College system rates borrowed.** No college rate is measured yet (T10, T12 owe them): college files use the pro values, every row marked Assumption. College behaviour spread is 1.25 times pro (K2.3.2 rule 5).
- **D-9 Prior calibration here, outcome calibration owed.** The calibration report checks a generated population against its file (whose means are the register values). The simulated league after K4.3.7 and K5 is measured by the batch harness; `tuneMeans` is the loop G-58 and G-59 call with a batch measure. Owed rows are printed by the report.

## Contract requests (to the integrator)
- **CR-G26-1 Where the full profile persists.** `coaching.hidden` (truth map string to number) holds the numeric part (`toHiddenMap`). The string parts (families, playbook, side, role, league), `memory` and `lineage` have no slot. Ask: a truth `coachProfile` component on the person record, or allow structured `hidden`. Until then `restOf()` carries them.
- **CR-G26-2 Barrel.** Add `export * as profile from './profile/index.ts';` to `packages/coach-ai/src/index.ts`.

## Owed elsewhere
- K2.1.2 play-action acceptance (27% to 33% over 2,000 plays) and the K2.3.1 outcome rows: G-58 (K4).
- Fourth-down mix, two-point and timeout rates through `fourthDownOffset` and friends: G-59 (K5).
- K2.3.2 coach-effect band (0.53 to 1.28 wins per 17 games): batch run once K3 to K5 exist.
- K2.5.1 population no-inflation check over 30 seasons needs real entry and exit of coaches: G-81 world loop.
- `ruleRespect` (K2.8.1) belongs to the people module (X1 facet), not here.
- Team-level spreads for every rate other than neutral pass, play action and blitz: research (K2.3.1 open question).

# Coach AI game management (K5, G-59): decisions and what is owed

Built against the engine as it stood on 2026-11-26, before the phase 1 gate. Nothing here is a sourced football fact: every number is a rule key read from the rule set or a row in `params.ts` marked `bible` (a K5 "starting" value) or `assumption`.

## How it is wired

- `coach-ai` may import only `engine-game`, `models` and `league` (P1.2.1), so shapes from `@gm/schema` (decision request, decision, tuning parameter, rule key) are mirrored structurally, as G-26 did with `Draws`.
- The G-71 chart (`models/src/strength`) is not in the `@gm/models` barrel yet (CR-G71-2). It comes in through `ChartPort`; the `strength` module satisfies it as is.
- Everything football reaches K5 through the caller: the scoreboard (`Situation`), the staff's estimates (`StaffEstimates`, the observer-filtered view of K3.2.1 and K9), and valued option lists. K5 never sees a true rating or a true outcome chance. `LogRow.wpTrue` is null here; the game layer fills it (K5.1.1 outputs).
- Draws: every function takes a fixed number of draws from the `Draws` it is given, whatever branch it takes. The caller passes the `coachAI` stream scoped by game, play and decision type (K5.6.1 rule 3).
- `createManagementDecider` answers `toss_call`, `toss_choice`, `overtime_choice`, `penalty_choice`, `runoff_choice`, `try_choice`, `timeout` and `challenge`. Call requests return null: the fourth-down decision is the unit called (J11.6.1), so K4 (G-58) reads `fourthDown`, `twoDownTerritory` and `clockPlan` and builds the call.

## Rulings applied

- A3 ruling 22 (anything possible keeps a chance): `prob.floor` is applied to every choice. Any legal option, a timeout, a challenge of any offered aspect, a kneel, a spike, another clock mode and pulling starters each keep the floor chance, tagged `floor` in the result. Exceptions are things the rule set forbids (a timeout with none left, a challenge of a play that is not reviewable) and resting starters in a game that can change seeding (K5.7.3 acceptance, the coach's own rule).
- This conflicts with two K5 acceptance lines written before the ruling: "No AI team spikes on fourth down in 1,000 simulated seasons" and "No AI team runs a risky play in a state where kneeling wins" (K5.4.3). The sound decision never does either; the floor can. Sent to the bible fixes thread.

## Assumptions (all `assumption` rows in params.ts)

- `challengeEagerness` is a z-score in the profile, but K5.5.2 divides by it. The multiplier used is `exp(0.5 z)`.
- Clock mode (K5.4.1) uses score, time and tendencies as thresholds. The bible asks for a win-probability comparison of time burned against a narrower menu; that needs K4's menu values and is owed with G-58.
- End of half (K5.4.2): "attack" is the model's win probability now; "sit" is the state when the half ends with nothing scored. A reach check (plays left times yards per play against the yards to field goal range) guards it. The seconds and yards per play are unsourced.
- Burn and save start times scale with the number of scores apart. One score is a touchdown plus a two-point try, from rule keys.
- Let the offense score (K5.4.1 rule 6): defense tied or ahead by less than a field goal, offense in range and able to kneel out from a fresh first down.

## Known limits

- The bootstrap win-probability model (G-07) is smooth in score: it does not know that down 1 with 40 seconds left is nearly lost. Late two-point chart cases (down 2 after scoring) therefore show margins of about 2 points instead of 20, and coaches with normal offsets kick. This clears when the model is refitted on engine batches with score-arithmetic terms; reported to the integrator.
- Rare fourth-down options (intentional safety, pooch punt by the field goal unit; K5.2.1 rule 1) are not built: the rule engine does not offer them as options yet.
- Tests use a stand-in for `strength.fourthDownOutcomes` (test/management/helpers.ts): the lint forbids a test reaching into another package's files and the barrel line is owed (CR-G71-2). Swap it for the real function when the barrel lands.
- Thinking time (K5.1.1 rule 7) is returned; comparing it with the request deadline is the caller's job because the decider does not see the play clock run.

## Owed

- Calibration (the plan's acceptance for G-59): fourth-down mix, two-point attempts per game and timeouts per game against their J15 rows, by tuning the K2.3.1 population means with `tuneMeans`. Needs engine batches after the phase 1 gate and the R3.2.1 modern-rate research.
- Integrator: barrel line `export * as management from './management/index.ts'` in `packages/coach-ai/src/index.ts`; `PARAMS` and `RULE_KEYS` into the merged tables; the game-layer `StaffPort` adapter (G-74, G-75).
- G-58: read `fourthDown().unit`, `shortYardage`, `twoDownTerritory()` and `clockPlan()`.
- K6.2.2: the same functions serve the user's staff when he delegates, with that staff member's `CoachInputs`.

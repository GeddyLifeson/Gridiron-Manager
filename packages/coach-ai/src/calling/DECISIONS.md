# G-58 coach AI play calling (bible K4): decisions, deviations and what is owed

Module: `packages/coach-ai/src/calling/`. Tests: `packages/coach-ai/test/calling/` (44, one or more per K4 leaf).

## How it is wired
- `createCaller(setup)` makes one caller per side per game. `call(request)` returns the call, tempo, call time and the K4.3.6 record. `observe(...)` feeds what his booth saw. `adjust('series' | 'halftime', capacity, draws)` is K4.5.3.
- coach-ai may import only engine-game, models and league (P1.2.1), so the sheet, scouting rows, K5 constraint, availability and readiness arrive as plain data (types.ts). A schema `RandomStream` and `DeterministicMath` satisfy `Draws` and `CallMath` structurally.
- Draws come from the `coachAI` stream keyed by game, play, team and decision type (J13.2.1). The caller asks for a kind (`call`, `tempo`, `script`, `timing`, `booth`, `disguise`, `adjust`) and takes a fixed number of draws from each, so no outcome moves another draw.
- Information limit (K9.1.1, K4.4.1): `CallRequest` has no field for the opponent's call, formation, motion, plan or sheet. On defense the caller is told only whether the offense is at tempo. A test pins the field list.
- The matrix game is solved by simplex at plan lock (`lockSheet`) and again only when a candidate list changes in game; solved lists are cached, so there is no solve per snap.
- For K3 plan lock (G-74): `solveMix(a, planned?)` returns one probability per candidate with the 5% floor of the K4.3.1 edge case. G-74 keeps its own sheet shape and converts it to `CallingSheet` for the caller.

## Deviations from the K4 text, with reasons
1. **Nothing possible is ever at zero (A3 ruling 22, newer than K4).** K4.3.5 rule 2 drops calls under 0.4 readiness and K4.5.2 sets tempo to 0 when the clock should run. Here an unready call is cut to 2% of its weight (`readiness.belowCutFactor`) and every legal, available candidate keeps a floor of 0.05% (`mix.possibleFloor`); no-huddle with the clock running keeps 0.1%. A fake the coordinator rates as losing keeps only that floor. The K4.3.5 acceptance (under 1% of calls) still holds in the test. Rule-based stops stay hard: an unavailable or illegal call, a K5 constraint, and going fast during a substitution.
2. **A caller can leave his script** on any snap at 3% (`script.departShare`), for the same ruling. The 80% acceptance holds.
3. **Injury to a personnel group**: K4.1.1 says renormalise the stored mix, K4.3.1 rule 2 says re-solve. The code re-solves once and caches it.
4. **K4.3.7 pass lean** is loaded from the measured table (pass-lean.json, research Rk1, status 1 of 3, pro only) as cell minus the tied cell of the same quarter. The leaf's "zero within one score" does not match that table in the fourth quarter (about +3 and -10 points); the table is used as measured. College uses the same table until college is measured.
5. **Play action, screens and deep shots** are leaned inside the pass game only (their K2.1.2 rates are shares of dropbacks or attempts), so they do not move the pass share.
6. **K4.2.2 neighbours**: buckets that share the play's down get the half count. Sheet boxes carry no personnel yet, so the "same personnel" half is not applied.
7. **K4.1.2**: `callFit` shortens the surprise delay (2.5 s at z = 0, 1.25 s per z). `clockManagement` is left to K5.5.1 (timeout or delay). Call length in words is relay time, which J5 owns.
8. **Clock boxes** hold win probability, so the tilt temperature is scaled by `tilt.clockBoxScale` (0.03, Assumption).
9. **Overtime** reads the fourth-quarter lean row (Assumption).

## Not verified, flagged
- Every constant in params.ts is a K4 starting value or a named Assumption. None is triple verified.
- pass-lean.json: 1 of 3 (one source, nflverse 2022-24).
- Not run here: league-mode acceptance rows (J15 pass rate, play action, no-huddle, snap point on the play clock, fake and onside rates, K4.5.3 second-half improvement, K4.3.3 rank correlation across a league) and the 5 ms per game budget on the reference machine. They need real sheets from G-74 and the phase 1 gate.

## Owed to the integrator
- CR-G58-1: barrel line `export * as calling from './calling/index.ts';` in `packages/coach-ai/src/index.ts`.
- CR-G58-2: `coachAi.calling` PARAMS in the merged parameter table.
- CR-G58-3: a `Decider` built on `createCaller`. It must live where @gm/schema may be imported (headless or app-services), or `schema` must be added to coach-ai's `mayImport`. It maps `DecisionView.situation` to `CallSituation`, a `SheetCall` to an `OffenseCall` or `DefenseCall` by content id, and feeds `observe` from the team's own charting (G-66 `chartGame`).
- CR-G58-4: `DecisionView` does not show the defense which personnel ran on (K4.4.1 rule 1), nor whether the offense is at tempo. Same gap the chart caller reported.
- CR-G58-5: a decision-log row type for the K4.3.6 call record (N3, truth class).

## Owed by other modules
- G-74 (K3): build `CallingSheet` from the G-68 sheet, with payoff estimates per box, script length by `preparation`, sequence packages and contingencies, and call `lockSheet` at plan lock.
- G-59 (K5): hand the `ManagementConstraint`, pick among `tacticalFoulCandidates`, and decide timeout or delay when the call is late.
- K2.8.2 violation decision (not built yet): `considerConductAct` takes it as a port.
- G-86 (Q4): the dominant-call search of K4.7.1.

# G-74 Coach AI preparation: decisions, requests and what is owed

Bible: K3 (K3.1 to K3.7). Code: this folder. Tests: `packages/coach-ai/test/preparation/`.

## What this module is

One AI staff's week as a pure function: scouting report, matchup table, payoff estimates, game plan, call sheets with a stored mix per box, practice split. `prepareTeamWeek` runs the steps in K3 order; `prepareLeagueWeek` runs every team in team-id order. A team's result depends only on its own input and its own streams.

## Information limits (K9.1.1, the observer rule)

- The scouting report reads rows of the shared tendency store (G-66) and nothing else about the opponent. `ScoutingInput` has no field for a plan, sheet, practice script or install state, so there is no path for them.
- Player data enters only as `StaffGrade` (a D6 estimate: mean and SD). No function here takes a true attribute.
- The planning-reps port is told a call id, a look class and a rep count. It cannot be handed opposing players by this module; the implementation must stage reps on the staff's estimates (K3.3.1 rule 3).
- Opponent grades are requested with the list of games the staff actually charted, so the adapter can limit evidence to that film (K3.2.1 rule 2).

## Decisions

- **D-1 Ports, not imports.** `coach-ai` may import only `engine-game`, `models` and `league` (P1.2.1). The plan and sheet schemas (G-68, `football-content`), the D6 estimates (G-19, `people`), the mix solver (G-58, not merged), readiness and rep yield (G-64, not merged), the practice object (G-65, not merged) and scenario-mode reps (J14.6.1) all arrive through typed inputs: `PriorTable`, `PlanningReps`, `MixSolver`, `ClockPayoff`, `grades`, `contestExpectation`, `repsToReady`, `readiness`, `PracticeBudget`.
- **D-2 Same machinery as the user.** Windows, relevance weights, breakdown jobs by staff hours, charting error, tendency tables, tells and unscouted looks are the G-66 functions the user's screens use, called with the AI staff's quality. Nothing is re-implemented.
- **D-3 Linear z mapping.** K3 gives each depth as a range "by `preparation`" with no curve. Each range is mapped linearly between z = -2 and z = +2 and held beyond (`z.low`, `z.high`, Assumption rows). Splits follow the leaf exactly (one per 0.75 z above -1.5).
- **D-4 Tell chance.** K3.1.1 rule 4 says 10% to 60% "by `evaluation` and hours spent". Chance = 10% + 50 points x evaluation share x hours share, hours full at 4 (Assumption). It is never zero.
- **D-5 Look classes.** Default look of an opposing defensive snap is its charted coverage family with pressure marked; of an opposing offensive snap, its charted concept tag. Both can be replaced per unit (`lookOf`). The prior table must answer the class `other` for every concept family: merged and unseen looks fall there.
- **D-6 Payoff sign.** A table holds payoffs from the planner's side. Matchup edges favour the offense when positive, so a defensive call takes the opposite sign.
- **D-7 Reps budget.** Reps go to the short list (plan size) by value, most common looks first, whole cells only, until the weekly cap (3,000) is reached across offense, defense and special teams together.
- **D-8 New calls.** A call is "new" when the staff's readiness estimate is under the installed line (0.60, G5.1.1 as quoted in G7.8.1). New calls are limited by depth (0 to 8) times the week's practice share, so a short week carries fewer. Wrinkles are the new calls that do best against a look a strong tendency row names. Installed calls not on last week's menu fill the rest without limit.
- **D-9 System balance.** K2's system rates are the menu's balance target (K2 `SYSTEM_RATE_READERS` names K3.4.1). The caller passes groups and targets (`Balance`); offense uses run and pass from `neutralPass`, defense pressure and base from `blitz`.
- **D-10 Uncovered situations.** With coverage c, the rarest situations that have a parent box lose their own box first (lowest expected snaps, G7.2.3). Base boxes are always kept, so K4.1.1 always finds a parent.
- **D-11 Planned snaps.** Practice needs planned usage before game day. The sheet is built and solved, then each call's planned snaps = box expected snaps (plus uncovered children) x stored mix. Practice reads that.
- **D-12 Practice split only.** This module decides reps per call for starters and backups. Periods, players and resolution belong to H3 (G-65) and G5 (G-64), the same code path as the user (K3.5.1 rule 6). A week goes past its limits only when the input names a logged violation (K2.8.2, L8.2.5).
- **D-13 Streams.** Three streams per team and week: `scouting`, `payoffNoise`, `planningReps`. The caller scopes each by season, week and team (K3.6.1 rule 5).

## Contract requests (to the integrator)

- **CR-G74-1 Barrels.** Add `export * as preparation from './preparation/index.ts';` to `packages/coach-ai/src/index.ts`. This PR also adds the line `export * as tendencies from './tendencies/index.ts';` to `packages/models/src/index.ts`, because the module cannot compile without it; it is the same line the integrator branch carries, so take the integrator's copy on conflict.
- **CR-G74-2 Plan and sheet adapters.** `AiGamePlan` and `AiSheet` are structural copies of the G6 plan and G7.1.1 sheet. When G-68 lands, a one-to-one adapter in the world package turns them into the stored objects and runs the G6 and G7 schema validation (K3.4.1 and K3.4.2 acceptance: "validates against the schema the user's plans use"). `sheetProblems` covers the structural half today.
- **CR-G74-3 Stream row.** J13.2.1 needs a world stream for weekly preparation (suggested name `coachPrep`, scope season, week, team, step). The tests use that name.
- **CR-G74-4 Parameter table.** Add `coachAi.preparation` (`PARAMS`) to the merged parameter table.
- **CR-G74-5 Wiring.** The week runner (G-87) builds `TeamWeekInput` per AI team after the weekly commit: store rows through the film exchange (H2.6.1), staff hours, D6 grades, playbook content as `CallOption`, the G7.2.2 catalogue with G7.2.3 expected snaps, the concept prior table, the scenario-mode reps runner, the K4.3.1 solver, the practice budget.
- **CR-G74-6 Profile schema (MA-60).** The coach profile schema gains `tendencies.veteranBias`, `tendencies.backupRepShare` and `tendencies.emphasis.{takeaway,tackleAttack,rushLanes,cornerJump}`, all hidden-map keys. Code and generator are in this PR (`profile/`); the `@gm/schema` side is the integrator's.
- **Owed after PR 138 (G-58) merges.** `toCallingSheet(aiSheet)` in this folder: the caller reads `CallingSheet`, not `AiSheet`. `MixSolver` is `(m) => solveMix(m.a)`. `BucketMatrix.counts` is the `scout` input of `createCaller`.
- **Owed after PR 143 (G-75) merges.** An adapter from its `WorkOrder` to `PrepDepth`, plugged in at `PreparationPort.build`.

## Owed elsewhere

- **K4.3.1 solver (G-58).** `MixSolver` takes a `BucketMatrix` (candidates, looks, `a`, `uncertainty`, `shares`, `payoffIn`) and returns one probability per candidate, floor included. Tests here use an even mix.
- **Concept prior table (content build, J14.6.1).** Not built yet. `PriorTable` is its reader.
- **K3.2.1 acceptance "error SD falls as `evaluation` rises".** That is a property of the D6 update (G-19, `people.scouting.update` with `skillOf`), which builds the grades this module reads. It is tested there; here the test shows the table cannot move without a change in estimates.
- **K3.3.1 acceptance "within 0.03 of the engine".** Shown here against a stand-in reps runner; the real check needs the engine's scenario mode.
- **K3.5.1 acceptance "identical readiness for AI and user".** Holds by construction (no AI-only path); the equality test belongs with the resolver in G-64 and G-65.
- **K3.6.1 "1 and 16 workers".** Order independence is tested here; the worker harness is G-87.
- **K3.7.1 acceptance (new system, lower early readiness).** Needs G-64 and a season run (G-87).
- **Q3.2.5 (IN-1, IN-2, TD-1, TD-2).** Battery items run in the Q3 runner (G-87) once K4 and the engine play real games. This module supplies their inputs: over-planning leaves the last calls short of reps (IN-2), and an AI staff only knows a tendency it charted (TD-1).

## Reported to the bible thread

- Resolved by MA-60 (K2.1.3 rule 4, all Assumptions): `tendencies.veteranBias` (ISS per five pro years or two college years, mean 1.0, sd 1.0, -2 to +4) feeds `depthChart`; `tendencies.backupRepShare` (mean 0.18, sd 0.05, 0.05 to 0.35) is the backup share in `allocatePractice`, with the K3.5.1 health-risk term added on top; `tendencies.emphasis` (takeaway, tackleAttack, rushLanes, cornerJump; mean 0, sd 0.35, -1 to +1) is carried on the plan. The profile draws these six after every earlier draw, so profiles generated before MA-60 keep all their other values. The hidden map gains six keys; the schema side goes through the integrator (CR-G74-6).
- K3.4.1 rule 3 gives new-call counts but no rule for how many wrinkles a staff adds at which depth. One above z = 0, two above z = 1 (Assumption).

# G-75 Staff AI on the user's team and simulating his week: decisions, requests and what is owed

Bible: K6.1 to K6.4 and K6.6 (K6.5 "the boss above the user" is G-78, `src/boss/`). Code: this folder. Tests: `packages/coach-ai/test/staff/`.

## What is here
| File | Leaf | What it does |
| --- | --- | --- |
| `owners.ts` | K2.6.1, K6.1.1 | One owner per duty: the holder, else the X8 succession order, else the head coach. |
| `instructions.ts` | K6.1.2 | Standing instructions as data (forbid, require, mandate, reserve), specificity, the conflict list for the pre-lock review. |
| `decider.ts` | K6.1.1, K6.1.2, K6.4.1 rule 1, J11.6.1, I2.6.4 | The team's `Decider`: the user where he kept a duty, the staff member holding it otherwise, overrides with their time cost, reserved decisions, the default order. |
| `advice.ts` | K6.2.1, K6.2.2 | Headset lines (suggestions, recognition reports with the reporter's error and delay) and the advisor's line. |
| `work.ts` | K6.3.1, L4.3.5 | Hours, load, the work order a K3 procedure runs with, late and thin products, charting error, own-player bias. |
| `candor.ts` | K6.3.2, L4.3.3 | Whether a staff member voices a disagreement. |
| `simulate.ts` | K6.4.1 rules 2 and 3, J14.4.2 | Who does each of the head coach's weekly tasks when he advances; the block resolver for the league week. |
| `violations.ts` | K6.6.1 | Unasked violations, proposals, and requests, over the one K2.8.2 procedure in `league.compliance`. |
| `ports.ts` | K6.1.1 rule 1 | What K6 asks of K4 (G-58), K5 (G-59) and K3 (G-74). |

## Decisions
- **D-1 Ports, not copies.** K6 adds no football judgment. A delegated caller is K4 run with his profile, a delegated game manager is K5 run with his, a work product is K3 run with his parameters. G-58, G-59 and G-74 were being built at the same time, so this module states what it needs as `CallerPort`, `ManagerPort` and `PreparationPort` and takes them as inputs. The tests use labelled stand-ins.
- **D-2 Contract types read off the game flow.** `coach-ai` may import `engine-game`, `models` and `league`, not `schema` (P1.2.1). `contract.ts` derives `Decider`, `DecisionView`, `Decision` and the call types from `flow.simulateGame`'s signature, so they are the contract's own types. Request CR-G75-2 would let this be a plain import.
- **D-3 The fourth-down decision is two decisions.** J11.6.1 expresses it as the unit called. Here the holder of `game_management` picks the unit (`ManagerPort.lastDown`), then the offense or special-teams caller makes the call. A head coach who delegated the offense and kept game management is asked through `UserSeat.lastDown` (I2.6.4 edge case).
- **D-4 No answer is ever invented for the user.** While his prompt is up the decider returns null (the flow stops). Only when the shell says the deadline passed does the J11.6.1 order run: standing instruction, then the staff member next in line, then the conservative default. The core reads no clock (J13.3.2).
- **D-5 Same result watched or simulated.** Every draw is keyed by game, request and person, never by call order, and the override hook is the only thing a watching head coach adds. With no override, "simulate to end" and "watch with everything delegated" give the same state hash (tested).
- **D-6 Instructions on calls are a conjunction.** A call must pass every instruction in force. When no call can (two instructions contradict), the least specific is dropped and the row says which (K6.1.2 "the more specific one wins"). The K6 check re-tests the caller's answer, so a caller that ignores its filter still cannot get a forbidden call through (tested over 100 games).
- **D-7 Candor is a chance, not a line.** K6.3.2 states `gap x candorFactor x safety > threshold`. Marlon's ruling of 2026-11-25 21:32 (anything possible keeps a chance) is applied: p = x / (x + threshold). At the threshold he speaks half the time. Only a zero gap, or a second headset push in one series (L4.3.3), gives zero. Mislabel and late chances are likewise capped below 1 and floored above 0.
- **D-8 No exponential.** `coach-ai` cannot reach the engine's deterministic `exp`, and platform `Math.exp` is banned in core (P1.1.1). Every curve here is linear in the z-score over the design range (z of -3 to +3) or a ratio.
- **D-9 Head-coach-only tasks are an input.** K6.4.1 names one (a one-on-one with a player). Which other weekly tasks only the head coach can hold (media sessions under H7, for one) is for the owning leaves; `staffBlockResolver` takes the list.
- **D-10 Week block shape stated locally.** The league barrel does not export `week` yet (CR-G69-2). `WeekBlock` holds the three fields read; a `week.Block` fits it and the returned resolver fits `week.BlockResolver`.
- **D-11 An AI team runs the same code.** With `userId` null the decider credits decisions to `ai` people and has no reserved decisions or overrides. K3.4.1 says AI head coaches instruct their staffs the same way.

## Not verified facts
Nothing in `params.json` is a real-world fact. Every row is a bible starting value (most of which the bible itself marks Assumption) or an assumption of this module, named as such with its leaf. The football statements in K6 ("head coaches delegate play calling", "booth coaches relay coverage") are marked Unverified in the bible and no number here rests on them.

## Contract requests (to the integrator)
- **CR-G75-1 Barrel.** Add `export * as staff from './staff/index.ts';` to `packages/coach-ai/src/index.ts`.
- **CR-G75-2 Contract types for coach-ai.** Either add `schema` to coach-ai's may-import list (P1.2.1 table and `package-map.json`), or have `engine-game` re-export the contract namespace. Until then `contract.ts` derives the types.
- **CR-G75-3 PARAMS.** Register `coachAi.staff` (`PARAMS`) in the parameter table.
- **CR-G75-4 Engine fault found.** Every game that reaches overtime throws `(overtime_toss, toss) overtime start answered kickoff with no restart after the toss` on `main` plus PR 107, with any decider (13 of 100 placeholder games with silent deciders). The whole-game tests here pass over exactly that error and count it.
- **CR-G75-5 Streams.** The decider and advice draw from `coachAI` scoped `[gameId, requestId, personId, tag]`; candor, work and violations take a stream from the caller (`coachAI` or `conduct`). No new stream name is needed.

## Owed elsewhere
- **K6.1.1 acceptance (higher `callFit` raises expected points over 200 games):** needs the real K4. The test here proves the caller's own `callFit` reaches the port. The 200-game run belongs with G-58's batch.
- **K6.2.2 acceptance (perfect analyst equals the model; error tags at the staff member's rate):** K5.1.1 and K5.6.1 are G-59's; this module passes the acting person and returns the tag on the row.
- **K6.2.1 rule 2 belief counts:** reports here use the observation plus the reporter's error. Once G-58's belief tracking exists a report can read his counts (same error model, K4.2.2 rule 3).
- **K6.5 the boss:** G-78.
- **Whole-game tests need PR 107's rule keys.** On `main` before that merge they are skipped with a stated reason; with PR 107 merged locally all 43 tests pass.
- **N3 rows.** `StaffDecisionRow` is the feed (`decidedBy`, basis, instructions, error tag). app-services maps it onto `models.decisions` records (attribution basis `delegated`).

## Adapter notes from the K4 and K5 owners (2026-11-26)

No adapter is written yet; these land after PR 138 (calling) and PR 139 (management) merge.

- K4 `createCaller(setup).call(request)` returns a sheet call id, `callTimeS` and a record. The adapter builds the call object from the content id and converts `callTimeS` to play clock tenths. `ctx.permits` maps to `request.constraint.allows`.
- K4 asks for draws by kind (call, tempo, script, timing, booth, disguise, adjust). The adapter must key the last draw scope field by that kind, not the single 'call' tag.
- K4 has no side-effect-free preview yet, so `CallerPort.suggest` is owed by G-58.
- K5 `fourthDown` returns unit 'offense' | 'field_goal' | 'punt' ('offense' is 'go' here) and has no allowed-units filter: filter after, or call `decide()` with only the allowed options.
- K5 functions return `thinkingS`, not play clock tenths. Call them directly: `createManagementDecider` drops `errorId`.
- K5 `modelLine(options, habit)` is the advisor line; the generic line is the weekly chart with `coach.advisor` false.

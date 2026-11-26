# @gm/world

Kind: core. Owns: World generation, the history run, the week and season runner, the off-screen loop. Bible categories: X10, X12. May import (P1.2.1): every other core package. As a core package it obeys P1.1.1: no wall clock, file system, network, display, locale, platform random or platform transcendental math; all randomness comes from `@gm/engine-core` streams.

Status: G-81 adds two modules and G-82 a third. They are not in the package entry point yet (the integrator adds the barrel lines); tests import the module indexes.

- `src/generation/` (X10.1, X10.2, X10.4, U4.1): the setup record and world code, structures (competitions, conferences, places, teams, venues, resource bands, rivals), founding people and cultures, placement of imported people and of the user.
- `src/tiers/` (X13, P6.4): who is near the user (tiers 1 to 3 for teams, people and games), what is recorded for them, moves between tiers with the demotion hold, the no-seam checks, and the measurement protocol.
- `src/loop/` (X10.3, X12.1, X12.3): the weekly and season-point passes in one fixed order, the history run and its validator, leaving football, the cohort step, stop points and time control.

The loop owns the order, the dates, the streams, the event log and the pass hash. Each system is a port in `WorldSystems`. A step with no owner bound is `unbound(reason)` and is listed by `unboundSteps`, so a run can never pass off an unwired step as done. Games go through `GamePort`, which the integrator binds to the real engine; the request type has no lighter method (A3 row 20).

## Tiers (G-82)

Marlon's ruling (A3.1.1 row 20): no lighter simulation anywhere. A tier chooses what is recorded (film kept or re-simulable) and how a game is run (shown, or headless and first in a long advance). It never chooses how anything is resolved. `policyProblems` fails if any simulated system differs by tier, and `configProblems` refuses every measurement step that would lighten the simulation.

Three things in the X13 leaf are not built because they contradict the ruling. They were sent to the bible fixes thread:
- X13.1.2 table: stress, memory, edges, development, injuries and AI calling thinned at tiers 2 and 3. Here they run the same at every tier.
- X13.2.1 seeded fill-in on promotion. Nothing is dropped at a lower tier, so there is nothing to fill in; a move changes the tier only.
- X13.3.1 rule 2 thinning order items 3 to 5 (short memory, weekly stress, full engine for the other level).

Wiring owed by the composition root: pass `TIER_EVENT_TYPES` to `createWorld`; call `recomputeTiers` between passes at the X13.1.1 rule 5 points with a `TierInputs` built from the schedule, boards, X7 edges, X6 memory and the K7 market slice; keep `TierState` in the save (`tierRows` gives the schema `TierRow`s). The timed measurement run needs a clock, so its runner belongs in `packages/headless` and hands its numbers to `buildReport` and `chooseShipping`. No measurement has been taken yet, so every line in `tiers/params.ts` is a starting value (X13.3.1 rule 6).

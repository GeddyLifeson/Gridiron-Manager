# @gm/world

Kind: core. Owns: World generation, the history run, the week and season runner, the off-screen loop. Bible categories: X10, X12. May import (P1.2.1): every other core package. As a core package it obeys P1.1.1: no wall clock, file system, network, display, locale, platform random or platform transcendental math; all randomness comes from `@gm/engine-core` streams.

Status: G-81 adds two modules. They are not in the package entry point yet (the integrator adds the barrel lines); tests import the module indexes.

- `src/generation/` (X10.1, X10.2, X10.4, U4.1): the setup record and world code, structures (competitions, conferences, places, teams, venues, resource bands, rivals), founding people and cultures, placement of imported people and of the user.
- `src/loop/` (X10.3, X12.1, X12.3): the weekly and season-point passes in one fixed order, the history run and its validator, leaving football, the cohort step, stop points and time control.

The loop owns the order, the dates, the streams, the event log and the pass hash. Each system is a port in `WorldSystems`. A step with no owner bound is `unbound(reason)` and is listed by `unboundSteps`, so a run can never pass off an unwired step as done. Games go through `GamePort`, which the integrator binds to the real engine; the request type has no lighter method (A3 row 20).

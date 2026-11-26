# G-62 game-day frame: decisions and owed requests

Leaves: I1 (pregame), I8 (halftime), I10 (postgame); screens O2. Core is pure (P1.1.1): draws come in as `() => number`,
rule values come in a `GameDayRules` object read from rule keys (`RULE_KEYS` in params.ts), tuning values are
`PARAMS` rows with basis `bible` (value stated in the leaf) or `assumption` (named, to be researched or tuned).

## Choices
- I1.1.1 "time advances": doing a task spends its cost from the attention budget and moves the clock; a deadline
  that passes with the task open hands it to the default owner (delegated) or marks it missed with the default used.
- Crew heads-up deadline: no leaf states it; set as assumption `pregame.crewAlertDeadline`. Bible note owed.
- Halftime working minutes = halftime length minus walk off and walk back (assumption values, I8.2.1).
- Uptake words come from the teaching coach's estimate, never the truth (I8.1.4); views carry words only.
- Postgame talk shows a fit band, never the morale number; first notes stay private (I10.6.1).
- Skipping the news conference produces a `media_policy` breakable act for G-28 compliance.
- Every real-world number is a rule key (rulebook sourced) or a named assumption; no unsourced constants.

## Owed to the integrator
- Barrels: career `export * as gameday from './gameday/index.ts'`; app-services `gameFrame` read model and
  commands; app-ui `gameFrame` screens and `gameFrameRoutes` in the route table.
- Schemas: move `packages/app-services/test/game-frame/proposed-schemas.ts` into `@gm/schema` and register specs.
- New rule keys: toss.minutes_before_kickoff (3), toss.field_presence_minutes (10), toss.late_field_penalty_yd (15),
  replay.challenge_designee_allowed, league.officiating_review.max_plays (9), comm.c2p_designated_offense (3),
  comm.c2p_designated_defense (3), field.end_zone_depth_yd (10). Until they land the caller passes them in rules.
- Shell: startGame jumps straight to /game/console, so game.pregame is not reachable before kickoff and
  game.halftime is not reached at the half. The game-day route flow should open on pregame and visit halftime.
- Structural types in app-services/app-ui become imports from `@gm/career` once the barrel line lands.

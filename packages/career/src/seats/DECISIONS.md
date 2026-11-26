# G-79 game day below head coach: decisions and owed requests

Leaves: S5.1.1 to S5.5.1, O7.4.1, O7.4.2. Core is pure (P1.1.1): draws come in as `() => number`, rule values come
in a `SeatRules` object read from rule keys (`RULE_KEYS` in params.ts), tuning values are `PARAMS` rows with basis
`bible` (the leaf states the number, as a tuning knob) or `assumption` (named here, to be researched or tuned).

## What is where
- `sheet.ts` S5.1.1: roles, default role by job, `buildSheet` (headsets by role rank up to the cap; the rest by hand
  signal and runner with a delay), `checkSheet` (one role per seat, cap), headset failure.
- `channels.ts` S5.1.1, O7.4.2: channel messages with delay, the head coach's channel pick (logged for N3), the booth
  line and the queue; lower seats have one fixed channel.
- `sideline.ts` S5.2.1 substitution (12 men: foul or burned timeout; 10 men; wrong player; college late-half clock
  reset), AI error rate; S5.2.2 corrections list from true causes plus decoys, effect scaled by composure and by the
  way given against the learning style (AI: K6 teaching), crowding, hesitancy, window closing, the one-line report.
- `booth.ts` S5.3.1 grading by family tree and time, disguise (pre-snap against the shown shell), tempo family-only,
  AI booth answers from K2 recognition, caller weighting by trust times running accuracy, caller reading. S5.3.2
  chart accuracy, personnel relay, departure flags (binomial test in squares, no root), tendency table for I8.
- `advice.ts` S5.3.3 prompt timers, delivery only before the timer, AI follow chance.
- `coordinator.ts` S5.4.1 intervention budget and plan (one per series, 50/20/30, answered-ahead drops the
  decision), menu narrowing, compliance and trust cost, taking play calling away.
- `record.ts` S5.5.1 role records, role report (family shares after 10 events, median speed, advice matched beside
  worked out), season lines after 3 games, simulated estimates excluded from certified mode.
- `layout.ts` O7.4.1 lower panel and view by seat; only a user caller's seat holds the game.
- `game.ts` a full game from one seat; doing nothing never stops the game; standing rules mark records simulated.
- app-services `read-models/seats` (live seat view without truth; role report view), `commands/seats` (seat
  commands, refusal without the S5.1.1 right). app-ui `screens/seats` (`SeatPanel`, `RoleReportPanel`).

## Choices (assumptions)
- A-G79-1 Strength staff have a sideline seat in the catalogue but no S5.1.1 role, so they are left off the sheet.
- A-G79-2 Default roles: offensive QC = booth coverage; defensive QC = booth personnel for the defensive staff;
  special teams QC and graduate assistants = charter; student assistants = signaler; student managers = get-back;
  assistant position coaches = personnel caller; rung 6 run game and co-coordinators sit with their group;
  a rung 7 coordinator without `calls_plays` feeds the caller (S5.4.1). S5.1.1 says which title sits where varies.
- A-G79-3 Headset priority when the college cap binds: head coach, callers, booth and analyst, personnel caller,
  position coaches, charter, signaler, get-back.
- A-G79-4 "More than one score" = more than 8 points.
- A-G79-5 Ignoring an instruction: the bible's 2 or 5 trust is scaled by ego from 0.5 to 1.5 (the leaf says the cost
  depends on ego but gives no form). The head coach takes calling away after 3 ignored instructions in a game.
- A-G79-6 S5.3.1 acceptance 2 ("an AI caller given 90% accurate reports calls measurably better") is tested at the
  belief the caller forms (`callerReading`); the calls themselves belong to K4 (coach-ai) once it reads these beliefs.
- A-G79-7 The other numbers marked `assumption` in params.ts (AI accuracy curves, delays, correction sizes).

## Owed to the integrator
- CR-G79-1 Barrels: career `export * as seats from './seats/index.ts'`; app-services `seats` read models and
  commands; app-ui `screens/seats`. Structural types in app-services and app-ui become imports once these land.
- CR-G79-2 Rule keys (requested): `comm.headsets_max` (college 23, rule 1-4-12-b, Rulebook only; pro: no key = no
  cap), `comm.headset_failure_both_off` (pro true per I7; college unchecked, S5.1.1 open question),
  `sub.late_half_twelve_clock_reset` (college rule 3-5-3-b, 2 of 3). Until they land the caller passes them.
- CR-G79-3 Screens: the game console (G-60) shows `SeatPanel` in its lower region when the user's seat is not a
  caller (a `lower` slot beside the existing `sideline` slot), passing the call sheet for a caller seat; the postgame
  screen (G-62) shows `RoleReportPanel`. Seat commands bind through the session (G-60 `GameCallingSession`).
- CR-G79-4 Schemas: SeatView and RoleReportView into `@gm/schema` with visibility classes; the live view is
  `observed` only (index rule 9), the role report is film-visible after the game.
- CR-G79-5 K4/K5 read booth reports through `reportWeight` and game-management advice through `followChance`.

## Bible notes owed
- S5.1.1 lists no role for strength staff; O7.4.1 lists a signaller only "at levels without helmet radio".

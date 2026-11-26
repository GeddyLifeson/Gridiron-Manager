# G-24 Relationships and culture

Two modules in `@gm/people`, both pure core (no clock, platform random or transcendental math).

- `relationships/`: X7 edges (creation from shared events, fit, growth and decay, promises, vouching),
  X7.3 unit cohesion counts that feed D9.5.1, and the L2.1 locker-room graph (ties, rooms, cliques, influence).
- `culture/`: X9 culture records (generation, decider blend, reader table, drift, expectations) and L2.4.1
  culture strength.

Every number is a row in the module's `PARAMS` file with its leaf and `basis` (`bible` starting value or
`assumption`). The only real-world fact near this code (offensive line continuity, X7.3.1) is Unverified,
so the X7.3.2 contest effect ships at zero (`cohesion.contest.shipped` = 0).

## How the acceptance line is met

- **Edges grow and decay from fit and shared history only.** `createTie` refuses a tie without a basis
  event except `family` and `prior` (X7.1.1). Growth is memory strength x 0.1 x (1 + 0.5 fit); decay is
  time since contact. Fit is 0 and no pair term is drawn for the user, imported or protected people.
- **Culture drift per X9.3.1.** `seasonEndDrift` implements the four-step procedure; tests cover the
  8-season vs 1-season case, the tradition 100 vs 0 rate, and the 5 percent of range cap.
- **Unit cohesion feeds D9.5.** `CohesionLedger` counts game snaps and practice reps per unit pair;
  `d95Inputs` hands D9.5.1 the raw counts and last date together, so the knowledge package applies its own
  weights and curve.

## Decisions made here (Assumption, flagged)

1. Each person keeps his own side of every tie, also for non-directional kinds, because memories are per
   person (X6.1.1). `toEdgeRows` writes one G-00 `RelationshipEdge` row per stored side, holder first.
2. Fit closeness (0 to 1) maps to -1..+1 as 2c - 1. Friction amounts 0.3 (two egos), 0.2 (candor), 0.2
   (risk gap of 40 or more); "high" is 70, "low" 30.
3. Sign: a negative event that leaves a side under 15 turns it cold; a broken promise always does
   (X7.2.3 acceptance). A cold side thaws to neutral at 40 and a neutral side warms at 50, through
   first-hand positive events only. Time never changes a sign.
4. Words: close at 60 or more, working at 30, distant below, cold by sign.
5. Minimum weeks together for a tie: 2 (X7.1.1 edge case says one week is not enough).
6. Being on one staff or roster is contact all season: pass `togetherFrom` (the season's first day).
7. X7.3.2 curve is snaps / (snaps + h), h set so 800 snaps give 90 percent of the cap.
8. L2.1.1 fit ceiling for weekly drift: 50 + 40 x fit.
9. X9.2.1 ratchet carries forward as a running offset on the baseline (`Expectation.ratchet`).
10. X9.3.1 implied patience when a coach who missed the target is kept: at least his season number.
11. X9.5.1 generation ranges by level and resource band are content in `culture/record.ts`.
12. Postseason goal ids come from the caller (league-rules content) so the code never branches on a level.

## Requests owed

To the integrator (schema, barrel): CR-G24-1 to CR-G24-5, listed in the PR description.
To the bible fixes thread: the X7.3.1 / D9.5.1 practice weight and decay conflict, the L2.1.1 storage
budget, the L2.1.1 agent and region terms, and the X9.2.1 ratchet wording.

# long-run (G-88)

The 30-season run and stability checks: Q1.6.1, Q1.6.2, Q1.6.4, and the P6.1.1 20-season advance.

- `runLongRun({ target })` advances a world pass by pass, checks the Q1.2.2 invariants at every week boundary
  (each failure names the invariant, the pass and the state hash before it), records save size and time per
  season, reads the Q1.6.4 yearly series, and scans for Q1.6.2 protected events, text and invented family.
- `runStabilitySuite({ seeds, makeTarget, cores })` runs the seed set and gives the release verdict:
  completion, zero invariant failures, 90 minutes on 16 cores, save under 1 GB, zero protection hits, no drift.
- `measureAdvance(target, seasons)` times the 20-season advance (or projects it from fewer seasons) against
  60 minutes. Its note names the game port, so a test-double time is never mistaken for an engine time.
- `loopTarget(world, systems, schedule, loop, eventType)` wraps the G-81 loop. This package does not import
  `@gm/world`; the composition root passes the loop namespace in.

What is not checked yet is reported, never passed: `NOT_CHECKED` (depth chart, money, labels, in-game clock)
and `UNAVAILABLE` (starters, snaps, player leaders, career records, money). Every drift tolerance is an
Assumption until the Q1.6.4 research on real year-to-year variation lands. The save size uses
`canonicalBytes`, a stand-in, until G-83's retention save is bound through `sizeOf`.

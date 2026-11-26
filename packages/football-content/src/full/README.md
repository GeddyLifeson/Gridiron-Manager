# Full content set (WP-25)

The v1 play and coverage set: the 12 starter plays and 8 starter calls (WP-15) plus the additions here, in the same shapes. Entry: `src/full/index.ts` (`FULL`, `FULL_PLAYS`, `FULL_DEFENSE`, `ALL_FORMATIONS`, `ALL_SOURCES`, `assignmentsOf`).

## What is in it
- Runs (`offense-run.ts`): wide zone, split zone, duo, power, counter, iso, buck sweep, dart.
- Dropback and quick passes (`offense-pass.ts`): slant-flat, curl-flat, snag, smash, sail, mesh, shallow cross, dagger, Yankee, post-wheel, Mills.
- Play action, movement, screens, RPO, quarterback run (`offense-pa.ts`): naked bootleg, leak, pop pass, tunnel screen, bubble screen, glance RPO, power read.
- Defensive calls (`defense.ts`): Cover 1 robber, Cover 3 flipped safeties, Cover 3 fire zone, Cover 3 fire 3 simulated pressure, Cover 4 palms, nickel Cover 1, nickel Cover 4, dime Cover 2, 3-4 Cover 3.
- One formation (`formations.ts`): 12 personnel singleback. Everything else uses the starter formations.

## Rules it follows
- Same conventions as the starter set: authored lateral is right-positive and flipped once by `toAssignment`; every play is drawn to the right.
- Every play and call lists `basis` rows with a status word and source ids (`sources.ts`). The test checks the status word against the number of independence groups, and that each play or call rests on two or more groups.
- A claim that a source does not give is marked Assumption. Disagreements between sources are marked Conflict and list each source. Numbers that no source gives (splits, depths, box counts) are design values.
- No outcome numbers and no forbidden keys: the data goes through the same forbidden-key lint as the starter set.

## What the sources are and are not
- Run, pass, play-action, screen and RPO pages were read on 2026-11-26 by the scheme-sources research thread; each source's citation names the research file and letter. The coverage and nickel pages were read for this work package the same day.
- Primary books and playbooks (Walsh, Coryell, Erhardt-Perkins, Air Raid) and paywalled clinic pages were not reached. Items resting on one group say "1 of 3".
- Cover 3 Sky and Cloud are named by one source (Ruley) that gives no assignments, so they are not authored as calls. The nickel pages name no yard depths.

## Not in the set yet (deferred)
Option plays (triple, midline, inside veer), trap and wham, pin-and-pull, bunch and empty formations, Cover 3 match, quarters variants beyond palms, and goal-line, short-yardage and prevent packages. Each needs sources read first.

## Owed to the integrator
Barrel line `export * as full` in `packages/football-content/src/index.ts`, and PARAMS if the integrator wants them. This package owns no schema change.

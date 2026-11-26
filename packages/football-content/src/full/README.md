# Full content set (WP-25)

The v1 play and coverage set: the 12 starter plays and 8 starter calls (WP-15) plus the additions here, in the same shapes. Entry: `src/full/index.ts` (`FULL`, `FULL_PLAYS`, `FULL_DEFENSE`, `ALL_FORMATIONS`, `ALL_SOURCES`, `assignmentsOf`).

## What is in it
- Runs (`offense-run.ts`): wide zone, split zone, duo, power, counter, iso, buck sweep, dart.
- Dropback and quick passes (`offense-pass.ts`): slant-flat, curl-flat, snag, smash, sail, mesh, shallow cross, dagger, Yankee, post-wheel, Mills.
- Play action, movement, screens, RPO, quarterback run (`offense-pa.ts`): naked bootleg, leak, pop pass, tunnel screen, bubble screen, glance RPO, power read.
- Defensive calls (`defense.ts`): Cover 1 robber, Cover 3 flipped safeties, Cover 3 fire zone, Cover 3 fire 3 simulated pressure, Cover 4 palms, nickel Cover 1, nickel Cover 4, dime Cover 2, 3-4 Cover 3.
- Formations (`formations.ts`): 12 personnel singleback, flexbone (30), gun trips bunch right, gun empty 3x2 and goal line 23. Everything else uses the starter formations.
- Deferred items added in the follow-up (`offense-more.ts`, `defense-more.ts`, sources in `sources-more.ts`, research notes in `research/scheme-sources/deferred-plays-and-packages.md`): inside veer (triple option), midline, trap, wham, pin and pull, bunch trail, empty stick, goal-line power; Cover 3 Sky (safety to the flat), Cover 3 Cloud (corner to the flat), Cover 3 match, goal line 6-5, prevent.

## Rules it follows
- Same conventions as the starter set: authored lateral is right-positive and flipped once by `toAssignment`; every play is drawn to the right.
- Every play and call lists `basis` rows with a status word and source ids (`sources.ts`). The test checks the status word against the number of independence groups, and that each play or call rests on two or more groups.
- A claim that a source does not give is marked Assumption. Disagreements between sources are marked Conflict and list each source. Numbers that no source gives (splits, depths, box counts) are design values.
- No outcome numbers and no forbidden keys: the data goes through the same forbidden-key lint as the starter set.

## What the sources are and are not
- Run, pass, play-action, screen and RPO pages were read on 2026-11-26 by the scheme-sources research thread; each source's citation names the research file and letter. The coverage and nickel pages were read for this work package the same day.
- Primary books and playbooks (Walsh, Coryell, Erhardt-Perkins, Air Raid) and paywalled clinic pages were not reached. Items resting on one group say "1 of 3".
- Cover 3 Sky and Cloud were first named by one source (Ruley) with no assignments; the follow-up found assignments in Bowen, FantasyPoints and X's O's Football, so both are now authored (Sky 2 of 3, Cloud Verified). The nickel pages name no yard depths.
- The follow-up pages were read through text fetches; several were cut or paywalled (X&O Labs trap and goal-line pages, the FirstDown goal-line teaser, Football Film Room bunch), and those are cited only for what was read.

## Not in the set yet (deferred)
- A separate short-yardage defensive front: the pages read give goal-line fronts (6-5, 6-2, 5-3) only, so short yardage outside the goal line is not authored.
- Speed option and a zone-read triple: no page read gives their assignments.
- Quarters variants beyond palms.
- Thin spots in what is authored, each marked in its basis rows: the flexbone alignment of the slotbacks, the back-side split end on the veer, the midline slotbacks, the trap play-side guard, the bunch spacing (Conflict across three sources), the empty two-receiver side, and the prevent's depths (one source, which calls it "cover 4" while describing thirds).

## Owed to the integrator
Barrel line `export * as full` in `packages/football-content/src/index.ts`, and PARAMS if the integrator wants them. This package owns no schema change.

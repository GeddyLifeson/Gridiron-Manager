# Starter content (WP-15)

Formations, twelve offensive base plays (one per `OffensePlayKind`) and eight defensive calls (one per `CoverageFamily`), each as eleven `Assignment`s the WP-10 language compiles with no error finding. Entry: `src/starter/index.ts` (`STARTER`, `assignmentsOf`, `formationSvg`, `SOURCES`).

- Authored lateral values are right-positive (G1.1.1); `toAssignment` negates them once into the play frame (D-11).
- Every play and call lists `basis` rows: the claim, its status word (A5.2.1) and the source ids in `sources.ts`. Tests check that Verified means three independence groups, "2 of 3" at least two, "1 of 3" exactly one, and that every play rests on two or more groups. Kneel and spike are rule book facts and say "Rulebook only".
- Values no source gives (splits, backfield depths, box counts, linebacker depths) are marked Assumption. Conflicts between sources (inside zone aiming point, stick depth, screen sell time, closed-middle seam) are stored as coach settings and marked Conflict.
- Tampa 2 stands in for `CoverageFamily` `other`; it has no J15.8.1 row of its own and the integrator may fold it into Cover 2.
- Defensive alignment rule names (`lineTech:<n>:<side>`, `rcv:<n>:<side>:<yd>:<leverage>`, `hash:<yd>:<yd>`, `lb:<over|gap>:<name>`) are read by WP-14. Technique numbers follow F8.1.1.
- Formation images: `data/starter/formations/*.svg`, rebuilt by `npx tsx packages/football-content/test/starter/build-images.ts`; a test fails when they drift.

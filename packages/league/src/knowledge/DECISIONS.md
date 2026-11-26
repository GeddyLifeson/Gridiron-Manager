# G-64 Scheme knowledge and install: decisions and open points

Implements D9.1 to D9.6 and G5.1 to G5.5. Every number is in `params.json` with its leaf; D9 says no
project research measures learning or cohesion, so nearly all are Assumptions (`status: starting`). Two
rows are the module author's own choice (`basis: assumption`): `gain.attentionAfter` (G5.1.2 says
attention falls after 45 minutes, no size) and `install.overLimitYield` (G5.2.1 says yield falls sharply
over the daily limit, no size). Install counts in G5.2.1 lean on research rows F14.5.1 (AJ, AK, AL), each
1 of 3, in `research/scheme-sources/systems-and-families.md`.

## Readings taken
- Decay is multiplicative on the value, clamped at the floor (60 percent of peak, 85 for families). That is
  the reading that meets the D9.3.1 acceptance (90 unused 8 weeks is about 80); decaying only the part above
  the floor gives about 86.
- Decay is a closed form of days since the last touch, so the book needs no daily tick.
- Gain is applied unit by unit in closed form; a block of n units equals n single units.
- Any teaching event on an item counts as a review (resets the timer, restores up to 5, never past peak).
  With this the D9.3.1 return case (review plus two full-speed reps) lands at about 90.
- Difficulty 1 to 5 maps linearly onto the D9.4.1 factor 0.6 to 1.6. The assignment's difficulty is its
  hardest item for the position.
- Opponent preparation's recognition bonus scales linearly with preparation knowledge up to 20 percent.

## Contradictions raised with the bible thread
1. Readiness formula: D9.6.1 says the minimum estimated knowledge of the slated players; G5.4.1 says the mean
   minus half the gap between mean and lowest. Both are computed; the flag uses D9.6.1's minimum.
2. Teaching yields: D9.2.1 bases are per 5 minutes (meeting 2.0, film 1.5, walk-through rep 3.0, full-speed
   rep 5.0); G5.1.2 gives per-minute yields (meeting 1.0, walk-through 1.5, rep 4.0, test 0.5). D9.2.1 is used
   because D9 owns the knowledge model.
3. G5.1.2 written test or teach-back yield is not in D9.2.1's mode list; the test is modelled only as an
   estimate-error reduction (G5.4.1).

## Dependencies
- G-12 calendar (merged): absolute day numbers and `DAYS_PER_WEEK`.
- G-24 relationships (merged): pair counts come from `people/src/relationships` `d95Inputs`; league may not
  import people, so `PairCounts` restates the shape.
- Persisted shape of `KnowledgeRow` is to be registered in `packages/schema` by the schema integrator; the
  barrel line in `packages/league/src/index.ts` (`export * as knowledge`) by the exports integrator.

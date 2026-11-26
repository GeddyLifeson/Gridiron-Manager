# Injury catalogue (G-21, D11.2.1 and D11.7.1)

| File | Holds |
|---|---|
| `catalogue.json` | 28 rows: region, body part, mechanisms, severity class, grades, recovery range (games, days or months with its basis), share not returning that season, lasting effects pointer, re-injury pointer, fact ids. |
| `facts.json` | 34 fact rows (`F-injury-cat-NNNN`, domain `medical`) in the Q6 row format. Status is computed from sources by the test, never typed. |

## Status, stated plainly

- 12 report-level rows plus ribs, elbow, hand, toe, illness and the all-other fallback take games missed (median, mean, p25 to p75, share not returning) from the project's nflverse analysis (one source, 2012-2025). Status `1 of 3` each; the hamstring and concussion rows have a second source.
- Specific diagnoses (high ankle, MCL, ACL, Achilles, patellar tendon, Lisfranc, turf toe, pectoral, hand and wrist) cite published studies. High ankle (3 groups) is `Verified`. The rest are `2 of 3` or `1 of 3`. Rows from the earlier research file were read through summarizing tools; only the pectoral, hamstring grade 2, MCL and hand and wrist studies were re-read this session. Recheck the others against the papers before they count as Verified.
- Cramp, heat illness and illness spread are `Assumption` (D11.7.1: no NFL rate found). Re-injury and lasting loss are pointers (`reinjury.value` null) until D11.6 and D8.3.2 are sourced.
- Not found, left to the all-other row: fractures other than hand, wrist, rib as a diagnosis, hamstring grade 1 and 3 times, concussion median days.
- The college MCL and hand and wrist studies and the soccer MCL study are other populations; the notes say so.
- Integrator ruling (2026-11-26): the game reads THIS set for recovery time (games missed after the first Out is what D11.2.1 asks for). `facts/injury.json` (G-10) measures something else from the same nflverse data, the number of consecutive weekly report listings, and is for the injury report model (H5) only. Neither replaces the other, and a listing count must never be read as games missed. These fact rows move into `facts/` once the register lint can compute `usedBy` for content tables.

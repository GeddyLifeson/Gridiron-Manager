# career/positions (G-25)

Positions as data, the job catalogue, and succession. Bible: X8, S1.1, S1.2, L4.1.

- `catalogue.json`: every job (S1.1.1 fields) at rungs 0 to 9, college and pro (S1.1.2, S1.1.3, E2.1.1), with starting seat counts. Rung 0 rows are outside every staff. Strength staff, bosses and the college general manager are off the ladder (`rung: null`).
- `positions.json`: the X8.1.1 definitions (contract `PositionDefinition`) plus role group, cascade kind, reporting rule (S1.2.1) and delegable tasks (L4.1.1 `controls`).
- `staff.ts`: generate a staff by resource band (X8.1.2), reporting lines, off-campus flags under the S1.2.2 limit, limit breaches (warnings only), the chart query, `JobRecord` rows.
- `delegation.ts`: one owner per delegable task; empty chairs push tasks up to the head coach; play callers per side (L4.1.2).
- `succession.ts`: the X8.1.1 grammar with eligibility and tie-breaks, interim naming (X8.3.1), absent play caller (X8.3.2).
- `cascade.ts`: the firing cascade (X8.4.1) and vacancy filling with promotion chains (X8.4.2).
- `params.ts`: starting values (all Assumption in the bible). `keys.ts`: S1.2.2 rule keys (requested, CR-G25-2).

No real-world number is typed here: staff limits come from rule keys; X8.4.3 turnover rates are calibration bands owned by the soak.

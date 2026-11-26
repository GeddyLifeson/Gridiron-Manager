# Crisis catalogue (G-32, L9.2, L9.4, L9.5)

| File | Holds |
|---|---|
| `catalogue.json` | 16 crisis types, one per leaf of L9.2.1 to L9.2.10, L9.4.1 to L9.4.4 and L9.5.1 to L9.5.2: levels, guard class (L9.1.2), subject limits, cause events, hazard parameters, severity, stages with clocks and who knows at each stage, the acts offered, and the template keys. Also the pacing rule (L9.1.1) and the early-warning values (L9.1.3). |
| `acts.json` | The 13 response acts of L9.3.1, each with one owning system and one event, no currency, no grade; plus the three rule-breaking responses that run through L8.2.5 with a warning. |
| `facts.json` | 16 fact rows (`F-crisis-NNNN`) in the Q6 row format. Status is computed from sources by the test, never typed. |

Every number in the catalogue sits in a `params` entry, a stage `clock`, a `severity` range or class share, or the `pacing` and `warning` blocks, and each cites a fact row. The test walks the whole file to enforce it.

## Status, stated plainly

- **Sourced from research, not yet Verified.** The yearly arrest rate (2.9 percent per player-season, 2000 to 2014) computes `2 of 3`: the research file calls it 3 of 3, but two of its three sources draw on the same database, so the register counts two independence groups. The violent share (27 percent) is `1 of 3`. The NCAA major-case rate (2 to 4 percent, midpoint 3 percent) is `2 of 3` with unverified denominators. The 12-month case length is `1 of 3`. All were read through the project research file `research/audit-r-historical-rates.md`, not re-opened in this package's session.
- **Assumption.** Every other number (pacing, severity ranges, hazing and family hazards, illness spread, thresholds, suspension lengths, stage clocks) is a named Assumption exactly as the bible marks it. The coach-DUI rate is kept as an Assumption because the research file reads it as a floor from case lists with no denominator.
- **Open research, no value shipped.** The league policy-draw rate for suspensions (L9.2.2). The row says so in `hazard.openResearch` and opens only from a serious or grave off-field outcome until it is researched.
- **Rule data, not here.** The transfer window dates (L9.4.1) and the academic standard (L9.4.2) are read from rule data by key (`college.transfer_window`, `college.academic_standard`); this folder holds no copy.

## Rules the tests hold

- Personal-class crises have generated adult subjects only; imported people get football-class crises only (L9.1.2). Only off-field incidents and family emergencies need no cause event (L9.1.1).
- No crisis score, meter or currency exists; no act is graded (L9.3.1).
- No cause of death anywhere. Retired generated people get a death notice with age and years of life only (`news.person_died`).

## Not done here

- No code reads these files yet. The crisis engine (G-50) and the week (G-69) load them. The integrator decides how the package exports them.

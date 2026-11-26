# College (G-37): eligibility, transfers, player pay, the college player

Bible: T5 (roster, eligibility clock, academics, time limits), T6 (transfers), T7 (pay), T8.3 to T8.5 (class load, roles by class, leaving for the draft).

| File | What | Bible |
|---|---|---|
| `keys.ts` | `RULE_KEYS`, `collegeRules(rs)`, cap by year (`revenueShareCapFor`) | all |
| `eligibility.ts` | seasons and age models, better-of-both from 2026, redshirt watch, sat-out chance | T5.2.1, T5.2.2, T6.3.2 |
| `academic.ts` | term checks, fall rule, team academic rate, term projection, weekly load | T5.3.1, T8.3.1 |
| `transfer.ts` | window and exceptions (entry refused outside), entry chance (hidden), staff read in words, placement, bands | T6.1 to T6.4 |
| `pay.ts` | football budget, AD split, sheet (excess refused), market value, clearinghouse, agreements | T7.1 to T7.3 |
| `draft.ts` | early entry (3 years), deadline, declare ends eligibility, stay-or-go, opt-outs | T8.5.1, T8.5.2 |
| `planning.ts` | declaration-date count (refused over the limit), class grid, departures | T5.1.1, T5.1.2, T8.4.1 |
| `violations.ts` | acts handed to compliance (G-28): academic help, ineligible player, false medical retirement, tampering, outside amount promise, staff NIL donation, unreported deal, forced voluntary work | T5.1.2, T5.3.2, T5.4.1, T6.4.1, T7.2.1, T7.4.1 |

Rules the league itself rejects are refused (entry outside a window, a roster over the limit on the declaration date, school payments over the budget, a late draft declaration). Everything else that breaks a rule is offered once with the warning and goes through `compliance.commitAct`. Imported real people are never subjects or actors of disputes, academic events or acts (X14).

Randomness comes from a caller-supplied J13 stream (`Stream`); the module never draws on its own. Numbers live in `params.json` (tuning, with leaf and basis) and `units.json` (arithmetic constants), because league source holds no literal other than 0 and 1.

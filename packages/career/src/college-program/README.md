# college-program (G-38)

College program, staff and boosters: bible T9.1 to T9.4, T9.6 and L5.4. T9.5 (violations, detection,
penalties) is the league compliance pipeline (G-28); this module hands it acts and never blocks one.

| File | Leaf | What it does |
| --- | --- | --- |
| `bosses.ts` | T9.1.1, L5.4.1, L5.4.2 | College power default and variant odds; AD answers (granted, deferred, refused) with a reason code and an exchange history; interim AD defers large requests; president backing formula, board threshold, involvement chance |
| `budget.ts` | T9.2.1 | Opening budget by tier, next-year total from results and giving, coach moves only between his lines, AD grants, mid-year cut freezes seats, disassociated money leaves; lines always sum to the total |
| `facilities.ts` | T9.2.2 | Grades, decay, projects of 1 to 3 years, effect the season after completion, small local effects, no indoor field |
| `boosters.ts` | T9.3.1, L5.4.3, L5.4.6 | Groups, mood (results, rivalry weight, access with diminishing returns, refusals, embarrassment by ties), giving, buyout funding up to 50%, booster payments as `pay_rules` acts, the coach's answer to a booster offer, disassociation |
| `staff.ts` | T9.4.1 | Seat limits from rule keys; warn once a season, one violation row per over-limit hire, never blocked; pay never exceeds the pool; AI split of the staff pool |
| `pay.ts`, `pay-bands.json` | T9.6.1 | Salary bands by role and tier, inflated from 2025 |
| `rules.ts` | S1.2.2 | `RULE_KEYS`: `staff.*_limit` (values come from rule data with fact rows) |
| `facts.json` | T9.6.1, T9.4.1 | Real-world pay and staff-size numbers; status computed, PROVISIONAL unless Verified |
| `params.json` | all | Design values, basis `bible` or `assumption` |

Open requests: CR-G38-1 (proposed zod schemas in `test/college-program/proposed-schemas.ts`), CR-G38-2
(barrel line `export * as collegeProgram from './college-program/index.ts'`), CR-G38-3 (violation class
`staff_seat_limit` for graduate assistant, strength, student assistant and headset seats), and the five
`staff.*_limit` rule values with fact rows.

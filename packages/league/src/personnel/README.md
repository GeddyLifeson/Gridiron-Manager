# Roster needs, pro scouting, camp and cutdown (G-57)

Bible: M1 (roster philosophy and needs), M3 (pro scouting), M6 (training camp and cutdown), and D6.3 (role label and flags, deferred here by G-19).

Every grade in this module is a club estimate (`Graded`: ISS mean and variance) passed in by the caller. `league` may not import `people` (P1.2.1), so callers pass G-19 output (`scouting.roleGrade`, `scouting.project`, board estimates) in that structural shape. Nothing here reads a true rating; the engine never reads fit (M1.2.1 rule 3).

## Files

| File | Leaves |
| --- | --- |
| `keys.ts` | camp work rules by key (C11.2.2, M6.1.1 rule 4, M6.2.4 rule 1, college edge case) |
| `params.ts`, `params.json` | every tuning number, each with its leaf and basis |
| `defaults.json`, `flags.json` | design tables: starting 53, tier cuts and shares, contact multipliers, staff calendar, flag raise and clear rules |
| `fit.ts` | M1.1.1 priority tiers, M1.2.1 fit, M1.2.2 versatility |
| `needs.ts` | M1.3.1 template, M1.4.1 needs board, M1.4.2 depth risk, M1.4.3 future need, M1.5.1 memo |
| `board.ts` | M3.1.1 coverage plan, queue and board rows; M3.1.2 colour tiers |
| `ready.ts` | M3.2.1 ready list; M3.3.1 workouts |
| `wire.ts` | M3.4.1 wire review; M3.5.1 practice squad targets and poach risk; M6.4.4 claim risk |
| `report.ts` | M3.6.1 report; M3.6.2 voice; M3.6.3 medical and conduct |
| `roles.ts` | D6.3.1 role labels; D6.3.2 flags |
| `camp.ts` | M6.1.1 camp checker and staff calendar; M6.1.2 install schedule |
| `practice.ts` | M6.2.1 to M6.2.4 camp practice; M6.5.1 report day; M6.5.2 mock game |
| `preseason.ts` | M6.3.1 snap plan; M6.3.2 show and hide; M6.3.3 preseason film |
| `cutdown.ts` | M6.4.1 board (files through the G-15 roster engine); M6.4.2 meetings; M6.4.3 releases; M6.4.4 claims |

## Decisions

- **P-57-1 No-grade attributes.** An attribute with no estimate counts at ISS 50 with variance 144 (12 squared, G-19 S-02's no-information reading). The public estimate is shown with at least that variance (M3.1.1 rule 6).
- **P-57-2 Unsized terms in M1.4.** "Count shortfall penalty" is 10 ISS per missing player; depth-risk drop-off adds 0.5 ISS per D9 knowledge point lost. Both assumptions.
- **P-57-3 Staff calendar.** The M6.1.1 rule 5 calendar (games on days 24, 31, 38, opener day 47) has 15 padded practices and 9 days off: the least that satisfies the day-off-every-7, post-game and four-after-the-last-game rules together under this reading. The acceptance line says "8 days off"; the test checks at least 8. Sent to the bible-fixes thread. Facility hours per day type are assumptions inside the 11 then 10 hour limits.
- **P-57-4 Ready list.** Conditioning floor 0.8, unfamiliar-terminology cost 20 percent, flexibility bonus 5 percent per extra job: assumptions; QB double weight and 2 percent weekly decay are the bible's.
- **P-57-5 Workout noise.** Small, small, moderate and little are read as 3, 3, 8 and 20 ISS sd; the mean update itself belongs to G-19 (`narrowed` only shows the band).
- **P-57-6 Wire, poach and claim risk.** One tier-step = 10 ISS (D6.2.1 tiers); claim chance per club ahead, acceptance and risk curves are assumptions. The true acceptance chance (`acceptChance`) is world side; screens get words only.
- **P-57-7 Contact and camp life.** "Thud improves technique partly" = half; medical read thresholds, fight chances, unfit exposure 1.3 and mock-game gain are assumptions.
- **P-57-8 Preseason and board.** Series for "a quarter" and "a half" are 3 and 6; the cut line sits midway between the last kept and first cut grade at a row; mixed lineups interpolate the unit weights.
- **P-57-9 Voice and relationships.** Voice success bases (0.2, 0.45, 0.7) scaled by relationship, standing costs, overrule and release-day trust and reputation are assumptions until L4, L5 and E5 own them.
- **P-57-10 Flags.** Raise and clear rules are data (`flags.json`). Effort is the bible's own rule; medical follows its example ("second hamstring strain in 10 months"); the rest are assumptions. Character flags (off-field, coachability) are never raised on a real person; a real person's medical and durability flags need injuries from inside the simulation.

## Not here

- Fit and labels need F14 system jobs and F1 package roles from content; callers pass job and role lists.
- Scout noise draws, evaluator lean and the D6.1.1 mean update stay in G-19 (`scouting.observe`). This module outputs evidence descriptors and bands.
- K7 (G-76) makes the AI clubs' decisions with these tools; L5 supplies approval values.

## Requests

- Integrator: barrel line `export * as personnel from './personnel/index.ts';` in `packages/league/src/index.ts`.
- G-10 and the integrator: the NEW keys in `keys.ts` (each names its leaf and value). Tests use `test/personnel/fixtures/camp-*.json` until then.

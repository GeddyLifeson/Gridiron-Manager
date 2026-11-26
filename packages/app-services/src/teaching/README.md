# Coaching school and teaching (G-94)

Bible: N5.1, N5.3 to N5.6 (N5.2 glossary links belong to G-93). Screen: `packages/app-ui/src/screens/school/`.

## What is here
- `curriculum.ts`, `data/curriculum.json`: the 15 courses of N5.1.1 rule 1 and 41 lessons. A lesson points at bible leaves, starter content ids (each with its own sourced `basis`) and A4.5 glossary term ids. It never restates football. `validateCurriculum` checks every reference.
- `data/glossary-snapshot.json`: id, computed status and source count of the 77 A4.5 rows the curriculum names, from `research/glossary/final/glossary-terms.jsonl` (2026-11-26). The test re-checks it against that file when the project folder is reachable. Replaced by G-93 `content/glossary/*.json`. Terms below Verified (24 of 77) are flagged on the lesson card.
- `grading.ts`: N5.1.2 scoring (band, partial credit, zero beyond 3 WP points or 0.5 EP, late timed answer is a delay of game), pack checks, seeded retake draws, lesson states (pass 70, mastered 90 on two different draws), course state, placement.
- `drills.ts`: call deadline from the radio cut-off (N5.3.1), session summaries, recognition scoring with the post-snap-only rule and the weak-area mix (N5.3.2), protection scoring with several sound answers (N5.3.4), kneel-down arithmetic from rule values (N5.3.3), problem filters.
- `film.ts`: G-63 film room hookup. Clip truth comes from the defensive call. Lesson clips use the film filter and show both sides' assignments only for a `school` viewer (N5.1.2 rule 6). Grading patterns are aggregate only (N5.4.1 rule 7).
- `picker.ts`: the work-on card (N5.4.1), improvement, duty offers made once (N5.5.1, G-55 duty ids), "why" answers from stored reason codes (N5.6.1).
- `views.ts`: curriculum map and development page for the screen.
- `params.ts`: every "starting" number of N5 as a tuning row. Three are module-author assumptions (kneel play length, snap margin, reasons per answer).

## Not yet sourced or not yet built (flagged)
- The course order is N5.1.1's "coaching convention" fact, which is still Unverified in the bible.
- Shell labels: Cover 0 and single-high are Verified rows; two-high is 2 of 3.
- No scenario pack is solved yet, so no lesson can be passed. Packs need engine runs across 200 seeds per answer (N5.1.2 rule 1). The map says "graded test coming".
- Kneel acceptance (1,000 problems equal to engine simulation) needs the engine kneel play. The arithmetic uses two assumption parameters until then.
- The call-speed situation generator ("weighted like real drives") and the protection answer computation (F5 through J4) are injected; neither exists yet.
- Reason codes for "why": the K-area AI decision record does not store them yet.

## Owed to the integrator
- CR-G94-1: barrel line `export * as teaching from './teaching/index.ts'` in app-services, re-export of the school screen from app-ui, and a save table for school records (lesson attempts, drill sessions, term-seen counts, offered duties, shown cards). Nothing in the career reads it.
- CR-G94-2: rule key for the two-minute stop reading (`clock.two_minute_mark_s`, 120 at both levels). Until then `TWO_MINUTE_MARK_S` in `rules.ts`.
- Register `PARAMS` and `RULE_KEYS` in the merged tables.

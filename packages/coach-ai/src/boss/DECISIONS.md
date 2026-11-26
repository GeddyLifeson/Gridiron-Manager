# G-78 the boss and evaluations: decisions

Bible: S4 (all leaves), K6.5.1, K6.5.2. Plan row G-78. Built 2026-11-26.

## Contract choices
1. **Facets come from the caller.** S4.1.1 calls `standards`, `delegation`, `ego`, `loyalty_to_staff`, `hours_culture`, `detail_focus` and `beliefs` "K2 fields", but the K2 profile (G-26, `profile/types.ts`) holds none of them; they are X1 facets. Like `staff/` (`StaffFacets`), this module takes them as `BossFacets` passed in from the people module. `teaching` and `evaluation` are read from the K2 behaviour block. Reported to the bible-fixes thread.
2. **No import of career.** coach-ai may not import career (P1.2.1). `DutySeen`, `SubmissionSeen` and `Judge` are structural subsets of the ladder's `DutyDef`, `Submission` and `BossJudge`; `judgeFor(boss, draws)` is assignable to `BossJudge` (checked with tsc against `career/src/ladder/perform.ts`). The world runner wires it into `performDuties`.
3. **Nothing knows who the user is** (K6.5.2). No function takes an is-user flag; the paired-run test shows identical trust paths for the user and an AI assistant with identical outputs.
4. **The boss sees only the page** (K6.5.1 rule 2). `visibleSections` scores what a real boss can see: filled fields, missed reps, findings against his beliefs, signals that went wrong on the field. Snap grades and advice carry no section he can check, so he gives the neutral mark (`judge_neutral`).
5. **Chances keep a floor** (MA-52): change of mind, going around, noticing quiet defiance, late requests, come-with-me and suggestion acceptance all pass through `chance()`. Threshold rules the bible states as rules (promotion at trust 75, release after two seasons below the floor) stay rules; noise enters through the boss's perception error.
6. **Evaluation is reproducible.** Area = mean of the boss's view (`bossScore` else the counted score) per duty family; overall weighted by `detail_focus` family weights; blame drift after a losing season fades to zero at trust 75. The only draw is the departed-boss memory noise.
7. **Mixed grades** weigh truth and boss parts equally in `gradeRecord`, matching the ladder's default.

## Numbers
Every constant is in `params.json` with its leaf. All are design values (S4 marks its rules Assumption); none is a real-world fact, so no fact rows are needed. The S4.5.1 facts (internal promotion share, support-staff promotions) are calibration context for the world run, not inputs here.

## Not built here
- K6.5.1 rule 5 (head coach taking play calling away, L4.1.2) belongs with seats (G-79).
- S4.5.1 acceptance (a third of rung 4 to 7 hires come from the head coach's previous staff) needs world simulations (G-81); `comeWithMeChance` is the lever.
- Reputation application (E5), contract changes (E3) and job market entry (S6) consume this module's outputs.

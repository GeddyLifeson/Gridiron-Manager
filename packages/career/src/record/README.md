# career/src/record (G-54): coaching skills record

Bible: E9 (all leaves), S8 (all leaves). The user's coach holds **no skill value of any kind**: no scale,
tree, XP, level, points, or picked trait (Marlon's ruling of 2026-11-25 22:02 UTC). This module holds what
he has demonstrated, as event references and history facts, and computes every view of it when shown.

| File | Leaf | What it does |
|------|------|--------------|
| `families.ts` | E9.1.1, E9.5.1, S3.1.1, S8.1.1 | The six evidence families; the 18 S3.1.1 duty families and the duty-to-evidence map; families and the family 1 scope each seat can produce |
| `events.ts` | E9.1.1, X2.1.2 | One evidence event type per family plus `record_history_fact`, the payload contract, the evidence map (type to family, actor role, outcome rule), drafts |
| `record.ts` | E9.1.2, S8.1.1 | `buildRecord`: per family, event ids in date order; simulated subset; refusals with a reason when his seat could not produce the event; `toCoachingFields` writes the P3.2.2 `CoachingBlock` fields |
| `facts.ts` | E9.1.2 rule 3, E9.3, E9.4.2, S8.2.1 | History facts from job stints, the team's real system per season, playing spans and fact events; Systems panel |
| `summary.ts` | E9.1.2, E9.2.1, E9.4.1 to E9.4.5 | "Your record" tab, teaching, game management, communication and evaluation views; descriptor sample lines |
| `gaps.ts` | S8.3.1, E9.4.5 rule 1 | "New to you" list; recommendation scoring windows, each scored once |
| `term.ts` | E9.1.3 | The coach term for a calling formula: AI or delegate parameter, or the user's case 1, 2 or 3 |
| `self-view.ts` | E9.2.2 | Full, colleague and public views side by side; last season's self-assessment beside the record |
| `validate.ts` | E9.1.2 acceptance 1, E9.1.1 acceptance | Rejects ability fields, stored aggregates and a hidden block on a user record; rejects a coach label that reads outside the six families |

## Acceptance (game build plan row G-54)

"Descriptions drawn only from the demonstrated record; no skill points (E9.6 retired ideas)". Tests in
`packages/career/test/record/` cover: E9.5.1 / S8.1.1 acceptance 1 at every rung; E9.1.2 acceptance 1 to 3
(validator, rebuild from logs, identical logs give identical tabs); S8.1.1 acceptance 2; S8.2.1 acceptance 1;
S8.3.1 acceptance 1; E9.1.3 acceptance 1 to 3 (a source scan for stored coach abilities, first-year and
twentieth-year give the same term, every listed leaf names a case); E9.1.1 acceptance (label sources);
E9.4.5 acceptance (scored once); E9.2.2 acceptance (three views trace to their rows).

## Decisions

1. **The record stores ids only.** Counts, matches and means are computed per window when shown and never
   written back (E9.1.2 rule 1). `toCoachingFields` writes event ids, seasons per system family and fact
   rows only.
2. **Duty map gaps.** S8.1.1 lists 14 duty rows; S3.1.1 has 18. The four missing are mapped by the nearest
   S8.1.1 row: staff hiring to conduct (6, like managing assistants), playbook drawings to work products
   (4), personnel reports to evaluations (5), academics and conduct to conduct (6).
3. **Family 1 below head coach.** E9.4.3 rule 2 and S8.1.1 log a coordinator's game-management advice as a
   recommendation. Recommendations enter family 1 from rung 3, where game-management charts are owned
   (S3.1.1). Own decisions need rung 8; play calls need rung 7 and the play-calling seat.
4. **Observe-only duties give nothing.** A seat's `duties` lists S3.1.1 O and R marks; B (observe) duties
   produce no evidence (S8.1.1 rule 4).
5. **Simulated events** carry `payload.simulated = true`, are listed with the flag, and are left out of
   `sampleEventIds` (S8.1.1 edge case starting rule; the open question on a discount stays with N2.8).
6. **Case 3 constant** sits at the middle of the caller's AI scale (`userTermPosition` 0.5, E9.1.3 rule 3;
   the leaf's open question about "slightly below" is unchanged). Case 2 with no checks falls to case 3.
7. **`levelKey`, not `level`.** The P3.2.2 coaching ban rejects any key ending in `level`, so the
   `coached_at_level` fact keeps its competition in `subjectKey` and stints use `levelKey`.
8. **Self-assessment notes** are matched by `subjectMeasure` as `family` or `family:kind`. The pair carries
   the note object for display only (E11.1.1 acceptance 3).

## Owed

- **Integrator:** barrel line `export * as record from './record/index.ts'` in `packages/career/src/index.ts`;
  register `RECORD_EVENT_TYPES` with the history type registry.
- **CR-G54-1 (schema):** `HistoryFact` (`entities.ts`) holds `kind`, date and `refIds` only. E9.1.2 rule 3
  facts also carry seasons, a system family or level key, and a role. Until the contract grows those
  fields, `toCoachingFields` writes the system seasons into `systemFamilies` and the full facts are
  recomputed by `historyFacts`.
- **Writers of evidence (N3, N2, N1, D7, S4.3.1, H6.6.2, T4):** emit the `record_*` types or add rows to the
  evidence map. Until they land, only the L1 promise rows reach family 6 from existing modules.
- **Label definitions (N2.8):** coach labels should be validated with `labelSourceProblems` in the content
  build.

No real-world number is used, so there is no `facts.json`; every constant is a PARAMS row with basis
`bible` or `assumption`.

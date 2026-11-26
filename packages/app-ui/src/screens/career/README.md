# Career screens by rung and the coach's own screens (G-85)

Bible: O7.1.1, O7.2.1, O7.2.2, O7.6.1, O4.6.1 to O4.6.3. Core half: `packages/career/src/ladder/screens.ts` and `screens.json`.

| Piece | Where | What |
|---|---|---|
| Badge per screen and rights per seat | core `ladder.seatView`, `ladder.ladderSeats` | Yours, Assigned, Suggest, Read from the S3 matrix and duty list; `submit:<duty>`, `suggest:<duty>` and the self commands. The shell's `permissions` prop draws the badge. |
| Assignment list | core `ladder.assignmentRows`, UI `AssignmentList` / `assignmentsRoute` | O7.2.1 rows: task, who set it, due slot, hours, status, the screen it opens, submit control only with the right. |
| Default route per hub | `rung_defaults.json`, `hubDefault` | O7.2.2, falls back to the hub's first listed screen. |
| Coach screens | `CoachScreens.tsx`, `careerRoutes(loaders)` | coach.career (ladder, history, tree, reputation tabs), coach.job_market (G-80 board, applications, offer cards, signs as facts, year-out choices), coach.contract, coach.record, coach.finance, coach.life. |

Rules kept: no skills tab, radar, progress bar or level number; reputation and the coach's state are words with reasons; no grade or projection number (A3 ruling 21, MA-48); hot seat shows signs as facts, never the label.

Starting values (Assumption, sent to the bible fixes thread): S3 has no visibility column yet, so `screens.json` sets minimum bands (owner view and delegation from rung 7, pro front-office screens and roster moves from rung 3). `rung_defaults.json` is a starting table.

Owed to the integrator: barrel line `export * as career from './screens/career/index.ts'` in `packages/app-ui/src/index.ts`; `careerRoutes` and `assignmentsRoute` in the route table; read models in app-services that build these views (the core functions exist: ladder.seatView/assignmentRows, market boardRows/fitLine/whatChanges/assistantView/ACTIVITY, wealth.netWorth, life.summaryWeek, record views, reputation.buildSummary); the shell's `permissions` from `seatView(...).states`; the core refusing commands without the right (O7.1.1 acceptance 2) in app-services command handling.

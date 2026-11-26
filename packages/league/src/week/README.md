# league/week (G-69): the week

Bible: H1 (schedule, templates, limits, delegation, rungs), H4 (meetings and install), H7 (media), H8 (travel), H9 (documents).

| File | What it does | Leaves |
|---|---|---|
| types.ts | Week, Day, Block, attendee atoms and groups, Finding | H1.1.1 |
| build.ts | Builds normal, short, bye, after-bye and extra weeks from a template set (data/templates.json) | H1.2.1, H1.3.1 |
| atoms.ts | Clash detection: nobody is in two places | H1.1.1 rule 3 |
| limits.ts | Hard and soft limits: G-12 work-rule checker, weekly day off, days off after a Thursday game, facility day, college countable hours | H1.1.2, H1.5.2 |
| edit.ts | Place, move, remove, delegate. Hard findings open the L8.2.5 warning; once confirmed, each becomes a ViolationRequest for compliance (G-28) | H1.1.1, H1.4.x, H1.5.5 |
| advance.ts | One loop for next block, next decision, next day and to game day. Every control stops before the game | H1.1.3 |
| hours.ts | Coach hours, involvement, presence bonus | H1.4.2 |
| meetings.ts, install.ts | Attention, agenda, teaching, themes, install exposure | H4 |
| documents.ts | Weekly document set, lifecycle, review, lateness. Quality and errors are hidden behind `documentView` | H9 |
| media.ts | Required sessions, skips, stances, questions, leaks, injury answers, college limits | H7 |
| travel.ts | Plans, applying travel to the week, body clock, curfew, delays, forecasts | H8 |
| rung.ts | Boss tasks and daily load for low rungs | H1.5.5 |
| view.ts | The `week.schedule` screen view (no truth-class values) | H1.1.1, H1.1.2 |

Numbers: rule values come from G-10 league files through `weekLookup`. Keys G-10 does not yet carry are in data/week-keys.json, each with its status and source (CR-G69-1). Design values and assumptions are in params.json, with a basis column. The screen is in app-ui `screens/week`. See DECISIONS.md.

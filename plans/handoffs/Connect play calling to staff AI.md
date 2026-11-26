# Handoff: Connect play calling to staff AI (G-58 follow-ups)

Written 2026-11-26 05:25 UTC at the context limit. Read `packages/coach-ai/src/calling/DECISIONS.md` and team memory `g58-play-calling.md` first.

## Done
- PR 151 (merged): `caller.preview(req)`, side-effect free, for K6 suggest.
- PR 191 (ready, branch claude/project-thread-yumuym): `calling/join.ts` `joinK5` (K5 clock plan + short-yardage hint -> `ManagementConstraint`) and `calling/port.ts` `createCallerPort(cfg)` (G-75 `CallerPort` on `createCaller`). `createStaffDecider({ caller: createCallerPort(...) })` is a full Decider; whole-game test in `test/calling/port.test.ts` passes. 233 coach-ai tests, typecheck, lint pass.

## Next task (asked by the coordinator 05:22 UTC)
Swap the test stand-in `build` for real playbook content: the starter 12 plays and 8 calls plus WP-25's 26 plays and 9 calls (PR 189, packages/football-content). PR 189 was NOT on main at 05:25 (main head 10dc6d4); wait for it or branch from it.

Constraint that decides where the code goes: coach-ai may import only engine-game, models, league (package-map). football-content is core and may import only schema. So the real `build(sheetCall, view, side) -> SnappingCall | OpposingCall`, the `fits` tags (kneel, spike, stay_in_bounds, avoid_incompletion) and a `toCallingSheet` from the G-68 `Sheet` (football-content/src/gameplan/sheet.ts) must live in a layer that may import both: app-services or headless (`@core`). Suggested: `packages/app-services/src/.../coach-calling.ts` exporting a factory that returns a `CallerPortConfig`. Barrel/package-map edits are integrator-only; if the coach-ai `calling` barrel line (CR-G58-1) is still missing, app-services cannot import `createCallerPort` through `@gm/coach-ai` and must ask the integrator.

## Special-teams menu
No kick/return call menu with content ids was found in football-content on main. There is only `specialTeamsTemplate()` (gameplan/templates.ts, G7.7.2 sheet sizes) and the fourth-down card (gameplan/card.ts). The port's `special.menu` / `special.build` therefore have no content to read; kicks fall to the J11.6.1 default. Tell the coordinator so it can start a thread for it (re-check PR 189 first).

## Other owed items
observe fed from G-66 charting via `port.callerOf(person, side)`; K5 `timeoutDecision` (`delay_looming`) on a late call needs a ManagerPort slot; integrator CR-G58-1/2/4/5.

# Handoff: Build play designer and test bench (G-90)

Branch `claude/project-thread-gs98q2`, PR against `main` (see the thread). Handed off at the context rule after the model and the bench; the screen is next.

## Done (on the branch)
- `packages/football-lang/src/designer/`: the G1.1.1 play object (`types.ts`), personnel slots and a legal starting picture for every group (`slots.ts`), pure edits for every field incl. mirror (`edits.ts`, reducer `applyEdit`), engine conversion with the one lateral negation, content hash and `toOffenseCall` (`to-engine.ts`), the O3.1.3 validator in four levels refused/illegal/unsound/note (`validate.ts`, legality via `legality.analyseAlignment` and `checkPreSnapScript`), O3.1.2 snapping, coaching-terms readout, route snap and recognition (`snap.ts`), publish with confirmation, rule failures and new-teaching roles (`publish.ts`). Tests: `test/designer/designer.test.ts` (21).
- `packages/app-services/src/play-bench/`: `runBench(request, deps)` on the contract `Resolver`; `deps.resolverFor(BenchContent)` is where the tick resolver plugs in with a content-port overlay; Wilson and mean intervals, histogram, targets by role, breaking contests, fouls drawn by the subject side, samples, cancel = partial, refused in game or without graded values, E7 hour charge, `benchInput(req, deps, i, 'full')` to replay one run in the viewer. Tests: `test/play-bench/` (9).
- Full suite 5,040 passed on Linux at the bench commit; typecheck and lint clean.

## Next: the screen (O3.1.1 to O3.1.4, O3.7.2), plan id `play-designer`
- app-ui may import only `@gm/app-services` public entry. Needs, from the integrator: `export * as designer` (football-lang barrel) re-exported or wrapped by app-services, `export * as playBench` in app-services, a route `play-designer`.
- Use G-91's editor core for drafts, undo (200+ steps), publish, versions: `packages/app-services/src/editor/` on branch `claude/project-thread-98jons` (createDraft, apply(draft, edit, reduce), undo, redo, publish, restore). Pass `designer.applyEdit` as `reduce`.
- Layout per O3.1.1: canvas 10 behind to 25 past, hash selector; left parts list in spoken order; right properties; bottom validator (debounce 150 ms, click highlights roles); tabs Draw, Rules, Against, Test bench, Notes. Keyboard-only drawing (O3.1.2 acceptance 2). Hours strip (O3.7.2) from E7 ledger.
- Read models: follow the G-71 injection pattern for screens (memory g71-analytics-strength).

## Owed by others (sent to the integrator thread)
- Barrel lines: football-lang `export * as designer from './designer/index.ts'` (then delete `src/designer-entry.ts` and point the test at the barrel); app-services `export * as playBench from './play-bench/index.ts'`.
- PARAMS modules `football-lang.designer`, `app-services.play-bench`.
- Proposed rule keys: `field.numbers_from_sideline_yd` (readout landmark; readout skips the numbers while absent), `pass.offensive_pi_contact_beyond_yd` (pick-depth foul-risk warning; skipped while absent).
- Schema: the play object lives in `designer/types.ts` until P3 registers it in `@gm/schema`.
- WP-23: a `PlayContentPort` overlay that serves `BenchContent.sides` by content id and hash, so `resolverFor` returns the tick resolver.

## Not done in the model (needs other modules)
- "No answer" soundness warning (needs F10 coverage rules as data, G-93). Call-length note takes `callWords` from G-67's spoken length; the screen must pass it.
- G1.6.1 board walk-through (chalk mode) needs the tick resolver's chalk option.
- G1.5.1 acceptance set of 40 formations: the legality checker's own 40-case set lives in `football-lang/test/legality/cases.test.ts`; the "running it draws the matching foul" half needs WP-23 plus officiating.

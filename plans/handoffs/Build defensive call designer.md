# Handoff: Build defensive call designer (G-91)

Branch `claude/project-thread-98jons`, PR against main (draft until the screen lands). Bible G2, O3.2, O3.7.

## Done (pushed)
- `packages/app-services/src/editor/index.ts`: shared editor core (O3.7.1): createDraft, apply(draft, edit, reduce), undo/redo (200 steps), publish(draft, label, refuse?), restore, live, isDirty, changedFields, canonical JSON (byte-identical undo). The play designer thread (G-90, branch claude/project-thread-gs98q2) uses it too. Tests: packages/app-services/test/editor/.
- `packages/football-content/src/defense-designer/` (pure core, imports only schema):
  - types.ts: DefensiveCall (G2.1.1 fields), slots with rule alignments (tech/lb/overhang/rcv/deep/spot) and jobs (rush/man/zone/spy), declarations, front conventions, stunts, pressure, coverage with match rules and motion answers, run fits with box/spill/dent per side, checks, disguise, matchup rules.
  - looks.ts: formation switcher set (starter 4 + bunch, empty, stack, TE+wing, 13, 22, unbalanced, jet motion, motion to trips).
  - geometry.ts: line chain and gaps A..F (TE and wing add gaps), receiver numbers, eligibility, look categories, declarations (run strength rules, passing strength, field/boundary with middle band), divider by ball position.
  - resolve.ts: eleven aligned defenders with one job each; first matching check applied; matchups (travel, bracket with priority, no-help; idle when the player is absent).
  - analysis.ts: gap table, run fit tables per family and side (spill needs a bounce player, box needs inside fitters), box count, run/pass conflict, stunt naming and looper arrival, pressure family and free rushers and hot answers, coverage report, hole map at t seconds, match-rule consistency over route combos.
  - adjust.ts: motion answers (lock, switch, track, spin, bump, hold) with times and late-by, comm failure; tempo timing (default call, repeat with 0.3 z penalty, check-with-me); disguise travel report.
  - validate.ts: refuse (more than 11, duplicate letters), rule failure (defender in the neutral zone, ruleKey foul.offside.exists -> illegal as drawn), warnings for everything else; refuseReason() is the editor core's refuse rule.
  - testplan.ts: auto test plan (scouted top formations, weak-to concepts, recent motions) and chalk pair results (unowned gaps at 0.5 s, open receivers at 1/2/3 s, holes, check fired); never a win rate.
  - compile.ts: compileCall(resolution) -> Assignment[] (WP-10 vocabulary, compiles with no error finding). Feed to G-90's runBench (packages/app-services/src/play-bench/, branch gs98q2) as the defense side.
  - calls.ts: six starter calls (Over 3 Sky, Nickel 1 Robber, Nickel Quarters, Nickel Fire Zone, Cover 0 six-man, Tampa 2).
  - params.ts (module content.defenseDesigner), keys.ts (RULE_KEYS).
- Tests: packages/football-content/test/defense-designer/designer.test.ts (44, one block per G2 leaf).

## Left to do
1. **Screen** `packages/app-ui/src/screens/defense-designer/` per O3.2.1: centre field canvas (SVG, reuse field-view tokens) with the defense against the selected look; formation switcher stepping through LOOKS; left layer list (package, front, stunts, pressure, coverage, checks, disguise); right panel for the selected defender (alignment, technique label, key, job by action: run to, run away, pass); bottom validator messages; gap labels over the line with one name per gap (flag 0 or 2); checks table (one row per look with the adjustment); O3.7.2 hours strip. app-ui may import only app-services:public, so add a read model `packages/app-services/src/read-models/defense-designer/` that builds a plain view object (defenders, gap labels, findings, per-look box) from a call + look + rule set, and copy its view types into the screen (pattern of screens/analytics/types.ts). Register the screen in shell/screens.json (integrator owns the barrel).
2. Bench hookup: once G-90 pushes play-bench, a "test against plays" tab calling runBench with this call's compileCall output.

## Owed to the integrator (thread "Integrate: rule key mapping and gate")
- CR-G91-1 barrels: football-content `export * as defenseDesigner from './defense-designer/index.ts'`; app-services `export * as editor from './editor/index.ts'` (and the read model when it lands); app-ui screen route `defense-designer`.
- Rule keys: field.width_ft (in the field-keys branch 42wpl5), NEW field.numbers_top_from_sideline_ft and field.numbers_bottom_from_sideline_ft (G2.4.2 divider; absent = divider off). PARAMS module content.defenseDesigner into the merged param table.
- CR-G91-2 vocabulary: fit gap enum is A..D and force; E and F (extra blockers from a TE plus wing or unbalanced line) compile as D until the WP-10 vocabulary adds them.

## Design notes and open points
- Zone windows, line spacing, look splits, bounce depth, hole reach are design values (Assumption, params.ts). Technique label conventions: oddOutside default, fiveHeadUp (Conflict in G2.2.2), free labels.
- Starter calls draw validator warnings against some looks (e.g. Cover 0 vs 13 personnel, robber vs 21): that is the validator doing its job; a coordinator adds checks.
- Football facts in G2 are mostly Unverified / 1 of 3 in the bible; this module encodes the bible's design rules and states no new facts.

# sheet-bridge: decisions and what is owed

Bridge from the game plan's call sheet (G-68, G7) to the calling console (G-60, I2, O2.2). Handoff item B of
"Let the player start and play a game"; unbuilt-work item 4.

## Rulings
- Marlon, 2026-11-26 07:06 UTC: the staff draft the starting sheet from the game plan and their skill; he can
  edit anything before kickoff.
- Marlon, 07:08 UTC: the staff learn his preferences, and have their own ideas to suggest (a one-on-one in the
  week). The meeting is the meetings and week-screens threads' job; this module gives them `suggestions`.

## Choices (status words per A5)
- The draft runs coach-ai preparation `buildSheet` (K3.4.2), the AI coordinators' builder. Skill enters through
  `prepDepth(preparationZ)`: catalogue coverage (70% to 100% of situations get a box) and script length (8 to 15),
  both bible values in coach-ai params. Each call's situations are the plan's `situationIds`; box size follows
  expected snaps (G7.2.3, pro 2024 table, PROVISIONAL 1 of 3 there).
- Ranking inside a box (estimates.ts): the staff's payoff estimates from the team's own charted film (G-66
  rows, source 'own'), observed grades only. Each play's payoff is its yardage EPA on the N2.2.1 baseline
  model (charted rows carry no turnover or timeouts: both are Assumptions). Levels shrink toward the level
  above by 12 plays of weight (Assumption): unit, call family, call, then call against a look and call in a
  catalogue situation. Skill: estimate noise SD by `preparation` through coach-ai `prepDepth` (K3.3.1 rule 4,
  0.20 to 0.05 expected points, a bible value). Each box keeps the size the K3 builder gave it and takes the
  fitting calls with the best situational estimate, plan order on a tie. A defensive row records coverage and
  rushers, not the call, so it counts for every planned call with that signature (Assumption).
  `rankedBy` says which happened: 'estimates' (week-built, `estimates`), 'film' (`observed`) or 'planOrder'.
- **Assumption**: with no film and no week estimates, calls are ranked in the plan's own order.
- **Assumption**: with no game plan at all the staff list every book call for the side, in book order, fitting
  any situation. It keeps the game playable; it is not good football and the plan screen should say so.
- Box sizes follow the level's table (`level`): pro 2024 (nflverse, PROVISIONAL 1 of 3) or college 2024
  (cfbfastR FBS against FBS regular season, 752 games, 65.6 snaps a team game; fact F-measured-rate-0390,
  1 of 3). The college release has no no-huddle flag, so tempo is unseen there.
- Layout and priorities come from the offense template (G7.1.2, G7.2.1 clock above zones above downs) for both
  sides, since the AI's boxes are catalogue situations. Category boxes (shots, screens ...) hold the plan's calls
  chosen for them, in plan order, up to `size.boxScanMax`.
- Learning reads demonstrated behaviour only: per box, weeks a call was taken out against weeks it was put in.
  Net out: left out of the draft and kept as a suggestion. Net in: put at the front. **Assumption**: one week is
  enough to count; no decay yet.
- Console rules: down, distance, yards to goal, score, personnel, half seconds (at most 120 = two-minute, at most
  5 = last play, 121 or more = not two-minute), sudden change, tempo. Anything else (tries, kicks, game seconds,
  timeouts, hash, formation, lost-yardage plays, "or" rules) becomes a key-only box (rule `downs: []`), never a
  broader rule.
- Base boxes: a ruled box can serve as the base for downs (`SheetBox.baseDowns`, K4.1.1 rule 4 as coach-calling
  `baseBoxes`): the broadest box for the down with only down and distance bounds.
- Box keys: when a sheet has more boxes than free letters, as many prefix letters as needed (was one prefix,
  which repeated codes past about 2 x the free letters).
- **Placeholders** the host should replace: readiness 'ready' and spoken length 0 until the week supplies the
  staff's estimates and the terminology; special-teams personnel codes come from `personnelOf` (the depth chart).

## Owed
- Barrel line `export * as sheetBridge from './sheet-bridge/index.ts'` (carried in this PR, told to "Integrate:
  exports and screen routes").
- The week runner passes `observed` (own film, `payoffNoise` stream, the scouting report's look shares) and
  `level`. A second and third source for the college snap figure on the same definition (no kneels).
- Defensive template layout (personnel boxes, third-down split) for a drafted defense: the AI's boxes are
  down-and-distance situations, so the draft uses that layout.

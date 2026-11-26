# Handoff: Remove hard zeros from probabilities (A3.1 ruling 22 / MA-52)

PR 126 (draft), branch claude/project-thread-etv21n, base main. Thread cmsg_01TpN1RKoZdNFALtGYUFjVqz7EyJedwzxjcTM4BPbMRxVi.

## Done
- @gm/schema: possible(), notImpossible(), PROB_FLOOR, PROB_FLOOR_PARAMS (src/probability.ts, src/probability-floor.json; tuning param prob.floor = 0.0001, basis assumption; a tuning param because Q6.3.1 bars Assumption facts from rule-set files). Barrel: schema/src/index.ts exports it. engine-game uses Contract.possible.
- Floors applied: see the PR body. Scanner for *Chance/*Probability functions that can return 0: /tmp scripts are lost, so re-create the idea: functions whose body has return 0 / clamp to 0 and no possible().
- Kept at 0: imported real people, physically impossible cases (loose.ts batChance above reach), structural sit-out zeros, the G-77 firing model (another thread).
- Integrator thread told: barrel, prob.floor as a tuning param, golden regeneration, market choose() surprise stream.
- typecheck and lint pass. New tests pass: packages/schema/test/probability.test.ts, packages/league/test/probability-floor.test.ts.

## Left to do
1. Full vitest run: 21 of 4916 tests fail, all in 16 files. Most assert an exact 0 (or exact base values) that are now the floor (0.0001) or 1 - floor. Update each one to expect PROB_FLOOR (or toBeCloseTo) unless it guards a real exception (imported people, physical impossibility). Check two of them for real behaviour change: resolver rates.test (kickoff/onside shares, which shift because shifted() floors) and engine-game forecast "never moves the game weather". Re-run only the failing files.
   -  FAIL  packages/career/test/community/community.test.ts > L8.3.2 rule changes and points of emphasis > emphasis starts at 1.2 and falls to 1.0 by mid-season; skipped staff sessions mislead in the first four games
   -  FAIL  packages/career/test/crisis/response.test.ts > L9.1.3 early warning > reads each channel by its own rule
   -  FAIL  packages/career/test/gameday/pregame.test.ts > I1.1.2 and I1.4 final plan edits > I1.4.3: cap of 12, miss chance beyond 8, first in the list wins a conflict
   -  FAIL  packages/career/test/locker-room/room.test.ts > leadership council (L2.2.2) > a council with no tie into the room is blind to it
   -  FAIL  packages/career/test/positions/succession.test.ts > X8.4.1 firing cascade > keep chances are the X8.4.1 base values with adjustments, clamped to 95 percent
   -  FAIL  packages/engine-game/test/environment/environment.test.ts > J12.2 weather generation > J12.2.1 acceptance: the forecast error shrinks toward game day and the forecast never moves the game weather
   -  FAIL  packages/engine-game/test/environment/environment.test.ts > J12.5.1 surface > slips happen only below the footing threshold and each check draws one uniform
   -  FAIL  packages/football-content/test/playbook/terminology.test.ts > G4.4.3 signals > decode chance is zero for a signal set never used in a game
   -  FAIL  packages/league/test/college/draft.test.ts > early entry (T8.5.1) > stay or go: more draft value means more declare; roster money keeps mid-round players; a coach can pull
   -  FAIL  packages/league/test/college/draft.test.ts > opt-outs (T8.5.2) > half of projected top-two-round players skip a non-playoff bowl; near zero in the playoff; never for imported people
   -  FAIL  packages/league/test/college/eligibility.test.ts > the player's say at the line (T5.2.2) > nothing under the age model, for a content player, or for an imported person
   -  FAIL  packages/league/test/compliance/compliance.test.ts > AI decision K2.8.2 and staff requests K6.6.1 > an imported person never decides to violate; the cooldown stops repeats
   -  FAIL  packages/league/test/development/exit.test.ts > D8.4.1 exit hazard > choosing to retire is 0 at 27 and about one third of the total exit rate from 30
   -  FAIL  packages/league/test/development/exit.test.ts > D8.4.1 exit hazard > modifiers: major injury x2, lost starting job x1.5, contender x0.6, high competitiveness x0.7, love of football x1.3 to x0.7
   -  FAIL  packages/league/test/news/news.test.ts > X12.2.1 news reaches people through people and media > a disciplined, guarded passer passes less often
   -  FAIL  packages/league/test/news/news.test.ts > X12.2.1 news reaches people through people and media > each hop degrades a detail at about the starting rate, and degraded stays degraded
   -  FAIL  packages/officiating/test/crew/crew.test.ts > wrong rulings (B11.3.2 rule 2) > a clear catch is never ruled incomplete
   -  FAIL  packages/officiating/test/crew/crew.test.ts > wrong rulings (B11.3.2 rule 2) > error chance is a coin flip at the boundary, falls with the margin, and is zero with no margin
   -  FAIL  packages/officiating/test/replay/replay.test.ts > B9.2.1 the standard and the evidence model > evidence is clearer the farther the truth was from the boundary, worse in a pile, better with postseason cameras
   -  FAIL  packages/people/test/cohorts/cohorts.test.ts > X11.2.3 stock balance > coach retirement chance starts at 55 and caps at 40 percent
   -  FAIL  packages/resolver-reference/test/resolver/rates.test.ts > reference resolver: kicks land on the rows in the parameter file > kickoffs: touchback share and returns; onside kicks: recovery share
2. Not done yet: snow can't happen when climate snowIn is 0 or above the snow temperature (weather.ts snowPossible); "touching of a kick: never a touch that did not happen" in officiating crew rulings; the remaining clamp01 uses in bench (these are freshness values, not chances, so no change needed).
3. Then run typecheck, lint and the full tests; commit test-results/ if the check writes them; mark PR 126 ready; tell Marlon it's ready for Merge All PRs.

# G-65 decisions and owed requests

1. **Practice sends, other modules change.** The resolver emits exposures and counts; D7, D9 (G-64), D10 and D11 own the formulas that turn them into change (H3 "What a builder needs"). G-64 was not on main when this was built, so the knowledge hand-off is `KnowledgeExposure { personId, elementId, cardId, mode, period, weight }`. `weight` is every H3.5.1 rule 3 term except card match and the player's learning rate. Card match is applied at game time with `cardMatch`/`cardMatchFactor` (H3.2.2). G-64 multiplies by the D4 learning rate.
2. **Load uses the WP-18 field names.** `PracticeLoad` carries `liveReps`, `thudReps`, `teamReps` (jog), `walkThroughReps` and `individualMinutes`, the same names as `engine-game` bench `DayActivity`. Conditioning goes out as minutes and D10 converts it to `otherLoad`. League cannot import engine-game (P1.2.1), so the runner maps one onto the other.
3. **Rule breaks never refuse.** Prohibited drills, padded practices past the budget, college hours over the limit, a false report label, and practising an uncleared player all produce findings. Confirming turns each hard finding into one `ViolationRequest`, the same type the week editor sends to compliance (G-28). The planner refuses only plans that cannot physically exist, such as a plan longer than the block.
4. **Pro limits go through the G-12 checker.** A practice becomes one calendar `Activity` (equipment from pads, contact from the hardest tempo, drills listed), so the padded budget, the two-padded-week rule and the prohibited drills come from the work-rule records and their fact status. Nothing in this module restates them.
5. **College limits are PROVISIONAL.** The countable-hours panel always shows the provisional flag (build plan section 5, R1.2.7). `college.in_season_padded_limit` has no value, so no padded budget is shown or enforced at college level (H3.6.1 acceptance 2).
6. **Per-position override.** Override players take exactly their percentage of the position's reps over the period. The remaining reps follow the unit split among the other players, so a backup quarterback set to 30 percent gets 30 percent and no more.
7. **Limited participation** takes reps by a running share. That gives exactly the share over any run of reps and makes it deterministic. Limited players skip live periods (H3.3.2 rule 1).
8. **Corrections.** A mental error in a led period gets the correction bonus on that rep, because the leader is present. A position coach's flagged players get it on everything they do in that period (H3.6.2).
9. **Injury hazard is an assumption.** `base_hazard_per_rep` has no source (H3.5.1 facts). It is floored at the probability floor, so even a walkthrough injury is possible (MA-52). It must be calibrated before use, and is flagged in J15.
10. **Fast mode** uses the same weights with the expected correction bonus and no rep draws. Injuries are returned as summed hazard for the D11 fast pass. The test checks that average knowledge gains are within 5 percent over 1,000 practices (H3.5.1 acceptance 3).

## Owed to the integrator
- CR-G65-1: add `college.any_staff_may_coach` (data/practice-keys.json) to the G-10 college files and the key dictionary. Also add the RULE_KEYS manifest row for `college.in_season_padded_limit` as a key with no value.
- CR-G65-2: add `export * as practice from './practice/index.ts'` to the league barrel. Add a `practice.planner` read model in app-services wrapping `practice.practiceView`, and register `practicePlannerRoute` for `practice.planner` in the shell route table.
- CR-G65-3: add the practice PARAMS to the param table if it lists league modules.

## Owed to the bible thread
- No contradiction found. H3.3.1 says Limited means "a chosen share below 100 percent", and H3.3.2 rule 1 says limited players run no live periods. Both are applied together.

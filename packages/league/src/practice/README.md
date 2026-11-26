# league/practice (G-65): practice planning

Bible: H3 (practice and periods, script and scout look, reps and people, conditions, results, college practice and the assistant's share).

| File | What it does | Leaves |
|---|---|---|
| types.ts | Practice, Period, Script, Rep, ScoutCard, RepSplit, Participation | H3.1.1, H3.2.1, H3.2.2, H3.3.1, H3.3.2 |
| practice.ts | Period palette (data/periods.json), tempo table, minutes and transitions, rep counts, templates, weather cut | H3.1.1 to H3.1.3, H3.2.1 rule 1, H3.4.1 |
| script.ts | Card match (exact, near, none), scout-team quality, coordinator draft, unit split, plan coverage counter | H3.2.1 to H3.2.3, H3.6.2 rule 4 |
| reps.ts | Who takes each rep: depth chart by unit, per-position overrides, Limited and Did not participate, next man up, mental reps, implied report label | H3.3.1, H3.3.2 |
| resolve.ts | Rep-level and fast resolution: knowledge exposures (to G-64/D9), technique exposures (D7), load counts in WP-18 `DayActivity` names (D10), injury events (D11), rep outcomes | H3.5.1, H3.2.3, H3.3.3 |
| limits.ts | Practice as a calendar activity through the G-12 checker (padded budget, prohibited drills, field time), college countable hours, live-without-pads and no-script warnings, report-label and clearance acts, violation requests | H3.1.1 rule 4, H3.1.2, H3.1.3, H3.3.2, H3.6.1 |
| report.ts | Practice report filtered by evaluation skill, film errors, competition grades, the user's coach term, environment and mock-game flags | H3.5.2, H3.3.3, H3.5.1 rule 3, H3.6.2, H3.4.1, H3.4.2 |
| view.ts | The `practice.planner` screen view (no truth-class values) | H3.1.1, H3.6.1 |

Numbers: design values and assumptions are in params.json with a basis column. Real-world rule values are keys: the G-12 work-rule records (padded practices, prohibited drills, field time), the week's countable-hours keys, and data/practice-keys.json for what G-10 does not yet carry. The screen is in app-ui `screens/practice`. See DECISIONS.md.

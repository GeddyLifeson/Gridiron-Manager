# Calendar engine (G-12)

Bible: C4 (yearly calendar), T3.2.1 (college calendar file), C11.1 and C11.2 (work-rule checker and time limits), X11.1.1 (cohort windows).

- `data/pro-pattern.json`, `data/college-pattern.json`: every anchor placed by a weekday rule or an offset, with leaf, source and status. Used for any year (C4.7.1 rule 2).
- `data/pro-2026.json`, `pro-2027.json`, `college-2026.json`, `college-2027.json`: real published dates that override pattern anchors, plus the recruiting periods (T4.2.1).
- `data/calendar-keys.json`: values with no league-rules key yet. League-rules keys (G-10) win; a disagreement throws.
- `data/work-rules.json`: C11.1.1 rule records (class blocked or breakable, limit from a key or the record, reference penalty).
- `engine.ts`: `CalendarEngine` — events in delivery order (`eventsOn`), per-club phase (`phaseOf`), `advance` by day, days, date, next deadline or next game (one loop, so all reach the same state), deadline checks and stops, date bar.
- `work-rules.ts`: `WorkRuleChecker.check(activity, workContext(...), held)`; counters derive from held activities only.

Season numbering: pro season Y is the league year that begins in March of Y; college season Y is played in the fall of Y. World dates are calendar year plus day of year (`toWorldDate`).

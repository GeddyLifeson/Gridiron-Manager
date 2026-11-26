# Crisis engine (G-50; bible L9.1, L9.3 to L9.5)

One engine for every crisis. The crisis types are G-32's content rows (`packages/football-content/data/crises/catalogue.json` and `acts.json`); `career` may not import `football-content` (P1.2.1), so the world layer loads both files and passes them in as `CrisisCatalogue` and `ActsFile`. `catalogueProblems` checks the rules the engine depends on when they load.

| File | Leaf | What it does |
|---|---|---|
| `catalogue.ts` | L9.1.1 | Types for the G-32 rows; load check (guard class present, causes, generated adults for personal and outside classes, no currency, no grade). |
| `guard.ts` | L9.1.2 | The real-person guard every generator calls. Built on the schema's `guardClassOf`/`mayReceiveEvent`, adding minors (rule 3), family objects, quotes and character labels (rules 2 and 4). No switch exists (rule 7). |
| `engine.ts` | L9.1.1, L9.3.2 | Triggers with causes, guard on every subject, merging two triggers about one person in a week, the pacing queue (one new a week, two open, three when the room is lost, four-week expiry unless the cause holds), stage clocks, closing into a history entry with the acts, culture precedent, notability input, lies coming to light, and the trigger left armed when the cause still holds. |
| `hazard.ts` | L9.2.1, L9.2.6, L9.2.8, L9.2.9 | Outside draws (off-field, family) on eligible people only; hazing and outbreak hazards. Rates come from the catalogue rows and their fact rows. No input carries a record or a streak. |
| `warning.ts` | L9.1.3 | Channel chances (council, position coach `report_up`, open door, medical, reporter), lead days and false alarms. No awareness value is stored. |
| `response.ts` | L9.3.1 | Acts offered by the job's powers (above authority = an ask), each act one owner-system event, the "told before he found out" timing rule, honesty, and rule-breaking responses through G-28 `commitAct`. |
| `college.ts` | L9.4 | Portal exodus from each player's own leaning, announcement smoothing, academic trigger (imported players always eligible), one investigation per major G-28 case, booster revolt and the precedent a granted demand writes. |
| `lower-rungs.ts` | L9.5 | Boss fired (priority in the queue), interim record (no automatic promotion), the witnessed item only the user sees and what each choice costs. |
| `orders.ts` | L9.3.1 | The orders handed to owning systems (memories, hours, moods, standing, ties, notices). The engines never write another system's state. |
| `keys.ts` | L9.4.1, L9.5.2 | Rule keys read (transfer windows, staff reporting duty). |
| `params.ts` | all | Design constants: bible starting values or module assumptions. No real-world number lives here. |

## Rates from history (the G-50 acceptance line)

The only real-world rates the engine uses are catalogue values with fact rows: the yearly arrest rate 0.029 per player-season (F-crisis-0001, computes 2 of 3), the violent and grave shares, the NCAA major-case rate 0.03 per program-year (2 of 3) and the 12-month case length (1 of 3). A 53-man generated roster at mean values produces about 1.5 off-field incidents a club-season in the test, against the bible's "about 1.6" from about 50 arrests a year. Everything else is a named Assumption, as the bible marks it. None of these is triple verified; the fact register prints them PROVISIONAL.

## Decisions

- **Always-open versus the open limit.** L9.5.1 says a boss-fired event always opens the crisis for a lower-rung user; L9.1.1 says no team holds more than two open crises. Both hold: `boss_fired` is a priority type that queues ahead of everything and opens on the first week with room. Sent to the bible-fixes thread.
- **Severity onto the 1 to 5 scale.** The off-field outcome classes (minor, serious, grave) map to 1-2, 3-4 and 5; "told upstairs at once" is severity 4 or more. Module assumptions (the catalogue has no value).
- **Rate spread.** A yearly rate becomes a weekly chance as rate / weeks (first-order term, no platform powers, P1.1.1).
- **Merging.** "Same week" is within seven days of each other. A merge that would put an imported person into a personal crisis is refused and the two stay separate.
- **Found out elsewhere.** When a stage widens to the team or upstairs and the coach has not told them, the group remembers (`found_out_elsewhere`, L1.1.2 -10). Telling them first writes +5.
- **Rule-breaking responses.** `hide_case`, `shade_report` and `improper_benefit` map to G-28 classes (`RULE_BREAKING_CLASSES`). There is no pro class for hiding a conduct case; `failure_to_cooperate` is a national-body class. Requested from the integrator.

## Owed

- CR-G50-1 barrel line `export * as crisis from './crisis/index.ts'` in `packages/career/src/index.ts`.
- CR-G50-2 `CRISIS_EVENT_TYPES` into the event-type table.
- CR-G50-3 rule keys in `keys.ts` into the dictionary (values from G-10).
- CR-G50-4 stream names `crisis` and `community` in J13 (the scopes used are in each call).
- CR-G50-5 an export of the crisis catalogue and acts from `football-content` for the world layer.
- G-69 (the week) applies the orders and calls `crisisWeek` per team.

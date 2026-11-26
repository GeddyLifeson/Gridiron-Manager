# Life: time, energy, health and family (G-53)

Bible: E7 (time and energy), E8.1 to E8.5 (health and family), S9.2.1 (hours by rung), S9.3.1 (relocation).
E8.6 (the coach's own conduct) is out of scope: offers and detection run through the compliance
pipeline (G-28, L8.2.5); this module only supplies `heavyWeeks52`, which changes how often offers arrive.

| File | Leaves | What it does |
| --- | --- | --- |
| `params.ts` | all | PARAMS (`career.life.*`): every bible starting value, assumptions, the E7.2.1 cost table and S9.2.1 rung hours from `tables.json`. Quarter-hour helpers. |
| `facts.json`, `facts.ts` | Q6 | F-life-0001 adult sleep need (7 h or more, Verified), F-life-0002 WHO/ILO 55-hour threshold (Verified). |
| `realism.ts` | E7.4.2, E8.2.3, E8.3.2 open questions | `LifeRealism` switches with bible defaults, `realismKey` for certified records, `LifeSubject` and the imported-person guard, `LifeRandom`. |
| `costs.ts` | E7.2.1, E7.2.2 | Task rows, `taskCost`, `WeekViewings` (film once per game per week). |
| `week.ts` | E7.1.1, E7.1.2, E7.7.3 | `resolveDay`, `runWeek` (one pure function for the dry run and the advance), `summaryWeek` for AI coaches. |
| `sleep.ts` | E7.4.1, E7.4.2 | Nightly debt, bands, game-day effects, slow-work fixed needs. |
| `ledger.ts` | E7.1.2 | Append-only `HourLedger`, rows per committed week, totals, the unplanned-demand line. |
| `delegation.ts` | E7.3.1, E7.3.2, E7.7.2 rule 3 | Who may take work, delegate load and incomplete products, review/return/replace, the 30 percent distrust rule. |
| `load.ts` | E8.1.1 | `load_12w`, `heavy_weeks_52`, bands. |
| `health.ts` | E8.2.1 to E8.2.3 | Yearly step, warnings and reviews, the event hazard, announcements. |
| `household.ts` | E8.3.1, E8.3.2 | Members, school stages, strong ties, weekly satisfaction, the conversation and separation chain, money offsets, the break. |
| `events.ts` | E8.3.3 | Yearly life-event generation from household facts, choices, family offers. |
| `relocation.ts` | E8.4.1, S9.3.1 | Move modes and effects, the home-hours cap while apart, who pays. |
| `rungs.ts` | E7.7.2, S9.2.1 | Required hours by rung and season. |
| `firewall.ts` | E8.5.1, E7.4.2 | Forbidden packages, permitted career modules, sleep-debt readers, private shapes. |

## Decisions

- **D-1 Randomness** comes in as `LifeRandom` (career may not import engine-core). Each function documents how many draws it takes. `yearlyStep` always takes one; `weeklyStep` takes none unless the event preconditions hold.
- **D-2 Six day fields.** E7.1.1 says five categories (work, sleep, home, travel, free) add to 168, but rule 1 also takes 1.5 h a day of fixed needs. `CoachDay` carries `needs` as a sixth field so the bars stay honest; the six add to 24 a day and 168 a week. Sent to the bible fixes thread.
- **D-3 Commute** is 0.5 of the 1.5 h fixed needs (assumption: the leaf says the commute part is zero on a facility night but not how big it is).
- **D-4 User-chosen order.** When the user names what gives, sleep may go to zero (rule 3: the game does not stop him). The default order stops sleep at the 4-hour floor. Required blocks (E7.7.2) are never dropped automatically.
- **D-5 Review targets** are 12-week means of sleep and weekly work hours (E8.2.2 rule 2 wording).
- **D-6 Serious can improve.** A met review moves at risk to watch (bible) and serious back to at risk (assumption, so a coach who follows advice after a second event is not stuck at serious for ever).
- **D-7 Hazard continues at serious** so E8.2.3 rule 4's third event is reachable.
- **D-8 Separation** is certain once its conditions hold (rule 6 says "may"; no chance is given). Satisfaction words use equal fifths (assumption; the leaf names the words but not the cuts).
- **D-9 Required hours** follow S9.2.1 (it owns them; E7.7.2's lower values were "pending S9"). The S9.2.1 acceptance (under 10 discretionary hours at rung 2 under a high-hours boss in a game week) is not reachable from S9's own maximum: 168 - 90 required - 52.5 sleep need - 10.5 fixed needs = 15 h. Sent to the bible fixes thread; the test pins 15.
- **D-10 "Part" of a life event** blocks half the hours and gives half the attend gain less half the miss loss (assumption).
- **D-11 Visiting window while apart**: 8 h in season, 36 h out of season, minus travel both ways (assumption; E8.4.1 acceptance 2 holds).
- **D-12 One added cost row**, `film.reportBuild` (1.0 h, assumption), so a delegated tendency report has a full cost for "replace".

## Open for Marlon (the E7/E8 life-realism defaults)

All three switches default to the bible as written. They are release-wide design choices, never per-user settings:

1. `gameDayTiredness` (E7.4.2): sideline information 3 or 6 seconds later and one or two fewer halftime items when worn down or exhausted.
2. `healthEvents` (E8.2.3): forced time away for a warned coach who carried on. Off: consequences stop at the warning.
3. `separation` (E8.3.2): a household strained for years after two plain warnings may separate. Off: the floor is "strained".

Family health history at creation is not a switch: the no-traits ruling already rules it out.

## Owed (requests sent)

- Integrator: barrel line `export * as life from './life/index.ts'` in `packages/career/src/index.ts`; world shapes for `CoachWeek`, `LedgerRow`, `HealthRecord`, `Household` (household-level satisfaction, member occupation and tie region, strain counters, move years; the current `HouseholdRecord` keeps satisfaction per member) and `RelocationRecord`.
- All numbers except the two fact rows are bible starting values or assumptions, as the bible itself marks them.

# front-office/gm (G-76): front office AI

Bible K7. This folder decides; `@gm/league` owns every mechanic and every legality check (roster engine C5.7.1, cap C6, draft C7, market C8). Nothing here files a transaction or reads a league rule value.

| File | Leaf | What it does |
|------|------|--------------|
| `profile.ts` | K7.1.1, K7.1.2 | The general manager record and the college roster-builder record: seeded generation, the median record for imported people, coach voice from the power arrangement and trust, horizon under job pressure, the small between-season move, deal and passed-on memory. `FIELD_READERS` names the file that reads each field. |
| `value.ts` | K7.2.2 | `playerWorth` (value, cost, surplus in wins), `walkAwayCents`, `rosterWorth` and `rosterDelta` (lineups by position), `goingRateCentsPerWin`. |
| `needs.ts` | K7.2.1 | The general manager's own needs, the blend with the coach's asks, the half weight past five asks, the trust move for a logged ask. |
| `trade.ts` | K7.4.4 | `answer` (one code path for AI clubs and the user), his own pick chart, `proposals` (two a week). |
| `draft.ts` | K7.4.3 | `buildBoard`, `onTheClock` (pick, move down, look to move up), `draftDecider` for the league draft event. |
| `free-agency.ts` | K7.4.2 | `targets` and `roundOffers` for one market round. The player's choice is `market.choose`. |
| `contracts.ts` | K7.4.1 | `capPlan` (greedy with a repair pass), `negotiate`, `bonusShare`, `campFine`. |
| `roster.ts` | K7.3.1, K7.4.5 | Mandatory gaps, ready-list signings, injury list choice, waiver claims, practice squad, the undrafted board, the cutdown, hiding a player from waivers. |
| `authority.ts` | L5.2.1 | `route`: file the decision, or hand it to the user as a proposal when he holds the field and has not delegated it. |
| `order.ts` | K7.8.1 | Acting order, stream scope, tier 3 step, one market round from one snapshot. |
| `personnel.ts` | K7.2.1, K7.3.1, K7.4.5 | The G-57 hookup: `league.personnel` output (needs board, memo, ready list, wire, practice squad targets, claim risk, cutdown board) into the plain inputs above, and a K7 cutdown back into an M6.4.1 board. The only file that knows both sides. |
| `college.ts` | K7.5.1, K7.5.2 | The AI college roster builder: board, place split, offers, committable offers, hours, flips, retention, transfer targets, pay budget split, agreement terms, trimming to the limit. |
| `violations.ts` | K7.7.1 | Each opportunity to break a rule, the K2.8.2 decision with the K7.2.2 gain, and the hand-off to the L8.2.5 pipeline. |

## Decisions this module made

- **GM-01 No truth can enter.** Inputs are `PlayerView` (a club's own D6 estimate: mean and variance). The folder does not import `@gm/people` at all; a test scans for the scouting truth readers.
- **GM-02 Opinions are persistent.** Grade lean and market-read error come from `PersistentDraw(kind, gmId, key)`: the same number on every ask. The world supplies it from J13 streams scoped by the key. A general manager cannot be asked again until he says yes (Q4.3.1).
- **GM-03 Players are worth what they add to a lineup.** `rosterWorth` values each position as slot weights over its best players (weights come with the J14.6.1 table), less contract cost. A deal is judged on `rosterDelta`, so several depth players never add up to a starter.
- **GM-04 No circular gain against one general manager.** `answer` accepts only when his own worth rises by more than his hold. The test recomputes worth before and after 400 random deals and finds the stated net each time, so no chain of accepted deals can return him to the same holdings.
- **GM-05 Between general managers, arbitrage is possible and bounded.** Two general managers hold different opinions (lean, chart bend, position values). Buying from one what another overrates is real football and is limited by the hold, the two-a-week cap and the bend ranges in `params.json`. G-89 (career loop search) should measure the yield.
- **GM-06 Units.** Value is wins over the horizon. Trades compare in chart points with `pointsPerWin` supplied with the fitted chart (C7.5.1). Cost converts at `centsPerWin`, recomputed each offseason by `goingRateCentsPerWin`.
- **GM-07 Rule values stay out.** Rookie contract length, rounds, roster limits, list rules and position minimums are arguments the caller reads by key.
- **GM-08 Restructures.** Under any discounting, pushing money later always looks free. `capStyle` scales the cost of a restructure both ways (a pay-as-you-go general manager counts it dearer), so only general managers who push money, or are under pressure, do it by default.

- **GM-09 Needs come from the M1.4.1 board when there is one.** `needsFromBoard` reads the board's gaps, not its score: the score carries the head coach's tier weights, and K7.2.1 rule 1 is the general manager's own list. Depth at half weight is the bible's; the count shortfall of 10 ISS matches G-57 (assumption). `gmNeeds` stays for callers with no board.
- **GM-10 One claim rule.** `claimDecision` decides and the personnel wire review reports to the user. A claim the cap check rejects is not attempted.
- **GM-11 The hookup is structural until the barrel lands.** `league.personnel` is not in the `@gm/league` barrel, so `personnel.ts` names the fields it reads, and `test/gm/hookup.test.ts` runs its real-module cases only when the barrel exports `personnel` (7 cases, skipped until then; all passed against PR 119 with the line added locally on 2026-11-26).
- **GM-12 Projection at college is an explicit weight.** "Projection weighted heavily" (K7.5.1) and "less on projection" (K7.5.2) are `college.boardProjectionWeight` 0.6 and `college.marketProjectionWeight` 0.15 of the gap between today's grade and the projection, moved by `developVsBuy`. The pro horizon maths barely reaches an 18-year-old's peak, so the lean alone did not do it.
- **GM-13 Pay shape without a power function.** Core packages may not call platform power maths; the split mixes a square-root share (spread) and a cube share (stars) by `payShape`.
- **GM-14 K7.6.1 is not built here, on purpose.** G-47 already built the whole leaf in `packages/career/src/staff/hiring.ts`: `candidateScore` (fit, the hirer's view of quality, tie, cost, familiarity bonus; no person id, so the user and an AI candidate score the same, tested there), `rankCandidates`, `runSearch`, `acceptChance`, `aiFiresAssistant`. front-office may not import career (P1.2.1) and a second score would break the same-function rule. The world runner calls `career.staff` for every vacancy; `violations.ts` covers the early-contact opportunity (`early_contact_coach`).
- **GM-15 Violations read the public record, not the detection table.** The person's belief about being caught is the caller's public figure (sanctions news, C10) bent by his persistent `marketRead` error. The true detection chances stay inside `league.compliance`. `medical_retirement` maps to the `roster_limit` class (a reading: T5.1.2 names the act, the catalogue has no separate class).
- **GM-17 The cutdown obeys the cap (K7.4.1 rule 2).** `CutdownInput.cap` is optional: this year's room if everyone is kept, and how much each cut changes this year's team salary (his salary saved, less guaranteed salary of later years that a release brings into this year, CBA Art. 13 s.6(d)(iv), Rulebook only). After the ranking, a repair pass keeps the cut whose release costs the most room instead of the lowest-ranked kept player at his position whose release saves room, until the cuts fit; only if the same position cannot make the room, at any position (the law before the head coach's position counts). The K7.4.1 rule 2 "greedy with a repair pass" method, applied to the one decision the world runs today. Without `cap` the cutdown is unchanged.
- **GM-16 Nothing possible has zero chance (MA-52).** A staff below the flip floor still keeps recruiting with the floor chance; a person whose character says no still might (the K2.8.2 slip, in `compliance.decideViolation`). Legality refusals (cap check, class not in the rule set, an imported real person) are not chances.

## Facts

K7 states "None sourced" for the pro leaves. K7.5.1 gives one sourced number: 8 to 9 offers per expected signee at power programs, status **2 of 3** (not Verified). It is content data passed in as `perSignee`; this module stores only the 3 to 20 spread the leaf states. Other tiers have no source and carry the no-data flag in content. Every constant here is in `params.json` with basis `bible` or `assumption`.

Calibration targets K7 lists as missing, still missing (research, not this module): pick number against career value from `data/people/nfl_draft_history.csv` (K7.4.3), real trade volume (K7.4.4), share of undrafted players on opening rosters (K7.4.5), real violation rates (K7.7.1), yearly roster turnover by program (K7.5.2).

## Not built yet

- The 10, 30 and 50 season acceptance runs (roster legality, cap legality, contract sizes, trade counts, undrafted players making rosters, AI violations detected and punished over 50 seasons) need the world runner (G-81). The 50-season violation test here covers the decision and the log only.
- World wiring: the runner must call `raise` from each owning procedure (list in `OPPORTUNITIES`), feed `college.ts` into `league.recruiting` (`aiProgramWeek` has its own simple offer and contact policy today; K7.5.1 should replace that policy, the mechanics stay), and call `career.staff` for K7.6.1.

## Change requests to the integrator

- **CR-G76-1** `packages/front-office/src/index.ts`: add `export * as gm from './gm/index.ts';`.
- **CR-G76-2** Merged parameter table: add `gm.PARAMS` (`frontOffice.gm`).
- **CR-G76-3** J13.2.1 stream catalogue: a front-office stream name for `streamScope` and `PersistentDraw` (scope: season, day, club, decision; and general manager, key).
- **CR-G76-4** `packages/league/src/index.ts`: add `export * as personnel from './personnel/index.ts';` (also asked by PR 119). It turns on the 7 real-module cases in `test/gm/hookup.test.ts`.

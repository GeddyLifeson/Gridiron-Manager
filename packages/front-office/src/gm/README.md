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

## Decisions this module made

- **GM-01 No truth can enter.** Inputs are `PlayerView` (a club's own D6 estimate: mean and variance). The folder does not import `@gm/people` at all; a test scans for the scouting truth readers.
- **GM-02 Opinions are persistent.** Grade lean and market-read error come from `PersistentDraw(kind, gmId, key)`: the same number on every ask. The world supplies it from J13 streams scoped by the key. A general manager cannot be asked again until he says yes (Q4.3.1).
- **GM-03 Players are worth what they add to a lineup.** `rosterWorth` values each position as slot weights over its best players (weights come with the J14.6.1 table), less contract cost. A deal is judged on `rosterDelta`, so several depth players never add up to a starter.
- **GM-04 No circular gain against one general manager.** `answer` accepts only when his own worth rises by more than his hold. The test recomputes worth before and after 400 random deals and finds the stated net each time, so no chain of accepted deals can return him to the same holdings.
- **GM-05 Between general managers, arbitrage is possible and bounded.** Two general managers hold different opinions (lean, chart bend, position values). Buying from one what another overrates is real football and is limited by the hold, the two-a-week cap and the bend ranges in `params.json`. G-89 (career loop search) should measure the yield.
- **GM-06 Units.** Value is wins over the horizon. Trades compare in chart points with `pointsPerWin` supplied with the fitted chart (C7.5.1). Cost converts at `centsPerWin`, recomputed each offseason by `goingRateCentsPerWin`.
- **GM-07 Rule values stay out.** Rookie contract length, rounds, roster limits, list rules and position minimums are arguments the caller reads by key.
- **GM-08 Restructures.** Under any discounting, pushing money later always looks free. `capStyle` scales the cost of a restructure both ways (a pay-as-you-go general manager counts it dearer), so only general managers who push money, or are under pressure, do it by default.

## Facts

K7 states "None sourced" for these leaves: philosophy and behaviour fields are design content (Assumption), so there is no fact row to add and nothing here is a real-world number. Every constant is in `params.json` with basis `bible` (the leaf gives the starting value) or `assumption`.

Calibration targets K7 lists as missing, still missing (research, not this module): pick number against career value from `data/people/nfl_draft_history.csv` (K7.4.3), real trade volume (K7.4.4), share of undrafted players on opening rosters (K7.4.5), real violation rates (K7.7.1). The draft test only checks that the relation is positive and well short of perfect.

## Not built yet (see the handoff)

- K7.5.1 and K7.5.2 college recruiting boards, transfers, retention and the pay budget (the K7.1.2 record and `blendCollege` are here).
- K7.6.1 coaches hiring coaches.
- K7.7.1 violation opportunities: `campFine` returns `violation_opportunity` and stops; the K2.8.2 decision and the L8.2.5 pipeline (`league.compliance`) are not wired.
- G-57 adapters: needs board, ready list and camp evaluations into `NeedsInput`, `fillGap` and `CutdownInput`.
- The 10, 30 and 50 season acceptance runs (roster legality, cap legality, contract sizes, trade counts) need the world runner (G-81).

## Change requests to the integrator

- **CR-G76-1** `packages/front-office/src/index.ts`: add `export * as gm from './gm/index.ts';`.
- **CR-G76-2** Merged parameter table: add `gm.PARAMS` (`frontOffice.gm`).
- **CR-G76-3** J13.2.1 stream catalogue: a front-office stream name for `streamScope` and `PersistentDraw` (scope: season, day, club, decision; and general manager, key).

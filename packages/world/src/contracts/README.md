# world.contracts: player contracts, player payroll and the cash floor (C6, C8.3.1)

Every club whose league has a cap holds a contract for each rostered player. Each league year's salaries
go on the club's books through `money.chargeClub` (C6.2.3 rule 1), and at the end of each floor period
the club's player cash is checked against the minimum team cash spending floor (C6.2.3 rule 2, CBA Art. 12
s.9). A shortfall is paid to the period's players and logged.

State lives in `LiveWorld.systemState` under `player_contracts`, so it is folded into `worldHash` and saved
with the world. Rows are schema `ContractRecord`s with player terms (P3.2.4). Cap charges, proration and
cash are computed from them by league `cap` and never stored (P3.1.1).

- `contractsStep(binding, inner)` wraps the roster cycle and runs the year's contract work after it, the
  first time it sees the league year. It reads the cycle's `player_drafted` and undrafted `player_signed`
  events as they pass, so drafted players sign rookie deals of their round's length.
- `runContractYear(world, binding, signings)` does one year's work once: it checks a floor period that just
  closed, ends contracts, opens new ones, and charges each capped club one `player_pay` entry.
- `contractOf`, `clubContracts`, `salaryIn`, `playerCashPaid`, `floorPeriodOf`, `ruleSetFor`.

## Decisions

- **PC-01** A club gets contracts when its league holds `cap.amount_<rulesYear>` (MO-02: today's rules in
  every year). College agreements (T5, T7) are not here. `skipTeam` leaves out a club the world must not
  write for.
- **PC-02** (Assumption: the pay rule. No figure in it is invented.) A veteran is paid his minimum (C6.4.1)
  plus the club's rate times his observed grade above the club's replacement level at his position. The rate
  spreads the owner's budget, capped at the cap, over the whole roster: rate = (min(budget, cap) minus the
  roster's minimums) / (the roster's summed grade above replacement). The money comes only from the cap
  (F-cap-0042), the minimum table (F-cap-0012 to F-cap-0041) and the owner budget the money module already
  draws (C6.2.3 rule 3, a bible Assumption). New veteran money is cut back so the year's payroll stays under
  the cap. Grades are the club's own `scouting.observe` look (K9), and replacement is the turnover
  `gm.replacementQuantile` of the club's grades. The salary is flat across the years. A year's salary is never
  below that year's minimum.
- **PC-03** Contract length follows C8.3.1 rule 3: years run to the D8 prime end of the position (turnover
  `ageCurve`), from 1 up to the market ceiling (`league.market.maxContractYears`, an Assumption in the market
  module). A founding contract is part way through its term: its remaining years are drawn from 1 to that
  length on stream `world.contracts.founding`, so the founding contracts do not all end in one year.
- **PC-04** Floor periods and their percents are the league-rules keys `cap.min_cash_period_<from>_<to>_pct`:
  2017 to 2020 at 89, then 2021 to 2023, 2024 to 2026 and 2027 to 2030 at 90 (CBA Art. 12 s.9(a), (b);
  keys from PR 282). Each named period is checked at its own percent. Outside them, periods are
  `floor.periodYears` (4) long, the last period's length (the C6.2.3 edge case keeps it past 2030), at
  `cap.min_cash_spend_pct` (MO-02: today's rules). Read backward from 2017 the same rule gives 2013 to 2016,
  and so on. A level with no floor key has no floor.
- **PC-05** Rookies sign the fixed length by rule key (`rookie.length_round_1`, `rookie.length_later_rounds`,
  `rookie.length_undrafted`; F-cap-0006 to F-cap-0008) at the minimum for each year's credited seasons. They
  get no signing bonus. The slot table is unsourced (C6.4.2 open question): only the 2026 first pick and pick
  32 are sourced, and those two points do not make a table. First-round deals are fully guaranteed (C6.4.2
  rule 3, 2 of 3). The fifth-year option year and the undrafted bonus pool split are not modelled yet.
  Founding players sign as veterans whatever their service, because the world holds no draft record for them.
- **PC-06** A contract ends when it runs out, when the club no longer rosters the player, or when he leaves
  football. A release before the last year pays the guaranteed salary still owed, all at once, as player pay.
  This is a simplification: the CBA pays on schedule, and offset is not modelled. Retirement ends the contract
  outright, where the CBA would toll it on the reserve/retired list.
- **PC-07** A league year's salaries are charged once, at the first pass of the year, after the roster cycle,
  as one `player_pay` entry per club (the same timing as staff pay, MO-07). The world's contracts carry no
  bonuses, so cash equals the cap charge.
- **PC-08** (Assumption: the split.) A shortfall is charged in the league year after the period. The CBA says
  by the next September 15 (Art. 12 s.9(c)). It is paid "directly to the players who were on such a Team's
  roster at any time during the applicable seasons" (same section): here, every player the club paid in the
  period. Each gets an equal share, because the NFLPA's allocation instructions are not public. Only the
  years the world paid count, each against that year's cap, so a world that starts mid-period is held to
  the years it ran.
- **PC-09** The floor counts player pay only (`player_pay`): never staff pay, fines or earlier shortfall
  payments (MO-10).
- **PC-10** The user's club is included today, because the world runs its roster. Once the career module
  writes the user's player contracts, bind `skipTeam` for that club.

## Sources and status

| Value | Where | Status |
|---|---|---|
| Cap 2026 | `cap.amount_2026`, F-cap-0042 | From the fact register |
| Minimum salary by credited seasons | `cap.min_salary_y2026_cs*`, F-cap-0012 to F-cap-0041 | From the fact register |
| Rookie lengths 4, 4, 3 | `rookie.length_*`, F-cap-0006 to F-cap-0008 | From the fact register (bible C6.4.2: Verified) |
| 25 percent rookie increase rule (checked by the test) | `rookie.max_annual_increase_pct`, F-cap-0009 | From the fact register |
| Floor 90 percent | `cap.min_cash_spend_pct`, F-cap-0001 | From the fact register (bible C6.2.3: Verified) |
| Floor periods and percents (2017-20 at 89, 2021-23, 2024-26, 2027-30 at 90) | `cap.min_cash_period_*_pct` (PR 282), CBA Art. 12 s.9(a), (b) | From the fact register |
| Shortfall paid to players rostered in the period, by Sept 15 | CBA Art. 12 s.9(c) | Rulebook only; bible C6.2.3: 1 of 3 |
| Owner budget 95 to 110 percent of the cap | C6.2.3 rule 3, money module | Assumption (bible) |
| First-round rookie deals fully guaranteed | C6.4.2 rule 3 | 2 of 3 (bible) |
| Pay above the minimum by observed grade (PC-02) | this module | Assumption |
| Years to the D8 prime end, market ceiling 5 (PC-03) | C8.3.1 rule 3, market params | Bible rule; ceiling Assumption |
| Four-year periods outside the CBA (PC-04) | C6.2.3 edge case | Assumption (bible) |
| Equal shortfall shares (PC-08) | this module | Assumption |

## Measured on the trimmed test world (founding year, 3 clubs)

Founding payroll is 100.0 percent of the cap at every club (owner budgets are at or above the cap). The
top five contracts are 4 to 7 percent of the cap each, the median is $3.3M to $4.4M, and 19 or 20 of the 53
players are at about the minimum. Real top deals take far larger shares of the cap. Calibrating position pay
shares is open research (C8.3.1 open question, M1.1.1), so PC-02's linear spread is flagged, not tuned.

## Gaps

- Free agents are priced by PC-02, not by the C8.3.1 market (`market.expectedContract` over the world's
  position scale with demand and time factors). The turnover cycle's free agency runs no priced offers yet
  (TO-04, TO-07). The next step is to feed these contracts into the front office (`costCentsByYear`, and
  `centsPerWin` from `gm.goingRateCentsPerWin`) so cap room enters roster decisions.
- Not modelled: signing, roster, option and workout bonuses; incentives; restructures and extensions; tags
  and RFA tenders; trades; practice squad pay; the top-51 offseason rule; carryover and settlement; dead money
  from proration (no bonuses exist to prorate).
- Players' personal income is not recorded (the E6 sheets are for staff). Shortfall shares are logged in
  `floorChecks`.
- K7's plan to meet the floor (C6.2.3 AI use) is not built. PC-02 sets payroll at the budget, so only an owner
  who does not pay can fall short today.

## For the integrators

- Barrel: `export * as contracts from './contracts/index.ts';` in `packages/world/src/index.ts`.
- PARAMS: `world.contracts` (`floor.periodYears`).
- P5 save slot for `systemState.player_contracts`.
- Composition root: `moves: contracts.contractsStep(cb, turnover.movesStep(b, turnover.rosterMovesStep(b)))`,
  with `cb = { rule: b.rule, keys: (level) => <the level's league-rules key names>, rulesYear: 2026 }`, the
  same rules year as `money.capFromRules`.

# world.contracts: player contracts, player payroll and the cash floor (C6, C8.3.1)

Every club whose league has a cap holds a contract for each rostered player. Each league year's salaries
go on the club's books through `money.chargeClub` (C6.2.3 rule 1), and at the end of each floor period
the club's player cash is checked against the minimum team cash spending floor (C6.2.3 rule 2, CBA Art. 12
s.9). A shortfall is paid to the period's players and logged.

State lives in `LiveWorld.systemState` under `player_contracts`, so it is folded into `worldHash` and saved
with the world. Rows are schema `ContractRecord`s with player terms (P3.2.4). Cap charges, proration and
cash are computed from them by league `cap` and never stored (P3.1.1).

- `contractsStep(binding, inner)` wraps the roster cycle and runs the year's contract work after it, the
  first time it sees the league year. It reads the cycle's `player_drafted` and `player_signed` events as
  they pass, so drafted players sign rookie deals of their round's length and each free agent's C8.3.1
  suitors are counted the moment he signs (`suitorsAt`).
- `sourcedScale(position)`, `publicPercentiles`, `marketPrice`: the real pay scale by position and the
  market line (scale.ts, PC-11).
- `runContractYear(world, binding, signings)` does one year's work once: it checks a floor period that just
  closed, ends contracts, opens new ones, and charges each capped club one `player_pay` entry.
- `contractOf`, `clubContracts`, `salaryIn`, `playerCashPaid`, `floorPeriodOf`, `ruleSetFor`.

## Decisions

- **PC-01** A club gets contracts when its league holds `cap.amount_<rulesYear>` (MO-02: today's rules in
  every year). College agreements (T5, T7) are not here. `skipTeam` leaves out a club the world must not
  write for.
- **PC-02** (replaced by PC-11 and PC-13.) The first version paid a veteran his minimum plus a club rate
  times his observed grade above replacement, a linear spread flatter than the real league.
- **PC-03** Contract length follows C8.3.1 rule 3 through `market.contractAtTime`: years run to the D8 prime
  end of the position (turnover `ageCurve`), from 1 up to the market ceiling (`league.market.maxContractYears`,
  an Assumption in the market module). A founding contract is part way through its term: its remaining years are drawn from 1 to that
  length on stream `world.contracts.founding`, so the founding contracts do not all end in one year.
- **PC-14** (supersedes PC-03's years) Veteran contract years come from the real league: `sourcedYears` reads
  `length-scale.json` (OverTheCap veteran signings 2011-2025, built by `facts/aging-build/build.py`, fact rows
  F-aging-0023..0029, status 1 of 3). The cell is the pay tier (the public percentile, read as the percentile of
  cap share at the position) by age band; the player's place within his tier picks the quantile of that cell's
  years, so the better-paid in a tier sign longer. The market ceiling still applies. Real flow: 78.9 percent of
  veteran signings are one year, mean 1.40 years. (PR 286's 57 percent was over active contracts only, which keeps
  long deals and drops expired one-year deals.)
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
- **PC-11** (Data 1 of 3.) Pay comes from the real league's scale. `pay-scale.json` holds, for each world
  position, the shares of the cap of OverTheCap's active contracts (`apy_cap_pct`, average per year over the
  cap of the signing year) at 51 evenly spaced percentiles, best paid first. `facts/market-pay-build/build.py`
  builds it and the fact rows F-market-pay-0001 to 0020 from the nflverse `contracts` release (file dated
  2026-11-25; 2,546 active contracts). Mapping (Assumption): T reads LT and RT, G reads LG and RG, DE reads ED,
  DT and NT read IDL, OLB, ILB and MLB read LB, FS and SS read S; a position not in the file reads every
  position pooled. A player's place on the scale is his public grade rank at his position among the players
  rostered at his level's capped clubs this year (D6 public look, ties share the middle rank). The market line
  (`market.contractAtTime`) gives the years and the guarantee share; the guarantee is carried as fully
  guaranteed salary in the first round(years x share) years, since the world's contracts hold no bonuses.
- **PC-12** A free agent (`player_signed` with kind `free_agent`, early contact included) is paid the C8.3.1
  market price: the scale share times the cap times the demand factor of his suitors, times the time factor.
  Suitors are counted when he signs: the capped clubs of his level with no more players at his position than
  the level's median club and room under the cap for his scale price (open contracts' salaries this year, and
  the minimum for each rostered player still without one). The world signs all its free agents in one pass at
  the market's opening, so the time factor is 1 (the first wave) unless the binding's `marketTime` says
  otherwise. Each year's signings and prices are kept in `lastMarket` for the front office's going rate.
- **PC-13** (Assumption: the level.) A club spends its owner's budget, capped at the cap (C6.2.3 rule 3).
  Founding players and re-signing veterans are priced at the scale share itself (demand and time neutral).
  Then the year's new veteran money above the minimum moves in proportion to each player's price until the
  payroll meets the budget: down to fit, or up, with no player past the top of his position's scale. The
  scale sets who is paid what relative to whom; the owner's budget sets the club's total. Released
  guarantees of the year count against the room.
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
| Pay shares of the cap by position and rank (PC-11) | `pay-scale.json`, F-market-pay-0001 to 0020 | 1 of 3 (OverTheCap via nflverse; second publisher and tag cross-check owed) |
| World position to OverTheCap position mapping (PC-11) | `build.py` | Assumption |
| Suitors: need at the median, room for the scale price (PC-12) | this module | Assumption (C8.3.1 rule 2 names need and room, not the tests) |
| Club spends its owner budget, prices move in proportion (PC-13) | this module | Assumption |
| Veteran years by pay tier and age from OverTheCap signings, market ceiling 5 (PC-14) | length-scale.json, F-aging-0023..0029 | 1 of 3; ceiling Assumption |
| Four-year periods outside the CBA (PC-04) | C6.2.3 edge case | Assumption (bible) |
| Equal shortfall shares (PC-08) | this module | Assumption |

## Measured on the trimmed test world (8 pro clubs, founding and four offseasons)

Founding: payroll is 100.0 percent of the cap at every club (owner budgets are at or above it). The
best-paid contract is 24.5 percent of the cap (a quarterback, the real top is 24.5), the next are 17.4, 15.5
and 14.9, and the median contract is 0.51 percent (real median at the busiest positions 0.4 to 0.5). Every
later year stays at 100 percent of the cap with the owner budgets as drawn. About 175 free agents sign each
offseason, each priced by PC-12.

Contract length (PC-03) is short against the real league: 88 percent of the world's veteran deals are one
year, where OverTheCap's active veteran deals (signed four or more years after the draft, 959 of them) are 57
percent one year, mean 1.8 years. The D8 prime end is 25 at most positions, so most veterans have one
productive year left by rule 3. This is reported, not tuned: it belongs to the D8 curve and C8.3.1 rule 3.

## Gaps

- The scale is the real league's, not one built from the world's own contracts (C8.3.1 rule 1 as written).
  The world's rookies are paid the minimum (no slot table, PC-05), so a world-built scale would sink at the
  rank of every first-round rookie; switch once the slot table is sourced and check the position spend
  shares (C8.3.1 acceptance, within 2 points over 30 seasons).
- Free agency is one pass with no offers: the price is the market line, not the result of clubs bidding
  (`gm.roundOffers`, `market.choose`). The world's free agents are only the players cut or unsigned:
  expiring contracts do not send players to the market (they re-sign at the scale price).
- The fact rows are 1 of 3. Owed: a second publisher (Spotrac positional pages) and the franchise tag
  cross-check (F-league-0013, the average of the top five prior-year salaries at each position against the
  league's announced tag figures). The cloud reaches neither site; it needs a browser on Marlon's PC.
- Not modelled: signing, roster, option and workout bonuses; incentives; restructures and extensions; tags
  and RFA tenders; trades; practice squad pay; the top-51 offseason rule; carryover and settlement; dead money
  from proration (no bonuses exist to prorate).
- Players' personal income is not recorded (the E6 sheets are for staff). Shortfall shares are logged in
  `floorChecks`.
- K7's plan to meet the floor (C6.2.3 AI use) is not built. PC-13 sets payroll at the budget, so only an owner
  who does not pay can fall short today.

## For the integrators

- Barrel: `export * as contracts from './contracts/index.ts';` in `packages/world/src/index.ts`.
- PARAMS: `world.contracts` (`floor.periodYears`).
- P5 save slot for `systemState.player_contracts`.
- Composition root: bind the front office with the contracts binding, `policy: turnover.gmPolicy({ contracts: cb })`,
  so free agents carry their minimum and market years (TO-07). Optional: `cb.marketTime` from the calendar.
- New fact file `facts/market-pay.json` (measured-rate rows, cited by `pay-scale.json`, not by a rule set).
- Composition root: `moves: contracts.contractsStep(cb, turnover.movesStep(b, turnover.rosterMovesStep(b)))`,
  with `cb = { rule: b.rule, keys: (level) => <the level's league-rules key names>, rulesYear: 2026 }`, the
  same rules year as `money.capFromRules`.

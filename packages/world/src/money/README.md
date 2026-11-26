# world.money: club cash and personal payments (C6.2.3, E6)

The off-screen world's money. State lives in `LiveWorld.systemState` under `club_money` and `person_money`,
so it is folded into `worldHash` and saved with the world.

- `cashBudget(world, teamId, year, cap)`: the owner's cash budget for a league year (C6.2.3 rule 3).
- `cashCommitted`: the cash the club actually paid that league year (C6.2.3 rule 1).
- `cashLeft`: budget minus committed. It can go below 0; an overspend is the owner's to answer.
- `chargeClub` / `chargePerson`: record a payment. `personalPaid` sums a person's.
- `capFromRules(rule, rulesYear)`: the cap reader over the turnover binding's rule reader.
- `payStaffYear(world, seasonYear)`: a league year's staff pay, once (E3.2.1). Each club's total is one
  `staff_pay` entry through `chargeClub`; each person's gross pay is kept under `person_income`.
- `payrollStep(inner)`: a weekly step with the year's payroll run before it, the first time it sees the year.
- `seatPay`, `defaultPayTier`, `grossPay`, `priorPay` (the E6.1.2 `priorPayCents`), `staffPayCommitted`.

## Decisions

- **MO-01** A fine with a published amount is paid in the league year it is ordered: a club's fine from the
  owner's cash, a person's fine from his own pocket. A person's fine is never moved to the club, even when the
  order allows repayment, because repaying is the club's choice and no off-screen policy makes it yet. An order
  with a null amount pays nothing (CO-08: no invented figure).
- **MO-02** The cap comes from `cap.amount_<rulesYear>` (F-cap-0042 for 2026, unit USD whole dollars, converted
  to cents). Every league year reads the same rules year, under the ruling that the past is played under today's
  rules (Marlon, 2026-11-26), so budgets do not move with the calendar.
- **MO-03** No personal opening balance sheet is drawn yet (pay now exists, see Gaps for what else it needs). E6.1.2 opens a sheet from modelled prior pay; the world
  holds no staff pay (only contract end years), and general managers, the people fined today, sit on no
  pay-band rung. Drawing a balance anyway would be a number from nowhere. `personalPaid` is the debit side
  that sheet will carry once world pay exists.
- **MO-04** The owner is the boss chair (`TeamRecord.ownerPersonId`). His L5.1.1 profile is drawn from the
  world seed, the club and the owner on stream `world.money.owner`, the same every time it is read. The budget
  share runs linearly from the low to the high share by his `spending` weight.

- **MO-05** A seat's yearly pay is the median of its E3.2.1 band (career `contract.payBand(tier, rung)`) at
  revenue index 1. E3.2.1 prices an offer at the median times a leverage multiplier (E3.5.2); no negotiation
  runs off-screen, so the multiplier is 1. The bands are 2025 dollars and every league year reads them
  unchanged, by MO-02's ruling. A seat marked `paid: 'none'` pays nothing; a stipend seat reads its rung's band.
- **MO-06** (Assumption) The generated world names no "power four". A program in the top college level
  (`college_top`) and the top X9.1.1 resource band reads the `power_four` bands; other `college_top`
  programs read `group_of_six`. Pro clubs read `pro`. The reader is a parameter (`PayTierRead`) so a content
  field can replace it.
- **MO-07** Staff pay for a league year is charged once, at the first weekly pass of the year, to the holders
  of the seats at that moment. A person is paid once per club per year, for his best-paid seat there (S1.1.1
  lets one person hold two). An acting holder keeps his own seat's pay and is not paid for the seat he
  covers; an interim holder is paid as the holder. A mid-year change is not prorated yet, and a fired coach's
  remaining guarantee (E3.3) is not paid off-screen yet.
- **MO-08** Off-ladder seats (general manager, owner seat, strength staff, athletic director, president) have
  no pay band in E3.2.1 or S9, so they are not paid and the payroll counts them (`offLadderUnpaid`). No
  figure is drawn for them until sourced bands exist.
- **MO-09** The second college level (`college_second`) has no sourced band: its seats are not paid and are
  counted (`noBand`), rather than borrowing the group of six bands.
- **MO-10** Staff pay counts toward cash committed (C6.2.3 rule 1 is "money actually paid"). Note for the
  bible: the owner budget (95 to 110% of the cap) was sized on player money, and the C6.2.3 rule 2 floor
  counts player cash only. A pro staff at band medians costs about $22M to $24M a year (fixture world, 2026
  cap), about 7% of a budget. `staffPayCommitted` gives the staff share alone so the floor can exclude it.

## Sources and status

| Value | Where | Status |
|---|---|---|
| Budget 95% to 110% of cap by owner profile | C6.2.3 rule 3 | Assumption (design tuning), the bible's own starting value |
| Cash committed is the money actually paid | C6.2.3 rule 1 | Bible rule |
| Cap 2026 | `cap.amount_2026`, F-cap-0042 | Status from the fact register |
| Staff pay bands by tier and rung | career `contract/defaults.json`, E3.2.1 | Per cell basis there: pro rungs 9 and 7 edges 1 of 3, typical Assumption; pro rung 5 Assumption (no source); pro rung 3 anchored on one 2018 estimate (1 of 3); power four rungs 5 and 7 and group of six rung 5 on single primary contracts (Rulebook only), edges Assumption; other cells Assumption |
| Median as the off-screen offer | E3.2.1 (median times leverage), MO-05 | Bible rule, leverage 1 is a design choice |
| Power four by resource band | MO-06 | Assumption |

## Gaps

- No player contracts are held off-screen (TO-04), so staff pay and fines are the only payments. When
  player salaries and bonuses land, they go through `chargeClub`.
- The 90% cash floor over periods (C6.2.3 rule 2, CBA Art. 12 s.9(b), F-cap-0001, status from the fact register) is not checked:
  it counts player cash, and the world holds no player cash yet. Checking it now would flag every club.
- College budgets (T2.2) are not in the world.
- Personal opening sheets and the E6 autopilot for AI people (E6.1.1, E6.1.2) still wait on three inputs:
  a tax profile per place (content `taxProfiles` is empty, so every `PlaceRecord.taxProfileId` is null), a
  cost-of-living index per place (not wired), and K2's money settings for AI people (risk, savings rate,
  lifestyle tier, household). Gross pay (`priorPay`) and fines (`personalPaid`) are ready for them.
- Off-ladder pay and second-level college pay need sourced bands (MO-08, MO-09).

## For the integrators

- Barrel: `export * as money from './money/index.ts';` in `packages/world/src/index.ts`.
- PARAMS: `world.money` (`budget.capShareLow`, `budget.capShareHigh`).
- P5 save slots for `systemState.club_money`, `person_money`, `person_income` and `payroll`.
- Composition root: bind `payrollStep` around the weekly `compliance` step (`payrollStep(complianceStep(cb))`)
  so pay is on the books before any fine of the same week.

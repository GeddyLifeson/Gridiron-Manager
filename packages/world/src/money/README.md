# world.money: club cash and personal payments (C6.2.3, E6)

The off-screen world's money. State lives in `LiveWorld.systemState` under `club_money` and `person_money`,
so it is folded into `worldHash` and saved with the world.

- `cashBudget(world, teamId, year, cap)`: the owner's cash budget for a league year (C6.2.3 rule 3).
- `cashCommitted`: the cash the club actually paid that league year (C6.2.3 rule 1).
- `cashLeft`: budget minus committed. It can go below 0; an overspend is the owner's to answer.
- `chargeClub` / `chargePerson`: record a payment. `personalPaid` sums a person's.
- `capFromRules(rule, rulesYear)`: the cap reader over the turnover binding's rule reader. After the rules
  year it returns the generated cap (MO-11).
- `capProjection` / `generatedCapCents`: a league year's cap from projected revenue and the CBA Art. 12
  Player Cost Amount (revenue.ts). Pass `generatedCapCents` to league `cap.teamCapPosition` for any year with
  no `cap.amount_<year>` key.

## Decisions

- **MO-01** A fine with a published amount is paid in the league year it is ordered: a club's fine from the
  owner's cash, a person's fine from his own pocket. A person's fine is never moved to the club, even when the
  order allows repayment, because repaying is the club's choice and no off-screen policy makes it yet. An order
  with a null amount pays nothing (CO-08: no invented figure).
- **MO-02** The cap comes from `cap.amount_<rulesYear>` (F-cap-0042 for 2026, unit USD whole dollars, converted
  to cents). Every league year reads the same rules year, under the ruling that the past is played under today's
  rules (Marlon, 2026-11-26), so budgets do not move with the calendar. That holds up to the rules year; later
  years are MO-11.
- **MO-03** No personal opening balance sheet is drawn. E6.1.2 opens a sheet from modelled prior pay; the world
  holds no staff pay (only contract end years), and general managers, the people fined today, sit on no
  pay-band rung. Drawing a balance anyway would be a number from nowhere. `personalPaid` is the debit side
  that sheet will carry once world pay exists.
- **MO-04** The owner is the boss chair (`TeamRecord.ownerPersonId`). His L5.1.1 profile is drawn from the
  world seed, the club and the owner on stream `world.money.owner`, the same every time it is read. The budget
  share runs linearly from the low to the high share by his `spending` weight.

- **MO-11** A league year after the rules year has a generated cap (C6.2.1 rule 5, CBA Art. 12 s.6(c)).
  Projected revenue (AR) grows each year by a seeded draw on stream `world.money.revenue` keyed by the year
  (mean `revenue.growthMean` 7%, sd `revenue.growthSd` 3 points: the bible's starting values, set from the
  Verified 2013 to 2026 cap history). The CBA sets no growth limit, and a fall year can happen. The cap is
  (Player Cost Amount less Projected Benefits) / clubs + True-Up. Today's rules give the same Player Cost share
  in every year, so the cap is the rules-year cap times the revenue index, rounded to the dollar. No 2025 or
  2027 figure is used (neither is sourced).
- **MO-12** (Assumption: the bucket mix.) The split of AR into League Media, Ventures/Postseason and Local is
  not public: the buckets are equal thirds. The 55/45/40 rates then give 46.7% of AR, under the 48% floor
  (`cap.player_cost_floor_pct_ar`), so the floor sets the Player Cost Amount at 48% of AR. Any mix below the
  floor gives the same cap, and no mix can move the share by more than the 0.5-point band.
- **MO-13** (Assumption.) Projected Benefits and the Joint Contribution Amount move with AR, and AR is earned
  per club, so the number of clubs does not change the per-club cap. The rules-year cap anchors the level,
  and no AR in dollars is drawn (that would need the benefits figure, which is not sourced).
- **MO-14** Off-screen revenue has no surprise, so projected equals actual and the True-Up is 0.

## Sources and status

| Value | Where | Status |
|---|---|---|
| Budget 95% to 110% of cap by owner profile | C6.2.3 rule 3 | Assumption (design tuning), the bible's own starting value |
| Cash committed is the money actually paid | C6.2.3 rule 1 | Bible rule |
| Cap 2026 | `cap.amount_2026`, F-cap-0042 | Status from the fact register |
| Player Cost rates 55/45/40, band 48 to 48.5% of AR | `cap.player_cost_*` keys, CBA Art. 12 s.6(c) | Status from the fact register (Rulebook only) |
| Revenue growth mean 7%, sd 3 points | C6.2.1 rule 5 | Bible starting value (Assumption) from the Verified cap history |
| Equal bucket mix (MO-12), benefits move with AR (MO-13), True-Up 0 (MO-14) | this module | Assumption |

## Gaps

- No contracts are held off-screen (TO-04), so fines are the only payments. When salaries and bonuses land,
  they go through `chargeClub`.
- The 90% cash floor over periods (C6.2.3 rule 2, CBA Art. 12) is not checked.
- College budgets (T2.2) are not in the world.
- Personal opening sheets, pay, tax and the E6 autopilot for AI coaches (E6.1.1) wait on world staff pay.

## For the integrators

- Barrel: `export * as money from './money/index.ts';` in `packages/world/src/index.ts`.
- PARAMS: `world.money` (`budget.capShareLow`, `budget.capShareHigh`).
- P5 save slots for `systemState.club_money` and `systemState.person_money`.

# world.money: club cash and personal payments (C6.2.3, E6)

The off-screen world's money. State lives in `LiveWorld.systemState` under `club_money` and `person_money`,
so it is folded into `worldHash` and saved with the world.

- `cashBudget(world, teamId, year, cap)`: the owner's cash budget for a league year (C6.2.3 rule 3).
- `cashCommitted`: the cash the club actually paid that league year (C6.2.3 rule 1).
- `cashLeft`: budget minus committed. It can go below 0; an overspend is the owner's to answer.
- `chargeClub` / `chargePerson`: record a payment. `personalPaid` sums a person's.
- `capFromRules(rule, rulesYear)`: the cap reader over the turnover binding's rule reader.

## Decisions

- **MO-01** A fine with a published amount is paid in the league year it is ordered: a club's fine from the
  owner's cash, a person's fine from his own pocket. A person's fine is never moved to the club, even when the
  order allows repayment, because repaying is the club's choice and no off-screen policy makes it yet. An order
  with a null amount pays nothing (CO-08: no invented figure).
- **MO-02** The cap comes from `cap.amount_<rulesYear>` (F-cap-0042 for 2026, unit USD whole dollars, converted
  to cents). Every league year reads the same rules year, under the ruling that the past is played under today's
  rules (Marlon, 2026-11-26), so budgets do not move with the calendar.
- **MO-03** No personal opening balance sheet is drawn. E6.1.2 opens a sheet from modelled prior pay; the world
  holds no staff pay (only contract end years), and general managers, the people fined today, sit on no
  pay-band rung. Drawing a balance anyway would be a number from nowhere. `personalPaid` is the debit side
  that sheet will carry once world pay exists.
- **MO-04** The owner is the boss chair (`TeamRecord.ownerPersonId`). His L5.1.1 profile is drawn from the
  world seed, the club and the owner on stream `world.money.owner`, the same every time it is read. The budget
  share runs linearly from the low to the high share by his `spending` weight.

## Sources and status

| Value | Where | Status |
|---|---|---|
| Budget 95% to 110% of cap by owner profile | C6.2.3 rule 3 | Assumption (design tuning), the bible's own starting value |
| Cash committed is the money actually paid | C6.2.3 rule 1 | Bible rule |
| Cap 2026 | `cap.amount_2026`, F-cap-0042 | Status from the fact register |

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

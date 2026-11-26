# Recruiting (G-36)

College recruiting by bible T4: the prospect pool (T4.1), calendar and staff limits (T4.2), evaluation
(T4.3), relationships, reads, negative recruiting, offers (T4.4), visits, commitment, signing and
academics (T4.5), and the numbers board (T4.8). Pure league code: no clock, file, platform random or
display. Imports only `@gm/schema`, `@gm/engine-core` streams and the league's own calendar (G-12) and
compliance (G-28) modules.

## Entry points

- `generateClass`, `generateJucoClass`, `toJucoPool` (pool.ts): a class per year, scaled to world size.
- `recruitingWeek` (season.ts): one week for every AI program and every prospect of a class.
- `previewAct` / `takeAct` (actions.ts): every contact, call, message, evaluation or camp, user or AI.
  The preview lists every rule broken and gives the L8.2.5 warning; nothing is disabled. Taking a
  rule-breaking act gives its normal effect and writes exactly one compliance row through G-28.
- `makeOffer`, `withdrawOffer`, `refuseCommitment`, `negativeClaim`, `settleClaims` (offers.ts).
- `hostOfficialVisit`, `hostUnofficialVisit` (visits.ts); `prospectWeek`, `decommitHazard` (commitment.ts).
- `qualifies`, `meetsTransferRule`, `jucoSeasonsLeft`, `finalRuling`, `readAcademics`, `academicFraud` (academics.ts).
- `numbersBoard`, `placesOpen`, `walkOnPlaces`, `rosterLimitCheck` (classplan.ts).
- `prospectPage` (read-model.ts): what a staff sees. Never carries a truth field (`TRUTH_FIELDS`).

## Ports (league cannot import the people package)

- `ProspectFactory` (context.ts): G-17 person generator makes the person behind each prospect.
- `CircleIds` (pool.ts): person ids for family members and high school coaches.
- `ProgramFacts` (context.ts): program info, opportunity by position, scheme fit, returning players,
  head coach on a day, loss streak. Wired by the world loop.
- `AiPeople` (ai.ts): the staff's disposition (K2.8.2), evaluation skill, judgement error, reach, and a
  conduct stream. G-19 scouting estimates are updated through `GradeSink` (evaluation.ts).

## Rule values

None of the recruiting keys are in `rules-data` yet. Every limit reads its key; a missing key means the
limit is not applied (`missingKeys` lists them). Keys used (keys.ts): `recruiting.model`
(`days_2025` | `opps_2027`), day pools, seats, head coach rules, opportunities, contact, call and message
limits and start dates, `recruiting.signee_cap`, `visits.*`, `iawp.window_years`,
`college.initial_eligibility.*`, `juco.*`, `eligibility.juco_seasons_count`, `eligibility.window_years`,
`league.roster_limit`. Tests use fixture values copied from the bible leaves (test/recruiting/fixtures.ts);
none of them is triple-verified. Requested from the rule values research thread.

## Tuning

`params.json` (215 rows, module `league.recruiting`) holds every number, each with a basis (B = bible
value, A = assumption) and its bible leaf. Calibrated with `test/recruiting/tools/calibrate.ts`
(30 programs, one cycle):

| Target (bible) | Result |
| --- | --- |
| Flips 15 to 23 percent of commitments (T4.5.2) | 16.7 percent |
| School drops 2 to 6 percent (T4.5.2) | 4.0 percent |
| Early signing about 85 percent or more of high school signees | 85.8 percent |
| Offers per signee at top programs 6 to 10 | 9.3 |
| Junior college share of signees 5 to 15 percent (T4.8.2) | 12.2 percent |
| Published list committed by August 85 percent (T4.1.1) | **77 percent (gap)** |

The August share is the one target not met. Raising the weekly commit pace lowers it (the best
prospects wait for more offers), so it needs a model change (earlier offers to the top of the list,
or a per-prospect timing trait), not a constant. The world test checks it at 70 percent or more.

## Data

- `data/regions.json`: hometown share by position and state from the college roster file (86,153
  players, 51 states; one source, status 1 of 3). Built by `test/recruiting/tools/build-regions.ts`.
- `data/roster-shape.json`: the T4.8.1 position shape (Assumption).

## Notes for the bible

- The G-12 college calendar has no fall 2026 contact period (evaluation to November 29, then dead to
  January 1); December contact before the early signing period therefore warns. Check against the
  calendar source.
- Hometown density is now measured (regions.json) instead of the bible's estimate.
- The visit timing window and the signee cap are not encoded as values in the bible.

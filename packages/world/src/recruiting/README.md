# Off-screen recruiting (world binding of G-36)

The G-36 recruiting week (`league.recruiting.recruitingWeek`, bible T4) run for every college program the
world holds, every week of the year, with its state in `LiveWorld.systemState['recruiting']` (folded into
`worldHash`). Nothing here decides a recruiting act: offers, contacts, visits, commitments, flips, drops and
signings are G-36's. This module reads the world into G-36's ports and carries the result back.

## Wiring (composition root)

```ts
const rb: recruiting.RecruitingBinding = { turnover: binding, calendarFiles: calendar.CALENDAR_FILES, policy: () => recruiting.gmRecruitingPolicy() };
cohorts: loop.cohortStep({ ...cohortBinding, recruitLeadYears: recruiting.param('cohort.leadYears') }),
moves: recruiting.movesWithRecruiting(rb, turnover.rosterMovesStep({ ...binding, policy: recruiting.lettersPolicy(binding.policy) })),
```

## Decisions

| Id | Decision | Status |
| --- | --- | --- |
| RC-01 | Recruit classes enter one year early (`CohortBinding.recruitLeadYears`, age 16 instead of 17), so each class has a cycle before it enrols. The first season point also makes the normal-age class, which enrols through the turnover default fill (no world has a recruited first class). | Assumption (D13.3.2 wants four years ahead) |
| RC-02 | A class's cycle opens on the first Wednesday of January of the year before it enrols and closes on its February signing date (G-12 anchor `february_signing`). Two classes overlap in January. This is the window the G-36 calibration used. | Assumption |
| RC-03 | A class first seen more than `cycle.openGraceWeeks` after its cycle opened is not recruited. | Assumption |
| RC-04 | Recruiting periods exist as dated data for one full year (college 2026). Every other year takes those periods moved by whole weeks; a year with dated periods of its own keeps them and is filled after its last one. Projected periods carry status Assumption. Needs the G-12 calendar owner's view. | Assumption |
| RC-05 | World date is the P3.1.2 calendar date. Recruiting weeks are Wednesdays; each pass runs every Wednesday the world date has passed, and the first pass of a season also runs through that season's February signing date. A short schedule catches up at the next season's first pass (so off-screen weeks are not evenly spread over passes, but every week runs). Compliance rows from a catch-up carry their own recruiting date. | Design |
| RC-06 | Stand-ins for facts the world does not hold: academics 50 for every program; money follows prestige; scheme fit 0.5; judgement error 0.15; neutral regional reach; evaluation skill = turnover `grade.aiSkill`; true quality = mean of true attributes; job pressure 0. Programs with no head coach use their first recruiter; a team with no staff does not recruit that pass. | Assumption |
| RC-07 | Returning players for the class plan: on the roster now, with seasons of competition and clock years left in the class's first season (the season under way counted as used). | Design |
| RC-08 | Recruiting runs inside the `moves` slot, before the roster cycle, so the loop order and pass hash keep their shape. Signed letters are handed to turnover through `RosterPolicy.recruitSignings`; a recruit with a letter signs there while the team has a place, otherwise he goes to the default fill. | Design |
| RC-09 | Circle members and high school coaches are not world people: they get ids below zero (member from prospect id and relation, coach from region and school index). | Design |
| RC-10 | Policy hook: offers wanted per room from `gm.offersWanted` (K7.5.1 rule 2, `college.offersPerSignee`), committable offers from `college.committablePerPlace`. Board order stays the staff's own board grades; `gm.recruitBoard` over those grades is owed. | Owed |

## Not bound yet

- Junior college prospects (no junior college pool in the world), transfers (G-37), walk-ons stay with turnover.
- About 45 recruiting rule keys are not in rules-data; an absent key means that limit is not applied (`league.recruiting.missingKeys`). The recruiting model option (`days_2025` / `opps_2027`) cannot be read through the world's numeric rule reader.
- CO-03: the compliance week reads one (pro) rule set; recruiting acts are committed under the college rule set.

## Measured (trimmed world, test fixtures, cloud container)

- 6 programs: about 0.3 s of recruiting per season. 18 programs: about 7 s per season (one full class cycle,
  52 weeks). That is about 0.4 s per program-season, so 130 programs projects to about 50 s per season for
  recruiting alone, against a whole-history budget of about 20 s per season. Most of it is G-36's contact
  path (`aiTry` to `takeAct` to `applyContact`, interest statements) and keyed stream creation. A full-world
  measurement on the PC is owed.
- Letters signed exceed open places: 6 programs signed 155 in one cycle where turnover had about 125 places,
  so about half the letters could not enrol (they leave the world's football). The class plan reads the
  T4.8.1 105-place shape against the world's roster; calibration owed.

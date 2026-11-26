# Scouting read models (item 3b)

Two read models over the observer filter (G-27), for a club the observer works inside only:

| Model | Screen | Bible | Builder |
| --- | --- | --- | --- |
| `scoutingTable` | `football.self_scout`, `week.scouting_report` | O3.6.1, G8.1, G8.2.1, G8.3.1, H2.1.1, H2.2.1, N2.3.1 | `buildTendencyView` (`tendencies.ts`) over `models.tendencies` |
| `scoutingPersonnel` | opponent personnel report, staff's eye on own players | H2.3.1, D6 | `buildPersonnelReport` (`personnel.ts`) over `people.scouting` |

`ScoutingView` has the shape of app-ui `screens/scouting/model.ts` plus `refs` (cut-ups), `teamId` and `partial`, so `scoutingRoutes(source)` can take it as it is. Schemas: `@gm/schema` `read-models/scouting.ts` (`ScoutingTableData`, `ScoutingPersonnelData`, registered in `READ_MODELS`).

## Inputs

- Charted plays are not a world table (CR-G66-4), so the host passes them through `ScoutingSources.tendencies(clubId, teamId)`: the club's own call log for itself, its staff's charting (H2.1.2, with tag error) for anyone else.
- Grades: the club's `personViews` rows first; else `ScoutingSources.estimates(clubId, personId)`, which is the shape of the career year's `ScoutingDesk.estimates` (PR 285). Wire it as `(club, id) => (club === seatTeam ? desk.estimates(id) : null)`.
- Depth chart, names, positions, roster: public world tables.

## Guards

- Self-scout keeps only `source: 'own'` rows of the club; an opponent table keeps only `source: 'charted'` rows, so an opponent's true call log is never reachable (O3.6.1 acceptance). Tested with a planted own-source row.
- No true attribute is read; grades are estimates in the display scale (MA-48). Bands narrow with more film (tested with `people.scouting.update`).

## Readings (assumptions, named)

- **SR-1** Expected starters: the first name at each role of every `off:` and `def:` unit.
- **SR-2** Group grade: equal-weight mean of the group's graded attributes (`roleGrade` with weights 1/k) until F1 and G content publish role weights (D6.2.2).
- **SR-3** Overall: the same mean over the position's primary groups (`people.generator.POSITION_RELEVANCE` 'p').
- **SR-4** Weak links (H2.3.1): pass protection reads `ol_pass` of OT and IOL starters; coverage reads `coverage` of CB and S starters. Backs and tight ends in protection, and linebackers in coverage, are left out for now.
- **SR-5** Strengths and weaknesses: the two highest and two lowest graded primary attributes (fewer when under four are graded).
- **SR-6** Window defaults: `last3` for self-scout (G8.1.1), `relevance` (H2.1.1 weights) for an opponent.

## Not built here

- H2.3.1 matchup notes against the user's players, H2.3.2 expected lineup beyond SR-1, H2.3.3 player tells, H2.5.1 report text and attack points (K3, K6 coordinator AI), caller cards and unscouted looks (models has `callerCard`, `unscoutedLooks`; no screen asks for them yet).

## Requests

- **CR-3b-1** (integrator 2) barrel line `export * as scouting from './read-models/scouting/index.ts'` (or the app-services read-model barrel's convention) and the route source for `scoutingRoutes` from `scoutingTable`.
- **CR-3b-2** (integrator 3) a world table for charted plays (CR-G66-4) so `ScoutingSources.tendencies` can read the save instead of a host callback.

# world/news: X12.2.1 news routing in the live world

The weekly `news` step (last in `WEEKLY_ORDER`). It reads the log rows written since its last pass and
routes them with `league.news`, which owns every routing rule and number. Bind it with
`news: news.newsStep(binding)`; the master history tool does so with no edges.

## What it does each week
- Public rows: news items (`league.news.newsFromEvents`, C10.3.1: X4 score at or above the news floor, or
  always for a head coach or coordinator change), transactions wire items for `roster` rows (C10.1.1), and a
  count of rows at or above the national line (X12.2.1 rule 1).
- Rows that are not public: from their witnesses along warm X7 edges (`league.news.spreadNonPublic`), one hop
  a week, pass chance from edge strength, candor and discipline, 15 percent detail loss per hop.

## Decisions (each an Assumption until its owner says otherwise)
- NW-01 Public reach is a rule, not a record. "Everyone at its level, at once" (rule 1) is read from the event
  by `heardPublic(event, competitionId)`. Writing one delivery per person per public row would cost
  people x rows; the answer is the same.
- NW-02 Witnesses: `people` rows name them; `team` rows are seen by the team's roster, staff seats and
  off-ladder seats plus anyone the row names; `room` rows by the people the row names (the world keeps no
  room lists); `none` rows have no witness and never travel. The dead pass nothing.
- NW-03 Storage window `world.news.keepSeasons` (1): items and deliveries of the current season and the one
  before; every season keeps a tally row for ever. Items can be rebuilt from log rows (C10 makes no world state).
- NW-04 Spread over reachable edges only: the step hands `spreadNonPublic` the warm edges within `maxHops`
  of the witnesses. The draws are the same as over every edge (test), the cost follows the reach.
- NW-05 Season-point rows (hall, cohorts, leaving) are read in the first pass of the next season; their
  tallies go to the season they are dated in.
- NW-06 A missing candor or discipline facet reads as 50, the population middle, as the compliance binding does.

## Not bound yet (owners)
- X7 edges: no edges step keeps edges off-screen, so `edges` is empty and nothing that is not public moves
  (X12.2.1 edge case: public news only). Pass `edges: (w) => ...` once the edges step stores them.
- X4 notability: rows carry no score until the notability step is bound, so only coach changes become items.
- C10.7.1 contact tips, X12.2.2 rumors (L6 speculation) and the user's inbox are on-screen features; the
  history run has no user. `league.news.contactTip`, `resolveRumors` and `selectForInbox` stay for the career.
- Barrel line `export * as news from './news/index.ts'` in `packages/world/src/index.ts` (exports integrator);
  the tool and tests import by path until then.

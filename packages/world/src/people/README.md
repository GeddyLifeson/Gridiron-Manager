# world/src/people: needs, memory, edges and culture in the live world

The X12.1.1 steps `memory` (X6), `edges` (X7), `needs` (X5) and the season-point pass `culture` (X9), bound
to the live world. Each step wraps the `@gm/people` module that owns the rules; nothing here restates a rule.
`peopleSteps(binding)` returns the four handlers for `loop.systemsFrom`; the master history tool binds them.
Event types: pass `peopleEventTypes()` to `createWorld` (the `season_together` basis plus `people.needs` types).

State lives in `LiveWorld.systemState`, plain data, under `people.memory`, `people.edges`, `people.needs`
and `people.culture`. `stateSizes(world)` reports row counts.

## What each step does

| Step | When | Reads | Writes |
|---|---|---|---|
| memory | weekly | log rows since its cursor | short rows for subjects (stake 1.0) and the team room (0.6); at a season's first pass X6.2.1 promotion, pruning, and permanent rows only for the inactive |
| edges | first pass of a season | last season's staff and roster seasons, current job chart | one `season_together` event per team; `worked_under`, `worked_with`, `teammate`, `coached` ties through `formOrGrow`, `rosterSeason`, `coachedSeason` |
| needs | weekly (offseason as one longer update at week 0) | seats, this season's record, this week's wins, `player_signed` rows, culture overrides | X5 state per seated active person; team acts through `weekOutcomes` |
| culture | season point | this season's results and titles, head coach chair by season, owner or AD | drift (X9.3.1), next expectation (X9.2.1), `world.cultures` row |

## Decisions (PD-n)

- **PD-01 Short memory at every tier.** `createMemoryRow` keeps X6.5.1's tier gates (tier 3 forms no short
  row). MA-66 (A3.1.1 row 20, Marlon 2026-11-25) says every system runs the same at every tier and tiers
  differ only in what is recorded, and X13.1.2 lists short memory as "Full" at every tier. The binding passes
  tier 1 for every holder. X6.5.1 amendment owed (sent to the bible fixes thread).
- **PD-02 Notability fallback.** Until the X4 step stamps `notability` on rows, memory uses the X4 base score
  of the type (`awards.baseFor`). Rows then carry the stamped score.
- **PD-03 Sign table.** No event type file has an X6.1.1 role table yet; `memory.ts SIGNS` is content,
  Assumption (signed/drafted +1, released/left unsigned -1, title +1 for the room, folded team -1 for the room).
- **PD-04 Staff ties bounded like roster ties.** X7.1.1 rule 1 forms `worked_with` between every pair on a
  staff. World staffs hold about 70 seats (interns, analysts, students), about 2,400 pairs a team-season.
  The binding forms `worked_with` inside one room (side plus position group) and among the head coach's
  direct reports, plus `worked_under` to the nearest held seat up the chart. Same reason as the roster rule
  ("to bound edge count"). Bible amendment owed.
- **PD-05 Ties of people who left.** A tie whose two people are both inactive or dead can never be touched
  again (X12.1.3 rule 1: no weekly systems). Its live row is retired at the next formation pass; the record
  stays in the log (`season_together` names both) and in the loop's staff and roster seasons. X7.2.2 rule 2
  ("a tie never vanishes") holds for every tie with a living, active party. Without this, a 157-season
  small world holds tens of millions of ties. Bible amendment owed (X7.2.2, X12.1.3).
- **PD-06 Needs nothing measures yet read as met.** Measured: `winning` (season win rate, last season at
  week 0; `game_won` relief), `playing_time` (starters met; backups at `needs.backupPlayingTimeMet`,
  Assumption; `named_starter` relief at week 0), `security` (staff final contract season, Assumption;
  `roster_spot_secured` on signing), `pay` (`contract_signed` relief). `role_and_respect`, `development`,
  `home_and_family`, `autonomy` and `recognition` have no off-screen input yet and read as met. Event hits
  (benched in public, broken promise, dropped goal) have no off-screen source yet.
- **PD-07 Acts.** Only acts that change nothing structural are legal off-screen: `meeting_requested`,
  `trade_requested` (players at levels with a draft, read from the rule key), `effort_dropped`,
  `job_search_started`. `resigned`, `portal_entry` and `holdout_started` wait until the K7, T6 and C6
  owners carry them out; logging them while the person stays would write a false history.
- **PD-08 Inner rows.** `stress_band_changed` and coping rows are written for teams at tiers 1 and 2 only
  (`recordInner`). The update runs for everyone; this is a recording choice (MA-66). Acts and meeting
  requests are always written.
- **PD-09 Culture evidence.** L3 discipline cases and X2.2.1 labels are not recorded off-screen, so drift
  moves patience and tradition only. A head coach who left the chair counts as `fired` (K7 does not say
  fired or hired away yet). Resources are `mid` (CR-G24-2). The projection is the mean of the last three
  seasons until X4.1.2 freezes one. L2.4.1 culture strength is not stepped (its inputs are unbound).
- **PD-10 Postseason goal ids.** The master tool passes level-free placeholders `postseason` and
  `top_fifth` until league-rules content names the C2/T3 goals.
- **PD-11 Pair chemistry.** The X7.2.1 pair term is drawn from the world seed on `pair.chemistry` keyed by
  the two ids only (not the step's season-scoped streams), so a pair has one term for life.
- **PD-12 Ties at rest are packed.** `ties.ts` stores each tie as one flat number row (exact codec); a pass
  decodes only what it touches. `worldHash` folds `systemState` one system at a time with large maps in
  chunks of 2,000, so no single hashed string grows with history.

## Not wired yet (owed by other owners)

- Turnover still uses its own stand-ins `coach.tiePerSeason` and `coach.needsMiddle`; it can read
  `edgesOf(world)` and `needsOf(world)` now.
- Compliance `grievance` (X7) can read the edge state.
- Memory rows promoted to permanent should be exempt from log compaction (X2.4.1 rule 4) once the
  compaction step drops events.

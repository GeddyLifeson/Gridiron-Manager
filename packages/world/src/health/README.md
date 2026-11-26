# Health in the world (D11 off-screen)

The weekly `health` step of the world loop (X12.1.1 order: after `games`). It wraps the G-33 medical
process (`@gm/league` `medical`) and decides nothing medical itself.

| File | Holds |
|---|---|
| `binding.ts` | `healthStep(binding)`, its state in `systemState['health']`, readers (`healthOf`, `isOut`, `openCaseOf`, `injuryHistoryOf`), `diagnosisOf` (J10 region and severity seed to a D11.2.1 catalogue row and grade), `medicalRulesFrom` |
| `from-engine.ts` | `injuriesFromTruth`: the engine's J10.6.1 `injury` truth events to `GameInjury` rows, for a game port whose rosters are world people |
| `events.ts` | `player_injured` (family health, public, minTier 3, never for imported people) |
| `params.ts` | Assumptions: medical staff skill and caution at the scale middle, consultant on call daily, concussion keep window |

## How it runs

1. The games step leaves the week's injury reports in `systemState['games.injuries']` (only when a port
   reports any, so worlds whose ports report none hash exactly as before). `GamePlayed.injuries` absent means
   "this port does not report injuries"; an empty list means none happened.
2. `health` consumes the key, opens one `medical.openCase` per injury (catalogue row from the region, grade
   from the severity seed band, toughness from the D5 facet, prior concussions from the person's history),
   and emits `player_injured` for injuries the staff know of.
3. It advances every open case one world day at a time through the last day of the pass's week
   (`medical.caseDay`). The first pass of a season catches up the offseason days, so injuries heal between
   seasons. Recovered cases leave; the person keeps an `InjuryHistory` (concussion days, major injuries,
   last season-ending season), pruned when the person leaves the world.
4. Games that reported no injury list are counted (`unreportedGames`). The master run writes health into
   run.json `unbound` with that count while it is above zero, so the bake stays provisional.

## Status, stated plainly

- **No injuries reach the world yet.** The real game runs placeholder rosters (not world people) and the
  reference resolver, which makes no injuries (resolver-reference README). The tick engine makes them
  (engine-core fouls-injuries, PR 292 moves the real game onto it), but a port can map them to people only
  when games carry world rosters (G-17 people and M2 depth charts in the game input). Until then the step
  is bound and tested with a test-double port, and the master run reports it as unbound with the reason.
- **Medical rule keys**: `medical.*` keys are requested from G-10 (league.medical keys.ts) and not in
  rules-data. Until they land, `medicalRulesFrom` uses the values G-33 was built and tested with
  (`FALLBACK_RULES`; pro five-step protocol is F-injury-0001) and names each fallback key; the master run
  writes them to run.json `medicalRuleFallbacks`.
- **Not here**: coach health (E8, career/life/health.ts) needs the E7 hour ledger off-screen (heavy weeks),
  which the world does not keep (turnover TO-13), so off-screen coaches have no health state yet. Playing
  through an injury off-screen (no game-day hurt list), the D11.6.1 re-injury multiplier fed back into the
  engine, and the turnover retirement multiplier for major injury (TO-05: `injuryHistoryOf(...).majorInjuries`
  is ready for it) wait on their owners.

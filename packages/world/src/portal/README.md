# Off-screen transfer portal (world binding of T6 and G-37 transfers)

Every college player in the live world may enter the transfer database in the sourced windows, and every
college program recruits entrants into its open roster places. State lives in
`LiveWorld.systemState['portal']` (folded into `worldHash`). Who enters is league college's `entryChance`
(T6.2.1) and whether he may enter on a day is its `entryAllowed` (T6.1.1); this module reads the world into
them and runs the market.

## Wiring (composition root)

```ts
const pb: portal.PortalBinding = { turnover: binding, calendarFiles: calendar.CALENDAR_FILES };
moves: portal.movesWithPortal(pb, recruiting.movesWithRecruiting(rb, turnover.movesStep(binding, turnover.rosterMovesStep(...)))),
// createWorld eventTypes: add portal.PORTAL_EVENT_TYPES
// recruiting board source: portal: portal.portalInput(world)
```

## Rule values and their status

| Value | Where it comes from | Status |
| --- | --- | --- |
| National window, 2026: January 2 to 16 | G-12 calendar `college-2026.json` anchors `transfer_window_open`, `transfer_window_close` | Verified (ESPN, SI, AP) |
| National window, 2027 | `college-2027.json` | as that file carries it |
| National window, other years | calendar pattern (first business day after January 1, 10 days) | Conflict (2027 rule adoption 1 of 3) |
| Postseason exception, 5 days after the last game | `transfer.postseason_extra_days`, F-college-keys-0024 | Verified (who qualifies differs: title-game teams per ESPN, PT-05) |
| Coaching-change window opens 5 days after the hire | `transfer.coach_change_delay_days`, F-college-keys-0025 | Verified |
| Coaching-change window lasts 15 days | `transfer.coach_change_window_days`, F-college-keys-0026 | Verified |
| No limit on transfers | `transfer.max_free` = 0, F-college-keys-0027 | Verified |
| Aid does not end on entry | `transfer.aid_ends_on_entry`, F-college-keys-0028 | 2 of 3 (not read by the world, PT-10) |
| Title game day (postseason exception) | calendar anchor `playoff_final` of the season before | Assumption (pattern: fourth Monday of January) |
| Market close (unsigned entrants) | the day before calendar anchor `season_week1_start` | as the calendar carries it |

Window status per cycle is kept on the cycle (`windowStatus`). Entry-chance weights are league college's
`league.college.entry*` rows (starting values, T6.2.1 names the drivers but no weights).

## Decisions

| Id | Decision | Status |
| --- | --- | --- |
| PT-01 | The portal runs inside the `moves` slot: the last cycle closes before the roster cycle, the new cycle opens after it (so the year's coaching changes and enrolled class are known). The loop order and pass hash keep their shape. | Design |
| PT-02 | A cycle's entries are drawn once, on the first pass of its season, each on a day drawn inside the window that applies to him; he is announced (and leaves his roster, opening the place) when the world date reaches that day. | Design |
| PT-03 | Players who enrolled this season (signed this January) do not enter the same January (`entry.skipNewlyEnrolled`). Eligibility for the cycle's season is counted as RC-07 counts it. | Assumption |
| PT-04 | Stand-ins for facts the world does not hold: satisfaction 0.5 (D12), position-coach tie 0.5 (L1), pay at market (T7 unbound), no role promises. "Team losing" is a losing record last season. | Assumption |
| PT-05 | "Blocked on the depth chart" and "backup with eligibility" are both: not among the starters of his room by his team's own observed grade, with 11 personnel on offense and nickel on defense (F1). The postseason exception applies to the teams that played the previous season's title game (ESPN's reading of F-college-keys-0024). | Assumption |
| PT-06 | A head coaching change stands for a position coach leaving (`positionCoachLeft`). A change on the season's first pass is folded into the main draw; a change later in the cycle gives that team's players the coaching-change window, drawing only the extra chance the change adds, so nobody is drawn twice at full odds. A change after the market close is not given a window. | Design |
| PT-07 | Market: every recruiting Wednesday from the window opening to the market close, programs with roster room (world roster limit less players on the roster), highest prestige first, offer to up to `market.offersPerWeek` entrants who would start for them by their own observed grade (`market.depthToSign`), never to their own former players. Entrants are graded as players with college film (narrower than a high school look, T6.3.1). | Assumption |
| PT-08 | The entrant, best public grade first, signs the offer that scores best on prestige (standing for money and winning) and whether he would start there, plus noise; only programs that still have room count. A signing is the turnover row `player_signed` with kind `transfer`. | Assumption |
| PT-09 | Entrants unsigned at the market close leave playing (`markOutOfFootball`, row `transfer_unplaced`): the world has no lower divisions to drop to. Young ones can still start coaching through TO-15. | Design (lower divisions not generated) |
| PT-10 | The numeric rule reader does not carry boolean keys, so `transfer.aid_ends_on_entry` reads as not applied, which is its sourced value (false). The world does not model aid yet. | Design |

## Measured (trimmed world, 6 programs, 105-player rosters, cloud container)

| Cycle | Entered | Per team | Signed | Unplaced | Via |
| --- | --- | --- | --- | --- | --- |
| 1996 | 165 | 27.5 | 122 | 43 (26%) | window 165 |
| 1997 | 106 | 17.7 | 71 | 35 (33%) | window 76, postseason 30 |
| 1998 | 182 | 30.3 | 117 | 65 (36%) | window 128, postseason 54 |

- T6.2.1 volume target: a quarter or more of scholarship players, about 36 entries per top-level team
  (derived from more than 4,900 entries over about 136 teams, 1 of 3, walk-ons included). The world gives 17.7
  to 30.3 per team (mean 25.2), the low edge of the 30 percent band; 1997 is below it. Entry weights belong
  to league college (G-37) and are not tuned here. A full-world run is owed before tuning.
- T6.2.1 unsigned share: 26 to 36 percent against 30 percent (Assumption) and the 35 to 40 percent
  mid-window snapshot (2 of 3).
- Cost: 4 seasons of the trimmed world with the portal take about 15 s in total (most of it the rest of the loop).

## Not bound yet

- The user's own retention board and market board (T6.2.1, T6.3.1 screens) and the user's entries; this module
  runs AI programs and gives the public list to the recruiting board's portal tab (`portalInput`).
- Tampering before entry (T6.4.1) is not raised off-screen yet; it would go through gm.raise and the L8.2.5
  pipeline like the compliance week.
- Junior college and lower-division sources (T6.3.2): no such pools in the world.
- Players following a departing coach, pay (T7), relationships (L1) and satisfaction (D12) as entry drivers.

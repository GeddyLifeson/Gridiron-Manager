# league/market (G-35): free agency and trades mechanics

Bible C8 (C8.1.1 to C8.4.2) and the mechanics of M5. Rules read directly in CBA 2020 Articles 8 and 9
(`/mnt/project-files/nfl-rules/cba_2020.txt`). K7 (G-76) makes the decisions with these functions;
the user's screens call the same ones (one rule set for user and AI clubs).

| File | Leaf | What it does |
|------|------|--------------|
| `keys.ts`, `data/market-keys.json` | C8 | Rule keys. Keys G-10 has not entered yet fall back to the JSON rows (CBA locator and status each). The league file wins; a test fails if both differ. |
| `dates.ts` | C4.2.4 | The year's market dates from G-12 calendar anchors (window, league year, offer sheet date, draft, UFA tender date, July 22 revert, June 1 and 15, trade deadline, the Tuesday after week 10). |
| `status.ts`, `data/tender-levels.json` | C8.1.1 | Free agent class by accrued seasons; exclusive rights, restricted (five levels), June 1, June 15 and UFA tenders with their dates and salaries; compensation with the upgraded-tender rules; who may sign him on any date. |
| `offer-sheet.ts` | C8.1.1 | Offer sheets: one at a time, no poison pills, likely incentives at most 15 percent, the pick must be held; five days to match, cut off the day before the draft; late sheets owe next year's pick; a match blocks a trade back for a year. |
| `window.ts` | C8.2.1, M5.2.1 | Contact legality (illegal contact is a breakable act for G-28, never refused); no contract before the opening; market rounds; window agreements post at the opening, back out, or wait for cap room. |
| `value.ts`, `data/neighbours.json` | C8.3.1 | Expected contract from the position scale as cap shares, demand, age, injury and the time discount. |
| `choice.ts` | C8.3.2, M5.2.1 | Offer scores with after-tax guaranteed money, waiting, ties, top two reasons, the coach's pitch and the money-gap cap. |
| `trade.ts` | C8.4.1 | Trade legality through the cap (G-16) and roster (G-15) engines, consent rules, picks and tendered rights; surplus valuation with window adjustments; untouchables; the stored record. |
| `deadline.ts` | C8.4.2 | Deadline stance from playoff odds, lean and the coach's voice. |
| `voice.ts` | M5.1.1, M5.3.1, M5.4.1 | Weight of insists, must-keep marks and core names. |

Readings this module made (flagged in the PR):
- The UFA tender is due by the end of the Monday after the draft; "first day of the first training camp" is the rookie report date.
- The head coach may not join the 2026 window call (open question R16a-4); `checkContact` holds the one line to change.
- Tendered-rights trades: "draft choice consideration greater than the compensation" is read as more picks, or an earlier round, than the tender yields.
- The money-gap cap (M5.2.1 rule 4) scales with the player's non-money weight against the median player's.
- League source holds no randomness: backout and the failed physical take a uniform draw from the caller's stream.

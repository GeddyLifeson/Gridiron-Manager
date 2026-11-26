# Schedule module (G-13): decisions, assumptions, open items

Bible leaves: C2.1 to C2.6 (pro), T3.1.1 and T3.1.2 (college). Every number is in `config.json`, each block with its leaf and status as the bible and `research/audit-r-schedule-patterns.md` give it. The league lint bans numeric literals in `.ts`, which is why.

## How it works

- **C2.1.1 opponents.** Fixed parity tables give each rotation block two homes and two aways per club and flip the next time the same two divisions meet (rule 6). The same-place games run round a four-division ring A-C-B-D so each club has one home and one away; the ring reverses every year. The 17th game's host conference alternates (second conference in even years, matching the NFC hosting in 2026). Rotation tables are data; the starting 17th-game offset (the division played two seasons earlier) is the 1-of-3 fact.
- **C2.2.1 weeks.** Each week is a matching; a club's empty week is its bye. Greedy edge colouring with Kempe-chain repair, then Kempe swaps and whole-week swaps under late-acceptance hill climbing. Integer costs only. Hard: one bye in weeks 5 to 14, none in Thanksgiving week, at most 6 clubs on bye a week, at most one other empty week, at most 3 straight road or home games, final week all division, no stadium clash, at most 4 opponents off a bye, the bye after a game abroad when the club chose it, games abroad never in consecutive weeks. Soft: three-game road trips (see below), off-bye opponents above 2, two division games in the last five weeks, a home game after a game abroad when the club skipped the bye.
- **Three-game road trips.** Real seasons have 2 to 4 clubs with one (three in 2026). This solver lacks the stadium-availability and broadcast constraints that force them, so left alone it would produce none. The count is held inside the band as a hard rule, and each season aims at a target drawn inside it. A game abroad counts as a road game for both clubs.
- **C2.3.1 slots.** Weeks are filled in order so rest rules read the previous week. National slots are drawn by attractiveness (prior wins, market tier, stars) raised to a power, damped by each club's national count. The two least attractive clubs get no night game. Tuned so seasons show 2 to 8 clubs with no night game (mean about 4) and 5 to 10 with six or more, against 2026's five and eight.
- **College rotation.** History in, history out. Each season, pairs that have gone a full conference cycle without meeting are forced in, and the rest are chosen by staleness. A conference's first season is chosen so the second season can close the two-year cycle. Hosts alternate by history; conference homes stay within one of half the games (a Dijkstra path-flip repair, protected series weighted four times rotating ones).
- **College non-conference.** In order: protected rivals across conferences, contracts, the 10-power-opponent rule (SEC, ACC, Big 12 stand-ins; from 2027 every power program, because the playoff standard counts the same games), lower-subdivision guarantee games at 0.94 per top team, then peers by proximity. A top team still short hosts another lower-subdivision team, so every top team plays 12.

## Assumptions (named, no real-world number)

- Search weights, budgets and restarts (`pro.solver`, `college` search settings).
- Prime-time weighting (`slots.attractiveness`) and the two-club night exclusion.
- Saturday games per late-season week (2, 1, 2 in weeks 15 to 17).
- International cities for the nine games (3 London-type, one each elsewhere) and their 9:30 a.m. ET slot; Mexico and South America games go to the Sunday late slot. Venue ids are placeholders until C1.3.1 neutral venues exist as world data.
- Second-subdivision season of 11 games; other-tier and second-subdivision conferences play 8 conference games (capped at a round robin).
- 80% of power-versus-other games hosted by the power program; 20% of guarantee games may sit late in the season.
- `school.alderbury` is the independent that counts as a power opponent (the Notre Dame rule).
- Twelve days between games is not in the C2.2.2 table; it is tagged mini-bye.
- Time-zone offsets are standard time. Arizona's summer hour is ignored.

## Conflicts found in the bible (sent to "Apply bible fixes from modules")

1. **C2.3.3 rule 4 and Thursday flex.** The six-day floor would forbid every Sunday-to-Thursday flex, yet the rule allows two a season. The code applies the floor to Sunday and Monday moves and the C2.3.1 rest rules (3 days, never after Monday, at most two short Thursdays) to Thursday moves.
2. **T3.1.1 protected games versus T3.1.2 rule 5.** G-11 gives one school (`school.dellwood`, SEC-like conference) three non-power rivals across conferences, so with nine conference games it has no room for the required power opponent. The code drops the weakest rivalry that season and logs it. Either the data should change or the bible should say which rule wins.
3. **C2.1.1 acceptance 3** says "every club in the other conference at least 3 times" in 12 seasons. With a 4-year cycle that holds exactly (3 meetings). Fine as written.
4. **C2.3.1 west coast.** Only Pacific home games are barred from the early Sunday slot, as the bible says. Mountain-zone home games at 11:00 a.m. local are allowed. Research could check the real rule.

## Requests for the integrator ("Integrate modules: contracts, facade, gate")

- Barrel line in `packages/league/src/index.ts`: `export * as schedule from './schedule/index.ts';`
- A world-level stream name for the scheduler (J13.2.1 lists game streams only); callers pass a `RandomStream`, the world package should derive it as `stream(seed, 'schedule', [season, competitionId])`.
- `ScheduledGame` maps to `GameRecord` in the world package: numeric ids, `kickoff` from `dayIndex`, `phase`, `neutralSite`.

## Rule values owed by G-10 ("Research missing league rule values")

The keys in `params.ts` RULE_KEYS are new. Values and statuses are in `config.json` until the league rule files exist.

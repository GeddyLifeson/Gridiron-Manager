# career/market (G-80)

Job market, hiring and firing. Bible: E2.2.2, E2.3 to E2.7, E4.4.1, E4.6, E4.7.1, S6.3 to S6.5, S7.
One set of functions for every coach in the world: no input marks the user, no input reads a hidden coach
value, and candidate scores and interview scores come only from public records, the hiring party's own
views and what was said in the room.

| File | What | Bible |
|---|---|---|
| `board.ts` | Opening objects with reason and cascade parent, job value and value window, fit line, the jobs board, applying (route, boss learns by route), pool | E2.2.2, E2.3.1, E2.3.3 |
| `score.ts` | Preference vector and candidate score (noise 20% of range), internal bonus, opposite-of-fired, interim discount, head coach interview segments, working interview blend, compliance interview turning | E2.3.2, E2.4.3, E2.4.4, E2.6.2, E2.6.3, S6.4.1 |
| `value.ts` | Market value by rung (path through at most two steps below rung 7; results, reputation and agent above), time-out decay, comeback rung, monthly standing loss | E2.4.1, E2.7.2, S7.3.1 |
| `offers.ts` | Offer lifecycle with deadline and evidence rows, "agreed in principle" hold until his season ends, backing out, leverage inputs for E3, assistant offer card and cross-level list, coach trades (ask, picks, route by rule key) | E2.3.1 rule 6, E2.5.1, E2.5.3, S6.5 |
| `hotseat.ts` | The nine signs with trigger bands, weekly chance, four-week cooldown, off-band rate, owner visits cost hours; assistant view by rung | E4.4.1, E4.7.1 |
| `saving.ts` | Conditions with tests and deadlines, meeting outcomes, bargaining, written plan, staff sacrifice | E4.6.1, E4.6.2 |
| `exits.ts` | Firing regard by context, year-out activities, offset-aware work income, resigning, scramble kinds, lateral moves, retirement hazard (imported people: age and years out only), entrants, search firms | E2.3.4, E2.3.5, E2.7, S7.2.1 |
| `keys.ts` | Rule keys `hiring.coach_trade.mode`, `hiring.search_firm_share`; absent key = no rule | E2.5.3, E2.3.5 |
| `facts.json` | Six fact rows (status computed): F-market-0004 Verified, 0006 2 of 3, the rest 1 of 3 | E2.3.4, E2.3.5, E2.5.3, E2.7.2 |
| `events.ts`, `params.ts` | Event types; design constants (all starting values) | |

Reused, not rewritten: candidate windows, the playoff interview cap, permission and the diverse-interview
count are `career/staff` (G-47); who stays when a head coach goes, interims and promotion seats are
`career/positions` (G-25); pay owed, offset and buyouts are `career/contract` (G-51). Owner confidence and
the firing decision are `front-office/stakeholders` (G-77); career may not import front-office (P1.2.1),
so the world runner passes confidence, media mood and decider traits in as values.

## Decisions

1. Coach trade price in pick points: first = 3, second = 2, mid-round = 1. The cap is the one fully
   reported price, a first and a second (F-market-0004, Verified). The third-round pick back to the
   pursuer in that case is a source conflict and is not used.
2. Interview seats cut at lower rungs by passing fewer segments; scoring is the same function.
3. Hot seat off-band share is 0.15%, not the bible's 3% (see conflicts).
4. The time-out decay compounds by whole years and is linear inside a year (no platform power function).

## Conflicts and owed requests

- **Bible (to "Apply bible fixes from modules")**: E4.4.1 "signs fire at high confidence at 3% of the normal
  chance" gives a sign in 54% of seasons for coaches above 70, against its own acceptance (under 5%). The
  module uses 0.15%, which meets both acceptance lines. Also: F-market-0002 shows 10 openings in the
  offseason after the 2025 season, outside E2.3.4's "five to nine" range (which counts firings 2017-2025).
- **CR-G80-1** (integrator) Barrel: `export * as market from './market/index.ts';` in `packages/career/src/index.ts`.
- **CR-G80-2** (integrator, rule-key research) Add `hiring.coach_trade.mode` (pro `club_consent`, college
  `contract_buyout`) and `hiring.search_firm_share` (college about 0.57 from F-market-0005, 1 of 3; pro
  Assumption) to the dictionary and rule sets. Both fall short of "Rulebook only", so they need research
  or must ship as Assumption-marked league settings.
- **CR-G80-3** (integrator) Register `MARKET_EVENT_TYPES` in the X2 event-type table; `PARAMS` into the
  merged parameter table.
- **CR-G80-4** (integrator) A J13 stream name for market draws (applications, scores, signs).

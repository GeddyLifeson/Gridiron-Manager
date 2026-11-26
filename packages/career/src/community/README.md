# Community and league relations (G-50; bible L8.1, L8.3 to L8.5)

L8.2 (the league office, the L8.2.5 rule-breaking pipeline) is G-28's (`@gm/league` compliance). This module owns what L8 adds around it. Every effect is an order (`../crisis/orders.ts`) for the owning system: no function here writes an attribute, a culture value, an officiating parameter or a contest input.

| File | Leaf | What it does |
|---|---|---|
| `requests.ts` | L8.1.1 | Community requests (one a month in season, two out), none inside 24 hours before kickoff, none in a crisis week; attend, stand in (half the effect, in his own name), move or decline (-1, or -4 on an owner's third decline when he values presence); foundation notability. |
| `league.ts` | L8.3.1 to L8.3.3, L8.4.1 | Clip answers from the truth record (85 percent honest on wrong calls) costing the quality control coach ten minutes each; rule awareness (start 20, officials +15, crew practice +10), the foul multiplier (exactly 1 at 100), emphasis factor and staff-advice error; documentary routing shares and access orders; the conference's default ladder reading only `conference_discipline.*` keys. |
| `cases.ts` | L8.4.2, L8.5.1 | Self-report window and the minor-to-major chance, the coach's responses mapped onto G-28's (`minimise` and `blame_assistant` are not cooperation) and their costs, show-cause restrictions that follow the person, interview answers by assistants, the interim's acts. |
| `clinics.ts` | L8.4.3 | Invitations by visible history, ties with a dated source event, high school familiarity, ideas copied on a visit, and the scouting cost of sharing real detail. |
| `params.ts` | all | Design constants. L8 marks the processes Unverified and every size an Assumption; nothing here is a real-world fact. |

## Decisions

- Conference discipline reads its own keys (`conference_discipline.fine_cents`, `.suspension_games`) so no league key is read when the body is the conference (L8.4.1 acceptance). Every value ships empty; the default ladder applies.
- Documentary "open" access keeps the standard 30 percent sample (the bible gives standard and minimal only); module assumption.
- The no-request rule uses whole days: nothing dated the day of kickoff or the day before.
- Penalties, head coach responsibility and show-cause orders are G-28's. `restrictionsFrom` only reads its orders so E2 can see them on the person.

## Owed

- CR-G50-1 barrel line `export * as community from './community/index.ts'`.
- CR-G50-3 the three keys in `RULE_KEYS` (league.ts) into the dictionary.

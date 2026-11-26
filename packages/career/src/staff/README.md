# career/staff (G-47)

Staff structure, hiring staff and support people. Bible: L4 (all leaves), K7.6.1 mechanics, C11.6, E2.3.1.
Seats, reporting lines, delegation and succession come from `career/positions` (G-25); this module adds
the people side: who is hired, how, and what working for the head coach does to them.

| File | What | Bible |
|---|---|---|
| `keys.ts` | Hiring rule keys; an absent key means no such rule (the college record has none) | E2.3.1, C11.6.1, L4.2.1 |
| `window.ts` | Candidate window state machine, playoff interview cap, move kind, permission check, tampering test | E2.3.1, C11.6.1, C11.6.2, L4.2.1 |
| `network.ts` | `coach_tie` from shared staff seasons only, years behind each tie, witnesses, coaching tree, known-first order | L4.2.3 |
| `hiring.ts` | Interviews (max 4 topics, evidence rows, no rating), references, promises, compatibility panel, offers and acceptance, candidate score (same for user and AI), searches, AI firing rule, diverse interview count | L4.2.2, L4.2.4, K7.6.1, E2.3.1 |
| `contracts.ts` | Assistant contracts (rules block, `ASSISTANT_TERMS_UNVERIFIED`), budget line, dead money with offset, inherited staff | L4.2.5, L4.1.4 |
| `record.ts` | L1.1.1 record shape, staff needs, `buy_in`, weekly need clock | L4.3.1 |
| `manage.ts` | Autonomy from settings and edits, room conditions, disagreement, development factor, hours and coverage, `coach_prep`, `report_up` | L4.3.2 to L4.3.6, L4.4.3 |
| `leaving.ts` | Request choices (refuse marked when it breaks a rule), refusal and support memories, departure room effect, passed over, firing witnesses, interim bond | L4.4.1, L4.4.2 |
| `violations.ts` | Acts for the L8.2.5 pipeline (`league.compliance.commitAct`) | L4.2.1, L4.5.1, C11.6 |
| `slots.ts` | Off-campus recruiter slots | L4.5.1 |
| `support.ts` | Chaplain and chapel | L4.6.1 |
| `events.ts`, `params.ts` | Event types; design constants (all starting values, Assumption in the bible) | |

Rulings applied: the head coach may hand play calling to anyone (positions `setCaller`); every task a held
chair owns leaves the head coach's list (good staff means less work), and `coach_prep` prices what he did
not see himself. No coach has a rating, skill or loyalty number; every interview statement links to rows.
Rule-breaking (blocking a protected interview, tampering, skipping required interviews, over-cap
recruiters) is never blocked: it is an `Act` for the one compliance pipeline, same code for user and AI.

## Contract notes

- `RelationRecord` mirrors L1.1.1. G-46 owns the type; swap to its export when it merges.
- Memories are returned as `MemoryDraft` rows for `people.memory`; stress inflow as numbers for `people.needs`.
- Randomness comes in as a `RandomStream`; the caller owns the stream name (requested, CR-G47-4).

## Change requests

- **CR-G47-1** (integrator) Barrel: `export * as staff from './staff/index.ts';` in `packages/career/src/index.ts`
  (and `positions`, CR-G25-4, which this module imports by relative path until then).
- **CR-G47-2** (integrator, league-values research) Add the 13 `hiring.*` keys in `RULE_KEYS` to the
  dictionary and the pro rule set with fact rows; the college record carries none of them (E2.3.1).
- **CR-G47-3** (compliance owner) Add classes `interview_block` (L4.2.1 (1), refusing a protected interview),
  `diverse_interview` (L4.2.1 (4), E2.3.1) and `staff_limits` (L4.5.1, T9.5). Until then `commitAct`
  returns `unknown_class` for them.
- **CR-G47-4** (integrator) A J13 stream name for staff hiring draws (offers, references).
- **CR-G47-5** (integrator) Register `STAFF_EVENT_TYPES` in the X2 event-type table.

No real-world number is typed in this module: league values are rule keys, and every constant in
`params.ts` is a design starting value with its leaf.

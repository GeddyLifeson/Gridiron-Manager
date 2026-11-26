# G-46 player relationships and morale effects: decisions

Bible: L1, D12.5, D12.6. Plan row G-46. Every number is a starting value of the bible (`basis: bible`) or this module's choice where a leaf names a rule but gives no number (`basis: assumption`, with the leaf in the row). L1 says no measured source exists for any relationship effect size, and D12.5 marks its sizes "Assumption (design tuning)", so there are no fact rows. The one real-world switch, whether players hold contracts, is the rule key `league_rules.player_contracts` (G-10 owns the value; the caller passes it until then).

## Ownership with G-23 and G-24

- G-23 (people/needs, people/memory) owns needs, stress, breakpoints (X5) and the memory layers (X6). The L1.1.4 and L1.1.5 numbers are not reimplemented here; X5 wins for real players (coordinator ruling 2026-11-26).
- G-24 (people/relationships, not merged yet) owns ties between people and moves the ties of people who hear of a promise's outcome (`resolvePromise`). It says "L1 owns the ledger and judges kept, broken or void". This module does that judging and writes the L1 memories and the coach_word change. The caller passes `judgePromise`'s outcome on to G-24's `resolvePromise`.
- D12.2 satisfaction is an input here (from D12 and G-23); this module reads it for D12.5.1 and D12.5.2 and never sets it.

## Choices

1. **One directed record per pair** (`RelationshipRecord`): trust, respect, familiarity, role belief and the L1.1.2 ledger. Events move the values at once (L1.1.1: "each value moves only through events"); the ledger keeps the decaying strengths for the card, conversation options and gossip. Values are never recomputed from the ledger, so nothing is counted twice.
2. **Channel split** of an event's strength into trust, respect and role belief is data (`events.json` weights). L1.1.2 says the summed effect feeds the three values but gives no split.
3. **Personality factor facet** per event kind is data (`facet`, `invert`). L1.1.1 names a 0.5 to 1.5 factor from D5 but not which facet. Promise and honesty kinds take factor 1.
4. **The familiarity shield applies to bad events only** (L1.1.1: "absorbs part of a single bad event").
5. **Half-life decay without platform math**: `halfPow` uses halving and square roots (IEEE sqrt is exact), because `career` may not import engine-core's `dPow`.
6. **Display read** (L1.1.1): under familiarity 15 "cannot tell yet", 15 to 30 a two-band range, from 30 one band, one band off with chance `(1 - familiarity/100)/2` each way (total 50 percent at familiarity 50, none at 100). Only band indices and template keys leave the module.
7. **Conversation fit** is facet weights per approach in `conversations.json`, scaled by `talk.fitSpan`. Directions follow L1.2.3.
8. **Rung table** (L1.5.2): each conversation type has a lowest rung. S3.1.1 owns the final authority lines. A statement beyond authority is recorded with the rung (`beyondAuthority`), never blocked.
9. **College types and the youth multiplier** switch on rule data (`player_contracts` false), never on a level word (P1.1.2).
10. **Open door** (L1.2.5): with zero hours nobody answers, so requests stop after two unanswered ones. Imported people never bring a personal matter (L9.1.2 rule 1).
11. **D12.5.2 ladder**: the meeting, private and public steps fire once per spell of unhappiness; a driver change resets every count; rising above -30 ends the spell. Holdouts and hold-ins are L7's.
12. **D12.6.1**: real people stop at the meeting step and give the neutral "expected to seek a larger role elsewhere" at a window, never quoted. Ego is fixed at 50 for D12.1 (`moraleFacets`).

## Requests sent

- **Integrator (schema):** `PromiseRecord.status` needs `void` and `left` (L1.3.1 rule 4 and edge case), and the record needs `type`, `measure`, `room`, `onBehalfOf`, `rung`, `beyondAuthority`, `fromRecruiting`, `pathBack`. A persisted shape for the L1.1.1 directed record (trust, respect, familiarity, role belief, ledger), `coach_word` and `shared_language` (W-20 dropped trust from edges; L1.1.1 keeps it on the directed record). Barrel line `export * as players from './players/index.ts';` in `packages/career/src/index.ts`.
- **Bible fixes:** D12.3.2 buy-in (0.4 trust + 0.3 satisfaction + 0.2 leaders + 0.1 plan, bounds x0.9 to x1.1) contradicts L1.6.1 (0.5 trust + 0.3 respect + 0.2 role belief, x0.90 to x1.05); this module follows L1.6.1, the plan row's leaf. D12.3.1 trust deltas (+4 kept, -12 broken) contradict L1.3.1 (+15, -30). L1.1.2 half-life decay differs from X6.1.3's hold-then-linear decay.

# career/bosses (G-48)

Owner, general manager and athletic director relations, business side. Bible: L5 (L5.1 to L5.4), T9.1.1.

## What is here

| File | Leaves | What it does |
| --- | --- | --- |
| `power.ts` | L5.2.1, T9.1.1 rule 1 | The power arrangement as data (`finalSay` per field, `reports`), generation from odds, and `route()`: every roster, draft, contract and staff action comes back as the actor's decision, a request to the holder, or an act under a logged delegation. |
| `profile.ts` | L5.1.1, L5.2.4, L5.3.2, L5.4, T9.1.1 | Hidden weights (0 to 1, never shown), needs by kind, interests, and the learned page (labels from incidents only). |
| `owner.ts` | L5.1.1 to L5.1.5, L5.2.6, L5.3.1, L5.4.1 | Meetings (cadence, item choice from the decision log, answers), interference, resource asks with reason codes, hot-seat signs, dead money, obligations, late-season requests. The athletic director runs through the same functions (L5.4.1). |
| `gm.ts` | L5.2.2 to L5.2.4 | Trust tolerance (0 rounds at trust 20, one round at 80), requests and orders, the contract-word warning, unplayed picks, roster-meeting evaluations. |
| `college.ts` | L5.4.2, L5.4.3, L5.4.6, T9.1.1 rules 2 and 3 | President ruling and involvement, board approval, booster mood, donor share of a buyout. |
| `standing.ts` | L5.3.3 | The one-line read in words. No stored value. |
| `events.ts` | | Outputs: memories (L1.1.2), promises (L1.3.1), signals (E4, media, room, hot seat). |

## Decisions

1. **Authority follows the real arrangement.** Under coach final say the general manager cannot act for the club on a held field without a `Delegation` row (L5.2.1 acceptance). The depth chart and game-day actives read no field: they are the head coach's own in every arrangement (L5.2.6 outputs, H6.2.1, H6.5.2).
2. **Club or program is read from the team row** (an owner present, or an athletic director present), never from a level word (P1.1.2).
3. **Split duties** (drawn one in three inside the general manager and owner groups) gives the head coach the roster and staff fields and the group's holder draft and contracts (L5.2.1).
4. **College payment variant**: the holder above the coach is the athletic director or the general manager, 50/50 (module assumption; T9.1.1 says "the athletic director or general manager").
5. **No relationship value is stored here.** The module reads the L1 record (`BossRecord`: trust, respect, familiarity) and emits memories. E4 decides firing; this module only supplies signs and the dead-money threshold raise.
6. **Every grant or refusal has a reason code** (T9.1.1 acceptance); every interference and late-season request names the interest behind it (L5.1.3, L5.2.6 acceptance).
7. Not built here: coach trades (L5.2.5; the price runs through E2.5.3 and K8 owners, G-77), the lower-rung chain view (L5.5.1, a read-model filter for the screens), and the AI side of owners and athletic directors deciding (K8, G-77).

## Facts

`facts.json`: F-bosses-0001 (2016 ESPN survey, 21:5:4:2; two outlets relay one survey, so 1 of 3), F-bosses-0002 (a 2015 list, 20:3:9:0, which disagrees on the owner share), F-bosses-0003 (January 2026: five head coaches named with final say). The odds in `params.ts` are the bible's starting values anchored on F-bosses-0001; every other number is a named parameter (basis `bible` with its leaf, or `assumption`).

## Contracts and requests owed

- G-24 relationships (PR 69, not merged when this was written): `BossRecord` is the L1.1.1 side of the boss toward the coach. Memories are emitted in `BossMemory` form for `people.memory`.
- Integrator: barrel line `export * as bosses from './bosses/index.ts';` in `packages/career/src/index.ts`. Schema: `TeamRecord.finalSay` has no `reports` (whom the head coach and general manager report to), and its `null` means "owner or administrator", so it cannot hold T9.1.1's unused draft field; request fields `headCoachReportsTo`, `gmReportsTo` and a way to mark a field unused.

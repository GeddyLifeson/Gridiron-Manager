# World contract decisions (G-00)

The world contract is `packages/schema/src/world/`: every persisted shape outside the engine. It follows the same rules as the simulation contract (`plans/engine-build-plan.md` section 5, D-01 to D-20): zod schemas, a visibility class on every field, a unit or scale on every number, all registered in `worldSchemas()`. Where the bible leaves a shape open or two leaves disagree, the contract fixes it as below. Changes follow engine-build-plan.md section 6: ask the integrator; never edit these files from a package branch.

## Decisions

- **W-01 Names.** Registered names carry the prefix `world:`. Exported names never clash with existing `@gm/schema` exports, so the integrator's one-line re-export works; `test/world/barrel-compat.ts` fails the typecheck if a clash appears. The phase 0 shapes in `entities.ts` (`Person`, `Team`, `Competition`, `WorldState`, `CoachingComponent`) are superseded by the `*Record` shapes here and retire when the save core (G-01) stops writing them (CR-G00-3).
- **W-02 Player id.** A person who plays has `PlayerId === PersonId`. The sim contract's `PlayerId` is the person id; there is no separate player table.
- **W-03 World root.** `WorldRecord` (P3.2.1) is the authority for seed, calendar, versions, manifest and settings. The save header (P5.1.1) repeats what it needs to be read without opening the world.
- **W-04 Level.** Only `CompetitionRecord` carries `level` (P3.1.2, P1.3.3). Jobs (S1.1.1 `level`), people (D1.1.1 "current level") and reputations (E5, fans and media keyed by level) derive it from a competition id. High school status is a prospect row with no team.
- **W-05 Scales.** Bounded design scales from the bible (X1 facets 0 to 100, X5 stress 0 to 1000, X7 strength 0 to 100, E5 regard 0 to 100, X4 notability 0 to 100) use unit `index` plus a `scale` meta key naming the leaf and bounds, until the integrator adds a `scale` unit (CR-G00-1).
- **W-06 Trait block key.** P3.2.2's `traits` block is stored as `traitBlock`. The forbidden-key lint bans a key named `traits` (no picked traits, A3.1.1), and the block is generated truth, never picked. Renaming the key keeps the lint strict for everything else.
- **W-07 Coaching block.** `CoachingBlock` holds E1.1.1's football identity (side, position group taught, system families) plus P3.2.2's fields. Outside `hidden` it has only ids, dates, counts, text and references. It is `.strict()`, so no ability field can be added, and the forbidden-key lint covers names.
- **W-08 Origin.** `PersonOrigin` is `generated | designed | imported | user`: P3.2.2's three plus D1.1.1's `designed` (player designer). `real_person` (D1.1.1) is implied by `imported` and not stored.
- **W-09 Jersey.** The number worn is per team, on the roster slot (D1.1.1 "jersey number per team"). The person keeps `lastJersey` for history pages only.
- **W-10 Player hidden block.** D7 and D8 parameters (growth, plateau, decline) are a truth map keyed by parameter name, like `coaching.hidden`, so G-17 and G-20 can name them without a contract change.
- **W-11 References point one way.** A child row names its person (`job.holderPersonId`, `contract.personId`, `jobHistory.personId`). The person record holds no back references except `householdId` and `agentId`. E1.1.1's "current contract id", "current job id" and "balance sheet id" are queries.
- **W-12 Seeds are truth.** Game seeds and generator seeds would let a reader predict outcomes, so they are class truth. The master seed stays public, as in the existing save header, because it names the world and is needed to load it.
- **W-13 Lists and designations are keys.** Roster lists (active, practice squad, reserve lists, redshirt, scout team), injury designations, rotation rules and season formats are league-rules or content keys, never enums in code, so one shape serves both levels and rule changes need no code change.
- **W-14 Contract visibility.** Pro player contract terms are `public` (clubs see filed contracts, C6.1.1 card). Coaching contract terms and college pay are `own_team` (the parties). The general manager's contract habits (K7) are truth on the general manager, not on the contract.
- **W-15 Terms, not charges.** Contracts store terms only. Cap charges, proration, cash by date and dead money are computed by the cap package (G-16) from the terms and league-rules keys (P3.1.1 derived data).
- **W-16 Event visibility.** On an event row, `own_team` on `actors`, `subjects` and `payload` means "visible to the event's witnesses only". The observer filter (G-27) applies `witnesses` per row. `tier` and `source` are internal truth.
- **W-17 Notability at emit.** X4.1.1 stores notability on the event, and X2.1.3 forbids editing an event. The notability pass therefore runs inside the emit fan-out, before the row is appended. `notability` is null only for events whose type is never scored.
- **W-18 Play and drive rows.** The `plays` table stores the sim contract's `PlayRecord` as it is. Drives are `GameDriveRow`: the sim `DriveRecord` plus `gameId`, which the sim shape lacks.
- **W-19 Edge kinds.** Relationship kinds are X7.1.1's list plus `mentor` and `agent` from P3.5.1.
- **W-20 Edge fields.** X7.1.1 (strength, sign, since, last contact, basis) wins over P3.5.1's older "strength, trust": X7 is the owning leaf and was written later. Trust is read from sign and strength.
- **W-21 Reputation key.** E5 keys fans and media by level. The contract keys every reputation row by audience and `competitionId` (null for the shared audiences), per W-04.
- **W-22 No stored labels.** Person views hold estimates, notes and public measurements. Labels are computed from the log when shown (N2.8, X2.2) and never stored on a person or a view.
- **W-23 Death.** A person record holds `diedYear` only, never a cause (Marlon's ruling, 2026-11-25 23:06 UTC). There is no photograph field (P3.2.2, P7.3.2) and no image field for team marks (A6.2.1).
- **W-24 Two kinds of tier.** `WorldTier` 1 to 3 is X13's fidelity tier of a person, team or game. The sim `PlayRecord.fidelityTier` (A, B, Bench) is the per-play detail of P6.4.1. They are different fields with different names.
- **W-25 Evaluations.** A boss's evaluation (S4) stores grade keys on a content-defined scale about work done, with evidence event ids. It is never an ability value, so it does not conflict with the no-points ruling.
- **W-26 Limits live in rules.** No shape holds a roster size, staff cap, memory row count or other limit. Owning packages read them from league-rules keys or their `PARAMS` (C5, T5, S1.2.2, X6). The only bounds in shapes are scales the bible defines as the record's range (W-05), X1.1.1's three goals, and X7.1.1's five basis events.
- **W-27 Table list.** `WORLD_TABLES` names every table of a world save with its row schema, storage kind (content, state, record, derived; P3.1.1), append-only flag, key fields and owning leaf. The save core (G-01) builds its tables from it. Only record tables are append-only; the test checks it.
- **W-28 Protection in one place.** `mayReceiveEvent(person, type)` is the one check of A6.3.1. Unknown types are refused for imported people (X2.1.2 edge case). `eventTypeProblems` fails a personal or harmful type that allows imported people, and `guardClassOf` derives L9's guard class from the stored harm class.
- **W-29 Final say.** A team stores L5.2.1's power arrangement as the job id holding final say per domain (roster, contracts, draft, staff hiring), null meaning the owner or administrator. Rule-breaking (L8.2.5) needs no shape here: acts are events and compliance rows owned by G-28.
- **W-30 Philosophy.** E10's philosophy is its own row (statements, team rules, standards) referenced by `coaching.philosophyId`. G-29 may ask to extend it.

## Change requests to the integrator

- **CR-G00-1** Add a `scale` unit to `Unit` in `src/field.ts` (W-05). World fields then switch from `index` plus `scale` meta to `scale`.
- **CR-G00-2** Add `export * from './world/index.ts';` to `packages/schema/src/index.ts`, and `Object.assign(out, worldSchemas())` to `allSchemas()` in `src/registry.ts`, so the forbidden-key lint and the schema convention test cover the world shapes in `npm run lint` too. Until then `test/world/world-contract.test.ts` runs both checks over `worldSchemas()`.
- **CR-G00-3** Retire the phase 0 `Person`, `Team`, `Competition` and `WorldState` of `src/entities.ts` once G-01 writes the world tables (W-01). A save written before then needs a migration fixture (Q1.2.3).

## Bible conflicts met

- P3.2.2 calls the X1 block `traits`, which the forbidden-key lint bans (W-06).
- P3.1.2 says nothing but a competition carries a level; S1.1.1, D1.1.1 and E5 store one (W-04, W-21).
- P3.5.1 gives relationship edges "trust"; X7.1.1 does not (W-20).
- X4.1.1 stores notability on the event; X2.1.3 forbids editing events (W-17).
- D1.1.1 adds `designed` to origin and `agent` to roles; P3.2.2 lists neither (W-08, PersonRole).

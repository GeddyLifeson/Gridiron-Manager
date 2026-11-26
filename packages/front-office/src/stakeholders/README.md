# stakeholders (G-77)

Owner, media, agent and fan models: bible K8, with the E4.2 confidence table, the E4.3 review and
firing rules, E4.5.1 situations and the E4.8.1 extension trigger that K8 points to. One confidence
procedure and one review procedure run for every head coach and general manager in the world; neither
has a parameter that says whether the subject is the user (K8.3.1 rule 2, K8.4.2 rule 6).

| File | Leaf | What it does |
| --- | --- | --- |
| `types.ts` | K8.1.1, E4.7.2 | `DecisionMakerProfile` (truth only), `DeciderModel` (everything that differs between an owner and a college is data), `Observer` |
| `profile.ts` | K8.1.1 | Generation with the X1 correlations, stated and unstated goals, goal stakes, ownership change, `deciderModel(kind)` |
| `expectation.ts` | K8.1.2 | Season expectation from the public estimate, the X9 level (rises 0.5 of the gap, falls 0.2), spend; grace band |
| `reaction.ts` | K8.2.1 | The one reaction function every observer runs: result against public expectation, margin, game weight, streaks, injury discounts, outcome-biased judgment of visible decisions |
| `confidence.ts` | K8.3.1, E4.2.1, E4.2.2 | `updateConfidence` (the only update function), every E4.2.2 term with a log row, volatility, drift, early floor, lagged word, replay, blame split |
| `firing.ts` | K8.4.1, E4.3.1 to E4.3.3, E4.5.1, E4.8.1 | Base hazard, year, general manager, money and situation factors, in-season factor, `review`, extension check. No modifier keyed to a coaching change exists (E4.3.5) |
| `search.ts` | K8.4.2 | Long list, score from public labels, record, first-hand memory, references and interview; reaction and fashion bonuses; tampering through `compliance.decideViolation` (K2.8.2) |
| `college.ts` | K8.5.1 | Booster reaction (full outcome bias, rivalry, pet recruits, attention), giving index, president forcing a firing |
| `agents.ts` | K8.6.1 | Ask, reservation, talks, public pressure, many-client restraint, default agent |
| `media.ts` | K8.7.1 | Story choice by notability times interest, label angles, tone with a 3-week half-life, friendly softening, X14 exclusion, leak lift |
| `fans.ts` | K8.8.1 | Fan mood with a 5-game half-life, offseason hope, hire hope kept out of the crowd-noise mood J12 reads |
| `params.json` | all | Design values, basis `bible` or `assumption`; none is a real-world fact |
| `facts.json` | E4.3.1, E4.7.2 | Calibration targets (firings per season, the 25/18 general manager model, college carousel counts); status computed, all PROVISIONAL |
| `rules.ts` | | `RULE_KEYS` is empty: K8 reads no rule value directly |

## Decisions

1. **Decider model as data.** `deciderModel(kind)` reads `ownerModel.<kind>.*` rows. College: no general
   manager factor, booster mood at 0.1 a point a month, a president who can force or veto. Code never
   branches on a level word.
2. **Hazard scale per decider model.** E4.3.1 says rates come "via owner_model.<level>". At scale 1 the
   bible's starting values give 6.9 professional firings a season on the synthetic test league (target 5 to
   9; 4.3% of 800 seasons outside 3 to 11). The college scale is fitted at 0.35 (about 9% of programs a
   season, target 6% to 12%). Both are refit when the real world runner exists; the test league is
   scaffolding, not the engine.
3. **Emergency reviews.** E4.3.3 outputs are "fire, or keep until the main review", so a coach kept at an
   emergency review is not reviewed again that season (`needsEmergencyReview(value, kept)`). Without this
   the in-season share was about 57%.
4. **Booster records stay in G-38.** front-office may not import career (P1.2.1). Booster group records,
   giving, buyout funding and booster pay acts are `career/src/college-program`; the world runner passes
   their mood and funding here.
5. **Sensitivity scaling.** The media and fan terms and the spend term are multiplied by twice the
   decider's trait, so an average decider gets the table's size.
6. **Change term cap.** E4.2.2's change term is capped at plus or minus 10, then a decline is multiplied
   by 1.5 (so a decline can reach -15).

## Measured, open

- E4.3.3 acceptance (in-season firings 15% to 40% of all firings): the test league gives about 8%, because
  a team still alive for the postseason never fires in season and a kept coach waits for the main review.
  Sent to the bible fixes thread with the K8.4.1 note below.
- K8.4.1 acceptance matches teams on record. In a world with no coach effect at all, record-matched teams
  that fired still improve about 0.04 win share more (firing selects on record against expectation, so
  regression differs). Matched on record and the public preseason estimate the gap is within sampling
  error, which is what the test checks.
- Contract requests to the integrator: barrel line `export * as stakeholders from './stakeholders/index.ts'`
  in `packages/front-office/src/index.ts`; `PARAMS` into the merged parameter table; zod schemas for
  `DecisionMakerProfile`, `ConfidenceLogRow`, `FanState`, outlet and agent records in `schema/src/world/`.

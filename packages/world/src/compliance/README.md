# compliance: the rule-breaking pipeline in the off-screen world

Binds `league.compliance` (L8.2.5, G-28) to the G-81 loop, and gives the front office AI a person who can act, so `gm.raise`
(K7.7.1) runs off-screen. One pipeline for the user and for AI alike (Marlon 2026-11-25 ruling, K9.5.1): nothing here decides,
detects or punishes on its own.

## What runs

- **General managers in the world.** Founding already generated a general manager for every pro club (catalogue row
  `job:pro.general_manager`, position `pos:general_manager`), but the seat has no ladder rung, so `toJobRecord` could not make a job
  row and the world dropped the seat. `LiveWorld.offLadder` now keeps every seat with no rung (general manager, the owner seat,
  strength staff, game management, athletic director, president), by seat id. `generalManagerOf(world, teamId)` reads it.
  Holders count as employed (`employedIds`) and as team members for tiers (`teamMembers`); a folded team's off-ladder holders go
  to the staff pool with its coaches.
- **State.** `LiveWorld.systemState` holds plain-data state of bound systems by key. The pipeline's `ComplianceState` (log, cases,
  league record, penalty orders) is under `compliance`. `worldHash` folds `systemState` in, so a replay that differs there differs.
- **Weekly step.** `complianceStep(binding)` is the new `compliance` step of the weekly order, after `moves` and before `labels`:
  `league.compliance.complianceWeek` (detection draws, false accusations, cases that fall due) over every team in the world.
- **Early contact (K7.7.1 `early_contact_player`, class `tampering_players`).** In each pro offseason, before free agency, each
  club in signing order gets the chance (`RosterPolicy.earlyContact`, bound in `turnover.gmPolicy()`). The gain is the K7.2.2 worth
  of his top free agent target over the target he expects to land from his place in the order (0 for the club that picks first). The
  K2.8.2 decision and the log row are `gm.raise`'s. On a yes the club signs that player ahead of the order (the illegal effect);
  the general manager and the player both know (L6.3.1 holders).

## Decisions

- CO-01. The X12.1.1 weekly order gains a `compliance` step after `moves`: a week's acts can be found the same week, and its public
  events are labelled and routed in the same pass. The order is part of the pass hash, so every world hash moves. A bible amendment
  to X12.1.1 is requested (not yet an MA entry).
- CO-02. Context stand-ins until their owners are bound off-screen: nobody holds a grievance (X7 edges unbound); no media leak
  (K8.7.1, no reporters); body strictness 1; compliance office strictness `context.officeStrictness` where the club's league holds
  `eligibility.seasons_of_competition` (a school), else 0; head coach monitoring `context.monitoring`; an AI club answers an inquiry
  by the candor of the first actor in the case (`aiResponse`).
- CO-03. The pipeline takes one rule set per week (`ComplianceContext.rules`), so the step reads the pro league's set
  (`complianceBindingFrom(b, 'pro')`). Every act raised off-screen today is a pro general manager's. College acts (T4 recruiting
  contact, T7 pay rules) need a rule set per act; that is a change to `league.compliance`, owed to its owner.
- CO-04. K7.7.1 `CaughtBelief` comes from the public record (C10 sanctions news), which the world does not hold yet: every person
  reads the shared `belief.publicDetectRate` and the severity's `belief.penaltyMajor` or `belief.penaltyMinor`. His own `marketRead`
  error still applies (`gm.opportunity`).
- CO-05. Events below their type's tier are not written (X13.1.1, MA-66): compliance types are tier 1, so a far club's act stays in
  the pipeline's state, is detected and punished there, and leaves no history row. The log row's `eventId` is then 0.
- CO-06. Pressure (E4 job security, X5 needs) is 0 for every general manager: neither is bound off-screen (as TO-07).
- CO-07. `ruleRespectZ` is the person's `rule_respect` facet over its X1.2.1 side sd (50 / people `traitSideSdDivisor`).
- CO-08. Penalty orders are carried to the world once each, after the week's pipeline run (`penalties.ts`, state under
  `systemState.penalties`). A forfeited pick (C7.2.1 rule 5) comes off the club's own pick of that round at its next draft
  (`draft.forfeitPick` on the year's ledger); a club without that pick keeps the forfeit for a later draft. A fine is entered on the
  books for the club or the person (`finesOf`); no club budget or E6 wealth is held off-screen yet, so the books are where club
  finances and E6 will read it. A suspension counts down by the games his club plays; while it runs, a suspended general manager
  does not act (his club's acting front office keeps the default board, and he raises nothing). Probation, show-cause, practice
  cancellations, rules education and warnings are recorded with no off-screen effect yet. An order with no published amount (null
  cents, games or round: "league default") is recorded with no cost; no figure is invented.
- CO-09. Front offices do not turn over off-screen: a general manager holds his seat until his club folds (K7.6.1 and K8 searches
  are owed, as are coach searches).

With the pro rule set, a detected tampering case costs the club its first-round pick (`compliance.tampering_players.pick_round_first`)
and fines the general manager (`compliance.tampering_players.fine_executive_first_cents`): both are sourced rule values (fact rows
F-league-0213 and F-league-0212), read through `league.compliance`, not restated here.

## Findings

- On the trimmed test world, 8 general managers with generated character over 2 offseasons committed early contact 3 times
  (16 chances). That rate comes from the K2.8.2 thresholds in `league.compliance` and the stand-in beliefs above; no real tampering
  rate has been researched (K7 calibration research is owed), so it is not checked against anything.
- The owner seat (`job:pro.owner`) is filled at founding by a second person besides the boss chair `TeamRecord.ownerPersonId`.
  Both now sit in the world; one of them should go (founding owner).

## Flagged (not triple verified)

Every row in `params.ts` is an Assumption (no source read).

## For the integrators

- Exports: world barrel `export * as compliance from './compliance/index.ts';` (and the turnover line still owed).
- Schema, PARAMS and gate: register `compliance.PARAMS` (module `world.compliance`); `LiveWorld.offLadder` stands in for
  CR-G25-1 (`JobRecord.rung` nullable or an off-ladder seat row) and `LiveWorld.systemState` needs a save slot (P5) for the
  `ComplianceState` (zod twins proposed in CR-G28-1).
- Composition root: bind `compliance: compliance.complianceStep(compliance.complianceBindingFrom(b, 'pro'))` with the same turnover
  binding `b`. `createWorld` now adds `league.compliance.COMPLIANCE_EVENT_TYPES` when the caller's registry lacks them.
- J13.2.1 stream catalogue: `enforcement` and `conduct` (CR-G28-2) are used by the step and by `gm.raise`.

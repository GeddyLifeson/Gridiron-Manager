# Compliance (G-28): rule-breaking for the user and AI alike

One owner of the L8.2.5 pipeline: **warn, allow, log, detect, punish**. Every rule-breaking act in the
game, by the user or by any AI coach, staff member, general manager or club, passes through
`commitAct`. Nothing is blocked; the only refusal is the real-person guard (an imported AI person
never breaks a rule, W-28 `mayReceiveEvent`).

| Step | Code | Bible |
|---|---|---|
| Classes | `classes.json`, `catalogue.ts` | L8.2.5 table, C11.2.4, C11.3.1, C11.6, T9.5.1, I11.8.1, K7.7.1 |
| Warn | `warningFor` | L8.2.5, T9.5.1 |
| Allow + log | `commitAct`, hidden `violation_committed` | L8.2.5, K2.8.2 rule 6 |
| AI choice | `decideViolation`, `staffRequest` | K2.8.2, K6.6.1 |
| Detect | `detectionSources`, `detectionWeek`, `openCase`, `selfReport`, `reportToLeague`, `falseAccusationWeek` | L8.2.5, T9.5.2, C11.2.4 rule 1 |
| Punish | `penaltiesFor`, `resolveDueCases` | L8.2.5, C11.2.4, L8.2.3, T9.5.3 |
| Weekly order | `complianceWeek` | L8.2.5 |
| Bounded log | `ownLog`, `releaseLog`, `retireSpent`, `archivedRows`, `findRow` (`log.ts`) | P6, T9.5.1 rule 4 |

## Bounded log (long histories)

`commitAct` no longer copies the whole log per act when the caller holds it (`ownLog` ... `releaseLog`; the
world's recruiting pass does). Acts past the detection window (`compliance.detect_window_years`, the statute
of limitations: NCAA Bylaw 19.5.11, four years, fact F-college-0029, Rulebook only), past the K2.8.2 cooldown
and in no open case move to `state.archive` (chunks per sweep), as do closed cases past the window. No step
reads them again, so results are unchanged (tested over 30 seasons). `complianceWeek` sweeps weekly; `commitAct`
sweeps when the live log has doubled, keeping acts younger than `retire_window_floor_years` because the weekly
step may read a longer window than the act's rule set. A time-barred act can no longer be reported or
self-reported (as under the real statute). The NCAA exceptions (current athlete's eligibility, willful
pattern, blatant disregard, concealment) are not modelled. The repeat check reads the league record through
an index (`someRecordEntry`), and `resolveDueCases` copies the record and orders once per call, not per finding.
Bench: `npx tsx packages/league/test/compliance/tools/log-bench.ts --seasons=60 [--weekly=0]`.

Penalty amounts are rule values (`compliance.<class>.<field>`, `RULE_KEYS`), supplied by G-10 with
fact rows. Empty keys fall back to the default tier ladder with no dollar figure. Detection chances
are design parameters (no published detection share, 0 of 3) in `params.json` and `classes.json`;
test fixtures copy bible amounts and are not triple-verified.

## Change requests (to the integrator)

- **CR-G28-1** Move the zod twins in `test/compliance/proposed-schemas.ts` into
  `schema/src/world/compliance.ts` and register them in `worldSchemas()` / `WORLD_TABLES`.
- **CR-G28-2** Add scope streams `enforcement` and `conduct` to the J13 catalogue (J13.2.1 already
  lists `enforcement`). The module takes them as `StreamFor` inputs.
- **CR-G28-3** Barrel: `export * as compliance from './compliance/index.ts';` in `packages/league/src/index.ts`.
- **CR-G28-4** Event types: register `COMPLIANCE_EVENT_TYPES` in the X2 event-type table (G-22).
  `inquiry_closed_no_finding` is new: L8.2.5 lists four types and none closes an empty inquiry.

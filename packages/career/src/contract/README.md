# career/contract (G-51)

The coach's contract and negotiation. Bible: E3 (E3.1 to E3.8).

- `types.ts`: the contract record (E3.1.1) with every E3 field: guarantee form and share, `guaranteed_through`, offset income kind and market floor, cause grounds, cure and suspension limits, buyout form, resignation window, rollover, authority and staff terms. `toWorldTerms` (draft.ts) maps it down to the world contract's `CoachContractTerms`; CR-G51-1 asks for the missing fields.
- `defaults.json`: `contract_defaults.<tier>.<seat>` for pro, power four and Group of Six, head coach and assistant; incentive ladders; `pay_bands.<tier>` by rung. Every cell names its basis (fact row, bible starting value, or assumption). A contract reads its tier's block; no code branches on a level.
- `facts.json`: 25 rows. Only the professional full guarantee and offset rows are Verified; the college contract rows are Rulebook only (one primary contract each, read by the bible depth pass, not reopened here because the sandbox blocks the hosts); the rest print PROVISIONAL.
- `draft.ts`: draft a contract from the defaults with a caller-supplied stream (career may not import engine-core); record checks.
- `pay.ts`: payment schedule (base in pay periods, supplemental quarterly without withholding), agent fee per payment, month cash flow in the shape the wealth month close reads.
- `incentives.ts`: triggers post once, employment and compliance conditions, annual cap.
- `termination.ts`: owed on firing by guarantee form (E3.3.1), offset with market floor (E3.3.2), for-cause notice, cure, suspension and disputes (E3.3.3), leaving early by buyout form, promotion waiver, window breach, payer and gross-up (E3.3.4), settlements (E3.3.5).
- `authority.ts`: roster dispute resolution by the authority flag, full-control rule, staff pool and release checks, other clauses with their consumers, owner breaches (E3.4).
- `negotiation.ts`: the round loop over offer budget units (the club's budget, never coach points), trimming the owner's most valued term first, patience, the hard-demand mark, final offer, the agent's noisy read, leverage (E3.5).
- `agent.ts`: client acceptance, shared representation, agency clusters (E3.6). Agent people come from K8.
- `extensions.ts`: owner extension rule, extension replacing remaining years, rollovers, final-year effects on other people's choices (E3.7).

The module does not import `wealth` (E6.12.1 firewall); it has its own cents helpers.

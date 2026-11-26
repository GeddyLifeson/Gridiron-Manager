# G-49 Agents and families (bible L7)

Pure core module in `@gm/career`. No clock, platform random or transcendental math: draws come in as a
`Draw` (career may not import engine-core), and the one decay curve (`halfLifeFactor`) uses only + - * /.

| File | Leaves |
|------|--------|
| `agents.ts` | L7.1.1 representation, calls and routing; L7.1.2 derived agent stance, client outcome rows, free-agent preference, user view; L7.1.3 interview weight, conflict flag |
| `contract.ts` | L7.2.1 contract-year need weights; L7.2.2 holdout trigger, camp fines, minicamp maximums, waiver violations, forfeiture, accrued season, room and return; L7.2.3 hold-ins; L7.2.4 trade requests |
| `families.ts` | L7.3.1 family guard, influence, coach acts, disclosure flag, witness copies; L7.3.2 high school coach stance and access; L7.3.3 college representatives |
| `lower.ts` | L7.4.1 assistant promises, past-authority standing, recruiter leaving |
| `keys.ts` | League-rules keys read (camp fines, forfeiture, accrued season, college representation) |
| `events.ts` | Event types written, with drafts |

## How the acceptance line is met

- **Holdouts per L7.2.2.** Daily fines come from league data for the four contract classes; veteran and
  free-agent-signee fines carry `waivable = false` and a waiver is allowed with a warning and one violation
  row; rookie and option-year fines are waivable. Forfeiture never exceeds 25 percent before the first
  regular-season game. A missed reporting date records no accrued season. Tests use the 2026 values.
- **Hold-ins per L7.2.3.** Chosen whenever the holdout's rule cost is above 5 percent of yearly pay. No camp
  fine ever posts for a present player; readiness loss at half; the room turns only after a missed game.
- **Trade requests per L7.2.4.** Never fire below the stress breakpoint; public when trust is under 30 or a
  combative agent is hostile; a public one makes one media event (the L6 story and L2.5.1 room event both
  read `trade_request_public`). No function here touches an attribute.
- **Families as outside voices (L7.3).** Imported people keep no family record (`guardFamilies`), and the
  `family_contact` event type is personal, so the schema refuses it for imported people. Family advice is
  at most 5 points, the same as an agent's. Recruiting promises copy to parents at full strength.

## Decisions made here (Assumption, flagged)

1. Agent stance score scale is the 0 to 100 trust scale; bands read as hostile < 35 <= wary < 50 <= neutral < 65 <= favourable.
2. High school coach stance reuses the same three thresholds (open, neutral, guarded, closed below 35); L7.3.2 gives no numbers.
3. Agent advice pull on role_belief scales with his trust in the coach: patience gives +5 x trust, unsettled gives -5 x (1 - trust).
4. "Nothing useful" on a call advises patience 30 percent of the time; a hopeful answer always does (the promise carries the risk).
5. Free agents choose with a uniform "other factors" term of spread 0.5 on each offer; with equal offers a favourable agent wins about 54 percent.
6. Self-represented share ships at 0 until the real share is researched; the caller may pass one.
7. Combative agent style is 70 or more on the hidden 0 to 100 style scale.
8. Trade-request low loyalty is under 30 (L7.2.4 says "low loyalty" without a number). A request withdrawn after six met weeks writes +5.
9. Forfeiture: "one seventeenth for each missed week after the fourth week" is read as 1/17 of the whole year's allocation per week, capped at all of it; the 25 percent on the first game is of what remains (Art. 4 Sec. 9(a)(ii) wording). All forfeiture values are maximums the club may take.
10. A return talk halves the strength of each negative memory from the absence (L7.2.2 says "removes half").
11. Contract classes come from K7. `unsigned` covers unsigned drafted rookies and unsigned tenders: no fines (L7.2.1 edge case, Unverified, kept as a class).

## Rule values (not in this module)

Every dollar value, share and day count is a league-rules key in `keys.ts`, requested from G-10 and the
league-values research thread with these locators in `/mnt/project-files/nfl-rules/cba_2020.txt` (read by
this thread on 2026-11-26):

- Camp fines: Art. 42 Sec. 1(b)(vi) to (ix), lines 11803 to 11830; 2026 column of Exhibit A (veteran and UFA signee $60,000, rookie $45,000 per day); option year Art. 7 Sec. 7(h), lines 2693 to 2700 ($45,000 for 2026 to 2030 plus a week's salary per preseason game).
- Minicamp maximums 2026: $17,986, $35,973, $53,952 (Exhibit A, line ~12030).
- Forfeiture: Art. 4 Sec. 9(a)(i) to (iii), lines 1182 to 1232.
- No accrued season: Art. 8 Sec. 1(b).
- College representation: L7.3.3 research block (2 of 3).

Status: every CBA row is one source type (the executed CBA text), so it prints PROVISIONAL until the
research thread adds two independent cross-checks (the bible lists CBS Sports 2021-07-28, Front Office
Sports 2024-07-25 and ABC/AP 2026-07-31 for the waivability rule).

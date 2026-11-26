# career/src/reputation (G-52): reputation and legacy

Bible: E5 (all leaves), S11.1 to S11.3, X2.3.1. Reputation is other people's opinion of the coach, built only
from logged events they could see. It is never a property of the coach, never spent, and never read by the
engine (E5.1.1 rule 6; a test scans the engine and people packages).

| File | Leaf | What it does |
|------|------|--------------|
| `record.ts` | E5.1, E5.2, E5.7 | Fold of world events into `regard` and `known` per audience; replayable; log rows trace to event ids; season decay; first impressions; rung reach caps; level transfer once; contract rows |
| `impacts.json` | E5.2.1 to E5.2.5, E5.6.1 | Data table: world event type, actor role, payload conditions, size per audience |
| `transfer.json` | E5.7.1 rule 2 | Level-to-level weights for shared audiences (keyed by level key, never branched on) |
| `view.ts` | X2.3.1, E5.3.1, E5.3.2 | One observer's view, computed on demand: audience value, his memories, his edge, label entries; mislabel flags; reference calls |
| `tree.ts` | E5.4, S11.2.1 | Coaching tree from job stints only: edges, counted pupils, generations, familiarity, reverse hiring terms |
| `career.ts` | E5.5.1, E5.6.2 | Head coach lines per competition and per level key; records tables; milestones; who was passed |
| `honours.ts` | E5.6.1, E5.6.3 | Award vote; Hall of Fame case score, committee vote, outlook words, eligibility |
| `summary.ts` | E5.5.2, S11.3.1 | Career summary: every line links to rows; no overall score; private sections only for the user's own coach, never for imported people |
| `events.ts` | E5.4.2, E5.6 | Event types this module writes (`assistant_hired_up`, `award_won`, `milestone_reached`, `hall_*`) |
| `facts.json` | E5.6.3 | Hall of Fame fact rows (election share and coach wait: Verified; committee size: 1 of 3; coach finalists per class: 2 of 3) |

## Decisions

- **Audiences use the contract names.** E5 "coaches" is `peers`, "owners and executives" is
  `administrators_and_owners`. `recruits` (contract only) hears the same events as `players` (T4 reads it).
- **Regard is whole on the contract row.** `ReputationRow.regard` is an integer scale; the fold keeps full
  precision and rounds only in `toRows`.
- **Fan bases have no contract key.** `toRows` returns them apart until the contract gains a nullable
  `teamId` (CR-G52-1).
- **Expectation lives in the payload.** Season events carry `bands` (signed bands against expectation,
  E4.1.1); the table scales owner sizes by it. Rivalry rows hold 3 times the win and loss size as data.
- **Tree mentors are head coaches and same-side coordinators** (E5.4.1 rule 1). S11.2.1's "direct boss"
  (a position coach over a graduate assistant) needs reporting lines per season that job stints do not hold
  yet; owed with G-55 duty records.
- **A pupil counts after a full season at a higher rung off the mentor's staff** (E5.4.1 rule 2). The news
  item comes at the hire (S11.2.1), from the same `assistant_hired_up` row that moves reputation.
- **Hall rules are passed in.** `proHallFromFacts()` builds the pro hall from fact rows; a college hall
  (E5.6.3 "via config") passes its own `HallRules`. One coach finalist per class (fact, 2 of 3).
- **Imported people.** No conduct penalty, no tree edges from generated pre-save history, no family, health
  or money in the summary.

## Event types read (proposals to their owners)

Read from `impacts.json`: `promise_kept`, `promise_broken` (L1), `player_released` with `toldBy` (H6),
`player_blamed_publicly`, `candid_answer`, `statement_shown_false`, `media_availability_skipped`,
`media_season_closed` (H7), `first_team_honour`, `discipline_inconsistent` (L3), `lame_duck_season`,
`authority_removed`, `coach_fired`, `team_declined_after_firing` (E4), `season_finished` with `bands`
(E4.1.1), `interview_blocked`, `assistant_credited`, `credit_taken`, `staff_resigned`, `clinic_talk_given`
(L4, E9), `staff_released` (G-25), `unit_ranked` (N2), `postseason_game`, `championship_won`, `game_played`
with `result` and `rivalry` (C3), `offer_reneged`, `interview_declined`, `left_during_contract` (E2, E3),
`owner_dispute_public` (L5), `violation_detected` (G-28), `decision_second_guessed` (N3, L6),
`community_event` (L8), `level_changed`, `report_retracted`.

# career/interviews

Fit-based hiring for every staff seat, for the user and every AI person, on screen or off.
Marlon, 2026-11-26 14:26: interviews have no obvious right or wrong answers; candidates answer how they
feel, and they are hired when that matches the team. 14:27: referrals from old coaches, interviews and
offers, for every staff position; the head coach need not sit in on every one.

| File | What |
|---|---|
| `beliefs.ts` | Stances on 13 axes (discipline, player relations, personnel say, analytics, youth, flexibility, practice contact, aggression, run or pass, delegation, dissent, media, academics at college). Drawn once per person from his X1 traits plus his own spread, on a stream keyed by him. Truth only. The user has none: his answers are his record. |
| `questions.ts` | The bank: 20 questions a panel asks and 6 a candidate asks back. Every option is a real view; each is the best answer for somebody. Role group from position and rung (E2.1.1). |
| `interview.ts` | Panel by reporting line (`panelFor`), the same slate for every candidate (`slate`), truthful AI answers (`answerAll`), fit scoring (`scoreInterview`), reverse questions (`candidateRead`, `acceptWithFit`), referrals (`referralScore`), shortlist, hire score and `runSearch`. |
| `facts.json` | 15 rows on what real interviews cover and how fit is weighed, status computed (5 Verified, 5 2 of 3, 5 1 of 3). |
| `params.ts` | Design starting values (Assumption). |

## How a hire runs

1. **Referrals.** Coaches who worked with the candidate vouch for him; the hirer weighs each word by his own
   tie to the referee. A former player's old coach (`pipeline.routeTo` `via`) vouches first.
2. **Shortlist.** Referrals, record and ties pick who is interviewed (3 to 6 by seat).
3. **Interview.** Lead interviewer: the first filled seat up the reporting line (assistant by his position
   coach, position coach by the coordinator, coordinator by the head coach). The head coach sits in from
   rung 5. A head coach is interviewed by the appointer and the general manager. Each member reads each
   answer against his own view, weighted by how strongly he holds it. After a firing the appointer leans to
   the other end of the fired coach's views (E2.3.2).
4. **Reverse questions.** The candidate asks the lead about the job; how the answers sit with his views moves
   his acceptance.
5. **Offers** down the hire score (fit 0.55, referrals 0.2, record 0.15, tie 0.1, small noise).

No term reads a stored quality: the user and an AI candidate with the same answers, record, ties and
referrals get the same score.

## Wired

- `world/turnover/coaches.ts`: `fillStaff` (every assistant seat, every off-screen team) and `headSearch`
  (K8.4.2 interview list scored by the panel's fit; acceptance moved by the candidate's read).
  Counters `staff_interviews`, `head_interviews`. `coachViews(world, id)` reads a person's views.

## Owed

- **Bible amendment** (bible fixes thread): E2.4.3 segments 4 and 5 and S6.4.1's practical parts are graded
  for correctness. Under the 14:26 ruling interviews are fit, not right or wrong. `market.headInterview` still
  has the correctness segments and is not called by the world; the board work could stay as a "what would you
  call" read against the interviewer's scheme. Needs an MA entry.
- **Screens** (O4, O7): the user's own interviews in both directions: the user answers a slate when he applies
  (the world never hires the user without one), and sits on panels for his own staff or delegates (the
  panel already falls to the next boss when the user is not in the room).
- **Barrel**: `export * as interviews` added to `packages/career/src/index.ts` (integrator: exports).
- Beliefs do not yet change over a career (K2.5.1 between-season change could move them).

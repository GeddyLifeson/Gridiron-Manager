# press (press conference questions)

The question generator for every news conference in the world: postgame, day after, midweek, the
college weekly, training camp, end of season, pre-draft, introductions, coordinators and position coaches,
the halftime interview, the coach's show, the opponent's conference call and crisis sessions. Bible
H7.2.1, H7.2.2, L6.1, K8.7.1. Marlon 2026-11-26: anything a reporter could realistically ask has a chance
of being asked.

| File | What it does |
| --- | --- |
| `types.ts` | `PressSession` (session kind, speaker, reporters, public events, prior statements, public world), `PressQuestion`, `AnswerKind` |
| `topics.json` | 67 topics over the 41 question kinds seen in real transcripts. Each lists the event types that raise it, its harm class, and neutral and pointed wordings |
| `sessions.json` | Question counts and code multipliers per session kind; `only` narrows coordinator, position coach and halftime sessions |
| `research.json` | Measured mix from real transcripts: share of each question kind, tone mix, follow-up rate, questions per session |
| `facts.json` | Fact rows behind research.json (built by `research/press/make_facts.py`); status computed |
| `catalogue.ts` | Loads and checks the data; `TRIGGER_TYPES` is the list of event types the world runner maps onto |
| `privacy.ts` | Observer rules: public or leaked only; no personal or harmful question about an imported person; personal topics behind a setting; fault questions softened after a serious injury |
| `session.ts` | `startSession`, `ask` (one question at a time, so the answer shapes the next), `runSession` |

## How a question is chosen

1. **Reporter.** Weighted by reach; a reporter who just asked is less likely to go again.
2. **Kind of question.** Weight = (measured share of that kind, or `floorShare` if never seen, plus
   `eventShare` x the most salient live subject) x the session multiplier x the reporter's beat x a penalty
   for each earlier question of that kind. A kind with no live subject and no evergreen topic has weight 0:
   the room never asks about a holdout that does not exist.
3. **Subject.** Among that kind's candidates (one per matching public event, plus a general subject for
   evergreen topics), weighted by salience = notability (plus 20 for a leak) x recency (halves every 3 days).
4. **Tone.** The measured tone mix tilted by pressure: losing streak, hot seat, low goodwill, this
   reporter's trust and appetite for controversy, market size, a decision the public judged poor, the
   session (crisis harsher, coach's show softer). A hostile floor keeps a hostile question possible.
5. **Follow-up.** After each answer: measured follow-up rate x 2.5 for an evasive answer, x 2 for a
   decline, x 1.8 for a combative one, x 0.6 for a direct one, x 1.5 on a pointed question; at most 2 per
   subject.
6. **Gotcha.** A prior statement that a later public event contradicts becomes a probing or hostile
   question flagged `gotcha`.
7. **Forced first.** A quarterback change is the first question of the next session (H7.2.2 acceptance 1).

## Research

`research/press/` in the project files: `taxonomy.md` (the 41 codes), the classified transcripts
(`pro-*.txt`, `college.txt`: one line per real question), `tally.py`, `tally.json`, `make_facts.py`.
26 transcripts, 426 questions: pro from the Patriots, Dolphins, Bears, Jaguars, Giants and Ravens (club
sites and ASAP Sports), college from Penn State, Texas A&M and Indiana. In-season shares come from the
11 pro and 7 college in-season sessions only; camp, offseason and end-of-season transcripts back the
session multipliers.

Status: 23 of the 82 "reporters ask this kind of question" rows are Verified (seen at 3 or more clubs).
The pooled numbers (shares, tone, follow-up rate, counts) are one sample read by one classifier, so they
are `1 of 3` and print PROVISIONAL. No hostile question appeared in the sample; tone labels differ between
readers (the second pro batch labelled almost every question neutral).

## Decisions

1. **Realistic counts, not the bible's 2 to 5.** Real sessions run about 10 (postgame) to 15 (day after,
   midweek) questions, college weeklies about 16. H7.2.1 starts at 2 to 5 and G-62 at 4 to 8. This module
   generates the realistic count; `settings.questionCount` overrides it, and the H7.2.1 one-click bland
   default still answers all of them. Sent to the bible thread.
2. **Two-stage draw.** Pick the kind of question first (calibrated to the measured mix), then the subject.
   This keeps the mix real when many events compete.
3. **Floor only where a subject exists.** "Anything could be asked" means every topic with a public event
   or an evergreen subject has at least `floorShare`. Nothing is asked about an event the press cannot know.
4. **Wording is design.** Topics come from real transcripts; the sentences are written for the game and
   picked so every placeholder has a real value.
5. **No barrel export yet.** `front-office/src/index.ts` is the integrator's. The world runner and
   app-services wire sessions to this generator and answers to the G-69 stance table (`league/week/media.ts`
   `answer`) and the G-62 answer styles (`career/gameday/postgame.ts`).

## Owed

- CR to the integrator: barrel `export * as press`, PARAMS table row, zod schemas for `PressSession` and
  `PressQuestion`, read model for the session screen, mapping world event types onto `TRIGGER_TYPES`.
- Bible notes: H7.2.1 question count; H7.2.2 topic list (7 topics there, 67 here); G-62 `drawQuestions`
  and G-69 `questions` become callers of this generator.

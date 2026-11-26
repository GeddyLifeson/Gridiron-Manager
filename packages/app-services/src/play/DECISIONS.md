# play/ decisions

CY-01 to CY-05 are in the header of `career-year.ts`. The desks add these. Every one is an ASSUMPTION
(status words of the fact register): none restates a real-world number, and each holds until the system named
takes it over.

| Id | Decision | Holds until |
|----|----------|-------------|
| CY-06 | Practice depth order is the world roster order inside each practice slot. World position codes fold into slots: ILB, MLB, OLB to LB; FS, SS to S; NT to DT; FB to RB; T and G stay. | The depth chart screen writes a team depth chart into the world (M2). |
| CY-07 | AI period leaders teach at the middle of the H3.5.1 range (`teachingTermOf(1)`) and write reports at evaluation skill 0.5. A period the user leads uses `userTeachingTerm(null)`. | K6 staff hidden values are bound to world staff. |
| CY-08 | A week the user leaves alone runs the staff standard week (`STAFF_WEEK`, 75 planned minutes in a 120-minute block, shells, no full-pads period). One practice per week. | The staff AI drafts the week (G-75, H1 weekly schedule). |
| CY-09 | The pro CBA work-rule checker is not run on a plan (it needs the week's held activities, which the save does not keep). Countable hours and coaching findings run. | The week schedule is kept in the career save. |
| CY-10 | The staff's eye is one evaluator (contributor id 0, line `own_staff`) at the median skill `skill.userTerm`, no lean. | AI staff evaluation skill and biases are bound (D6.4.3, K2). |
| CY-11 | Practice evidence: one item per player and attribute per practice; live and thud reps are `practice_full`, jog and walk reps `practice_walk`; units are reps taken. | D6 owner sets per-attribute visibility by period type. |
| CY-12 | Game evidence: the top of each practice slot's depth (22 starters plus K, P, LS) gets one `game_film` item of `GAME_SNAPS` = 60 units per game. | The season session records snaps per player. |
| CY-13 | Priors centre on the position mean of the team's own roster with the no-information sd (D6.4.1). | A position-and-level census (D13.2.2) is exported. |
| CY-14 | Recruiting acts with no staff id are taken by the program's head coach. | The recruiting board names a staff member per act (PR 257 commands). |
| CY-15 | The user's commitments to non-committable offers are answered as an AI program would (`aiAcceptsCommitment`). | The inbox carries the question (O1.2). |
| CY-16 | A queued act whose prospect's class is not being run that day waits for its class's next recruiting day; an act on an unknown prospect is logged and dropped. A rule-breaking act is refused unless `goAhead`. | - |

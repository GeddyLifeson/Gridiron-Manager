# College-to-pro pipeline (G-39)

Bible: T11 (T11.1.1, T11.2.1, T11.2.2, T11.3.1, T11.4.1, T11.5.1), with D6.4.5 rules 1, 3 and 4.

## Files

| File | Leaf | Reads truth? |
| --- | --- | --- |
| `params.ts` | every tuning number, as a `ParamFile` | no |
| `facts.json`, `fact-ids.json`, `facts.ts` | 160 Q6 fact rows: T11.4.1 rates by round and by position group, pick supply, first-round QB rates, top-20 college share, NCAA drafted share, T11.5.1 movement targets | no |
| `level-rule.ts` | T11.1.1: draft-day diff of true values, honours to draft interest only | compares two snapshots; writes nothing |
| `discount.ts` | T11.3.1 summary path: level factor, opponent weight, per-opportunity and system normalisation, cast variance, stat-line evidence items | no |
| `translation.ts` | T11.4.1 odds for N5, by-round and by-group calibration report (J15.10.1), pick supply, T11.5.1 movement check | no |
| `coach-reports.ts` | T11.2.1: statements, accuracy record, statement variance, access, visit hours | no |
| `predraft.ts` | T11.2.2: step order, combine invites, measured tests, testing evidence | **`measure`, `measureForty` only** |
| `standing.ts` | T11.5.1: `regard.pro_teams` from logged history, usual entry jobs | no |

## Facts

Rates are recomputed from `data/people/nfl_draft_history.csv` by `research/college/make_pipeline_facts.py` (project files) with the definitions of `draft_translation.py`; they equal the bible table. A second starter definition from game snap counts (`research/college/draft_translation_snap_check.py`, classes 2012 to 2019: 8 or more games at 50 percent of team snaps) agrees within 3.3 points in every round, and is attached to the by-round Starter 3 and Starter 5 rows. Both trace to Pro Football Reference through nflverse, so it shares the first source's independence group: every rate stays **1 of 3** and prints PROVISIONAL. A third, independent source of starter seasons is still owed (T11.4.1 open question).

## Decisions

- **P-01 Facts beside the module.** As with wealth, injuries and names, the rows stay in the module until the fact lint reads module files. The integrator can move them to `facts/` with the same ids.
- **P-02 One opponent form.** T11.3.1 rule 3's summary `f` uses the D6.4.5 form as a weight, `1 / (1 + ((grade - opponent - 10) / 10)^2)`, floored at 0.2, so the summary path and the play-level path in `scouting` agree where both apply. Play-level evidence keeps using `scouting.observe` and `scouting.evidenceVariance` with the opponent attached; `statLineVariance` passes `opponent: null` to them so the cut is not applied twice.
- **P-03 Skill applies the discount.** Evaluators apply level factor x opponent weight in proportion to evaluation skill (as `scouting` does for D6.4.5 rule 3), so low-skill staff overrate players from weak schedules.
- **P-04 Statement variance from the record.** T11.2.1 gives no noise for a coach's word. Scouts read it from his record: mean absolute error (shrunk toward a neutral 4 ISS over the first 5 statements) times sqrt(pi/2) as an sd. The record is scored against the scouts' settled estimate after pro evidence, never against truth.
- **P-05 Honours.** `draftInterest` is the only consumer here: board grade plus a capped pull per honour scaled by the general manager's K7 honour weight. It orders boards and never writes an estimate or attribute. A source scan test checks that no pipeline file assigns attributes, ceilings or growth values.
- **P-06 Coordinator entry.** T11.5.1 rule 4 names head coaches and position coaches only; a college coordinator is taken to enter as coordinator or position coach.
- **P-07 Rule values and dependencies.** `people` may not import `rules-data`, so `calibrationReport` takes `league_rules.draft.rounds` from the caller (declared in `RULE_KEYS`). Rounds the real table lacks are listed, not failed. G-20 (development) is not merged: nothing here needs the D7 curve; projections keep using `scouting.project` with its `curve` hook.

## Not here

- The 20-season world run that closes T11.4.1 and T4.7.1 (needs G-20, G-34 draft, G-76 front office and the world loop; Q2). `calibrationReport` is the check it calls.
- "Late-round hits come from wide-band players" (T11.3.1 acceptance, second half): needs the draft run above.
- Scout visit scheduling on the calendar (G-12, M3/M4 screens) and the decision log of each answer (N3): this module gives the statement record they store.

## Change requests

- **CR-G39-1** (integrator) `packages/people/src/index.ts`: add `export * as pipeline from './pipeline/index.ts';`.
- **CR-G39-2** (integrator) When the fact lint reads module fact files, register `packages/people/src/pipeline/facts.json` (domain `measured-rate`, ids `F-pipeline-0001` to `0160`).
- **CR-G39-3** (integrator, G-27) Add `pipeline.measure` and `pipeline.measureForty` to the truth-reader list no read model or screen may call (same list as CR-G19-3).
- **CR-G39-4** (research) A third starter-season source independent of Pro Football Reference, and undrafted free agent outcomes (T11.4.1 open questions); combine invite count, pro day and all-star dates (T11.2.2).

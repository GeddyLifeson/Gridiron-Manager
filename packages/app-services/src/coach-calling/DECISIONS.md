# coach-calling: decisions and what is owed

Follow-up to G-58 (PR 138, 151, 191). The K4 caller port (`createCallerPort`, coach-ai) needs content hooks that
coach-ai cannot import (P1.2.1: coach-ai imports engine-game, models, league only; football-content imports
schema only). app-services may import both, so the joins live here.

## What is here
- `content.ts`: the full content set (WP-25, PR 189: 12 starter plays and 8 starter calls kept, 26 plays and
  9 calls added) as K4 `SheetCall`s and K3 `CallOption`s; `contentFits` for the K5 kneel, spike and clock orders.
- `build.ts`: sheet call to the engine `OffenseCall` / `DefenseCall`, players from the host's depth chart.
- `sheet.ts`: `toCallingSheet`, the G-74 `AiSheet` to the K4 `CallingSheet` (CR-G74-2 and the G-58
  `toCallingSheet`), box rules from the G-68 standard catalogue.
- `port.ts`: `coachCallingConfig` / `coachCallerPort`, the whole `CallerPortConfig`.

## Choices (status words per A5)
- Offensive look class is the play's content id: the models tendencies record writes `concept = playContentId`
  for a team's own charting. Defensive look class is the G-74 `defenseLook` form (coverage family, `+pressure`
  at the models `chart.pressureRushers` mark).
- K4.3.7 tags come from content fields only: `pass` for the forward-pass kinds (an RPO carries `rpo`, not
  `pass`, because it may hand off), `deepShot` for intent `shot`, `blitz` at the pressure mark, `man` for
  cover0, cover1 and two-man, `twoHigh` for cover2, cover4, cover6 and two-man (F10.1). `simulatedPressure`
  is a call under the pressure mark in which a second-level defender rushes (slot behaviour `blitz`).
- `avoid_incompletion` keeps calls with no designed forward pass (run, draw, QB run, kneel). By rule an
  incompletion needs a forward pass (B5); this is a definition, not a rate.
- `stay_in_bounds` keeps runs aimed at the middle (or with no side), draws and the kneel. **Assumption**: the
  content has no sideline tag yet. A content tag for "keeps the ball inside" would replace it.
- `sideline_or_middle_with_timeout` has no test: no content field says it, so K5 applies no filter for it.
- K3 concept family (the prior-table row) is the play's G1.1.1 kind, and the defensive look class for a
  defense, until the concept-family table exists (G-74 PriorTable, not built). `fits` is null (any
  situation): content carries an intent word, not a situation list.
- A run with no called side is sent to the middle, as the flow's default run is.
- `toCallingSheet`: K4 bounds hold down, distance, yards to goal and the two-minute flag. A G-68 rule on
  anything else (after a turnover, score, game seconds, the last 5 seconds, a try) is dropped and listed in
  `dropped`; its calls are reached through the parent box (K4.1.1 rule 2). Look columns: the most-scouted looks
  over all boxes up to `mix.maxLooks`, the last column 'other'; an unscouted column takes the box's 'other'
  value or its share-weighted mean. A locked K3 sheet keeps its stored mix (renormalised if a candidate is
  missing from the book); an open one is locked by K4.3.1. The short-yardage box is repeated first under the
  K5 `go.short` rule. Base box per down: the broadest box for that down with no field-zone or clock bound.
- G-74 sequence packages carry no trigger look and its contingencies have another shape, so neither is joined.

## Owed
- Barrel lines (integrator, "Integrate: exports and screen routes"): coach-ai `calling`, `staff`,
  `preparation`; football-content `full`; app-services `coachCalling`.
- Special-teams menu: the port's `special` hook is passed through; kicks fall to the J11.6.1 default until the
  special teams call menu (its own thread) exists.
- K3 priors (G-74 PriorTable) so a real week builds the AiSheet that `toCallingSheet` reads; the whole-game test
  uses hand-built fixture sheets.
- About 22% of scrimmage calls in the whole-game test reach the engine after the deadline and take the
  default: the call window can open only a second or two above the deadline (play clock 15.0 s). That is
  flow timing, not content (reported to the coordinator).

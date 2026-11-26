# Reference resolver (WP-08)

Bible: J1.6.3, J14.1.2, R1.2.2. Entry point: `index.ts` (`REFERENCE_RESOLVER`, `PARAMS`, `RULE_KEYS`, `referenceParamTable`).

A simple outcome model behind the `Resolver` interface. It is for phases 1 and 2 and for cross-checks. Its results may never be saved into a career (`mayProduceSavedResults` is false).

## What it reads

- The `resolver` stream scoped by game and play, and nothing else random.
- `input.math` for log, sqrt and the logistic function.
- `input.params` for every number (`params.ts`, names `resolverRef.*`).
- `input.rules` only for `foul.<id>.exists`. A foul type whose key is missing or false is never committed.

## How a play is resolved

- An offense call is a run, a dropback, a kneel or a spike by its `kind`. An RPO is a pass with the chance `rpo.passShare`. A trick play is a dropback. A draw and a quarterback run are runs.
- A run gain is drawn from the J15.5.1 quantile table, moved by the box count row and the rating shift.
- A dropback draws pressure and sack from the J15.4.2 rows for the number of rushers, then a scramble, then a pass at a depth band with the J15.4.1 completion and interception rates of that band.
- A kick call is resolved by its `kickKind`, whatever the situation's play kind says.
- The rating shift is 0.1 standard deviations per z of the difference between the two units' mean attribute (J1.6.3, an Assumption there).

## What the truth record holds

Physical events only (contract D-04). Conventions officiating can rely on:

- A score is a dead ball with reason `ball_across_goal_line_in_possession`, the spot inside the end zone, and `side` the team with the ball.
- A ball dead in a team's own end zone is `ball_dead_in_end_zone` with `endZoneImpetus` set: the offense for a sack or loss, the passing team for an interception downed there, the kicking team for a punt or free kick.
- A lost fumble is a `fumble` event, a `possession` event with `how: 'fumble_recovery'`, and a dead ball at that spot. There are no fumbles recovered by the fumbling team and no returns of a fumble.
- A place kick ends in `kick_through_uprights` or `kick_failed` with the spot on the end line. Blocked place kicks are not modelled; they are inside the miss rate.
- A foul before the snap leaves two events: the foul and a `pre_snap_foul` dead ball, with a live duration of 0.
- Every `visibility` is `open` except onside kick touches. `marginYd` is filled on a dead ball of the snapping team (distance to the line to gain) and on place kicks (distance to the nearer upright).
- No injuries, no mental errors, no contest events.

## Known gaps, by design

- Coverage family, formation, motion, tempo, weather and fatigue change nothing.
- Completed-pass gains match the mean rows of J15.4.1 but not its quantile row: the depth shares are a fit to five rows, not a measured distribution.
- One parameter table serves one rule set. The kickoff touchback share is the 2025 pro value; a college table needs its own.

// Ball carrier model (bible J8, work package WP-21): seeing the field, the designed run's press and
// read, lane choice and run style, moves, finishing (traffic, situation rules, slides), carriers after
// the catch and on returns; and, on bodies, the J6.6 tackle and pile contests, the J6.7 fumble draw and
// loose-ball and kick recoveries.
//
// Conventions:
//   - Decisions read the carrier's `PerceivedView`, his own state, his side's play and public facts.
//     The two named truth reads (engagement state, movement limits) are documented in stage.ts.
//   - Draws: stream `carrier` [game, play, player] in fixed blocks per carry and per tick; contests on
//     stream `contest` [game, play, lowerId, higherId, type] (J13.2.1).
//   - Every number is a row of `PARAMS` (bible starting value or named assumption; none is a measured
//     fact). Measured rates appear only as calibration targets in `constrainedBy`.
export * from './params.ts';
export * from './formulas.ts';
export * from './stage.ts';
export * from './plug.ts';

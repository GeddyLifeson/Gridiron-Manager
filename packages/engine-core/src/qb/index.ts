// Quarterback model (bible J7, work package WP-20): the drop, the progression, judging open, the
// throw-or-hold decision, feeling and answering pressure, scrambles and throwaways, the throw's
// timing and error, the mesh read, and the clock plays.
//
// Conventions:
//   - Decisions read his `PerceivedView`, his own state, his side's play and public facts (Q1.4.1).
//     The two named truth reads of rushers are documented at the top of stage.ts.
//   - Every draw comes from stream `qb`, keyed [game, play, player] (J13.2.1): a fixed block at the
//     start of the play, then four uniforms on each tick he holds the ball. Arrival and strip-sack
//     draws use `contest`.
//   - Every number is a row of `PARAMS` (bible starting value or named assumption; none is a measured
//     fact yet). Rule keys read are listed in `RULE_KEYS`.
export * from './params.ts';
export * from './formulas.ts';
export * from './play.ts';
export * from './judge.ts';
export * from './stage.ts';

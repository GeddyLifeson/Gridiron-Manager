// Ball physics and kicking (bible J9, work package WP-16): pass flight and its solver, snaps,
// deflections, bounces and rolls, the place-kick operation and make model, punts, kickoffs, onside
// kicks, wind and air, and the tick stages that move the ball.
//
// Conventions:
//   - Field frame, yards, seconds. Height is the only third dimension (J1.1.1).
//   - Every draw comes from stream `ball`, keyed [game, play, flightIndex] (J13.2.1). Each resolve
//     function documents its fixed raw-draw count. Pass flight itself draws nothing (aim error is J7's).
//   - Every number is a row of `PARAMS` or an exact unit constant in params.ts. The module reads no rule
//     key: goal posts arrive in `FieldGeometry`, and kick consequences are officiating's (B6).
export * from './params.ts';
export * from './flight.ts';
export * from './loose.ts';
export * from './kicks.ts';
export * from './stage.ts';
export * from './exchanges.ts';

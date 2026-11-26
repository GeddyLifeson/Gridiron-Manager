// Tuning constants of the tick resolver assembly (WP-23). Every row is a starting value chosen by the
// module's author (basis 'assumption') unless the leaf states it. None is a rule value: rules arrive by
// key. The stand-in rows exist only while WP-20, WP-21 or WP-22 is missing and go when they land.
import type { ParamFile, ParamTable } from '@gm/schema';
import { defineParams, fastParams, type ParamRow } from '../tick/param-util.ts';

const A = 'assumption' as const;
const ROWS: readonly ParamRow[] = [
  // Where the two units stand when the pre-snap phase starts (J5.1): a huddle each side of the ball.
  ['setup.huddleDepthYd', 8, 3, 15, 'yd', A, 'J5.1.1', 'film: units reach their alignment before the snap'],
  ['setup.huddleSpacingYd', 0.8, 0.5, 2, 'yd', A, 'J5.1.1', 'none'],
  // Perception keeps 1.5 s of history (J3.1.1); it starts this many ticks before the snap.
  ['setup.perceptionLeadTicks', 20, 15, 100, 'ticks', A, 'J3.1.1', 'must cover the longest key delay'],
  ['setup.defaultCohesion', 0.5, 0, 1, 'ratio', A, 'J3.6.1', 'D9.5.1 cohesion when the call names no dependents'],
  // J6 engagements as bodies (Interact stage).
  ['interact.contactGapYd', 0.25, 0, 1, 'yd', A, 'J6.1.2', 'a block starts when the body circles are this close'],
  ['interact.breakGapYd', 1.5, 0.5, 3, 'yd', A, 'J6.1.2', 'a block ends when the bodies are this far apart'],
  ['interact.wonRecoveryS', 1.5, 0.5, 4, 's', A, 'J6.1.2', 'defender out of the play after A = +1 (pancake or locked out)'],
  ['interact.shedFreeS', 0.6, 0.1, 2, 's', A, 'J6.1.2', 'no blocker can pick him up again this soon after a shed'],
  ['interact.interiorHalfWidthYd', 2.5, 1, 5, 'yd', A, 'J6.2.1', 'rushers inside this lateral distance use the interior row'],
  // J2.1.3 planted cuts on drawn paths (route-cuts.ts).
  ['route.cutMatchYd', 4, 0.5, 8, 'yd', A, 'J2.1.3', 'a break point moved by a K1 depth or width error is still his break when his aim is this close to the drawn one'],
  // J7.3.1 inputs: whom the quarterback watches while he is on a read (plugs.ts). The count is spent
  // from his J3.1.2 attention capacity (3 at grade 50), after the receiver himself.
  ['qb.watchDefenders', 2, 0, 4, 'count', A, 'J7.3.1', 'J15.4.1 interception rate by depth'],
  ['qb.watchAheadYd', 12, 4, 25, 'yd', A, 'J7.3.1', 'J15.4.1 interception rate by depth'],
  // The catch point as bodies (J6.5.1). The chances themselves are the contest file's rows.
  ['catch.reachPerHeight', 1.3, 1.1, 1.5, 'ratio', A, 'J6.5.1', 'standing reach as a share of height; a ball above it cannot be played'],
  ['catch.leapPerZYd', 0.1, 0, 0.3, 'yd/z', A, 'J6.5.1', 'reach height gained per z of explosiveness'],
  ['catch.boundaryRoomYd', 1.5, 0.5, 4, 'yd', A, 'J6.5.1', 'closer to a sideline or end line than this, the feet-in-bounds draw is taken'],
  ['catch.hitGapYd', 0.2, 0, 1, 'yd', A, 'J6.5.1', 'a defender this close to the receiver, and closing, hits him as the ball arrives'],
  ['catch.hitClosingYps', 3, 0.5, 8, 'yd/s', A, 'J6.5.1', 'closing speed that makes the contact a hit'],
  ['catch.movingYps', 2, 0.5, 5, 'yd/s', A, 'J6.5.1', 'receiver faster than this has a direction a defender can trail'],
  ['catch.knockDownKeep', 0.25, 0, 1, 'ratio', A, 'J6.5.1', 'share of its pace a dropped or broken-up ball keeps'],
  // Kick-play operation (J9.4 to J9.6): values the call content will carry once it has them.
  ['kick.aimLatYd', 12, 0, 25, 'yd', A, 'J9.5.1', 'lateral aim of a directional punt or kickoff'],
  ['kick.kickoffTargetAlongYd', 62, 30, 80, 'yd', A, 'J9.6.1', 'called landing point until the kick call carries one'],
  ['kick.pressureRangeYd', 5, 1, 10, 'yd', A, 'J9.5.1', 'free rusher inside this range is full pressure on the punter'],
  // A play from a kicking look (F12.7.1): the long snap flies at the speed the punt operation gives it,
  // `this depth / (ball.block.puntSnapS - ball.block.puntPerZS * z_longSnap)`, to whoever takes it.
  ['kickLook.puntSnapDepthYd', 14.5, 13, 16, 'yd', 'bible', 'J9.4.3', 'J9.4.3: a long snap of 0.75 s to a punter at 14 to 15 yd'],
  // Stand-ins. Not football: they only let a play end while the real modules are missing.
  ['standIn.qbHoldS', 6, 2, 20, 's', A, 'J7', 'stand-in only'],
  ['standIn.touchGapYd', 0.1, 0, 1, 'yd', A, 'J8', 'stand-in only'],
  ['standIn.reachHeightYd', 2.5, 1, 3.5, 'yd', A, 'J6.7.2', 'stand-in only'],
];

export const PARAMS: ParamFile = defineParams('tickResolver', '0.1.0', ROWS);

export type TickResolverParams = Readonly<Record<string, number>>;

let cachedTable: ParamTable | null = null, cached: TickResolverParams | null = null;
/** The module's rows as a plain record keyed without the module prefix. Read once per parameter table. */
export function tickResolverParams(t: ParamTable): TickResolverParams {
  if (cachedTable === t && cached !== null) return cached;
  const out: Record<string, number> = {};
  for (const p of PARAMS.params) { const short = p.name.slice('tickResolver.'.length); out[short] = t.num(p.name); }
  const fast = fastParams(out);
  cachedTable = t; cached = fast;
  return fast;
}

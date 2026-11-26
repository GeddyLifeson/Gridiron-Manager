// Contest models (bible J6, work package WP-12). The Interact stage and the quarterback, carrier, ball
// and foul modules (J7 to J10) call these; nothing else turns player grades into results.
//
// Conventions:
//   - Inputs are effective z values (J6.1.1). Build them with `CONTEST_MATH.effectiveZ` from true
//     attribute values; never from a displayed grade or a staff estimate.
//   - Every draw comes from the `RandomStream` the caller opens on stream `contest`, keyed
//     [game, play, lowerPlayerId, higherPlayerId, contestType] (J13.2.1). Each `resolve*` function
//     documents a fixed number of draws, so one contest never shifts another.
//   - Every number is a row of `PARAMS` (J6.8.1) or a rule value named in `RULE_KEYS`.
import type { ContestMath, DeterministicMath, ParamTable } from '@gm/schema';
import { CONTEST_MATH } from './math.ts';
import { P_CEIL, P_FLOOR } from './params.ts';
import { createPassRush, type PassRushContests } from './pass-rush.ts';
import { createRunBlock, type RunBlockContests } from './run-block.ts';
import { createCoverage, type CoverageContests } from './coverage.ts';
import { createCatchPoint, type CatchPointContests } from './catch-point.ts';
import { createTackle, type TackleContests } from './tackle.ts';
import { createBallSecurity, type BallSecurityContests } from './ball-security.ts';

export * from './params.ts';
export * from './math.ts';
export type * from './pass-rush.ts';
export type * from './run-block.ts';
export type * from './coverage.ts';
export type * from './catch-point.ts';
export type * from './tackle.ts';
export type * from './ball-security.ts';

export interface Contests {
  readonly math: ContestMath;
  /** J6.1.1 `dFatigue` from in-play fatigue f in 0 to 1 (J2.4). */
  fatiguePenaltyZ(fatigue: number): number;
  readonly passRush: PassRushContests;
  readonly runBlock: RunBlockContests;
  readonly coverage: CoverageContests;
  readonly catchPoint: CatchPointContests;
  readonly tackle: TackleContests;
  readonly ballSecurity: BallSecurityContests;
}

/** Builds the contest library over a parameter table. All parameters are read here, once. */
export function createContests(params: ParamTable, math: DeterministicMath): Contests {
  const n = (name: string): number => params.num(`contest.${name}`);
  if (n('common.pFloor') !== P_FLOOR || n('common.pCeil') !== P_CEIL) {
    throw new Error('contest.common.pFloor and pCeil are fixed by J6.1.3 and cannot be overridden by a parameter table');
  }
  const fatigueCoef = n('common.fatigueCoef');
  return {
    math: CONTEST_MATH,
    fatiguePenaltyZ: (fatigue) => fatigueCoef * fatigue * fatigue,
    passRush: createPassRush(n, math),
    runBlock: createRunBlock(n, math),
    coverage: createCoverage(n, math),
    catchPoint: createCatchPoint(n, math),
    tackle: createTackle(n, math),
    ballSecurity: createBallSecurity(n, math),
  };
}

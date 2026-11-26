// Spots and facts of one down that enforcement needs (B8.5.2 basic spot, B6.6.1 end of kick, B8.5.5 clean hands).
//
// CONTRACT CHANGE REQUEST (plans/engine-build-plan.md section 6): `FoulRules.options` receives the
// called outcome and the foul records only. B8.5.2 needs the spot where possession was lost, the spot
// of a fumble or backward pass, and B6.6.1 needs the end of the kick. None of them is in `PlayOutcome`.
// Until the contract carries them, this local type holds them. `factsFromTruth` fills it from the seen
// truth record; `factsFromOutcome` is the fallback the contract signature allows, and uses the
// dead-ball spot wherever a spot is unknown.
import {
  deadBallOf, eventsOf, otherSide, yardsFromOwnGoal,
  type AttackDir, type PlayOutcome, type PlayTruth, type RulingContext, type Side,
} from '@gm/schema';
import { K } from './params.ts';

/**
 * All spots are in yards from the goal line of the team that snapped or kicked ("Team A", B8 Terms),
 * measured toward the goal it attacks: 0 is Team A's goal line, `length` is Team B's.
 */
export interface EnforcementFacts {
  readonly teamA: Side;
  readonly teamB: Side;
  readonly dir: AttackDir;
  /** Goal line to goal line. */
  readonly length: number;
  readonly previous: number;
  /** Where the ball became dead. On a touchback or an incomplete pass this is the succeeding spot (B6.6.1 rule 2). */
  readonly deadBall: number;
  readonly succeeding: number;
  readonly lineToGain: number | null;
  /** Team entitled to the ball after the down, counting a failed last down. */
  readonly nextSide: Side;
  readonly turnoverOnDowns: boolean;
  /** Spot where Team A lost possession, when it did. */
  readonly lostAt: number | null;
  /** Spot of the first fumble or backward pass by Team A before any change of possession. */
  readonly looseAt: number | null;
  /** Where a scrimmage kick ended: the receivers' catch or recovery, or the dead-ball spot. */
  readonly kickEnd: number | null;
  readonly kickCrossedLine: boolean;
  /** A receiver who gained the ball in his own end zone tried to bring it out (B8.5.3 rule 6). */
  readonly triedToAdvance: boolean;
  /** Time expired during the down. */
  readonly periodExpired: boolean;
  /** The period is the last of a half, or an overtime period. */
  readonly lastPeriodOfHalf: boolean;
}

export function toTeamA(ctx: RulingContext, x: number): number {
  return yardsFromOwnGoal(ctx.geometry, x, ctx.situation.attackDir);
}

export function toFieldX(ctx: RulingContext, yards: number): number {
  const g = ctx.geometry;
  return ctx.situation.attackDir === 1 ? g.goalLineWestX + yards : g.goalLineEastX - yards;
}

function base(outcome: PlayOutcome, ctx: RulingContext): EnforcementFacts {
  const s = ctx.situation;
  const teamA = outcome.snappingSide;
  const teamB = otherSide(teamA);
  const length = ctx.geometry.goalLineEastX - ctx.geometry.goalLineWestX;
  const previous = toTeamA(ctx, outcome.previousSpotX);
  const succeeding = toTeamA(ctx, outcome.spotX);
  const lineToGain = s.lineToGainX === null ? null : toTeamA(ctx, s.lineToGainX);
  const lastDown = s.down !== null && s.down >= ctx.rules.num(K.downs);
  const turnoverOnDowns = s.playKind === 'scrimmage' && lastDown && lineToGain !== null && !outcome.noPlay
    && outcome.score === null && outcome.possessionAfter === teamA && succeeding < lineToGain;
  let deadBall = succeeding;
  if (outcome.score !== null && outcome.score.type === 'touchdown') deadBall = outcome.score.side === teamA ? length : 0;
  const perHalf = ctx.rules.num(K.periodsPerHalf);
  return {
    teamA, teamB, dir: s.attackDir, length, previous, deadBall, succeeding, lineToGain,
    nextSide: turnoverOnDowns ? teamB : outcome.possessionAfter, turnoverOnDowns,
    lostAt: null, looseAt: null, kickEnd: null, kickCrossedLine: false, triedToAdvance: false,
    periodExpired: s.untimedDown,
    lastPeriodOfHalf: s.overtime || s.period % perHalf === 0,
  };
}

/** The facts the contract signature can give: every spot it cannot know is the dead-ball spot. */
export function factsFromOutcome(outcome: PlayOutcome, ctx: RulingContext): EnforcementFacts {
  return base(outcome, ctx);
}

/** The facts read from the truth record as the crew saw it. */
export function factsFromTruth(seen: PlayTruth, outcome: PlayOutcome, ctx: RulingContext): EnforcementFacts {
  const b = base(outcome, ctx);
  const A = b.teamA;
  const possessions = eventsOf(seen, 'possession');
  const firstChange = possessions.find((e) => e.side !== A) ?? null;
  const changeT = firstChange === null ? null : firstChange.t;

  let looseAt: number | null = null;
  let lastLoose: number | null = null;
  for (const e of seen.events) {
    if (changeT !== null && e.t > changeT) break;
    let spot: number | null = null;
    if (e.type === 'fumble' && e.side === A) spot = toTeamA(ctx, e.spot.x);
    if (e.type === 'pass_release' && !e.forward) spot = toTeamA(ctx, e.releaseSpot.x);
    if (spot === null) continue;
    if (looseAt === null) looseAt = spot;
    lastLoose = spot;
  }

  const kick = eventsOf(seen, 'kick')[0] ?? null;
  let lostAt: number | null = null;
  let kickEnd: number | null = null;
  if (kick !== null) {
    const got = possessions.find((e) => e.side !== A && e.t >= kick.t) ?? null;
    kickEnd = got === null ? toTeamA(ctx, deadBallOf(seen).spot.x) : toTeamA(ctx, got.spot.x);
  } else if (firstChange !== null) {
    // A fumble is lost where it was fumbled; an interception where it was caught (B8.5.2 basic spot).
    lostAt = firstChange.how === 'fumble_recovery' && lastLoose !== null ? lastLoose : toTeamA(ctx, firstChange.spot.x);
  }

  let triedToAdvance = false;
  if (outcome.touchback && firstChange !== null && toTeamA(ctx, firstChange.spot.x) >= b.length) {
    triedToAdvance = seen.events.some((e) => e.type === 'tackle_attempt' && e.t > firstChange.t);
  }

  const s = ctx.situation;
  const timed = s.clockStatus !== 'untimed' && s.clockStatus !== 'intermission';
  return {
    ...b, lostAt, looseAt, kickEnd,
    kickCrossedLine: kick !== null && kick.crossedLine,
    triedToAdvance,
    periodExpired: b.periodExpired || (timed && seen.liveDurationTenths > 0 && s.clockTenths <= seen.liveDurationTenths),
  };
}

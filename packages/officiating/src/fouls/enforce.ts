// Enforcement of one foul (B8.5.2 spots, B8.5.3 half the distance, B6.6.1 kicks, B7.3.3 tries,
// B8.5.7 scores). `plansFor` returns every way the rules allow one foul to be enforced; the procedure
// in options.ts combines them. All spots here are Team A yards (facts.ts).
import { otherSide, type FoulRecord, type PlayOutcome, type RuleSet, type RulingContext, type Side } from '@gm/schema';
import { enforcementProfile, isKickBlockAttempt } from './catalogue.ts';
import type { EnforcementFacts } from './facts.ts';
import { K } from './params.ts';

export type PlanKind =
  | 'previous_spot' | 'spot_of_foul' | 'basic_spot' | 'dead_ball_spot' | 'succeeding_spot' | 'post_possession'
  | 'safety' | 'carry_try' | 'carry_kickoff' | 'try_fails' | 'no_yardage' | 'offset' | 'offset_keep';

/** One way to enforce. `to` is the succeeding spot after it. */
export interface Plan {
  readonly kind: PlanKind;
  readonly enforced: readonly number[];
  readonly from: number | null;
  readonly to: number;
  readonly possession: Side;
  /** The result of the play stands (score, change of possession, statistics). */
  readonly keepResult: boolean;
  readonly noPlay: boolean;
  readonly replayDown: boolean;
  readonly afd: boolean;
  readonly lod: boolean;
  readonly half: boolean;
  readonly safetyFor: Side | null;
  readonly carriedTo: 'try' | 'kickoff' | null;
  readonly offsetting: boolean;
  /** Yards of the play that still count for the team that snapped, when the result does not stand. */
  readonly gain: number;
}

export interface World {
  readonly ctx: RulingContext;
  readonly rules: RuleSet;
  readonly outcome: PlayOutcome;
  readonly facts: EnforcementFacts;
  readonly fouls: readonly FoulRecord[];
}

interface Walked { readonly to: number; readonly half: boolean }

/**
 * B8.5.3 rule 1: walk `yards` against a team from a spot, limited to the rule set's fraction of the
 * distance to that team's goal line. A foul exempt from the limit (rule 2) still cannot put the ball
 * on or behind the goal line: the bible gives no result for that case, so the limit is applied there.
 */
export function walk(w: World, from: number, yards: number, against: Side, limited: boolean): Walked {
  const f = w.facts;
  const start = Math.min(Math.max(from, 0), f.length);
  const towardA = against === f.teamA;
  const room = towardA ? start : f.length - start;
  const cap = room * w.rules.num(K.halfFraction);
  const limit = limited ? w.rules.bool(K.halfApplies) && yards > cap : yards >= room;
  const eff = limit ? cap : yards;
  return { to: towardA ? start - eff : start + eff, half: limit };
}

const NO = { keepResult: false, noPlay: false, replayDown: false, afd: false, lod: false, half: false,
  safetyFor: null, carriedTo: null, offsetting: false, gain: 0 } as const;

function isPersonal(r: FoulRecord): boolean { return r.foulClass !== 'other'; }

function inOwnEndZone(f: EnforcementFacts, spot: number, side: Side): boolean {
  return side === f.teamA ? spot <= 0 : spot >= f.length;
}

function safety(w: World, i: number, against: Side): Plan {
  const f = w.facts;
  const goal = against === f.teamA ? 0 : f.length;
  return { ...NO, kind: 'safety', enforced: [i], from: goal, to: goal, possession: otherSide(against), safetyFor: otherSide(against) };
}

function carry(w: World, i: number, to: 'try' | 'kickoff'): Plan {
  return { ...NO, kind: to === 'try' ? 'carry_try' : 'carry_kickoff', enforced: [i], from: null, to: w.facts.succeeding,
    possession: w.outcome.possessionAfter, keepResult: true, carriedTo: to };
}

export function limited(w: World, r: FoulRecord): boolean {
  const p = enforcementProfile(r.foulId, w.rules);
  return p === 'standard' || p === 'interference_spot';
}

/** B8.1.2 and B13.5.1: where defensive pass interference at `spot` puts the ball. */
export function interferenceSpot(w: World, spot: number): number {
  const f = w.facts;
  const r = w.rules;
  let target = spot;
  if (r.num(K.interferenceMaxYards) > 0) target = Math.min(target, f.previous + r.num(K.interferenceMaxYards));
  const floor = f.length - r.num(K.interferenceFloorYardline);
  const halfLine = f.length - r.num(K.interferenceHalfInside);
  const prevInside = r.bool(K.interferenceHalfInclusive) ? f.previous >= halfLine : f.previous > halfLine;
  const hit = r.opt(K.interferenceFloorRule) === 'end_zone_only' ? spot >= f.length : target > floor;
  if (!hit) return target;
  return prevInside ? f.previous + (f.length - f.previous) * r.num(K.halfFraction) : floor;
}

/** Enforcement at the previous spot with the down replayed, or counted when the foul carries loss of down. */
function atPrevious(w: World, i: number): Plan {
  const f = w.facts;
  const r = w.fouls[i]!;
  const m = walk(w, f.previous, r.yards, r.side, limited(w, r));
  const lod = r.lod && r.side === f.teamA;
  return { ...NO, kind: 'previous_spot', enforced: [i], from: f.previous, to: m.to, half: m.half, possession: f.teamA,
    noPlay: !lod, replayDown: !lod, lod, afd: r.afd && r.side === f.teamB };
}

/** Yardage added where the play ended, with the result standing. */
function tackOn(w: World, i: number, kind: PlanKind): Plan {
  const f = w.facts;
  const r = w.fouls[i]!;
  const m = walk(w, f.succeeding, r.yards, r.side, limited(w, r));
  return { ...NO, kind, enforced: [i], from: f.succeeding, to: m.to, half: m.half, possession: f.nextSide, keepResult: true,
    afd: r.afd && r.side !== f.nextSide };
}

/** From a spot, with the ball staying with (or returning to) `possession` and the result not standing. */
function fromSpot(w: World, i: number, kind: PlanKind, from: number, possession: Side): Plan {
  const f = w.facts;
  const r = w.fouls[i]!;
  const start = Math.min(Math.max(from, 0), f.length);
  const m = walk(w, start, r.yards, r.side, limited(w, r));
  const offensive = r.side === possession;
  const lod = r.lod && offensive && possession === f.teamA;
  const atLine = start === f.previous;
  return { ...NO, kind, enforced: [i], from: start, to: m.to, half: m.half, possession,
    noPlay: atLine && !lod && possession === f.teamA, lod,
    replayDown: possession === f.teamA && !lod && (offensive || !r.afd),
    afd: r.afd && !offensive, gain: possession === f.teamA && !atLine ? start - f.previous : 0 };
}

function passPlay(w: World, i: number): Plan[] {
  const f = w.facts;
  const r = w.fouls[i]!;
  const sp = spotOf(w, r);
  const profile = enforcementProfile(r.foulId, w.rules);
  const out: Plan[] = [];
  if (r.side === f.teamA) {
    if (profile === 'previous_or_spot_worse') {
      // B8.1.2 intentional_grounding row: the yardage or the spot of the pass, and a safety from the end zone.
      if (sp <= 0) return [safety(w, i, f.teamA)];
      const m = walk(w, f.previous, r.yards, f.teamA, false);
      const to = Math.min(m.to, sp);
      out.push({ ...NO, kind: to === sp ? 'spot_of_foul' : 'previous_spot', enforced: [i], from: f.previous, to, half: m.half && to !== sp,
        possession: f.teamA, lod: r.lod, noPlay: !r.lod, replayDown: !r.lod });
    } else if (r.spotFoul) {
      if (sp <= 0) return [safety(w, i, f.teamA)];
      const p = fromSpot(w, i, 'spot_of_foul', sp, f.teamA);
      out.push({ ...p, gain: 0, noPlay: !p.lod });
    } else {
      out.push(atPrevious(w, i));
      // B8.5.3 rule 4: an offensive foul behind its own goal line is a safety if the defense enforces there.
      if (sp <= 0) out.push(safety(w, i, f.teamA));
    }
    out.push(...offenseKeepsNothing(w, i));
    return out;
  }
  if (profile === 'interference_spot') {
    const to = interferenceSpot(w, sp);
    return [{ ...NO, kind: 'spot_of_foul', enforced: [i], from: f.previous, to, possession: f.teamA, noPlay: true, replayDown: !r.afd, afd: r.afd }];
  }
  if (r.spotFoul) return [{ ...fromSpot(w, i, 'spot_of_foul', sp, f.teamA), noPlay: true, gain: 0 }];
  const prev = atPrevious(w, i);
  // B8.5.2 exception 7: a defensive personal or unsportsmanlike foul goes from the previous spot or
  // the dead-ball spot, whichever is better for the offense, when the offense still has the ball.
  if (isPersonal(r) && f.nextSide === f.teamA && !w.outcome.changeOfPossession && !w.outcome.incomplete && w.outcome.score === null) {
    const tack = tackOn(w, i, 'dead_ball_spot');
    if (tack.to > prev.to) return [tack];
  }
  return [prev];
}

/**
 * B8.5.2 exception 8: an offensive personal or unsportsmanlike foul before the offense lost the
 * ball may be enforced from the dead-ball spot, and the defense keeps the ball.
 */
function offenseKeepsNothing(w: World, i: number): Plan[] {
  const f = w.facts;
  const r = w.fouls[i]!;
  if (!isPersonal(r) || r.side !== f.teamA || !r.beforeChangeOfPossession) return [];
  if (f.nextSide !== f.teamB || w.outcome.score !== null) return [];
  return [tackOn(w, i, 'dead_ball_spot')];
}

function spotOf(w: World, r: FoulRecord): number {
  const g = w.ctx.geometry;
  return w.facts.dir === 1 ? r.spot.x - g.goalLineWestX : g.goalLineEastX - r.spot.x;
}

function runningPlay(w: World, i: number): Plan[] {
  const f = w.facts;
  const r = w.fouls[i]!;
  const sp = spotOf(w, r);
  const loose = r.phase === 'backward_pass_or_fumble';
  const changed = w.outcome.changeOfPossession || f.lostAt !== null;
  const basic = loose ? (f.looseAt ?? f.deadBall) : changed ? (f.lostAt ?? f.deadBall) : f.deadBall;
  const basicBehind = basic < f.previous;
  if (r.side === f.teamA) {
    const out: Plan[] = [];
    if (r.spotFoul) {
      if (sp <= 0) return [safety(w, i, f.teamA)];
      out.push(fromSpot(w, i, 'spot_of_foul', sp, f.teamA));
    } else if (sp < f.previous || basicBehind) {
      // Exceptions 1, 2 and 4: behind the line, or the basic spot behind the line.
      out.push(atPrevious(w, i));
    } else if (sp < basic) {
      out.push(fromSpot(w, i, 'spot_of_foul', sp, f.teamA));
    } else {
      out.push(fromSpot(w, i, 'basic_spot', basic, f.teamA));
    }
    if (sp <= 0) out.push(safety(w, i, f.teamA));
    out.push(...offenseKeepsNothing(w, i));
    return out;
  }
  // Exceptions 3 and 4: the basic spot is behind the line, so a defensive foul goes from the previous spot.
  if (basicBehind) return [atPrevious(w, i)];
  if (!changed && w.outcome.score === null && !f.turnoverOnDowns) {
    const t = tackOn(w, i, 'basic_spot');
    return [{ ...t, replayDown: !r.afd }];
  }
  // Exception 9: a defensive foul before the change returns the ball to the offense before enforcement.
  return [fromSpot(w, i, 'basic_spot', basic, f.teamA)];
}

/** A foul after the change of possession: a new running play by the team that has the ball (B8.5.2, B8.5.3 rule 6). */
function afterChange(w: World, i: number): Plan[] {
  const f = w.facts;
  const r = w.fouls[i]!;
  const holder = f.nextSide;
  if (r.side !== holder) return [tackOn(w, i, 'dead_ball_spot')];
  const sp = spotOf(w, r);
  const basic = f.deadBall;
  const behind = holder === f.teamA ? sp < basic : sp > basic;
  let from = behind ? sp : basic;
  if (inOwnEndZone(f, from, holder)) {
    if (!w.outcome.touchback || f.triedToAdvance) return [safety(w, i, holder)];
    from = f.succeeding;
  } else if (w.outcome.touchback) {
    // The spot of the foul or the touchback spot, whichever is worse for the fouling team.
    from = holder === f.teamA ? Math.min(sp, f.succeeding) : Math.max(sp, f.succeeding);
  }
  const m = walk(w, from, r.yards, holder, limited(w, r));
  return [{ ...NO, kind: behind ? 'spot_of_foul' : 'dead_ball_spot', enforced: [i], from, to: m.to, half: m.half, possession: holder }];
}

/** B6.6.1 rules 4 to 9. */
function scrimmageKick(w: World, i: number): Plan[] {
  const f = w.facts;
  const r = w.fouls[i]!;
  const sp = spotOf(w, r);
  const receiversKeep = f.nextSide === f.teamB;
  if (r.side === f.teamA) {
    if (r.spotFoul) {
      const m = walk(w, sp, r.yards, f.teamA, limited(w, r));
      return [{ ...NO, kind: 'spot_of_foul', enforced: [i], from: sp, to: m.to, half: m.half, possession: f.teamB }];
    }
    // Rule 7: a missed field goal that gives the receivers the ball.
    if (w.outcome.resultType === 'field_goal_missed' && receiversKeep) return [tackOn(w, i, 'succeeding_spot')];
    const out: Plan[] = [atPrevious(w, i)];
    if (sp <= 0) out.push(safety(w, i, f.teamA));
    if (receiversKeep && w.outcome.score === null) out.push(tackOn(w, i, 'dead_ball_spot'));
    return out;
  }
  if (r.spotFoul) {
    const m = walk(w, sp, r.yards, f.teamB, limited(w, r));
    return [{ ...NO, kind: 'spot_of_foul', enforced: [i], from: sp, to: m.to, half: m.half, possession: f.nextSide }];
  }
  // Rule 8: a post-possession foul is enforced as if the receivers already had the ball.
  if (f.kickCrossedLine && f.kickEnd !== null && receiversKeep && !isKickBlockAttempt(r.foulId, w.rules)) {
    let from = Math.max(f.kickEnd, sp);
    if (from >= f.length) from = f.length - w.rules.num(K.endZoneFoulYardline);
    const m = walk(w, from, r.yards, f.teamB, limited(w, r));
    return [{ ...NO, kind: 'post_possession', enforced: [i], from, to: m.to, half: m.half, possession: f.teamB }];
  }
  return [atPrevious(w, i)];
}

/** B6.6.1 rules 1 to 3. */
function freeKick(w: World, i: number): Plan[] {
  const f = w.facts;
  const r = w.fouls[i]!;
  const sp = spotOf(w, r);
  if (r.spotFoul && sp < f.length) {
    const m = walk(w, sp, r.yards, r.side, limited(w, r));
    return [{ ...NO, kind: 'spot_of_foul', enforced: [i], from: sp, to: m.to, half: m.half, possession: f.teamB }];
  }
  const out: Plan[] = [atPrevious(w, i)];
  if (f.nextSide === f.teamB && w.outcome.score === null) out.push(tackOn(w, i, 'dead_ball_spot'));
  return out;
}

function tryGood(o: PlayOutcome): boolean {
  return o.score !== null && (o.score.type === 'try_kick' || o.score.type === 'try_two');
}

/** B7.3.3 rules 3 and 4. */
function tryDown(w: World, i: number): Plan[] {
  const f = w.facts;
  const r = w.fouls[i]!;
  const o = w.outcome;
  const good = tryGood(o);
  if (r.side === f.teamA) {
    if (r.lod) return [{ ...NO, kind: 'try_fails', enforced: [i], from: null, to: f.succeeding, possession: o.possessionAfter, lod: true }];
    if (good) return [atPrevious(w, i)];
    return isPersonal(r) ? [carry(w, i, 'kickoff')] : [];
  }
  const retry = enforcementProfile(r.foulId, w.rules) === 'interference_spot'
    ? { ...atPrevious(w, i), to: interferenceSpot(w, spotOf(w, r)), half: false, kind: 'spot_of_foul' as const }
    : atPrevious(w, i);
  if (good) return enforcementProfile(r.foulId, w.rules) === 'interference_spot' ? [retry] : [carry(w, i, 'kickoff'), retry];
  // On a try that failed the offense may also decline the yardage and replay the down.
  return [retry, { ...retry, kind: 'no_yardage', to: f.previous, half: false }];
}

/** A walked-off spot must be in the field of play; a plan that cannot keep it there is not offered. */
function inField(w: World, plans: Plan[]): Plan[] {
  return plans.filter((p) => p.safetyFor !== null || p.carriedTo !== null || p.kind === 'try_fails' || (p.to > 0 && p.to < w.facts.length));
}

/** Every way to enforce live-ball or pre-snap foul `i` on its own. Empty when nothing can be enforced. */
export function livePlans(w: World, i: number): Plan[] { return inField(w, liveAll(w, i)); }

function liveAll(w: World, i: number): Plan[] {
  const f = w.facts;
  const r = w.fouls[i]!;
  const o = w.outcome;
  if (r.timing === 'before_snap') return [atPrevious(w, i)];
  if (w.ctx.situation.playKind === 'try' || r.phase === 'try') return tryDown(w, i);
  let plans: Plan[];
  if (r.phase === 'scrimmage_kick') plans = scrimmageKick(w, i);
  else if (r.phase === 'free_kick') plans = freeKick(w, i);
  else if (r.phase === 'after_change_of_possession' || !r.beforeChangeOfPossession) plans = afterChange(w, i);
  // B8.5.2 table: a foul at the snap goes from the previous spot.
  else if (r.t <= 0 && !r.spotFoul && enforcementProfile(r.foulId, w.rules) === 'standard') plans = [atPrevious(w, i)];
  else if (r.phase === 'pass_play') plans = passPlay(w, i);
  else plans = runningPlay(w, i);

  if (o.score === null || tryGood(o) || o.score.type === 'defensive_try' || o.score.type === 'try_safety') return plans;
  // B8.5.7: fouls on a scoring play.
  const giveUp = plans.filter((p) => !p.keepResult);
  if (r.side === o.score.side) return giveUp;
  const out: Plan[] = [];
  if (o.score.type === 'touchdown') {
    out.push(carry(w, i, 'try'));
    if (w.rules.bool(K.touchdownCarryToKickoff)) out.push(carry(w, i, 'kickoff'));
  } else if (isPersonal(r)) {
    out.push(carry(w, i, 'kickoff'));
  }
  // Rule 4: the offended team may take normal enforcement and give up the points.
  out.push(...giveUp.filter((p) => p.safetyFor === null));
  return out;
}

/**
 * Every way to enforce dead-ball or between-downs foul `i` after the play result in `w` (B8.5.6,
 * B8.5.7 rule 1, B7.3.3 rule 8). `w.outcome` may already hold an enforced live-ball penalty.
 */
export function deadPlans(w: World, i: number): Plan[] {
  const f = w.facts;
  const r = w.fouls[i]!;
  const o = w.outcome;
  if (w.ctx.situation.playKind === 'try') return [carry(w, i, 'kickoff')];
  if (o.score !== null) {
    if (o.score.type !== 'touchdown') return [carry(w, i, 'kickoff')];
    return w.rules.bool(K.touchdownCarryToKickoff) ? [carry(w, i, 'try'), carry(w, i, 'kickoff')] : [carry(w, i, 'try')];
  }
  // B8.5.6 rule 4: after the last play of a half a personal or unsportsmanlike foul goes to the next kickoff.
  if (f.periodExpired && f.lastPeriodOfHalf && isPersonal(r)) return [carry(w, i, 'kickoff')];
  if (r.side === f.nextSide && inOwnEndZone(f, f.succeeding, r.side)) return [safety(w, i, r.side)];
  return [tackOn(w, i, 'succeeding_spot')];
}

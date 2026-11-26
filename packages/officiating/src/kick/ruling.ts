// The kick ruling: the rules of B6 as written, applied to a truth record that holds a `kick` event
// (contract: BasicRuling, WP-03). It is called once on the real truth and once on what the crew saw.
//
// What it rules: free kicks under either format (B6.1, B6.2, B13.6.1), scrimmage kicks (B6.3), the fair
// catch (B6.4.1), field goals, tries by kick and fair catch kicks (B6.5, B7.3.2, B13.6.2).
// What it does not rule: fouls and their enforcement spots (B6.6, B8: the foul module), formation
// legality (B6.1.2, B6.3.1: the legality validator), the clock (B1).
//
// Conventions of the outcome it returns:
//   - On a score `possessionAfter` is the scoring team. The restart comes from RestartRules.afterScore.
//   - `changeOfPossession` is true whenever the next snap starts a new series: the receivers have the
//     ball, or the kicking team has it again after legally recovering a kick the receivers touched
//     (B6.3.2 items 1 and 4). SeriesRules reads it that way.
//   - Where B6 gives the receivers a choice of spots that is not a penalty (a first-touch spot, a kick
//     out of bounds, an illegal touch of a free kick), `rule` returns the spot that is best for the
//     receivers and `choices` lists every legal choice, that one first.
// Every yard line and point value is a rule key (params.ts). No level is ever tested.
import {
  eventsOf, otherSide, xAtYardsToGoal, yardsFromOwnGoal, yardsToGoal,
  type AttackDir, type BasicRuling, type EnforcementOption, type FieldGeometry, type KickKind, type PlayOutcome,
  type PlayResultType, type PlayTruth, type RuleSet, type RulingContext, type ScoreEvent, type Side, type Spot,
  type TruthEvent, type TruthEventOf,
} from '@gm/schema';
import { FORMAT_TRADITIONAL, KEY, MISS_AT_KICK_SPOT } from './params.ts';

/** Facts about a kick play that later steps need and a PlayOutcome cannot hold. */
export interface KickFacts {
  readonly kickKind: KickKind;
  readonly freeKick: boolean;
  /** A fair catch was made by rule (B6.4.1 item 4). Only then may a fair catch kick follow (B6.4.3). */
  readonly fairCatchMade: boolean;
  /** Receivers touched a free kick, or touched a scrimmage kick beyond the line (B10.4.1 item 3). */
  readonly receiversTouched: boolean;
  /** The kick ended in the receivers' possession. */
  readonly receiversPossessed: boolean;
  /** The kicking team caught or recovered the kick legally and keeps the ball. */
  readonly kickersRecoveredLegally: boolean;
  /** Spots of first touching (scrimmage kick) or illegal touching (free kick): violations, not fouls. */
  readonly violationSpots: readonly Spot[];
  /** The place kick passed through the goal by B6.5.1. */
  readonly good: boolean;
}

interface Res {
  possession: Side;
  x: number;
  y: number;
  touchback: boolean;
  score: ScoreEvent | null;
  /** The next snap starts a new series even if the kicking team has the ball. */
  newSeries: boolean;
  labelKey: string;
}

interface Resolved { main: Res; alternatives: Res[]; facts: KickFacts }

const LABEL = {
  result: 'kick.result.as_played',
  deadBallSpot: 'kick.result.dead_ball_spot',
  firstTouch: 'kick.result.first_touch_spot',
  illegalTouch: 'kick.result.illegal_touch_spot',
  fromKick: 'kick.result.spot_from_kick',
  outOfBounds: 'kick.result.out_of_bounds_spot',
  touchback: 'kick.result.touchback',
  short: 'kick.result.short_of_landing_zone',
  untouchedBeyond: 'kick.result.onside_untouched_beyond_zone',
  missed: 'kick.result.missed_field_goal',
  good: 'kick.result.good',
  score: 'kick.result.score',
} as const;

const DOWN_IN_BOUNDS = ['down_by_contact', 'forward_progress_stopped', 'kneel', 'gave_himself_up', 'touched_on_ground', 'runner_down_without_contact'];
const OUT_OF_BOUNDS = ['runner_out_of_bounds', 'ball_out_of_bounds'];
const FREE_KICKS: readonly KickKind[] = ['kickoff', 'onside_kick', 'safety_kick'];
const PLACE_KICKS: readonly KickKind[] = ['field_goal', 'try_kick', 'fair_catch_kick'];
/** Worst to best for the receiving team. */
const RECEIVER_RANK = ['kickers_score', 'kickers_ball', 'receivers_ball', 'receivers_score'] as const;

class Frame {
  readonly g: FieldGeometry;
  readonly rules: RuleSet;
  readonly kickers: Side;
  readonly receivers: Side;
  readonly dir: AttackDir;
  readonly events: readonly TruthEvent[];
  readonly kickIndex: number;
  readonly kick: TruthEventOf<'kick'>;
  readonly dead: TruthEventOf<'dead_ball'>;
  readonly impetus: Side | null;
  readonly previousX: number;
  readonly previousY: number;
  readonly isTry: boolean;
  readonly otPeriod: number;

  constructor(truth: PlayTruth, ctx: RulingContext) {
    this.g = ctx.geometry;
    this.rules = ctx.rules;
    this.kickers = ctx.situation.offense;
    this.receivers = otherSide(this.kickers);
    this.dir = truth.attackDir;
    this.events = truth.events;
    this.kickIndex = truth.events.findIndex((e) => e.type === 'kick');
    const kick = truth.events[this.kickIndex];
    if (!kick || kick.type !== 'kick') throw new Error('kick ruling called on a play with no kick event');
    this.kick = kick;
    const dead = eventsOf(truth, 'dead_ball')[0];
    if (!dead) throw new Error('play truth has no dead_ball event');
    this.dead = dead;
    this.impetus = truth.endZoneImpetus;
    this.previousX = ctx.situation.ballX;
    this.previousY = ctx.situation.ballY;
    this.isTry = ctx.situation.playKind === 'try';
    this.otPeriod = ctx.before.overtime ? ctx.before.overtime.otPeriod : 0;
  }

  /** Yards from x to the receiving team's goal line. Zero or less is in its end zone. */
  toGoal(x: number): number { return yardsToGoal(this.g, x, this.dir); }
  /** Yards from the kicking team's goal line to x. Zero or less is in its end zone. */
  fromOwn(x: number): number { return yardsFromOwnGoal(this.g, x, this.dir); }
  /** Field x of a yard line of the given team (yards from its own goal line). */
  yardline(team: Side, yd: number): number {
    return team === this.receivers ? xAtYardsToGoal(this.g, yd, this.dir) : xAtYardsToGoal(this.g, yd, this.dirOf(this.receivers));
  }
  /** Signed yards from one x to another along the kicking team's direction. */
  gain(from: number, to: number): number { return (to - from) * this.dir; }
  advance(x: number, yd: number): number { return x + yd * this.dir; }
  dirOf(team: Side): AttackDir { return team === this.kickers ? this.dir : (this.dir === 1 ? -1 : 1); }
  inEndZoneOf(team: Side, x: number): boolean { return team === this.receivers ? this.toGoal(x) <= 0 : this.fromOwn(x) <= 0; }
  /** The inbounds line (hash) on the side of the field where y lies. */
  hashY(y: number): number { return y < this.g.centreY ? this.g.hashSouthY : this.g.hashNorthY; }
}

function ball(f: Frame, possession: Side, spot: Spot, labelKey: string, newSeries: boolean): Res {
  return { possession, x: spot.x, y: spot.y, touchback: false, score: null, newSeries, labelKey };
}

/** How good a result is for the receiving team: class first, then field position. */
function receiverValue(f: Frame, r: Res): [number, number] {
  if (r.score) {
    return r.score.side === f.receivers ? [RECEIVER_RANK.indexOf('receivers_score'), r.score.points] : [RECEIVER_RANK.indexOf('kickers_score'), -r.score.points];
  }
  // With the ball, the receivers want to be far from their own goal line; without it, they want the kickers far from it.
  return [RECEIVER_RANK.indexOf(r.possession === f.receivers ? 'receivers_ball' : 'kickers_ball'), f.toGoal(r.x)];
}

/** Puts the result that is best for the receivers first (B6.3.2: the better field position is preselected). */
function bestForReceivers(f: Frame, options: Res[], facts: KickFacts): Resolved {
  let best = 0;
  for (let i = 1; i < options.length; i++) {
    const a = receiverValue(f, options[i]!), b = receiverValue(f, options[best]!);
    if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) best = i;
  }
  const main = options[best]!;
  return { main, alternatives: options.filter((_, i) => i !== best), facts };
}

/**
 * A ball dead on or behind `defender`'s goal line (B7: touchdown, safety or touchback by impetus).
 * `impetus` is the team whose force put the ball there.
 */
function deadInEndZone(f: Frame, defender: Side, possessor: Side | null, carrierId: number | null, impetus: Side, touchbackYardline: number, spot: Spot, newSeries: boolean): Res {
  if (possessor !== null && possessor !== defender) {
    return { possession: possessor, x: spot.x, y: spot.y, touchback: false, newSeries: possessor !== f.kickers || newSeries, labelKey: LABEL.score,
      score: { type: 'touchdown', side: possessor, points: f.rules.num(KEY.touchdown), scorerId: carrierId } };
  }
  if (impetus === defender) {
    const scorer = otherSide(defender);
    return { possession: scorer, x: spot.x, y: spot.y, touchback: false, newSeries: true, labelKey: LABEL.score,
      score: { type: 'safety', side: scorer, points: f.rules.num(KEY.safety), scorerId: null } };
  }
  return { possession: defender, x: f.yardline(defender, touchbackYardline), y: f.g.centreY, touchback: true, score: null,
    newSeries: defender !== f.kickers || newSeries, labelKey: LABEL.touchback };
}

/**
 * The down after the kick has ended in a player's possession at event `from`: a running play (B6.1.3
 * item 12, B6.6.1 item 10). The ball belongs to whoever holds it when it becomes dead. A loose ball out
 * of bounds follows B5.6.3.
 */
function afterKickEnded(f: Frame, from: number, touchbackYardline: number, seriesAlreadyNew: boolean): Res {
  const d = f.dead;
  let last: TruthEventOf<'possession'> | null = null;
  let fumble: TruthEventOf<'fumble'> | null = null;
  let receiversHeld = false;
  for (let i = from; i < f.events.length; i++) {
    const e = f.events[i]!;
    if (e.t > d.t) break;
    if (e.type === 'possession') { last = e; fumble = null; if (e.side === f.receivers) receiversHeld = true; }
    else if (e.type === 'fumble') fumble = e;
  }
  if (!last) throw new Error('kick ruling: no possession event after the kick ended');
  const holder: Side = d.side ?? last.side;
  const newSeries = seriesAlreadyNew || receiversHeld;
  for (const team of [f.receivers, f.kickers] as const) {
    if (!f.inEndZoneOf(team, d.spot.x)) continue;
    // Impetus when the truth record leaves it open: the last team to hold the ball outside this end zone, else the kick.
    let impetus: Side = f.kickers;
    for (let i = from; i < f.events.length; i++) {
      const e = f.events[i]!;
      if (e.type === 'possession' && e.t <= d.t && !f.inEndZoneOf(team, e.spot.x)) impetus = e.side;
    }
    return deadInEndZone(f, team, d.side, d.carrierId, f.impetus ?? impetus, touchbackYardline, d.spot, newSeries);
  }
  let spot: Spot = d.spot;
  if (d.side === null && fumble && d.reason === 'ball_out_of_bounds') {
    // B5.6.3: a fumble forward out of bounds returns to the spot of the fumble.
    const forward = (d.spot.x - fumble.spot.x) * f.dirOf(holder) > 0;
    if (forward) spot = fumble.spot;
  }
  return ball(f, holder, spot, LABEL.result, newSeries);
}

function isSignal(e: TruthEvent): boolean {
  return e.type === 'kick_touch' && (e.kind === 'fair_catch_signal' || e.kind === 'invalid_signal');
}

/** B6.4.1 item 4: a valid signal by the catcher, no kicking-team touch, caught before it hit the ground. */
function fairCatchMade(f: Frame, at: number): boolean {
  const p = f.events[at];
  if (!p || p.type !== 'possession' || p.how !== 'kick_catch' || f.dead.reason !== 'fair_catch') return false;
  let signalled = false;
  for (let i = f.kickIndex + 1; i < at; i++) {
    const e = f.events[i]!;
    if (e.type !== 'kick_touch') continue;
    if (e.kind === 'fair_catch_signal' && e.playerId === p.playerId) signalled = true;
    if (e.kind === 'landed' || e.kind === 'touched_by_kickers') return false;
  }
  return signalled;
}

function signalledBy(f: Frame, at: number): boolean {
  const p = f.events[at];
  if (!p || p.type !== 'possession') return false;
  for (let i = f.kickIndex + 1; i < at; i++) {
    const e = f.events[i]!;
    if (e.type === 'kick_touch' && isSignal(e) && e.playerId === p.playerId) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Free kicks (B6.1, B6.2, B13.6.1)
// ---------------------------------------------------------------------------------------------

function ruleFreeKick(f: Frame): Resolved {
  const r = f.rules;
  const K = f.kickers, R = f.receivers;
  const kind = f.kick.kickKind;
  const onside = kind === 'onside_kick';
  const safetyKick = kind === 'safety_kick';
  // Two free-kick procedures, chosen by data: the landing-zone kick of the dynamic format, and the
  // ten-yard kick (every declared onside kick, and every free kick of the traditional format).
  const tenYard = onside || r.opt(KEY.format) === FORMAT_TRADITIONAL;
  const zone = r.num(KEY.landingZone);
  const kickX = f.kick.kickSpot.x;

  let firstContact: Spot | null = null;
  let triggered = false;
  let receiversTouched = false;
  let lastToucher: Side | null = null;
  const violations: Spot[] = [];
  const facts = (over: Partial<KickFacts>): KickFacts => ({
    kickKind: kind, freeKick: true, fairCatchMade: false, receiversTouched, receiversPossessed: false,
    kickersRecoveredLegally: false, violationSpots: violations, good: false, ...over,
  });

  const firstContactInZone = (): boolean => firstContact !== null && f.toGoal(firstContact.x) <= zone && f.toGoal(firstContact.x) > 0;
  const touchbackYardline = (): number => {
    if (f.fromOwn(kickX) >= r.num(KEY.touchbackReducedKick)) return r.num(KEY.touchbackReduced);
    return firstContactInZone() ? r.num(KEY.touchbackLandingZone) : r.num(KEY.touchback);
  };
  const kickersMayTouch = (spot: Spot): boolean => (tenYard ? receiversTouched || f.gain(kickX, spot.x) >= r.num(KEY.onsideMinDistance) : triggered);
  const withViolations = (res: Res): Resolved => bestForReceivers(f, [res, ...violations.map((s) => ball(f, R, s, LABEL.illegalTouch, true))], facts({}));

  /** B6.1.4: first touch short of the landing zone. Dead at once. */
  const short = (touch: Spot): Resolved => {
    const yd = r.num(safetyKick ? KEY.shortSpotSafetyKick : KEY.shortSpot);
    const res = f.gain(kickX, touch.x) < yd
      ? ball(f, R, touch, LABEL.short, true)
      : ball(f, R, { x: f.advance(kickX, yd), y: f.g.centreY }, LABEL.short, true);
    return { main: res, alternatives: [], facts: facts({}) };
  };
  /** B6.2.1 item 9: a declared onside kick untouched beyond the setup zone. */
  const untouchedBeyond = (): Resolved => ({
    main: ball(f, R, { x: f.advance(kickX, -r.num(KEY.onsideUntouchedPenalty)), y: f.g.centreY }, LABEL.untouchedBeyond, true),
    alternatives: [], facts: facts({}),
  });
  const beyondOnsideZone = (spot: Spot): boolean => onside && r.num(KEY.onsideUntouchedDead) > 0 && lastToucher === null && f.gain(kickX, spot.x) > r.num(KEY.onsideUntouchedDead);

  for (let i = f.kickIndex + 1; i < f.events.length; i++) {
    const e = f.events[i]!;
    if (e.type === 'kick_touch') {
      if (isSignal(e)) continue;
      const first = firstContact === null;
      if (first) firstContact = e.spot;
      const inZone = f.toGoal(e.spot.x) <= zone;
      if (!tenYard && first && !inZone) return short(e.spot);
      if (beyondOnsideZone(e.spot)) return untouchedBeyond();
      if (e.kind === 'landed') { if (inZone) triggered = true; }
      else if (e.kind === 'touched_by_receivers') { receiversTouched = true; lastToucher = R; if (inZone) triggered = true; }
      else { if (!kickersMayTouch(e.spot)) violations.push(e.spot); lastToucher = K; }
      continue;
    }
    if (e.type === 'possession') {
      if (beyondOnsideZone(e.spot)) return untouchedBeyond();
      if (e.side === K) {
        // B6.1.3 item 7, B6.2.1 item 5: a kicking-team catch or recovery is dead at once.
        if (!kickersMayTouch(e.spot)) {
          violations.push(e.spot);
          return bestForReceivers(f, violations.map((s) => ball(f, R, s, LABEL.illegalTouch, true)), facts({}));
        }
        const legal = f.inEndZoneOf(R, e.spot.x)
          ? deadInEndZone(f, R, K, e.playerId, K, touchbackYardline(), e.spot, false)
          : ball(f, K, e.spot, LABEL.result, false);
        const all = [legal, ...violations.map((s) => ball(f, R, s, LABEL.illegalTouch, true))];
        return bestForReceivers(f, all, facts({ kickersRecoveredLegally: true }));
      }
      // The receivers have the ball: the kick has ended.
      const made = fairCatchMade(f, i);
      let res = afterKickEnded(f, i, touchbackYardline(), true);
      const tb = r.num(KEY.touchback);
      if (r.bool(KEY.fairCatchToTouchback) && e.how === 'kick_catch' && signalledBy(f, i) && !res.score && !res.touchback && res.possession === R && f.toGoal(res.x) < tb) {
        res = { ...res, x: f.yardline(R, tb), y: f.g.centreY };
      }
      const out = withViolations(res);
      return { ...out, facts: facts({ fairCatchMade: made, receiversPossessed: true }) };
    }
    if (e.type === 'dead_ball') {
      const d = e;
      if (!tenYard && d.reason === 'kick_short_of_landing_zone') return short(firstContact ?? d.spot);
      if (d.reason === 'onside_untouched_beyond_zone' || beyondOnsideZone(d.spot)) return untouchedBeyond();
      for (const team of [R, K] as const) {
        if (f.inEndZoneOf(team, d.spot.x)) {
          return { main: deadInEndZone(f, team, null, null, f.impetus ?? K, touchbackYardline(), d.spot, true), alternatives: [], facts: facts({}) };
        }
      }
      if (d.reason === 'ball_out_of_bounds' && lastToucher !== R) {
        // B6.1.4: kicked out of bounds, or the kicking team last to touch it.
        const yd = r.num(safetyKick ? KEY.outOfBoundsSafetyKick : KEY.outOfBounds);
        const fromKick = ball(f, R, { x: f.advance(kickX, yd), y: f.hashY(d.spot.y) }, LABEL.fromKick, true);
        const where = ball(f, R, d.spot, LABEL.outOfBounds, true);
        return bestForReceivers(f, [fromKick, where, ...violations.map((s) => ball(f, R, s, LABEL.illegalTouch, true))], facts({}));
      }
      // At rest, out of bounds off the receivers, or dead by any other rule: the receivers' ball there.
      return withViolations(ball(f, R, d.spot, LABEL.deadBallSpot, true));
    }
  }
  throw new Error('kick ruling: free kick with no end');
}

// ---------------------------------------------------------------------------------------------
// Scrimmage kicks (B6.3, B6.5, B13.6.2) and the fair catch kick (B6.4.3)
// ---------------------------------------------------------------------------------------------

function ruleScrimmageKick(f: Frame): Resolved {
  const r = f.rules;
  const K = f.kickers, R = f.receivers;
  const kind = f.kick.kickKind;
  const placeKick = PLACE_KICKS.includes(kind);
  const line = f.previousX;
  const beyond = (x: number): boolean => f.gain(line, x) > 0;
  const general = r.num(KEY.touchbackGeneral);

  let touchedBeyond = false;
  let groundOrKicker = false;
  const firstTouches: Spot[] = [];
  let good = false;
  let recovered = false;
  const facts = (over: Partial<KickFacts>): KickFacts => ({
    kickKind: kind, freeKick: false, fairCatchMade: false, receiversTouched: touchedBeyond, receiversPossessed: false,
    kickersRecoveredLegally: recovered, violationSpots: firstTouches, good, ...over,
  });
  const firstTouchChoices = (): Res[] => firstTouches.map((s) => ball(f, R, s, LABEL.firstTouch, true));

  /** B6.5.2 and key `fg.miss_spot`: the receivers' ball at the spot of the kick or the previous spot, never inside the minimum yard line. */
  const missed = (): Resolved => {
    const atKick = r.opt(KEY.missSpot) === MISS_AT_KICK_SPOT;
    const min = r.num(KEY.missSpotMin);
    let spot: Spot = atKick ? f.kick.kickSpot : { x: line, y: f.previousY };
    if (f.toGoal(spot.x) < min) spot = { x: f.yardline(R, min), y: spot.y };
    return { main: ball(f, R, spot, LABEL.missed, true), alternatives: [], facts: facts({}) };
  };
  const missRule = (): boolean => placeKick && f.kick.crossedLine && !touchedBeyond;
  /** B6.3.3 items 1, 2 and 5: untouched by the receivers and dead on or behind their goal line. */
  const untouchedInEndZone = (): Resolved => {
    if (missRule()) return missed();
    const tb: Res = { possession: R, x: f.yardline(R, general), y: f.g.centreY, touchback: true, score: null, newSeries: true, labelKey: LABEL.touchback };
    return bestForReceivers(f, [tb, ...firstTouchChoices().filter((c) => f.toGoal(c.x) > general)], facts({}));
  };

  for (let i = f.kickIndex + 1; i < f.events.length; i++) {
    const e = f.events[i]!;
    if (e.type === 'kick_touch') {
      if (isSignal(e)) continue;
      if (e.kind === 'landed') {
        groundOrKicker = true;
        if (!touchedBeyond && beyond(e.spot.x) && f.inEndZoneOf(R, e.spot.x)) return untouchedInEndZone();
      } else if (e.kind === 'touched_by_receivers') {
        // B6.3.2 item 5: a touch behind the line (a block) does not count.
        if (beyond(e.spot.x)) touchedBeyond = true;
      } else {
        groundOrKicker = true;
        if (beyond(e.spot.x) && !touchedBeyond) {
          // B6.3.3 item 4: a first-touch spot is never inside the minimum yard line.
          const min = r.num(KEY.firstTouchMin);
          firstTouches.push(f.toGoal(e.spot.x) < min ? { x: f.yardline(R, min), y: e.spot.y } : e.spot);
        }
      }
      continue;
    }
    if (e.type === 'possession') {
      if (e.side === K) {
        // B6.3.2 item 1: behind the line the kicking team may recover and advance.
        if (!beyond(e.spot.x)) return { main: afterKickEnded(f, i, general, touchedBeyond), alternatives: [], facts: facts({}) };
        // B6.3.2 item 4: beyond the line the ball is dead where the kicking team catches or recovers it.
        if (touchedBeyond) {
          recovered = true;
          const res = f.inEndZoneOf(R, e.spot.x) ? deadInEndZone(f, R, K, e.playerId, K, general, e.spot, true) : ball(f, K, e.spot, LABEL.result, true);
          // A first touch made before the receivers' touch still stands: they may take that spot (B6.3.2 edge case).
          return bestForReceivers(f, [res, ...firstTouchChoices()], facts({}));
        }
        if (f.inEndZoneOf(R, e.spot.x)) return untouchedInEndZone();
        if (missRule()) return missed();
        firstTouches.push(e.spot);
        return bestForReceivers(f, firstTouchChoices(), facts({}));
      }
      // The receivers have the ball: the kick has ended, and first touching is ignored (B6.3.2 item 3).
      const made = fairCatchMade(f, i) && f.kick.crossedLine;
      return { main: afterKickEnded(f, i, general, true), alternatives: [], facts: facts({ fairCatchMade: made, receiversPossessed: true }) };
    }
    if (e.type === 'dead_ball') {
      const d = e;
      // B6.5.1 items 1 to 3: through the goal without touching the ground or a kicking-team player.
      if (placeKick && d.reason === 'kick_through_uprights' && !groundOrKicker) {
        good = true;
        const isTryKick = kind === 'try_kick';
        const from = r.num(KEY.twoPointRequiredFrom);
        const tryPoints = from > 0 && f.otPeriod >= from ? 0 : r.num(KEY.tryKick);
        const score: ScoreEvent = isTryKick
          ? { type: 'try_kick', side: K, points: tryPoints, scorerId: f.kick.kickerId }
          : { type: 'field_goal', side: K, points: r.num(KEY.fieldGoal), scorerId: f.kick.kickerId };
        return { main: { possession: K, x: line, y: f.previousY, touchback: false, score, newSeries: false, labelKey: LABEL.good }, alternatives: [], facts: facts({}) };
      }
      if (f.inEndZoneOf(R, d.spot.x)) {
        if (!touchedBeyond) return untouchedInEndZone();
        return bestForReceivers(f, [deadInEndZone(f, R, null, null, f.impetus ?? K, general, d.spot, true), ...firstTouchChoices()], facts({}));
      }
      if (missRule()) return missed();
      // B6.3.3 item 10: dead in the kicking team's end zone (blocked out of it, or off its own goal post).
      if (f.inEndZoneOf(K, d.spot.x)) return { main: deadInEndZone(f, K, null, null, f.impetus ?? K, general, d.spot, true), alternatives: [], facts: facts({}) };
      // B6.3.3 item 8: out of bounds between the goal lines, or lying with no one recovering it.
      return bestForReceivers(f, [ball(f, R, d.spot, LABEL.deadBallSpot, true), ...firstTouchChoices()], facts({}));
    }
  }
  throw new Error('kick ruling: scrimmage kick with no end');
}

/** B7.3.2: on a try a touchdown scores the try points, a safety scores for the opponent, anything else fails. */
function asTry(f: Frame, res: Res): Res {
  const K = f.kickers;
  const base: Res = { possession: K, x: f.previousX, y: f.previousY, touchback: false, score: null, newSeries: false, labelKey: res.labelKey };
  const s = res.score;
  if (!s) return base;
  if (s.type === 'try_kick') return { ...base, score: s };
  if (s.type === 'touchdown') {
    return { ...base, score: s.side === K
      ? { type: 'try_two', side: K, points: f.rules.num(KEY.tryTwo), scorerId: s.scorerId }
      : { type: 'defensive_try', side: s.side, points: f.rules.num(KEY.tryDefense), scorerId: s.scorerId } };
  }
  if (s.type === 'safety') return { ...base, score: { type: 'try_safety', side: s.side, points: f.rules.num(KEY.trySafety), scorerId: null } };
  return base;
}

function resultType(f: Frame, res: Res): PlayResultType {
  const kind = f.kick.kickKind;
  if (f.isTry || kind === 'try_kick') return res.score && res.score.side === f.kickers ? 'try_good' : 'try_failed';
  if (kind === 'punt') return 'punt';
  if (kind === 'field_goal') return res.score && res.score.type === 'field_goal' ? 'field_goal_good' : 'field_goal_missed';
  if (kind === 'safety_kick') return 'safety_kick';
  if (kind === 'fair_catch_kick') return 'fair_catch_kick';
  return 'kickoff';
}

function toOutcome(f: Frame, truth: PlayTruth, res: Res): PlayOutcome {
  const reason = f.dead.reason;
  const kept = res.possession === f.kickers && !res.newSeries && !res.score && !FREE_KICKS.includes(f.kick.kickKind) && !f.isTry;
  const injured: number[] = [];
  for (const e of eventsOf(truth, 'injury')) if (!injured.includes(e.playerId)) injured.push(e.playerId);
  return {
    resultType: resultType(f, res),
    noPlay: false,
    snappingSide: f.kickers,
    possessionAfter: res.possession,
    changeOfPossession: res.possession !== f.kickers || res.newSeries,
    spotX: res.x,
    spotY: res.y,
    previousSpotX: f.previousX,
    score: res.score,
    touchback: res.touchback,
    endedOutOfBounds: OUT_OF_BOUNDS.includes(reason),
    incomplete: false,
    runnerDownInBounds: DOWN_IN_BOUNDS.includes(reason),
    // Yards count only when the kicking team keeps the ball in the same series (a recovered block).
    yardsGained: kept ? f.gain(f.previousX, res.x) + 0 : 0,
    injuryStoppage: injured,
    enforcement: null,
  };
}

function resolve(truth: PlayTruth, ctx: RulingContext): { f: Frame; out: Resolved } {
  const f = new Frame(truth, ctx);
  const raw = FREE_KICKS.includes(f.kick.kickKind) ? ruleFreeKick(f) : ruleScrimmageKick(f);
  if (!f.isTry) return { f, out: raw };
  // A try has no choice of spots: whatever happened, the ball is next kicked off (B7.8.1).
  return { f, out: { main: asTry(f, raw.main), alternatives: [], facts: raw.facts } };
}

/** The kick ruling with the two extras the contract's BasicRuling has no room for (see the WP-03 report). */
export interface KickRuling extends BasicRuling {
  /**
   * Every legal non-penalty choice on this kick, for the receiving team. The first entry is what `rule`
   * returns. A single entry means there is nothing to choose.
   */
  choices(truth: PlayTruth, ctx: RulingContext): EnforcementOption[];
  facts(truth: PlayTruth, ctx: RulingContext): KickFacts;
}

export function createKickRuling(): KickRuling {
  return {
    handles(truth: PlayTruth): boolean { return truth.events.some((e) => e.type === 'kick'); },
    rule(truth: PlayTruth, ctx: RulingContext): PlayOutcome {
      const { f, out } = resolve(truth, ctx);
      return toOutcome(f, truth, out.main);
    },
    choices(truth: PlayTruth, ctx: RulingContext): EnforcementOption[] {
      const { f, out } = resolve(truth, ctx);
      return [out.main, ...out.alternatives].map((res, i) => ({
        optionId: `kick.choice.${i}`, side: f.receivers, labelKey: res.labelKey, outcome: toOutcome(f, truth, res),
      }));
    },
    facts(truth: PlayTruth, ctx: RulingContext): KickFacts { return resolve(truth, ctx).out.facts; },
  };
}

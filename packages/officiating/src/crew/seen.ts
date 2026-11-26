// Builds the record the crew ruled on from the truth and the list of rulings (B11.2.1, contract
// decision D-05). It draws nothing: the same truth and rulings always give the same record, so the
// crew model and replay share it. Each ruling is in one of three states:
//   correct    called value equals true value: the truth stands at that point.
//   wrong      the crew's mistake is written into the record (a catch seen as incomplete ends the play there).
//   corrected  replay changed a wrong ruling: the record is rebuilt by the placement rules of B9.4.1
//              (ball at the spot of the catch with no advance; a loose ball goes to whoever clearly
//              recovered it in the immediate continuing action, or stays where possession was lost).
// The result always keeps the structural promises of the truth record: one dead-ball event, events in
// time order, nothing but fouls, injuries and details after the dead ball.
import {
  TICKS_PER_SECOND, otherSide, roundYd,
  type AttackDir, type PlayTruth, type Ruling, type RulingContext, type Side, type Spot, type TruthEvent, type TruthEventOf,
} from '@gm/schema';
import { CREW } from './params.ts';

type Dead = TruthEventOf<'dead_ball'>;
type Judged = Pick<Dead, 'marginYd' | 'marginS' | 'visibility'>;

/** Numbers the B9.4.1 placement rules need. Only replay supplies them; the crew model corrects nothing. */
export interface PlacementValues {
  /** Longest time from the loss of the ball to a recovery that still counts as immediate continuing action. */
  readonly continuingActionS: number;
  /** Yard line the ball goes to when it was lost in a team's own end zone and nobody clearly recovered it. */
  readonly noRecoveryEndZoneYardline: number;
}

const NOT_CLOSE: Judged = { marginYd: null, marginS: null, visibility: 'open' };

export function deadBallIndex(truth: PlayTruth): number {
  return truth.events.findIndex((e) => e.type === 'dead_ball');
}

/** Team in possession just before event `index`: the last possession event, or the team that put the ball in play. */
export function possessionSideBefore(truth: PlayTruth, index: number, snappingSide: Side): Side {
  let side = snappingSide;
  for (let i = 0; i < index && i < truth.events.length; i++) {
    const e = truth.events[i]!;
    if (e.type === 'possession') side = e.side;
  }
  return side;
}

/** Direction a team attacks on this play. The play frame belongs to the team that snapped or kicked. */
export function attackDirOf(side: Side, truth: PlayTruth, ctx: RulingContext): AttackDir {
  return side === ctx.situation.offense ? truth.attackDir : (truth.attackDir === 1 ? -1 : 1);
}

export function goalLineAttackedBy(side: Side, truth: PlayTruth, ctx: RulingContext): number {
  return attackDirOf(side, truth, ctx) === 1 ? ctx.geometry.goalLineEastX : ctx.geometry.goalLineWestX;
}

function inEndZoneAttackedBy(x: number, side: Side, truth: PlayTruth, ctx: RulingContext): boolean {
  return attackDirOf(side, truth, ctx) === 1 ? x >= ctx.geometry.goalLineEastX : x <= ctx.geometry.goalLineWestX;
}

function inOwnEndZone(x: number, side: Side, truth: PlayTruth, ctx: RulingContext): boolean {
  return inEndZoneAttackedBy(x, otherSide(side), truth, ctx);
}

interface Cut {
  /** Events from this index on are dropped, except fouls, injuries and details. */
  readonly index: number;
  readonly tail: readonly TruthEvent[];
  readonly impetus: Side | null;
}

/**
 * A dead ball in a player's hands at a spot. In the end zone he attacks it is the physical fact of a
 * score; in his own end zone the ball is dead there and `impetus` says who put it there.
 */
function carrierDead(
  t: number, spot: Spot, side: Side, carrierId: number, judged: Judged, reason: Dead['reason'], impetusSide: Side,
  truth: PlayTruth, ctx: RulingContext,
): { dead: Dead; impetus: Side | null } {
  // `judged` may be a whole event: only its three close-call fields are copied.
  const base = { type: 'dead_ball' as const, t, marginYd: judged.marginYd, marginS: judged.marginS, visibility: judged.visibility,
    spot: { x: spot.x, y: spot.y }, side, carrierId };
  if (inEndZoneAttackedBy(spot.x, side, truth, ctx)) return { dead: { ...base, reason: 'ball_across_goal_line_in_possession' }, impetus: side };
  if (inOwnEndZone(spot.x, side, truth, ctx)) return { dead: { ...base, reason: 'ball_dead_in_end_zone' }, impetus: impetusSide };
  return { dead: { ...base, reason }, impetus: null };
}

function incompleteDead(t: number, spot: Spot, judged: Judged): Dead {
  return { type: 'dead_ball', t, marginYd: judged.marginYd, marginS: judged.marginS, visibility: judged.visibility,
    reason: 'incomplete_pass', spot: { x: spot.x, y: spot.y }, side: null, carrierId: null };
}

/** B9.4.1 rule 2: where a ball that was wrongly ruled dead goes once replay shows it was loose. */
function looseBallPlacement(
  truth: PlayTruth, looseIndex: number, lostSpot: Spot, lostSide: Side, place: PlacementValues, ctx: RulingContext,
): Cut | null {
  const ev = truth.events;
  const loose = ev[looseIndex]!;
  let next = -1;
  for (let j = looseIndex + 1; j < ev.length; j++) {
    const e = ev[j]!;
    if (e.type === 'dead_ball') break;
    if (e.type === 'possession') { next = j; break; }
  }
  if (next < 0) {
    // A loose ball that went out of bounds counts as recovered by the team last in possession: the
    // truth record already ends that way, so it stands. Otherwise nobody recovered it at all.
    const dead = ev[deadBallIndex(truth)];
    if (dead && dead.type === 'dead_ball' && dead.reason === 'ball_out_of_bounds') return null;
  } else {
    const rec = ev[next] as TruthEventOf<'possession'>;
    if (rec.how === 'fumble_recovery' && rec.t - loose.t <= place.continuingActionS) {
      const d = carrierDead(rec.t, rec.spot, rec.side, rec.playerId, NOT_CLOSE, 'down_by_contact', lostSide, truth, ctx);
      return { index: next + 1, tail: [d.dead], impetus: d.impetus };
    }
  }
  // No clear recovery: the ball stays with the team that last had it, at the spot where it lost it.
  const dir = attackDirOf(lostSide, truth, ctx);
  const ownGoalX = dir === 1 ? ctx.geometry.goalLineWestX : ctx.geometry.goalLineEastX;
  const x = inOwnEndZone(lostSpot.x, lostSide, truth, ctx) ? roundYd(ownGoalX + dir * place.noRecoveryEndZoneYardline) : lostSpot.x;
  const dead: Dead = { type: 'dead_ball', t: loose.t, ...NOT_CLOSE, reason: 'loose_ball_at_rest', spot: { x, y: lostSpot.y }, side: lostSide, carrierId: null };
  return { index: looseIndex + 1, tail: [dead], impetus: null };
}

/**
 * The record as ruled. `corrected` holds indexes into `rulings` that replay changed; `place` must be
 * given when it is not empty. Foul rulings do not alter the record: fouls travel as foul records.
 */
export function seenFrom(
  truth: PlayTruth, rulings: readonly Ruling[], corrected: ReadonlySet<number>, ctx: RulingContext, place: PlacementValues | null,
): PlayTruth {
  const ev = truth.events;
  const offense = ctx.situation.offense;
  const deadIndex = deadBallIndex(truth);
  const removed = new Set<number>();
  const replaced = new Map<number, TruthEvent>();
  let cut: Cut | null = null;
  let deadSwap: TruthEvent[] | null = null;
  let impetus = truth.endZoneImpetus;
  let changed = false;

  const order = rulings.map((_, i) => i)
    .filter((i) => rulings[i]!.aspect !== 'foul' && rulings[i]!.calledValue !== rulings[i]!.trueValue)
    .sort((a, b) => rulings[a]!.eventIndex - rulings[b]!.eventIndex || a - b);

  for (const i of order) {
    const r = rulings[i]!;
    const at = r.eventIndex;
    const e = ev[at];
    if (!e || (cut && at >= cut.index)) continue;
    const fixed = corrected.has(i);
    if (fixed && !place) throw new Error('seenFrom: a corrected ruling needs the placement values of B9.4.1');

    if (r.aspect === 'catch' && e.type === 'catch_point') {
      const passSide = possessionSideBefore(truth, at, offense);
      if (r.trueValue !== 'incomplete') {
        if (!fixed) {
          // A catch or an interception ruled incomplete: the play ends where the ball was.
          cut = { index: at, tail: [{ ...e, outcome: 'grounded', catcherId: null }, incompleteDead(e.t, e.spot, e)], impetus: null };
        } else if (e.catcherId !== null) {
          const side = r.trueValue === 'intercepted' ? otherSide(passSide) : passSide;
          // B9.4.1 rule 2: a catch and then a fumble in the immediate continuing action is a loose ball.
          const lost = ev.findIndex((x, j) => j > at && x.type === 'fumble' && x.kind === 'fumble' && x.playerId === e.catcherId
            && x.t - e.t <= place!.continuingActionS);
          if (lost >= 0) {
            cut = looseBallPlacement(truth, lost, (ev[lost] as TruthEventOf<'fumble'>).spot, side, place!, ctx) ?? cut;
            changed = true;
            continue;
          }
          // B9.4.1 rules 1 and 4: the ball at the spot of the catch or interception, no advance.
          const d = carrierDead(e.t, e.spot, side, e.catcherId, NOT_CLOSE, 'down_by_contact', passSide, truth, ctx);
          const how = r.trueValue === 'intercepted' ? 'interception' as const : 'catch' as const;
          cut = { index: at + 1, tail: [{ type: 'possession', t: e.t, side, playerId: e.catcherId, spot: e.spot, how }, d.dead], impetus: d.impetus };
        }
      } else if (!fixed && e.intendedId !== null) {
        // An incomplete pass ruled a catch: the receiver has the ball, down where he "caught" it.
        const d = carrierDead(e.t, e.spot, passSide, e.intendedId, e, 'down_by_contact', passSide, truth, ctx);
        cut = {
          index: at,
          tail: [
            { ...e, outcome: 'catch', catcherId: e.intendedId, feetInBounds: ctx.rules.num('catch.feet_required') },
            { type: 'possession', t: e.t, side: passSide, playerId: e.intendedId, spot: e.spot, how: 'catch' },
            d.dead,
          ],
          impetus: d.impetus,
        };
      }
    } else if (r.aspect === 'fumble_before_down' && e.type === 'fumble') {
      if (!fixed) {
        // A fumble ruled down by contact: dead in the runner's hands at the spot of the fumble.
        const d = carrierDead(e.t, e.spot, e.side, e.playerId, e, 'down_by_contact', e.side, truth, ctx);
        cut = { index: at, tail: [d.dead], impetus: d.impetus };
      } else {
        cut = looseBallPlacement(truth, at, e.spot, e.side, place!, ctx) ?? cut;
      }
    } else if (r.aspect === 'forward_or_backward_pass' && e.type === 'pass_release') {
      const passSide = possessionSideBefore(truth, at, offense);
      if (r.trueValue === 'forward') {
        const dead = ev[deadIndex];
        if (!fixed && dead && dead.type === 'dead_ball') {
          // A forward pass that fell incomplete, ruled backward: a loose ball that came to rest, the passing team's.
          replaced.set(at, { ...e, forward: false });
          deadSwap = [
            { type: 'fumble', t: dead.t, marginYd: null, marginS: null, visibility: dead.visibility, kind: 'backward_pass_loose',
              playerId: e.passerId, side: passSide, forcedById: null, spot: dead.spot },
            { ...dead, reason: 'loose_ball_at_rest', side: passSide, carrierId: null },
          ];
        }
      } else {
        const loose = ev.findIndex((x, j) => j > at && x.type === 'fumble' && x.kind === 'backward_pass_loose');
        if (loose >= 0) {
          if (!fixed) {
            // A backward pass that hit the ground, ruled forward: incomplete where it landed.
            replaced.set(at, { ...e, forward: true });
            cut = { index: loose, tail: [incompleteDead(ev[loose]!.t, (ev[loose] as TruthEventOf<'fumble'>).spot, e)], impetus: null };
          } else {
            cut = looseBallPlacement(truth, loose, e.releaseSpot, passSide, place!, ctx) ?? cut;
          }
        }
      }
    } else if (r.aspect === 'score' && !fixed) {
      const dead = ev[deadIndex];
      if (e.type === 'boundary' && dead && dead.type === 'dead_ball') {
        // The ball broke the plane, ruled short: down just outside the goal line.
        const g = ctx.geometry;
        const east = e.spot.x - g.goalLineWestX > g.goalLineEastX - e.spot.x;
        const goalX = east ? g.goalLineEastX : g.goalLineWestX;
        const short = ctx.params.num(CREW.shortOfGoalYd);
        const back = e.marginYd !== null && e.marginYd > short ? e.marginYd : short;
        removed.add(at);
        deadSwap = [{ ...dead, reason: 'down_by_contact', spot: { x: roundYd(east ? goalX - back : goalX + back), y: dead.spot.y } }];
        impetus = null;
      } else if (e.type === 'dead_ball' && e.side !== null) {
        // Down short of the goal line, ruled a score: the plane is recorded as broken in possession.
        const goalX = goalLineAttackedBy(e.side, truth, ctx);
        deadSwap = [
          { type: 'boundary', t: e.t, marginYd: r.marginYd, marginS: null, visibility: e.visibility, kind: 'ball_crosses_goal_line',
            playerId: e.carrierId, spot: { x: goalX, y: e.spot.y } },
          { ...e, reason: 'ball_across_goal_line_in_possession', spot: { x: goalX, y: e.spot.y } },
        ];
        impetus = e.side;
      }
    } else if (r.aspect === 'spot' && !fixed && e.type === 'dead_ball' && !deadSwap) {
      deadSwap = [{ ...e, spot: { x: Number(r.calledValue), y: e.spot.y } }];
    } else if (r.aspect === 'touching' && !fixed && e.type === 'kick_touch') {
      // A touch of the kick the crew did not see, and the muff that went with it.
      removed.add(at);
      ev.forEach((x, j) => { if (x.type === 'fumble' && x.kind === 'muff' && x.playerId === e.playerId && x.t === e.t) removed.add(j); });
    } else if (r.aspect === 'kick_good' && !fixed && e.type === 'dead_ball') {
      deadSwap = [{ ...e, reason: r.calledValue === 'good' ? 'kick_through_uprights' : 'kick_failed' }];
    } else if (r.aspect === 'down_by_contact' && !fixed && e.type === 'tackle_attempt') {
      // An erroneous whistle (B11.3.2 rule 4): the runner broke the tackle but the play was blown dead.
      const side = possessionSideBefore(truth, at, offense);
      const d = carrierDead(e.t, e.spot, side, e.carrierId, NOT_CLOSE, 'forward_progress_stopped', side, truth, ctx);
      replaced.set(at, { ...e, outcome: 'made' });
      cut = { index: at + 1, tail: [d.dead], impetus: d.impetus };
    } else {
      continue;
    }
    changed = true;
  }

  if (!changed) return { ...truth, events: ev.slice() };

  const out: TruthEvent[] = [];
  const end = cut ? cut.index : ev.length;
  for (let i = 0; i < end; i++) {
    if (removed.has(i)) continue;
    if (i === deadIndex && deadSwap && !cut) { out.push(...deadSwap); continue; }
    out.push(replaced.get(i) ?? ev[i]!);
  }
  let liveDurationTenths = truth.liveDurationTenths;
  if (cut) {
    out.push(...cut.tail);
    for (let i = cut.index; i < ev.length; i++) {
      const e = ev[i]!;
      if (e.type === 'foul_committed' || e.type === 'injury' || e.type === 'detail') out.push(e);
    }
    const dead = cut.tail.find((e) => e.type === 'dead_ball');
    const tenths = dead ? Math.round(dead.t * TICKS_PER_SECOND) : 0;
    liveDurationTenths = tenths > 0 ? tenths : 0;
    impetus = cut.impetus;
  }
  return { ...truth, liveDurationTenths, endZoneImpetus: impetus, events: out };
}

// One reading of a play record, shared by the credit rows and the play-by-play row so the two cannot
// disagree (P3.1.1). The ruling (result type, yards, score, touchback, no play) comes from the final
// called outcome, because statistics follow called values (B11.2.1 rule 3). Who did it (passer,
// receiver, tackler, returner) comes from the truth events, which is the only place players are named.
// Where an official ruled a truth event differently (a fumble seen as down by contact), the event is
// not credited.
import { Contract } from '@gm/engine-core';

type PlayRecord = Contract.PlayRecord;
type Side = Contract.Side;
type TruthEvent = Contract.TruthEvent;
type Ev<T extends TruthEvent['type']> = Contract.TruthEventOf<T>;

export interface StatsDeps {
  readonly geometry: Contract.FieldGeometry;
  readonly params: Contract.ParamTable;
}

/** Codes of `detail` truth events this module reads (contract decision D-16). Any resolver may emit them. */
export const DETAIL_CODES = { scramble: 'scramble' } as const;

/** What the play was for the offense's stat line, whatever the clock-table result type says. */
export type BasePlay = 'run' | 'kneel' | 'completion' | 'incompletion' | 'spike' | 'interception' | 'sack' | 'none';

export interface FumbleFact {
  readonly index: number;
  readonly playerId: number;
  readonly side: Side;
  readonly kind: 'fumble' | 'muff' | 'bad_snap' | 'backward_pass_loose';
  readonly muff: boolean;
  readonly forcedById: number | null;
  /** False when a ruling on this event differs from the truth: the officials did not see a fumble. */
  readonly credited: boolean;
  /** The next possession after the fumble belongs to the other team. */
  readonly lost: boolean;
  readonly recoveredById: number | null;
  readonly spotX: number;
}

export interface ReturnFact {
  readonly returnerId: number;
  readonly fairCatch: boolean;
  readonly returned: boolean;
  readonly yards: number;
  readonly touchdown: boolean;
}

export interface PuntFact {
  readonly punterId: number;
  readonly blocked: boolean;
  readonly gross: number;
  readonly net: number;
  readonly inside: boolean;
  readonly touchback: boolean;
  readonly hangTimeS: number;
}

export interface PlaceKickFact {
  readonly kickerId: number;
  readonly kind: 'field_goal' | 'try_kick';
  readonly good: boolean;
  readonly blocked: boolean;
  /** Labelled distance in whole yards. Null on a try kick. */
  readonly distanceYd: number | null;
}

export interface PlayFacts {
  readonly record: PlayRecord;
  readonly offense: Side;
  readonly defense: Side;
  /** False for a play that does not count (replayed down, re-kick). */
  readonly counts: boolean;
  /** The ball was snapped or kicked. False for a play stopped before the snap. */
  readonly live: boolean;
  readonly isTry: boolean;
  /** Either team called a kicking or return unit. */
  readonly specialTeams: boolean;
  readonly kick: Ev<'kick'> | null;
  readonly base: BasePlay;
  readonly passerId: number | null;
  readonly targetId: number | null;
  readonly receiverId: number | null;
  readonly carrierId: number | null;
  readonly interceptorId: number | null;
  readonly interceptionReturnYards: number;
  readonly breakupById: number | null;
  readonly release: Ev<'pass_release'> | null;
  /** Whole official yards of the base play for the offense. */
  readonly yards: number;
  /** Whole air yards when the pass had a target, else null. */
  readonly airYards: number | null;
  readonly offenseTouchdown: boolean;
  readonly firstDownEarned: boolean;
  readonly sackerIds: readonly number[];
  readonly hitterIds: readonly number[];
  readonly fumbles: readonly FumbleFact[];
  readonly madeTackles: readonly Ev<'tackle_attempt'>[];
  readonly scramble: boolean;
  readonly pressure: boolean;
  readonly twoPointGood: boolean;
  readonly kickReturn: ReturnFact | null;
  readonly punt: PuntFact | null;
  readonly placeKick: PlaceKickFact | null;
  /** Kickoff or onside kick: kicker and whether it was a touchback. */
  readonly kickoff: { readonly kickerId: number; readonly touchback: boolean; readonly distanceYd: number } | null;
  sideOf(playerId: number): Side | null;
}

const KICK_RESULTS = new Set<string>(['punt', 'field_goal_good', 'field_goal_missed', 'kickoff', 'safety_kick', 'fair_catch_kick']);

function unique(ids: readonly number[]): number[] {
  const out: number[] = [];
  for (const id of ids) if (!out.includes(id)) out.push(id);
  return out;
}

/** Whole yards between the yard lines nearest two spots, for a team moving in direction `dir`. Totals then telescope over a drive. */
export function wholeYardsBetween(g: Contract.FieldGeometry, fromX: number, toX: number, dir: Contract.AttackDir): number {
  return Math.round(Contract.yardsFromOwnGoal(g, toX, dir)) - Math.round(Contract.yardsFromOwnGoal(g, fromX, dir)) + 0;
}

export function readPlay(record: PlayRecord, deps: StatsDeps): PlayFacts {
  const g = deps.geometry;
  const { situation, calls, final } = record;
  const events = record.truth.events;
  const offense = situation.offense;
  const defense = Contract.otherSide(offense);
  const dir = situation.attackDir;
  const otherDir: Contract.AttackDir = dir === 1 ? -1 : 1;
  const startX = situation.ballX;
  const clampX = (x: number) => Math.min(g.goalLineEastX, Math.max(g.goalLineWestX, x));

  const sides = new Map<number, Side>();
  for (const p of calls.snapping.players) sides.set(p.playerId, offense);
  for (const p of calls.opposing.players) sides.set(p.playerId, defense);
  const sideOf = (id: number): Side | null => sides.get(id) ?? null;

  const first = <T extends TruthEvent['type']>(type: T, ok: (e: Ev<T>, i: number) => boolean = () => true): { e: Ev<T>; i: number } | null => {
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      if (e.type === type && ok(e as Ev<T>, i)) return { e: e as Ev<T>, i };
    }
    return null;
  };
  const last = <T extends TruthEvent['type']>(type: T, ok: (e: Ev<T>, i: number) => boolean = () => true): { e: Ev<T>; i: number } | null => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]!;
      if (e.type === type && ok(e as Ev<T>, i)) return { e: e as Ev<T>, i };
    }
    return null;
  };

  const counts = !final.noPlay && final.resultType !== 'no_play';
  const snap = first('snap');
  const kick = first('kick')?.e ?? null;
  const live = record.truth.liveDurationTenths > 0 || snap !== null || kick !== null;
  const isTry = situation.playKind === 'try';
  const specialTeams = calls.snapping.unit === 'kick' || calls.opposing.unit === 'return';
  const dead = first('dead_ball');
  const deadIndex = dead ? dead.i : events.length;
  const deadX = clampX(dead ? dead.e.spot.x : startX);

  // Fumbles, with what the officials made of each.
  const overruled = (index: number) => record.called.rulings.some((r) => r.eventIndex === index && (r.aspect === 'fumble_before_down' || r.aspect === 'down_by_contact') && r.calledValue !== r.trueValue);
  const fumbles: FumbleFact[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.type !== 'fumble') continue;
    const next = first('possession', (_p, j) => j > i);
    fumbles.push({
      index: i, playerId: e.playerId, side: e.side, kind: e.kind, muff: e.kind === 'muff', forcedById: e.forcedById,
      credited: !overruled(i), lost: next !== null && next.e.side !== e.side,
      recoveredById: next ? next.e.playerId : null, spotX: e.spot.x,
    });
  }
  const firstOffenseFumble = fumbles.find((f) => f.side === offense && f.kind === 'fumble' && f.credited) ?? null;
  const cutoff = firstOffenseFumble ? firstOffenseFumble.index : deadIndex + 1;

  const releaseAt = last('pass_release', (e, i) => e.forward && i < cutoff);
  const release = releaseAt ? releaseAt.e : null;
  const catchAt = releaseAt ? first('catch_point', (e, i) => i > releaseAt.i && e.outcome === 'catch') : null;
  const interceptionAt = releaseAt ? first('catch_point', (e, i) => i > releaseAt.i && e.outcome === 'interception') : null;
  const interceptionPossession = first('possession', (e) => e.how === 'interception');
  const breakup = releaseAt ? first('catch_point', (e, i) => i > releaseAt.i && e.outcome === 'breakup') : null;
  const sackEvents = events.filter((e): e is Ev<'pressure'> => e.type === 'pressure' && e.kind === 'sack');
  const madeTackles = events.filter((e): e is Ev<'tackle_attempt'> => e.type === 'tackle_attempt' && e.outcome === 'made');

  // Base play for the offense's stat line.
  const rt = final.resultType;
  let base: BasePlay = 'none';
  if (counts && kick === null && !KICK_RESULTS.has(rt)) {
    if (rt === 'run') base = 'run';
    else if (rt === 'kneel') base = 'kneel';
    else if (rt === 'spike') base = 'spike';
    else if (rt === 'sack') base = 'sack';
    else if (rt === 'interception') base = 'interception';
    else if (rt === 'pass_incomplete') base = 'incompletion';
    else if (rt === 'pass_complete') base = 'completion';
    else if (rt === 'fumble_lost') {
      if (interceptionAt || interceptionPossession) base = 'interception';
      else if (catchAt && catchAt.i < cutoff) base = 'completion';
      else if (sackEvents.length > 0) base = 'sack';
      else base = 'run';
    } else if (rt === 'try_good' || rt === 'try_failed') {
      base = catchAt ? 'completion' : release ? 'incompletion' : 'run';
    }
  }
  const passBase = base === 'completion' || base === 'incompletion' || base === 'spike' || base === 'interception';

  const snapTo = snap ? snap.e.toPlayerId : null;
  const lastExchange = last('exchange', (e, i) => i < cutoff && e.kind !== 'fake' && e.toId !== null);
  const holder = last('possession', (e, i) => i < cutoff && e.side === offense);
  const deadCarrier = dead && dead.e.side === offense ? dead.e.carrierId : null;

  let passerId: number | null = null;
  if (passBase) passerId = release ? release.passerId : snapTo;
  else if (base === 'sack') passerId = sackEvents[0]?.passerId ?? snapTo ?? deadCarrier;

  let receiverId: number | null = null;
  if (base === 'completion') {
    receiverId = catchAt?.e.catcherId ?? first('possession', (e) => e.how === 'catch' && e.side === offense)?.e.playerId ?? release?.targetId ?? null;
  }
  let targetId: number | null = null;
  if (base === 'completion') targetId = receiverId;
  else if ((base === 'incompletion' || base === 'interception') && release && !release.throwaway && !release.spike) targetId = release.targetId;

  let carrierId: number | null = null;
  if (base === 'run' || base === 'kneel') {
    carrierId = holder?.e.playerId ?? (firstOffenseFumble ? firstOffenseFumble.playerId : null) ?? deadCarrier ?? lastExchange?.e.toId ?? snapTo;
  }

  const interceptorId = base === 'interception' ? (interceptionAt?.e.catcherId ?? interceptionPossession?.e.playerId ?? null) : null;
  let interceptionReturnYards = 0;
  if (base === 'interception') {
    const from = interceptionPossession?.e.spot.x ?? interceptionAt?.e.spot.x;
    if (from !== undefined) {
      const lostBack = fumbles.find((f) => f.side === defense && f.playerId === interceptorId && f.credited);
      interceptionReturnYards = wholeYardsBetween(g, clampX(from), lostBack ? clampX(lostBack.spotX) : deadX, otherDir);
    }
  }

  // Yards: the called gain, except that a lost fumble ends the offense's gain at the spot of the fumble.
  const lostFumbleBase = rt === 'fumble_lost' && firstOffenseFumble !== null && (base === 'run' || base === 'completion' || base === 'sack');
  const endX = lostFumbleBase ? clampX(firstOffenseFumble.spotX) : startX + final.yardsGained * dir;
  const yards = base === 'none' || base === 'incompletion' || base === 'spike' || base === 'interception' ? 0 : wholeYardsBetween(g, startX, endX, dir);
  const airYards = release && targetId !== null && passBase ? Math.round(release.airYd) + 0 : null;

  const basePlayerId = base === 'completion' ? receiverId : base === 'run' || base === 'kneel' ? carrierId : null;
  const score = final.score;
  const offenseTouchdown = !isTry && (base === 'run' || base === 'completion') && rt !== 'fumble_lost'
    && score !== null && score.type === 'touchdown' && score.side === offense
    && (score.scorerId === null || basePlayerId === null || score.scorerId === basePlayerId);
  const firstDownEarned = !isTry && (base === 'run' || base === 'completion') && rt !== 'fumble_lost'
    && (offenseTouchdown || (situation.distanceYd !== null && final.yardsGained >= situation.distanceYd));

  const maxSharers = deps.params.num('stats.sack.maxSharers');
  let sackerIds: number[] = [];
  if (base === 'sack') {
    sackerIds = unique(sackEvents.map((e) => e.rusherId));
    if (sackerIds.length === 0) sackerIds = unique(madeTackles[madeTackles.length - 1]?.tacklerIds ?? []);
    sackerIds = sackerIds.slice(0, maxSharers);
  }
  const hitterIds = counts && !isTry
    ? unique(events.filter((e): e is Ev<'pressure'> => e.type === 'pressure' && (e.kind === 'hit' || e.kind === 'sack')).map((e) => e.rusherId))
    : [];

  const scramble = events.some((e) => e.type === 'detail' && e.code === DETAIL_CODES.scramble);
  const pressure = events.some((e) => e.type === 'pressure' && e.kind !== 'escape') || (release !== null && release.underPressure);
  const twoPointGood = isTry && kick === null && rt === 'try_good';

  // Kicks.
  let kickReturn: ReturnFact | null = null;
  let punt: PuntFact | null = null;
  let placeKick: PlaceKickFact | null = null;
  let kickoff: PlayFacts['kickoff'] = null;
  if (counts && kick !== null) {
    const blocked = kick.blockedById !== null;
    const freeKick = kick.kickKind === 'kickoff' || kick.kickKind === 'onside_kick' || kick.kickKind === 'safety_kick';
    if (kick.kickKind === 'punt' || freeKick) {
      const taken = blocked ? null : first('possession', (e) => e.side === defense && (e.how === 'kick_catch' || e.how === 'kick_recovery'));
      let returnYards = 0;
      if (taken) {
        const fairCatch = dead !== null && dead.e.reason === 'fair_catch';
        const returned = !fairCatch && !final.touchback;
        if (returned) {
          const ownFumble = fumbles.find((f) => f.index > taken.i && f.playerId === taken.e.playerId && f.credited);
          returnYards = wholeYardsBetween(g, clampX(taken.e.spot.x), ownFumble ? clampX(ownFumble.spotX) : deadX, otherDir);
        }
        kickReturn = {
          returnerId: taken.e.playerId, fairCatch, returned, yards: returnYards,
          touchdown: returned && score !== null && score.type === 'touchdown' && score.side === defense,
        };
      }
      if (kick.kickKind === 'punt') {
        const short = blocked && !kick.crossedLine;
        const goalX = Contract.xAtYardsToGoal(g, 0, dir);
        const grossEndX = short ? startX : final.touchback ? goalX : taken ? clampX(taken.e.spot.x) : deadX;
        const gross = wholeYardsBetween(g, startX, grossEndX, dir);
        const net = short ? 0 : final.touchback ? wholeYardsBetween(g, startX, clampX(record.called.calledOutcome.spotX), dir) : gross - returnYards;
        const lineAfter = Math.round(Contract.yardsToGoal(g, startX, dir)) - net;
        const inside = !short && !final.touchback && lineAfter > 0 && lineAfter < deps.params.num('stats.punt.insideYardLine');
        punt = { punterId: kick.kickerId, blocked, gross, net, inside, touchback: final.touchback, hangTimeS: kick.hangTimeS };
      } else if (kick.kickKind !== 'safety_kick') {
        kickoff = { kickerId: kick.kickerId, touchback: final.touchback, distanceYd: wholeYardsBetween(g, kick.kickSpot.x, clampX(kick.landingSpot.x), dir) };
      }
    } else if (kick.kickKind === 'try_kick') {
      placeKick = { kickerId: kick.kickerId, kind: 'try_kick', good: score !== null && score.type === 'try_kick' && score.side === offense, blocked, distanceYd: null };
    } else {
      // A field goal from scrimmage is labelled line of scrimmage plus 17 (J9.4.1). A fair-catch kick has
      // no snap, so its distance is the kick spot to the goal posts on the end line.
      const endZoneDepth = g.goalLineWestX;
      const distanceYd = kick.kickKind === 'field_goal'
        ? Math.round(Contract.yardsToGoal(g, startX, dir)) + deps.params.num('stats.fieldGoal.labelAddYd')
        : Math.round(Contract.yardsToGoal(g, kick.kickSpot.x, dir) + endZoneDepth);
      placeKick = { kickerId: kick.kickerId, kind: 'field_goal', good: score !== null && score.type === 'field_goal' && score.side === offense, blocked, distanceYd };
    }
  }

  return {
    record, offense, defense, counts, live, isTry, specialTeams, kick, base, passerId, targetId, receiverId, carrierId,
    interceptorId, interceptionReturnYards, breakupById: breakup?.e.defenderIds[0] ?? null, release, yards, airYards,
    offenseTouchdown, firstDownEarned, sackerIds, hitterIds, fumbles, madeTackles, scramble, pressure, twoPointGood,
    kickReturn, punt, placeKick, kickoff, sideOf,
  };
}

export interface EnforcedPenalty {
  readonly foulId: string;
  readonly side: Side;
  readonly playerId: number | null;
  readonly yards: number;
}

/**
 * Penalties enforced on the play. The enforcement summary holds one total of yards walked. With one
 * enforced foul that total is the foul's yardage (half the distance included). With several, or when
 * the yards are carried to a later kick, each foul keeps its catalogue distance.
 */
export function enforcedPenalties(record: PlayRecord): EnforcedPenalty[] {
  const enforcement = record.final.enforcement;
  if (!enforcement || enforcement.offsetting) return [];
  const single = enforcement.enforced.length === 1;
  const walked = Math.abs(enforcement.yardsWalked);
  const out: EnforcedPenalty[] = [];
  for (const index of enforcement.enforced) {
    const foul = record.called.fouls[index];
    if (!foul) continue;
    out.push({ foulId: foul.foulId, side: foul.side, playerId: foul.playerId, yards: single && walked > 0 ? walked : foul.yards });
  }
  return out;
}

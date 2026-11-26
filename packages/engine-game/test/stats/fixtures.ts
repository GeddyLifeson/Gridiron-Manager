// Hand-built play records for the statistics tests. FIXTURE DATA: the field size, the players and the
// plays are made up for the tests and are not football facts. Each record is checked against the
// contract's schema, so a fixture cannot drift from the shapes the engine really produces.
import { Contract } from '@gm/engine-core';

type Side = Contract.Side;
type TruthEvent = Contract.TruthEvent;
type PlayRecord = Contract.PlayRecord;
type PlayOutcome = Contract.PlayOutcome;
type FoulRecord = Contract.FoulRecord;
type Ruling = Contract.Ruling;

/** Fixture field: goal lines at x = 10 and x = 110, so side 0 (attacking east) is at its own N-yard line at x = 10 + N. */
export const FIXTURE_GEOMETRY: Contract.FieldGeometry = {
  lengthYd: 120, widthYd: 54, goalLineWestX: 10, goalLineEastX: 110, hashSouthY: 24, hashNorthY: 30, centreY: 27,
  uprightSouthY: 24, uprightNorthY: 30, crossbarHeightYd: 3,
};

export const CENTRE_Y = 27;

// Side 0 players. Offense: 1 quarterback, 2 back, 3 and 4 receivers, 5 tight end, 6 to 10 line, 11 receiver.
// Kicking unit: 12 kicker, 13 punter. Defense: 301 to 311. Returner: 320.
// Side 1 players. Defense: 101 to 111. Returner: 120. Offense: 201 to 211. Kicker 212.
const ids = (from: number, n = 11) => Array.from({ length: n }, (_, i) => ({ playerId: from + i, role: `R${i}` }));
const OFFENSE: Record<Side, Contract.FieldedPlayer[]> = { 0: ids(1), 1: ids(201) };
const DEFENSE: Record<Side, Contract.FieldedPlayer[]> = { 0: ids(301), 1: ids(101) };
const KICK_UNIT: Record<Side, Contract.FieldedPlayer[]> = {
  0: [12, 13, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((playerId, i) => ({ playerId, role: `K${i}` })),
  1: [212, 213, 202, 203, 204, 205, 206, 207, 208, 209, 210].map((playerId, i) => ({ playerId, role: `K${i}` })),
};
const RETURN_UNIT: Record<Side, Contract.FieldedPlayer[]> = {
  0: [320, ...Array.from({ length: 10 }, (_, i) => 301 + i)].map((playerId, i) => ({ playerId, role: `T${i}` })),
  1: [120, ...Array.from({ length: 10 }, (_, i) => 101 + i)].map((playerId, i) => ({ playerId, role: `T${i}` })),
};

export interface Helpers {
  /** Field x of the offense's own N-yard line. */
  x(yardsFromOwnGoal: number): number;
  spot(yardsFromOwnGoal: number, lateral?: number): Contract.Spot;
  snap(to?: number): TruthEvent;
  handoff(from: number, to: number): TruthEvent;
  possession(side: Side, playerId: number, at: number, how: Contract.TruthEventOf<'possession'>['how'], t?: number): TruthEvent;
  release(o: { passer?: number; target?: number | null; air: number; from: number; lateral?: number; throwaway?: boolean; spike?: boolean; underPressure?: boolean; t?: number }): TruthEvent;
  catchPoint(outcome: Contract.TruthEventOf<'catch_point'>['outcome'], at: number, o?: { intended?: number | null; catcher?: number | null; defenders?: number[]; contested?: boolean }): TruthEvent;
  tackle(carrier: number, tacklers: number[], at: number, outcome?: 'made' | 'broken' | 'missed', t?: number): TruthEvent;
  pressure(kind: Contract.TruthEventOf<'pressure'>['kind'], rusher: number, passer: number, at: number): TruthEvent;
  fumble(side: Side, playerId: number, at: number, o?: { forcedBy?: number | null; kind?: Contract.TruthEventOf<'fumble'>['kind']; t?: number }): TruthEvent;
  kick(kind: Contract.KickKind, kicker: number, from: number, to: number, o?: { hang?: number; blockedBy?: number | null; crossed?: boolean }): TruthEvent;
  detail(code: string, playerIds: number[]): TruthEvent;
  foul(foulId: string, side: Side, playerId: number | null, timing: Contract.TruthEventOf<'foul_committed'>['timing']): TruthEvent;
  dead(reason: Contract.DeadBallReason, at: number, side: Side | null, carrier: number | null, t?: number): TruthEvent;
}

export interface PlaySpec {
  /** Team that snaps or kicks. Default 0. */
  off?: Side;
  playKind?: Contract.PlayKind;
  /** Yards from the offense's own goal line at the snap. */
  at: number;
  down?: number | null;
  dist?: number | null;
  goalToGo?: boolean;
  offenseKind?: Contract.OffensePlayKind;
  offenseCall?: Partial<Contract.OffenseCall>;
  kickKind?: Contract.KickKind;
  defenseCall?: Partial<Contract.DefenseCall>;
  events: (h: Helpers) => TruthEvent[];
  result: Contract.PlayResultType;
  gain?: number;
  final?: Partial<PlayOutcome>;
  /** Succeeding spot of the called outcome before any penalty choice, as yards from the offense's own goal. */
  calledSpotAt?: number;
  fouls?: FoulRecord[];
  rulings?: Ruling[];
  firstDownAwarded?: boolean;
  period?: number;
  clockTenths?: number;
  drive?: number;
  overtime?: boolean;
  score?: [number, number];
  scoreAfter?: [number, number];
  liveTenths?: number;
}

export function foulRecord(foulId: string, side: Side, playerId: number | null, yards: number, timing: FoulRecord['timing'] = 'live'): FoulRecord {
  return {
    foulId, side, playerId, spot: { x: 50, y: CENTRE_Y }, t: 1, timing, phase: 'running_play', yards, afd: false, lod: false, spotFoul: false,
    runoffEligible: false, foulClass: 'other', dq: 'none', beforeChangeOfPossession: true, eventIndex: null, sameAct: null, called: true,
    correct: true, flagrant: false,
  };
}

export function enforcement(enforced: number[], yardsWalked: number, o: Partial<Contract.EnforcementSummary> = {}): Contract.EnforcementSummary {
  return {
    enforced, declined: [], offsetting: false, yardsWalked, fromSpot: null, halfDistanceApplied: false, automaticFirstDown: false,
    lossOfDown: false, replayDown: false, carriedTo: null, runoffTaken: false, disqualified: [], ...o,
  };
}

let nextIndex = 1;
export function resetIndexes(): void { nextIndex = 1; }

export function play(spec: PlaySpec): PlayRecord {
  const off: Side = spec.off ?? 0;
  const def = Contract.otherSide(off);
  const dir: Contract.AttackDir = off === 0 ? 1 : -1;
  const x = (yards: number) => (off === 0 ? 10 + yards : 110 - yards);
  const spot = (yards: number, lateral = 0): Contract.Spot => ({ x: x(yards), y: CENTRE_Y + lateral * dir });
  const judged = { marginYd: null, marginS: null, visibility: 'open' as const };
  const qb = OFFENSE[off][0]!.playerId;
  const h: Helpers = {
    x, spot,
    snap: (to = qb) => ({ type: 'snap', t: 0, snapperId: null, toPlayerId: to, quality: 'clean' }),
    handoff: (from, to) => ({ type: 'exchange', t: 0.8, kind: 'handoff', fromId: from, toId: to, spot: spot(spec.at - 4) }),
    possession: (side, playerId, at, how, t = 1) => ({ type: 'possession', t, side, playerId, spot: spot(at), how }),
    release: (o) => ({
      type: 'pass_release', t: o.t ?? 2.5, ...judged, passerId: o.passer ?? qb, targetId: o.target === undefined ? null : o.target, forward: true,
      releaseSpot: spot(o.from - 6), aimSpot: spot(o.from + o.air, o.lateral ?? 0), landingSpot: spot(o.from + o.air, o.lateral ?? 0), airYd: o.air,
      throwaway: o.throwaway ?? false, spike: o.spike ?? false, underPressure: o.underPressure ?? false, passerOutsidePocket: false, ballBeyondLine: false,
    }),
    catchPoint: (outcome, at, o = {}) => ({
      type: 'catch_point', t: 3.2, ...judged, outcome, spot: spot(at), intendedId: o.intended ?? null, catcherId: o.catcher ?? null,
      defenderIds: o.defenders ?? [], feetInBounds: 2, contested: o.contested ?? false,
    }),
    tackle: (carrier, tacklers, at, outcome = 'made', t = 4) => ({ type: 'tackle_attempt', t, outcome, carrierId: carrier, tacklerIds: tacklers, spot: spot(at) }),
    pressure: (kind, rusher, passer, at) => ({ type: 'pressure', t: 2.4, kind, rusherId: rusher, passerId: passer, spot: spot(at) }),
    fumble: (side, playerId, at, o = {}) => ({ type: 'fumble', t: o.t ?? 3.5, ...judged, kind: o.kind ?? 'fumble', playerId, side, forcedById: o.forcedBy ?? null, spot: spot(at) }),
    kick: (kind, kicker, from, to, o = {}) => ({
      type: 'kick', t: 0.1, kickKind: kind, kickerId: kicker, kickSpot: spot(from), landingSpot: spot(to), hangTimeS: o.hang ?? 4,
      crossedLine: o.crossed ?? true, blockedById: o.blockedBy ?? null,
    }),
    detail: (code, playerIds) => ({ type: 'detail', t: 2, code, playerIds, spot: null, value: null }),
    foul: (foulId, side, playerId, timing) => ({
      type: 'foul_committed', t: timing === 'before_snap' ? -0.5 : 1, foulId, side, playerId, spot: spot(spec.at), timing, phase: 'running_play',
      severity: 0.8, visibility: 'open', atPointOfAttack: true, flagrant: false, borderline: false, ordered: false,
    }),
    dead: (reason, at, side, carrier, t = 5) => ({ type: 'dead_ball', t, ...judged, reason, spot: spot(at), side, carrierId: carrier }),
  };

  const index = nextIndex++;
  const playKind = spec.playKind ?? 'scrimmage';
  const scrimmage = playKind === 'scrimmage';
  const down = spec.down === undefined ? (scrimmage ? 1 : null) : spec.down;
  const dist = spec.dist === undefined ? (scrimmage ? 10 : null) : spec.dist;
  const score = spec.score ?? [0, 0];
  const gain = spec.gain ?? 0;

  const situation: Contract.GameSituation = {
    gameId: 7, playNumber: index, driveNumber: spec.drive ?? 1, playKind, period: spec.period ?? 1, overtime: spec.overtime ?? false,
    clockTenths: spec.clockTenths ?? 9000 - index * 300, clockStatus: 'running', playClockAtSnapTenths: 50, offense: off, attackDir: dir, down,
    distanceYd: dist, goalToGo: spec.goalToGo ?? false, ballX: x(spec.at), ballY: CENTRE_Y, lineToGainX: dist === null ? null : x(spec.at + dist),
    score, timeoutsLeft: [3, 3], insideTwoMinute: false, untimedDown: false,
  };

  const snapping: Contract.SnappingCall = spec.kickKind
    ? { unit: 'kick', kickKind: spec.kickKind, callContentId: null, contentHash: null, direction: null, players: KICK_UNIT[off] }
    : {
      unit: 'offense', playContentId: null, contentHash: null, kind: spec.offenseKind ?? 'run', personnelCode: '11', formationId: null, strength: null,
      motionId: null, protectionId: null, tags: [], runDirection: null, shotgun: false, tempo: 'huddle', players: OFFENSE[off], ...spec.offenseCall,
    };
  const opposing: Contract.OpposingCall = spec.kickKind
    ? { unit: 'return', returnKind: spec.kickKind === 'punt' ? 'punt_return' : 'kick_return', callContentId: null, contentHash: null, players: RETURN_UNIT[def] }
    : {
      unit: 'defense', callContentId: null, contentHash: null, packageId: null, frontId: null, coverageId: null, pressureId: null,
      coverageFamily: 'cover3', rushers: 4, boxCount: 7, players: DEFENSE[def], ...spec.defenseCall,
    };

  const events = spec.events(h);
  const truthRecord: Contract.PlayTruth = {
    resolverId: 'reference', resolverVersion: 'fixture', gameId: 7, playNumber: index, originX: x(spec.at), originY: CENTRE_Y, attackDir: dir,
    liveDurationTenths: spec.liveTenths ?? 50, endZoneImpetus: null, events,
  };

  const final: PlayOutcome = {
    resultType: spec.result, noPlay: false, snappingSide: off, possessionAfter: off, changeOfPossession: false, spotX: x(spec.at + gain), spotY: CENTRE_Y,
    previousSpotX: x(spec.at), score: null, touchback: false, endedOutOfBounds: false, incomplete: false, runnerDownInBounds: true, yardsGained: gain,
    injuryStoppage: [], enforcement: null, ...spec.final,
  };
  const calledOutcome: PlayOutcome = { ...final, enforcement: null, spotX: spec.calledSpotAt === undefined ? final.spotX : x(spec.calledSpotAt) };

  const record: PlayRecord = {
    gameId: 7, index, fidelityTier: 'A', situation, calls: { snapping, opposing }, truth: truthRecord, deltas: [],
    called: {
      rulings: spec.rulings ?? [], fouls: spec.fouls ?? [], trueOutcome: calledOutcome, calledOutcome,
      options: [{ optionId: 'as_called', side: off, labelKey: 'option.as_called', outcome: final }], defaultOptionId: 'as_called',
    },
    chosenOptionId: 'as_called', final,
    seriesAfter: {
      playKind: 'scrimmage', possession: final.possessionAfter, down: 1, distanceYd: 10, goalToGo: false, ballX: final.spotX, ballY: CENTRE_Y,
      lineToGainX: null, seriesStartX: null, firstDownAwarded: spec.firstDownAwarded ?? false, turnoverOnDowns: false,
    },
    clockAfter: { clockTenths: Math.max(0, situation.clockTenths - 60), status: 'running', playClockTenths: 400, periodExpired: false, untimedDown: false, twoMinuteStop: false, runoff: null },
    scoreAfter: spec.scoreAfter ?? score, decisions: [], stateHash: 'fixture',
  };
  const problems = Contract.playTruthProblems(record.truth);
  if (problems.length) throw new Error(`fixture play ${index}: ${problems.join('; ')}`);
  return Contract.PlayRecord.parse(record);
}

export const touchdown = (side: Side, scorerId: number | null): Contract.ScoreEvent => ({ type: 'touchdown', side, points: 6, scorerId });

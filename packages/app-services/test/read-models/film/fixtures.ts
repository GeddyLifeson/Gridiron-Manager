// Film fixtures: a scripted pass play written in the engine's trajectory format 1, with its truth
// record, play-by-play row and calls. Test data only: no number here is a real-world claim.
import { BALL_STATES, MOVE_MODES, type PlayByPlayRow, type PlayCalls, type PlayTruth, type TrajectoryRecord } from '@gm/schema';
import { seedFromNumber } from '@gm/engine-core';
import type { FilmSource } from '../../../src/read-models/film/index.ts';

export const SEED = seedFromNumber(63);
export const HOME = 3, AWAY = 5;
export const person = (slot: number) => 1000 + slot;
export const ROLES = ['LT', 'LG', 'C', 'RG', 'RT', 'QB', 'X', 'Z', 'Y', 'H', 'RB', 'DE', 'DT', 'DT', 'DE', 'WLB', 'MLB', 'SLB', 'CB', 'CB', 'FS', 'SS'];

export interface V1Player { x: number; y: number; heading: number; gaze: number; mode: number; advantage: number | null }
export interface V1Tick { players: V1Player[]; ball: { kind: number; x: number; y: number; height: number; carrier: number }; officials: { x: number; y: number; gaze: number }[] }

/** Writes format 1 exactly as engine-core's recorder does. */
export function encodeV1(firstTick: number, officials: number, ticks: readonly V1Tick[]): TrajectoryRecord {
  const out: number[] = [officials];
  const put = (d: number) => { let v = d < 0 ? -2 * d - 1 : 2 * d; while (v >= 128) { out.push((v % 128) + 128); v = Math.floor(v / 128); } out.push(v); };
  const q = (rad: number) => { const a = Math.round((rad / (2 * Math.PI)) * 4096) % 4096; return a < 0 ? a + 4096 : a; };
  const lx = new Array(22).fill(0), ly = new Array(22).fill(0), lh = new Array(22).fill(0), lg = new Array(22).fill(0);
  const ox = new Array(officials).fill(0), oy = new Array(officials).fill(0), og = new Array(officials).fill(0);
  let bx = 0, by = 0, bh = 0;
  for (const t of ticks) {
    t.players.forEach((p, s) => {
      const x = Math.round(p.x * 100), y = Math.round(p.y * 100), h = q(p.heading), g = q(p.gaze);
      put(x - lx[s]); put(y - ly[s]); put(h - lh[s]); put(g - lg[s]);
      lx[s] = x; ly[s] = y; lh[s] = h; lg[s] = g;
      out.push(p.mode);
      const adv = p.advantage === null ? -128 : Math.round(p.advantage * 100);
      out.push(adv < 0 ? adv + 256 : adv);
    });
    out.push(t.ball.kind);
    const x = Math.round(t.ball.x * 100), y = Math.round(t.ball.y * 100), h = Math.round(t.ball.height * 100);
    put(x - bx); put(y - by); put(h - bh); bx = x; by = y; bh = h;
    out.push(t.ball.carrier < 0 ? 255 : t.ball.carrier);
    t.officials.forEach((o, i) => {
      const x2 = Math.round(o.x * 100), y2 = Math.round(o.y * 100), g = q(o.gaze);
      put(x2 - ox[i]); put(y2 - oy[i]); put(g - og[i]); ox[i] = x2; oy[i] = y2; og[i] = g;
    });
  }
  return { formatVersion: 1, firstTick, tickCount: ticks.length, buffer: Uint8Array.from(out) };
}

const M = (m: (typeof MOVE_MODES)[number]) => MOVE_MODES.indexOf(m);
const B = (b: (typeof BALL_STATES)[number]) => BALL_STATES.indexOf(b);
export const LOS = 40, TPS = 10;
export const M_ = (m: (typeof MOVE_MODES)[number]) => MOVE_MODES.indexOf(m);
export const SNAP_T = 0, THROW_T = 15, CATCH_T = 25, TACKLE_T = 32, WHISTLE_T = 33;
export const FIRST_TICK = -3, LAST_TICK = 36;

export interface PlayOpts {
  gameId?: number; playNumber?: number;
  /** Override a slot's position and mode at a tick. */
  override?: (slot: number, tick: number, p: V1Player, ball: { x: number; y: number }) => Partial<V1Player> | null;
  mentalError?: { slot: number; cause: 'knowledge' | 'discipline' | 'communication' };
  contests?: { winner: number; loser: number }[];
  epBefore?: number; epAfter?: number;
  yardsGained?: number; down?: number; distance?: number; ballOn?: number;
  formationId?: string; personnelCode?: string; coverageId?: string; frontId?: string; pressureId?: string | null;
  callValue?: number | null;
  teams?: [number, number];
  offense?: 0 | 1;
  injuries?: number[];
  clockTenths?: number; period?: number;
  advantage?: number;
}

/** Ball spot at a tick: held by the QB, in flight to the Z, then carried. */
function ballAt(t: number): { x: number; y: number; kind: number; carrier: number } {
  if (t < SNAP_T) return { x: LOS, y: 26.65, kind: B('deadPreSnap'), carrier: -1 };
  if (t < THROW_T) return { x: LOS - Math.min(t, 7) * 0.7, y: 26.65, kind: B('held'), carrier: 5 };
  const rx = LOS + 15, ry = 10;
  if (t < CATCH_T) { const f = (t - THROW_T) / (CATCH_T - THROW_T); return { x: LOS - 4.9 + f * (rx - LOS + 4.9), y: 26.65 + f * (ry - 26.65), kind: B('passInFlight'), carrier: -1 }; }
  if (t <= TACKLE_T) return { x: rx + (t - CATCH_T) * 0.6, y: ry, kind: B('held'), carrier: 7 };
  return { x: rx + (TACKLE_T - CATCH_T) * 0.6, y: ry, kind: B('dead'), carrier: -1 };
}

function basePlayer(slot: number, t: number, ball: { x: number; y: number }): V1Player {
  const tt = Math.max(0, t);
  const live = t >= SNAP_T && t <= WHISTLE_T;
  if (slot <= 4) return { x: LOS - 1, y: 22 + slot * 1.2, heading: 0, gaze: 0, mode: live ? M('engaged') : M('stance'), advantage: null };
  if (slot === 5) return { x: t < THROW_T ? ballAt(t).x - 0.5 : LOS - 5.4 + (t - THROW_T) * 0.3, y: 26.65, heading: 0, gaze: 0, mode: live ? M('run') : M('stance'), advantage: null };
  if (slot >= 6 && slot <= 9) {
    if (slot === 7 && t >= CATCH_T) return { x: ball.x, y: ball.y, heading: 0, gaze: 0, mode: M('run'), advantage: null };
    const y0 = [5, 10, 35, 45][slot - 6]!;
    const x = slot === 7 ? LOS + Math.min(tt, CATCH_T) * 0.6 : LOS + tt * 0.5;
    return { x, y: slot === 7 ? y0 : y0, heading: 0, gaze: 0, mode: live ? M('sprint') : M('stance'), advantage: null };
  }
  if (slot === 10) return { x: LOS - 6 + tt * 0.3, y: 26.65, heading: 0, gaze: 0, mode: live ? M('run') : M('stance'), advantage: null };
  if (slot >= 11 && slot <= 14) return { x: LOS + 1, y: 22 + (slot - 11) * 1.6, heading: Math.PI, gaze: Math.PI, mode: live ? M('engaged') : M('stance'), advantage: null };
  // Back seven: start deep, pursue the ball at the same speed once it is caught.
  const start = backStart(slot);
  if (t < CATCH_T) return { ...start, heading: Math.PI, gaze: Math.PI, mode: live ? M('backpedal') : M('stance'), advantage: null };
  return { ...pursue(start, PURSUIT_YD_PER_TICK, t, ball), heading: Math.PI, gaze: Math.PI, mode: t <= WHISTLE_T ? M('sprint') : M('run'), advantage: null };
}

export const PURSUIT_YD_PER_TICK = 0.7;
/** Straight-line pursuit from `start` at a speed, stopping one yard short of the ball. */
export function pursue(start: { x: number; y: number }, ydPerTick: number, t: number, ball: { x: number; y: number }, from = CATCH_T): { x: number; y: number } {
  const dx = ball.x - start.x, dy = ball.y - start.y, d = Math.hypot(dx, dy);
  const run = Math.min(d - 1, Math.max(0, t - from) * ydPerTick);
  const f = d > 0 ? Math.max(0, run) / d : 0;
  return { x: start.x + dx * f, y: start.y + dy * f };
}
export const backStart = (slot: number) => ({ x: LOS + 5 + (slot - 15) * 1.5, y: 8 + (slot - 15) * 6 });

export function makeTrajectory(o: PlayOpts = {}): TrajectoryRecord {
  const ticks: V1Tick[] = [];
  for (let t = FIRST_TICK; t <= LAST_TICK; t++) {
    const b = ballAt(t);
    const players: V1Player[] = [];
    for (let s = 0; s < 22; s++) {
      let p = basePlayer(s, t, b);
      if ((s <= 4 || (s >= 11 && s <= 14)) && t >= SNAP_T && t <= WHISTLE_T && o.advantage !== undefined) p = { ...p, advantage: o.advantage };
      const ov = o.override?.(s, t, p, b);
      if (ov) p = { ...p, ...ov };
      players.push(p);
    }
    ticks.push({ players, ball: { kind: b.kind, x: b.x, y: b.y, height: 1, carrier: b.carrier }, officials: [{ x: LOS + 10, y: 0, gaze: 0 }] });
  }
  return encodeV1(FIRST_TICK, 1, ticks);
}

export function makeSource(o: PlayOpts = {}): FilmSource {
  const gameId = o.gameId ?? 7, playNumber = o.playNumber ?? 12;
  const teams = o.teams ?? [HOME, AWAY];
  const offense = o.offense ?? 0;
  const off = offense, def = (1 - offense) as 0 | 1;
  const slots = ROLES.map((role, slot) => ({ slot, side: (slot <= 10 ? off : def) as 0 | 1, personId: person(slot), jersey: slot + 50, role }));
  const s = (t: number) => t / TPS;
  const spot = (x: number, y: number) => ({ x, y });
  const events: PlayTruth['events'] = [
    { type: 'snap', t: s(SNAP_T), snapperId: person(2), toPlayerId: person(5), quality: 'clean' },
    ...(o.contests ?? []).map((c) => ({ type: 'contest' as const, t: s(3), contest: 'pass_rush', winnerId: person(c.winner), loserId: person(c.loser), spot: spot(LOS, 25) })),
    ...(o.mentalError ? [{ type: 'mental_error' as const, t: s(1), playerId: person(o.mentalError.slot), cause: o.mentalError.cause, form: 'wrong_gap' }] : []),
    { type: 'pass_release', t: s(THROW_T), marginYd: null, marginS: null, visibility: 'open', passerId: person(5), targetId: person(7), forward: true, releaseSpot: spot(LOS - 4.9, 26.65), aimSpot: spot(55, 10), landingSpot: spot(55, 10), airYd: 15, throwaway: false, spike: false, underPressure: false, passerOutsidePocket: false, ballBeyondLine: false },
    { type: 'catch_point', t: s(CATCH_T), marginYd: null, marginS: null, visibility: 'open', outcome: 'catch', spot: spot(55, 10), intendedId: person(7), catcherId: person(7), defenderIds: [person(18)], feetInBounds: 2, contested: false },
    ...(o.injuries ?? []).map((sl) => ({ type: 'injury' as const, t: s(TACKLE_T), playerId: person(sl), mechanism: 'contact', region: 'knee', severitySeed: 0.5, finishesPlay: true, headImpact: false })),
    { type: 'tackle_attempt', t: s(TACKLE_T), outcome: 'made', carrierId: person(7), tacklerIds: [person(18)], spot: spot(59.2, 10) },
    { type: 'dead_ball', t: s(WHISTLE_T), marginYd: null, marginS: null, visibility: 'open', reason: 'down_by_contact', spot: spot(59.2, 10), side: off, carrierId: person(7) },
  ];
  const truth: PlayTruth = { resolverId: 'tick', resolverVersion: 'test', gameId, playNumber, originX: LOS, originY: 26.65, attackDir: 1, liveDurationTenths: 33, endZoneImpetus: null, events };
  const calls: PlayCalls = {
    snapping: { unit: 'offense', playContentId: 'smash', contentHash: null, kind: 'dropback_pass', personnelCode: o.personnelCode ?? '11', formationId: o.formationId ?? 'trips_right', strength: 'right', motionId: null, protectionId: 'slide_left', tags: [], runDirection: null, shotgun: true, tempo: 'huddle', players: slots.slice(0, 11).map((x) => ({ playerId: x.personId, role: x.role })) },
    opposing: { unit: 'defense', callContentId: null, contentHash: null, packageId: 'nickel', frontId: o.frontId ?? 'even', coverageId: o.coverageId ?? 'cover3', pressureId: o.pressureId === undefined ? null : o.pressureId, coverageFamily: 'cover3', rushers: 4, boxCount: 6, players: slots.slice(11).map((x) => ({ playerId: x.personId, role: x.role })) },
  };
  const row: PlayByPlayRow = {
    gameId, playIndex: playNumber, driveNumber: 3, period: o.period ?? 2, clockTenths: o.clockTenths ?? 4500, offense, playKind: 'scrimmage',
    down: o.down ?? 3, distanceYd: o.distance ?? 7, ballOnYd: o.ballOn ?? 40, yardsToGoalYd: 100 - (o.ballOn ?? 40), goalToGo: false,
    scoreOffense: 10, scoreDefense: 7, resultType: 'pass_complete', noPlay: false, offenseKind: 'dropback_pass', kickKind: null,
    dropback: true, scramble: false, shotgun: true, noHuddle: false, playAction: false, motion: false, personnelCode: o.personnelCode ?? '11',
    yardsGained: o.yardsGained ?? 19, airYd: 15, yardsAfterCatch: 4, passLocation: 'left', runLocation: null, rushers: 4, boxCount: 6,
    coverageFamily: 'cover3', pressure: false, sack: false, interception: false, fumbleLost: false, touchdown: false, firstDown: true,
    kickDistanceYd: null, penalties: [], snapToSnapTenths: null, epBefore: o.epBefore ?? 1.2, epAfter: o.epAfter ?? 2.6, textKey: 'pbp.pass', textParams: {},
  };
  return {
    gameId, playNumber, kind: 'game', teams: [teams[0], teams[1]], ticksPerSecond: TPS, trajectory: makeTrajectory(o), slots, row, calls, truth,
    hash: 'middle', lineOfScrimmageX: LOS, lineToGainX: LOS + 7, assignments: [
      { slot: 7, words: 'Corner route, 12 steps then break at 45 degrees', points: [{ x: LOS, y: 10 }, { x: LOS + 12, y: 10 }, { x: LOS + 18, y: 4 }] },
      { slot: 18, words: 'Deep third, outside', points: [{ x: LOS + 7, y: 8 }, { x: LOS + 20, y: 8 }] },
    ], callValue: o.callValue === undefined ? 0.3 : o.callValue,
  };
}

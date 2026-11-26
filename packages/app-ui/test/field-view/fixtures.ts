// FIXTURE plays and geometry for the field-view tests. Not facts: positions are made up to exercise
// the renderer. Geometry takes the hash distance from the real rule-set files.
import { resolveRuleSet } from '@gm/rules-data';
import { encodeLayout0, radToFacing, FILM_MOVE_MODES, FILM_BALL_STATES, type FieldGeometryLike, type FilmPlay, type FilmSlot, type FilmEvent, type TickSample, type Canvas2DLike } from '../../src/field-view/index.ts';

const FT = 1 / 3;
/** FIXTURE geometry. Width 160 ft and 10 yd end zones (J1.1.1) until WP-09's fieldGeometry(rules) lands. */
export function geometryFor(file: 'pro' | 'college'): FieldGeometryLike {
  const rules = resolveRuleSet(file === 'pro' ? 'pro_2026' : 'college_2026');
  const hashFt = rules.num('field.hash_from_sideline_ft');
  const goalToGoal = rules.num('field.goal_to_goal_yd');
  const width = 160 * FT, ez = 10;
  return {
    lengthYd: goalToGoal + 2 * ez, widthYd: width, goalLineWestX: ez, goalLineEastX: ez + goalToGoal,
    hashSouthY: hashFt * FT, hashNorthY: width - hashFt * FT, centreY: width / 2,
    uprightSouthY: width / 2 - 18.5 * FT / 2, uprightNorthY: width / 2 + 18.5 * FT / 2, crossbarHeightYd: 10 * FT,
  };
}
export const PRO = geometryFor('pro');
export const COLLEGE = geometryFor('college');

const mode = (m: (typeof FILM_MOVE_MODES)[number]) => FILM_MOVE_MODES.indexOf(m);
const ball = (b: (typeof FILM_BALL_STATES)[number]) => FILM_BALL_STATES.indexOf(b);

/** Offense slots 0 to 10, defense 11 to 21. Offsets in the play frame: px downfield, py to the offense's left. */
export interface Formation { readonly name: string; readonly offense: readonly [string, number, number][]; readonly defense: readonly [string, number, number][] }

const BASE_D: [string, number, number][] = [
  ['DE', 1, 4.5], ['DT', 1, 1.5], ['DT', 1, -1.5], ['DE', 1, -4.5], ['OLB', 4.5, 6], ['MLB', 5, 0], ['OLB', 4.5, -6],
  ['CB', 7, 15], ['CB', 7, -15], ['FS', 13, 4], ['SS', 12, -4],
];
const LINE: [string, number, number][] = [['C', -0.5, 0], ['LG', -0.7, 1.2], ['RG', -0.7, -1.2], ['LT', -0.9, 2.4], ['RT', -0.9, -2.4]];

/** FIXTURE formations, including splits at the sideline and both goal lines (the I9.1.1 test set). */
export const FORMATIONS: readonly Formation[] = [
  { name: 'pro I', offense: [...LINE, ['QB', -1.5, 0], ['FB', -4.5, 0], ['RB', -7, 0], ['TE', -0.9, -3.6], ['WR', -1, 16], ['WR', -1, -18]], defense: BASE_D },
  { name: 'shotgun trips wide', offense: [...LINE, ['QB', -5, 0], ['RB', -5, 1.5], ['WR', -1, -9], ['WR', -1, -13], ['WR', -1, -25], ['WR', -1, 25]], defense: BASE_D },
  { name: 'empty, splits on the sidelines', offense: [...LINE, ['QB', -5, 0], ['WR', -1, 25.5], ['WR', -1, 18], ['TE', -1, -6], ['WR', -1, -18], ['WR', -1, -25.5]], defense: BASE_D },
  { name: 'bunch', offense: [...LINE, ['QB', -5, 0], ['RB', -5, -1.5], ['WR', -1, 8], ['TE', -2, 9], ['WR', -3, 8.5], ['WR', -1, -20]], defense: BASE_D },
  { name: 'goal line heavy', offense: [...LINE, ['QB', -1.5, 0], ['FB', -4, 0], ['RB', -6.5, 0], ['TE', -0.9, -3.6], ['TE', -0.9, 3.6], ['TE', -2, 5]], defense: [['DE', 1, 4.5], ['DT', 1, 1.5], ['DT', 1, -1.5], ['DE', 1, -4.5], ['DT', 1, 0], ['LB', 3, 3], ['LB', 3, -3], ['CB', 2, 8], ['CB', 2, -8], ['SS', 4, 6], ['FS', 4, -6]] },
  { name: 'punt', offense: [...LINE, ['P', -15, 0], ['RB', -5, 1.5], ['RB', -5, -1.5], ['WR', -1, 20], ['WR', -1, -20], ['TE', -0.9, -3.6]], defense: [...BASE_D.slice(0, 9), ['PR', 45, 0], ['FS', 30, 4]] },
];

export const SLOTS_OF = (f: Formation, offenseSide: 0 | 1): FilmSlot[] => [
  ...f.offense.map(([role], i) => ({ slot: i, side: offenseSide, jersey: [52, 66, 64, 71, 77, 12, 44, 28, 87, 11, 81][i]!, role })),
  ...f.defense.map(([role], i) => ({ slot: 11 + i, side: (1 - offenseSide) as 0 | 1, jersey: [91, 97, 93, 95, 55, 54, 51, 24, 21, 31, 33][i]!, role })),
];

export interface PlayOpts {
  readonly formation?: Formation;
  readonly losX?: number;
  readonly ballY?: number;
  readonly attackDir?: 1 | -1;
  readonly offenseSide?: 0 | 1;
  readonly preSnapTicks?: number;
  readonly liveTicks?: number;
  readonly geometry?: FieldGeometryLike;
  readonly kick?: boolean;
  /** Trajectory layout: 0 (P2.2.2 fixed) or 1 (the engine record, with three officials). Default 0. */
  readonly layout?: 0 | 1;
}

export interface V1Tick {
  readonly players: readonly { x: number; y: number; heading: number; gaze: number; mode: number; advantage: number | null }[];
  readonly ball: { kind: number; x: number; y: number; height: number; carrier: number };
  readonly officials: readonly { x: number; y: number; gaze: number }[];
}

/**
 * Writes layout 1 exactly as the engine recorder does (WP-09, engine-core src/tick/trajectory.ts):
 * zigzag LEB128 deltas, 1/4096-turn angles, a signed advantage byte (-128 none), carrier 255 none.
 */
export function encodeLayout1(firstTick: number, officials: number, ticks: readonly V1Tick[]): { formatVersion: number; firstTick: number; tickCount: number; buffer: Uint8Array } {
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

/**
 * A FIXTURE pass play: motion by the last receiver before the snap, a five-step drop, a throw at
 * tick 15 to slot 9, the catch at tick 25, a tackle at tick 32, the whistle at tick 33.
 * With `kick` the ball is punted instead and lands 45 yd downfield.
 */
export function fixturePlay(o: PlayOpts = {}): FilmPlay {
  const g = o.geometry ?? PRO;
  const f = o.formation ?? FORMATIONS[0]!;
  const dir = o.attackDir ?? 1;
  const losX = o.losX ?? g.goalLineWestX + 25;
  const by = o.ballY ?? g.centreY;
  const pre = o.preSnapTicks ?? 10;
  const live = o.liveTicks ?? 37;
  const offenseSide = o.offenseSide ?? 0;
  const place = (px: number, py: number) => ({ x: losX + px * dir, y: by + py * dir });
  const starts = [...f.offense, ...f.defense].map(([, px, py]) => place(px, py));
  const ticks: TickSample[] = [];
  const passTick = 15, catchTick = 25, tackleTick = 32, whistleTick = 33;
  const offenseFacing = radToFacing(dir === 1 ? 0 : Math.PI);
  const defenseFacing = radToFacing(dir === 1 ? Math.PI : 0);
  for (let t = -pre; t < live; t++) {
    const players = starts.map((p, s) => {
      const off = s < 11;
      let { x, y } = p;
      let state = mode('stance');
      let facing = off ? offenseFacing : defenseFacing;
      if (t < 0) {
        // Last offensive slot motions across the formation before the snap.
        if (s === 10 && t > -pre + 2) { y -= dir * 0.6 * (t + pre - 2); state = mode('run'); facing = radToFacing(dir === 1 ? -Math.PI / 2 : Math.PI / 2); }
      } else {
        const k = t;
        if (s === 5 && !o.kick) { x -= dir * Math.min(k, 8) * 0.8; state = k < 8 ? mode('backpedal') : mode('stance'); }
        else if (s < 5) { state = k > 1 ? mode('engaged') : mode('stance'); x += dir * Math.min(k, 3) * 0.3; }
        else if (s >= 11 && s <= 14) { state = k > 1 ? mode('engaged') : mode('stance'); x -= dir * Math.min(k, 3) * 0.3; }
        else if (s === 9) { x += dir * Math.min(k, catchTick) * 0.9; y -= dir * Math.max(0, k - 12) * 0.4; state = k > tackleTick ? mode('down') : mode('sprint'); }
        else if (off) { x += dir * k * 0.7; state = mode('run'); }
        else { x -= dir * Math.min(k, 6) * 0.4; x += dir * Math.max(0, k - 6) * 0.6; state = mode('run'); }
      }
      return { x, y, facing, state };
    });
    let b: TickSample['ball'];
    const qb = players[5]!, wr = players[9]!;
    if (t < 0) b = { x: losX, y: by, z: 0, kind: ball('deadPreSnap'), carrier: -1 };
    else if (t === 0) b = { x: losX, y: by, z: 0.2, kind: ball('snapInFlight'), carrier: -1 };
    else if (o.kick) {
      const f0 = Math.min(1, Math.max(0, (t - 8) / 40));
      b = t < 8 ? { x: losX - dir * 15, y: by, z: 0.5, kind: ball('held'), carrier: 5 } : { x: losX - dir * 15 + dir * 60 * f0, y: by, z: f0 < 1 ? 4 * 15 * f0 * (1 - f0) : 0, kind: f0 < 1 ? ball('kickInFlight') : ball('loose'), carrier: -1 };
    } else if (t < passTick) b = { x: qb.x, y: qb.y, z: 0.6, kind: ball('held'), carrier: 5 };
    else if (t < catchTick) { const k = (t - passTick) / (catchTick - passTick); b = { x: qb.x + (wr.x - qb.x) * k, y: qb.y + (wr.y - qb.y) * k, z: 1 + 6 * k * (1 - k), kind: ball('passInFlight'), carrier: -1 }; }
    else b = { x: wr.x, y: wr.y, z: 0.5, kind: t > whistleTick ? ball('dead') : ball('held'), carrier: 9 };
    ticks.push({ players, ball: b });
  }
  const at = (tick: number, slot: number) => ticks[tick + pre]!.players[slot]!;
  const events: FilmEvent[] = o.kick
    ? [{ kind: 'snap', tick: 0, x: losX, y: by }, { kind: 'kickLanding', tick: 48, x: losX + dir * 45, y: by }, { kind: 'whistle', tick: live - 2, x: losX + dir * 45, y: by }]
    : [
      { kind: 'snap', tick: 0, x: losX, y: by },
      { kind: 'throw', tick: passTick, x: at(passTick, 5).x, y: at(passTick, 5).y, slots: [5, 9] },
      { kind: 'catch', tick: catchTick, x: at(catchTick, 9).x, y: at(catchTick, 9).y, slots: [9] },
      { kind: 'flag', tick: 20, x: losX + dir * 6, y: by + 3 },
      { kind: 'tackle', tick: tackleTick, x: at(tackleTick, 9).x, y: at(tackleTick, 9).y, slots: [20] },
      { kind: 'whistle', tick: whistleTick, x: at(whistleTick, 9).x, y: at(whistleTick, 9).y },
    ];
  return {
    playId: `fixture-${f.name}-${losX}-${dir}`,
    visibility: 'user-visible',
    ticksPerSecond: 10,
    trajectory: o.layout === 1 ? toLayout1(-pre, ticks, losX, by) : encodeLayout0(-pre, ticks),
    slots: SLOTS_OF(f, offenseSide),
    events,
    situation: { lineOfScrimmageX: losX, lineToGainX: o.kick ? null : losX + dir * 10, attackDir: dir, offenseSide },
  };
}

function toLayout1(first: number, ticks: TickSample[], losX: number, by: number) {
  const turn = (code: number) => (code / 256) * 2 * Math.PI;
  return encodeLayout1(first, 3, ticks.map((t, i) => ({
    players: t.players.map((p) => ({ x: p.x, y: p.y, heading: turn(p.facing), gaze: turn(p.facing), mode: p.state, advantage: p.state === FILM_MOVE_MODES.indexOf('engaged') ? 0.25 : null })),
    ball: { kind: t.ball.kind, x: t.ball.x, y: t.ball.y, height: t.ball.z, carrier: t.ball.carrier },
    officials: [{ x: losX + 12, y: by, gaze: 0 }, { x: losX - 8 + i * 0.05, y: 2, gaze: 1 }, { x: losX - 8, y: 51, gaze: 2 }],
  })));
}

/** Records the calls made on a 2D context. */
export class RecordingContext implements Canvas2DLike {
  fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000000';
  lineWidth = 1; font = ''; textAlign: CanvasTextAlign = 'start'; textBaseline: CanvasTextBaseline = 'alphabetic'; globalAlpha = 1;
  calls = 0;
  texts: { text: string; x: number; y: number; font: string; fill: string }[] = [];
  arcs: { x: number; y: number; r: number }[] = [];
  record = true;
  save() { this.calls++; } restore() { this.calls++; } beginPath() { this.calls++; } closePath() { this.calls++; }
  moveTo() { this.calls++; } lineTo() { this.calls++; }
  arc(x: number, y: number, r: number) { this.calls++; if (this.record) this.arcs.push({ x, y, r }); }
  fill() { this.calls++; } stroke() { this.calls++; } fillRect() { this.calls++; }
  fillText(text: string, x: number, y: number) { this.calls++; if (this.record) this.texts.push({ text, x, y, font: this.font, fill: String(this.fillStyle) }); }
  setLineDash() { this.calls++; } translate() { this.calls++; } rotate() { this.calls++; } scale() { this.calls++; }
  clear() { this.texts = []; this.arcs = []; this.calls = 0; }
}

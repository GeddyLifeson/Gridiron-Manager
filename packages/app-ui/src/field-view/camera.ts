// Camera of the field view (I9.1.1, O2.3.1). One uniform scale and a rotation by a quarter turn:
// no stretching, so every on-screen distance is a J1 distance times the scale. The camera frames the
// play at the snap, then follows the ball with a dead zone so markers do not jitter. On kicks it
// widens to keep the landing spot in frame, easing the scale change.
import { param } from './params.ts';
import type { FrameSample } from './sample.ts';
import type { FieldGeometryLike, Orientation, Zoom, FilmSituation, FilmSide } from './types.ts';
import { FILM_BALL_STATES } from './format.ts';

const KICK_IN_FLIGHT = FILM_BALL_STATES.indexOf('kickInFlight');
/** A new kick target only restarts the ease when the scale differs by more than this share. */
const EASE_RESTART_SHARE = 0.01;

export interface CameraContext {
  readonly geometry: FieldGeometryLike;
  readonly situation: FilmSituation;
  readonly orientation: Orientation;
  readonly zoom: Zoom;
  /** The user's team, for the "my team always moves up" orientation. */
  readonly userSide: FilmSide;
  /** Landing spot of a kick in this play, when the event list has one. */
  readonly kickLanding: { x: number; y: number } | null;
  readonly viewWidthPx: number;
  readonly viewHeightPx: number;
}

/** A box in field-frame yards. */
export interface FieldBox { x0: number; x1: number; y0: number; y1: number }
type Window = FieldBox;

export class Camera {
  /** World unit vectors of screen up and screen right (each component -1, 0 or +1). */
  ux = 1; uy = 0; rx = 0; ry = -1;
  /** Pixels per yard. */
  scale = 1;
  /** World point at the centre of the view. */
  cx = 0; cy = 0;
  private ctx!: CameraContext;
  private easeFrom = 1; private easeTo = 1; private easeLeft = 0;
  private halfLen = 1; private halfWid = 1;
  /** Where the ball sat in the frame at the reset: the camera follows the ball's movement from there. */
  private offX = 0; private offY = 0;

  /** Frames the play from a sample (normally the first tick) with no easing. Call on load and on every seek. */
  reset(ctx: CameraContext, s: FrameSample, keepInFrame: FieldBox | null = null): void {
    this.ctx = ctx;
    this.setAxes();
    const w = this.baseWindow(s, keepInFrame);
    this.applyWindow(w);
    this.easeLeft = 0;
    this.easeFrom = this.easeTo = this.scale;
    this.offX = this.cx - s.ballX; this.offY = this.cy - s.ballY;
  }

  /** Advances the camera to a new sample. `dtS` is display seconds since the last update. */
  update(s: FrameSample, dtS: number): void {
    if (this.ctx.kickLanding && s.ballKind === KICK_IN_FLIGHT) {
      const w = this.fit(this.currentWindow(), s, [this.ctx.kickLanding]);
      const target = this.scaleFor(w);
      if (target < this.easeTo * (1 - EASE_RESTART_SHARE)) {
        this.easeFrom = this.scale; this.easeTo = target; this.easeLeft = param('kickEaseS');
        this.halfLen = (w.x1 - w.x0) / 2; this.halfWid = (w.y1 - w.y0) / 2;
      }
    }
    if (this.easeLeft > 0) {
      const total = param('kickEaseS');
      this.easeLeft = Math.max(0, this.easeLeft - dtS);
      const k = total > 0 ? 1 - this.easeLeft / total : 1;
      this.scale = this.easeFrom + (this.easeTo - this.easeFrom) * k;
    }
    // Follow the ball along the field with a dead zone; across the field only in the tight copy.
    const dz = param('cameraDeadZoneFrac');
    const visLen = this.visibleHalfLength(), visWid = this.visibleHalfWidth();
    this.cx = follow(this.cx, s.ballX + this.offX, visLen * dz);
    if (this.ctx.zoom === 'tight') this.cy = follow(this.cy, s.ballY + this.offY, visWid * dz);
  }

  /** Screen x of a world point, in CSS pixels from the left of the view. */
  sx(wx: number, wy: number): number {
    return this.ctx.viewWidthPx / 2 + this.scale * ((wx - this.cx) * this.rx + (wy - this.cy) * this.ry);
  }
  /** Screen y of a world point, in CSS pixels from the top of the view. */
  sy(wx: number, wy: number): number {
    return this.ctx.viewHeightPx / 2 - this.scale * ((wx - this.cx) * this.ux + (wy - this.cy) * this.uy);
  }
  /** Screen direction (dx, dy) of a world angle; used for facing ticks and triangle points. */
  dirX(rad: number): number { return Math.cos(rad) * this.rx + Math.sin(rad) * this.ry; }
  dirY(rad: number): number { return -(Math.cos(rad) * this.ux + Math.sin(rad) * this.uy); }

  /** True when the world point is inside the view. */
  inView(wx: number, wy: number, marginPx = 0): boolean {
    const x = this.sx(wx, wy), y = this.sy(wx, wy);
    return x >= -marginPx && y >= -marginPx && x <= this.ctx.viewWidthPx + marginPx && y <= this.ctx.viewHeightPx + marginPx;
  }

  get context(): CameraContext { return this.ctx; }

  private setAxes(): void {
    const { orientation, situation, userSide } = this.ctx;
    if (orientation === 'broadcast') { this.ux = 0; this.uy = 1; this.rx = 1; this.ry = 0; return; }
    const userAttacks = userSide === situation.offenseSide ? situation.attackDir : -situation.attackDir;
    const dir = orientation === 'offenseUp' ? situation.attackDir : userAttacks;
    this.ux = dir; this.uy = 0; this.rx = 0; this.ry = -dir;
  }

  /** Field length (x) maps to screen height unless the view is broadcast. */
  private get lengthIsVertical(): boolean { return this.ctx.orientation !== 'broadcast'; }

  private scaleFor(w: Window): number {
    const len = w.x1 - w.x0, wid = w.y1 - w.y0;
    const { viewWidthPx: W, viewHeightPx: H } = this.ctx;
    return this.lengthIsVertical ? Math.min(W / wid, H / len) : Math.min(W / len, H / wid);
  }

  private visibleHalfLength(): number {
    const { viewWidthPx: W, viewHeightPx: H } = this.ctx;
    return (this.lengthIsVertical ? H : W) / this.scale / 2;
  }
  private visibleHalfWidth(): number {
    const { viewWidthPx: W, viewHeightPx: H } = this.ctx;
    return (this.lengthIsVertical ? W : H) / this.scale / 2;
  }

  private currentWindow(): Window {
    return { x0: this.cx - this.halfLen, x1: this.cx + this.halfLen, y0: this.cy - this.halfWid, y1: this.cy + this.halfWid };
  }

  private baseWindow(s: FrameSample, keep: FieldBox | null): Window {
    const { geometry: g, situation, zoom } = this.ctx;
    const m = param('frameMarginYd');
    let w: Window;
    if (zoom === 'tight') {
      const hl = param('tightDepthYd') / 2, hw = param('tightWidthYd') / 2;
      w = { x0: s.ballX - hl, x1: s.ballX + hl, y0: s.ballY - hw, y1: s.ballY + hw };
      return w;
    }
    const half = zoom === 'full' ? param('fullLengthYd') / 2 : param('wideHalfLengthYd');
    const los = situation.lineOfScrimmageX;
    w = { x0: los - half, x1: los + half, y0: -m, y1: g.widthYd + m };
    if (zoom === 'wide') {
      // Widen to keep every player in frame, through the whole pre-snap phase when it is given.
      w = this.fit(w, s, []);
      if (keep) { w.x0 = Math.min(w.x0, keep.x0); w.x1 = Math.max(w.x1, keep.x1); w.y0 = Math.min(w.y0, keep.y0); w.y1 = Math.max(w.y1, keep.y1); }
    }
    // Near a goal line show the end zone in full (O2.3.1 edge case).
    if (w.x0 < g.goalLineWestX) w.x0 = Math.min(w.x0, -m);
    if (w.x1 > g.goalLineEastX) w.x1 = Math.max(w.x1, g.lengthYd + m);
    return w;
  }

  /** Grows a window to hold every player, the ball and extra points, with the frame margin. */
  private fit(w: Window, s: FrameSample, extra: readonly { x: number; y: number }[]): Window {
    const m = param('frameMarginYd') + param('markerDiameterYd') / 2;
    let { x0, x1, y0, y1 } = w;
    const take = (x: number, y: number) => {
      if (x - m < x0) x0 = x - m; if (x + m > x1) x1 = x + m;
      if (y - m < y0) y0 = y - m; if (y + m > y1) y1 = y + m;
    };
    for (let i = 0; i < s.x.length; i++) take(s.x[i]!, s.y[i]!);
    take(s.ballX, s.ballY);
    for (const p of extra) take(p.x, p.y);
    return { x0, x1, y0, y1 };
  }

  private applyWindow(w: Window): void {
    this.cx = (w.x0 + w.x1) / 2; this.cy = (w.y0 + w.y1) / 2;
    this.halfLen = (w.x1 - w.x0) / 2; this.halfWid = (w.y1 - w.y0) / 2;
    this.scale = this.scaleFor(w);
  }
}

function follow(centre: number, target: number, deadHalf: number): number {
  if (target > centre + deadHalf) return target - deadHalf;
  if (target < centre - deadHalf) return target + deadHalf;
  return centre;
}

// The field renderer (I9.1, O2.3.1, O2.3.2, O6.3.1, O6.4.1). It draws one frame of a stored play onto
// any 2D canvas context. It draws only what film shows: positions, facings, movement states, the
// ball, the official's flag and the cues of visible events. It has no access to engine truth beyond
// the trajectory and the filtered event list, so it cannot leak it (I9.3.2, O2.3.3).
import { Camera, type CameraContext, type FieldBox } from './camera.ts';
import { buildCues, activeCues, limitFlashes, switchedOn, cueSwitch, type Cue, type CueSwitches, type FieldContact, type ContactTier } from './cues.ts';
import { decodeTrajectory, FILM_MOVE_MODES, type FilmFrames } from './format.ts';
import { buildMarkings, PRO_MARKINGS, type FieldMarkings, type MarkingSet } from './markings.ts';
import { fillBlockText, blockWidth } from './blockFont.ts';
import { mergeNotes, layoutNotes, type FieldNote, type PlacedNote } from './fieldText.ts';
import { buildParticles, wetTint, type CosmeticDraw, type FieldWeather, type WeatherParticles } from './weather.ts';
import { markerFor, positionLetter, DEFAULT_MARKERS, type MarkerStyle, type MarkerTable } from './markers.ts';
import { param } from './params.ts';
import { newSample, sampleFrames, type FrameSample } from './sample.ts';
import { fieldPalette, inkOn, mixColour, contrastRatio, type FieldPalette, type ResolvedColours } from './colours.ts';
import type { FieldGeometryLike, FilmPlay, FilmSide, Orientation, PlaybackMode, Zoom } from './types.ts';

/** The subset of CanvasRenderingContext2D the renderer uses, so tests can record the calls. */
export interface Canvas2DLike {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  setLineDash(segments: number[]): void;
  translate(x: number, y: number): void;
  rotate(a: number): void;
  scale(x: number, y: number): void;
}

export interface RenderOptions {
  readonly mode: PlaybackMode;
  readonly orientation: Orientation;
  readonly zoom: Zoom;
  readonly userSide: FilmSide;
  readonly colours: ResolvedColours;
  /** Token colours for the theme and colour-vision setting (O5, O6.2.1). Default: light theme. */
  readonly palette?: FieldPalette;
  readonly showPositionLetters?: boolean;
  readonly markers?: MarkerTable;
  readonly markings?: MarkingSet;
  /** Mowing stripes every 5 yd (plan 3.1). Off in the high-contrast theme. Default on. */
  readonly stripes?: boolean;
  /** Generated team names painted in each end zone, by the side that defends it (A6: generated text only). */
  readonly endZones?: { readonly west?: EndZoneMark; readonly east?: EndZoneMark };
  /** Public field text for this play, for example the result yards or "UNDER REVIEW" (O2.3.5, MB-4). Flags add "FLAG" themselves. */
  readonly notes?: readonly FieldNote[];
  /** The engine's conditions for the play (J12, presentation feed). Rain and snow draw only with `cosmetic`. */
  readonly weather?: FieldWeather;
  /** The play's `cosmetic.display` stream (PV-01). The only source of particle spots. */
  readonly cosmetic?: CosmeticDraw;
  /** Draws rain and snow particles; the wet tint stays. Off in the high-contrast theme. Default on. */
  readonly weatherParticles?: boolean;
  /**
   * The feed's contact cues for the play (PV-00). When given (even empty), contact bars come only from
   * these, weighted by the engine's tier; when absent (the feed lists `contactTier` missing) the bar
   * falls back to two engaged markers touching, drawn at the lightest weight.
   */
  readonly contacts?: readonly FieldContact[];
  /** Per-cue settings switches by cue-table key (MB-17). Missing keys are on. */
  readonly cueSwitches?: CueSwitches;
  /** Playback speed, for the flash limiter (display time). Default 1; see `setSpeed`. */
  readonly speed?: number;
}

/** A team name in an end zone, in that team's colour. */
export interface EndZoneMark { readonly text: string; readonly side: FilmSide }

/** The dead-ball spot after the whistle (MB-3): drawn with the gained line until the next snap. */
export interface Aftermath { readonly fromTick: number; readonly x: number; readonly y: number }

export class OverlaySourceError extends Error {}

const ENGAGED = FILM_MOVE_MODES.indexOf('engaged');
const DOWN = FILM_MOVE_MODES.indexOf('down');
const TWO_PI = 2 * Math.PI;
const TRAIL_GHOSTS = 2;
const SHADOW_ALPHA = 0.35;
const GHOST_ALPHA = 0.3;
const LABEL_GAP_PX = 2;

interface SlotLook { style: MarkerStyle; group: string; offense: boolean; jersey: string; letter: string; side: FilmSide }

export class FieldRenderer {
  readonly frames: FilmFrames;
  readonly camera = new Camera();
  readonly sample: FrameSample;
  private readonly allCues: Cue[];
  private cues: Cue[] = [];
  private droppedCues: Cue[] = [];
  private bars: { tier: ContactTier | 0; widthPx: number }[] = [];
  private readonly cueBuf: Cue[] = [];
  private readonly markings: FieldMarkings;
  private readonly looks: SlotLook[];
  private readonly presnapBox: FieldBox | null;
  private readonly labelLift: Float64Array;
  private readonly passTargets = new Map<Cue, { x: number; y: number }>();
  private readonly after: Aftermath;
  private readonly notes: readonly FieldNote[];
  private readonly particles: WeatherParticles | null;
  private readonly stripeColour: string;
  private placed: PlacedNote[] = [];
  private opts: RenderOptions;
  private pal: FieldPalette;
  private ink: [string, string];
  private viewW = 1; private viewH = 1;

  constructor(readonly play: FilmPlay, readonly geometry: FieldGeometryLike, opts: RenderOptions) {
    // I9.3.2: in a game every drawn source carries the user-visible tag. Checked at run time too,
    // because the read model reaches the view across a worker boundary.
    if ((opts.mode === 'live' || opts.mode === 'replay') && (play as { visibility?: string }).visibility !== 'user-visible') {
      throw new OverlaySourceError(`play ${play.playId} is not tagged user-visible; the field view refuses it during a game`);
    }
    this.opts = opts;
    this.pal = opts.palette ?? fieldPalette();
    this.ink = [inkOn(opts.colours.sides[0], this.pal), inkOn(opts.colours.sides[1], this.pal)];
    this.frames = decodeTrajectory(play.trajectory);
    if (play.slots.length !== this.frames.slotCount) throw new Error(`play ${play.playId} lists ${play.slots.length} slots, the trajectory has ${this.frames.slotCount}`);
    this.sample = newSample(this.frames.slotCount, this.frames.officialCount);
    this.labelLift = new Float64Array(this.frames.slotCount);
    this.allCues = buildCues(play.events, play.ticksPerSecond, opts.contacts ?? []);
    this.applyLimits(opts.speed ?? 1);
    this.markings = buildMarkings(geometry, opts.markings ?? PRO_MARKINGS);
    const table = opts.markers ?? DEFAULT_MARKERS;
    this.looks = [...play.slots].sort((a, b) => a.slot - b.slot).map((s) => {
      const offense = s.side === play.situation.offenseSide;
      const { style, group } = markerFor(s.role, offense, table);
      return { style, group, offense, jersey: String(s.jersey), letter: positionLetter(s.role), side: s.side };
    });
    this.presnapBox = this.computePresnapBox();
    for (const c of this.allCues) {
      const target = c.event.slots?.[1];
      if (c.shape === 'passLine' && target !== undefined) {
        const i = (Math.min(Math.max(c.event.tick - this.frames.firstTick, 0), this.frames.tickCount - 1)) * this.frames.slotCount + target;
        this.passTargets.set(c, { x: this.frames.x[i]!, y: this.frames.y[i]! });
      }
    }
    this.after = this.computeAftermath();
    this.notes = [
      ...play.events.filter((e) => e.kind === 'flag').map((e) => ({ text: 'FLAG', x: e.x, y: e.y, fromTick: e.tick })),
      ...(opts.notes ?? []),
    ];
    this.particles = buildParticles(opts.weather, opts.cosmetic);
    this.stripeColour = mixColour(this.pal.turf, this.pal.lines, param('stripeMix'));
    sampleFrames(this.frames, this.frames.firstTick, this.sample);
  }

  /** The whistle's tick (else the last stored tick) and the ball's spot there. */
  private computeAftermath(): Aftermath {
    const f = this.frames;
    const last = f.firstTick + f.tickCount - 1;
    const w = this.play.events.find((e) => e.kind === 'whistle');
    const tick = Math.min(Math.max(w ? w.tick : last, f.firstTick), last);
    const probe = newSample(f.slotCount, f.officialCount);
    sampleFrames(f, tick, probe);
    return { fromTick: tick, x: probe.ballX, y: probe.ballY };
  }

  /** Sets the view size in CSS pixels and frames the play at `tick` (normally on load and on seek). */
  resize(widthPx: number, heightPx: number, tick = this.sample.tick): void {
    this.viewW = widthPx; this.viewH = heightPx;
    this.reframe(tick);
  }

  /** Changes orientation or zoom; reframes at the current tick. */
  setView(orientation: Orientation, zoom: Zoom): void {
    this.opts = { ...this.opts, orientation, zoom };
    this.reframe(this.sample.tick);
  }

  /** Reframes without easing, for a seek or step. */
  reframe(tick: number): void {
    sampleFrames(this.frames, tick, this.sample);
    this.camera.reset(this.cameraContext(), this.sample, this.presnapBox);
  }

  /** Samples tick time `t` and moves the camera. `dtS` is display seconds since the last frame. */
  update(t: number, dtS: number): void {
    sampleFrames(this.frames, t, this.sample);
    this.camera.update(this.sample, dtS);
  }

  /** Test hook: the world position the marker of `slot` is drawn at (O2.3.4 acceptance 1). */
  markerWorld(slot: number): { x: number; y: number } { return { x: this.sample.x[slot]!, y: this.sample.y[slot]! }; }
  /** Test hook: the screen position of the marker of `slot`, in CSS pixels. */
  markerScreen(slot: number): { x: number; y: number } {
    const wx = this.sample.x[slot]!, wy = this.sample.y[slot]!;
    return { x: this.camera.sx(wx, wy), y: this.camera.sy(wx, wy) };
  }
  /** Switches and the flash limiter at a playback speed (call when the speed changes). */
  setSpeed(speed: number): void { this.applyLimits(speed); }

  private applyLimits(speed: number): void {
    const { kept, dropped } = limitFlashes(switchedOn(this.allCues, this.opts.cueSwitches), this.play.ticksPerSecond, speed);
    this.cues = kept; this.droppedCues = dropped;
  }

  /** Test hook: cues the flash limiter refused at the current speed. */
  cuesDropped(): readonly Cue[] { return this.droppedCues; }
  /** Test hook: contact bars drawn by the last draw, with tier (0 for the untiered fallback) and width. */
  contactBars(): readonly { tier: ContactTier | 0; widthPx: number }[] { return this.bars; }
  /** Test hook: cues on screen now. */
  cuesShown(): Cue[] { return this.cueBuf.slice(0, activeCues(this.cues, this.sample.tick, this.cueBuf)); }
  /** Test hook: the dead-ball spot and gained line, when shown at the current tick (MB-3). */
  aftermathShown(): Aftermath | null { return this.sample.tick >= this.after.fromTick ? this.after : null; }
  /** Test hook: field text boxes placed by the last draw, in CSS pixels (MB-4). */
  notesPlaced(): readonly PlacedNote[] { return this.placed; }
  /** Test hook: the play's weather particles (spots fixed for the play). */
  weatherParticles(): WeatherParticles | null { return this.particles; }
  /** Marker diameter on screen in CSS pixels. */
  markerPx(): number { return param('markerDiameterYd') * this.camera.scale; }

  draw(ctx: Canvas2DLike): void {
    const cam = this.camera;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.fillStyle = this.pal.surround;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    this.drawField(ctx);
    this.drawSituationLines(ctx);
    this.drawAftermath(ctx);
    this.drawWeather(ctx);
    const d = param('markerDiameterYd');
    const r = (d / 2) * cam.scale;
    this.drawEngagements(ctx, r);
    this.drawTrails(ctx, r);
    this.drawOfficials(ctx, r);
    for (let s = 0; s < this.looks.length; s++) this.drawMarker(ctx, s, r);
    this.drawBall(ctx, r);
    this.drawCues(ctx, r);
    this.drawLabels(ctx, r);
    this.drawNotes(ctx);
    ctx.restore();
  }

  private cameraContext(): CameraContext {
    const kick = this.play.events.find((e) => e.kind === 'kickLanding');
    return {
      geometry: this.geometry, situation: this.play.situation, orientation: this.opts.orientation, zoom: this.opts.zoom,
      userSide: this.opts.userSide, kickLanding: kick ? { x: kick.x, y: kick.y } : null,
      viewWidthPx: this.viewW, viewHeightPx: this.viewH,
    };
  }

  private computePresnapBox(): FieldBox | null {
    const f = this.frames;
    const snapIdx = Math.min(Math.max(-f.firstTick, 0), f.tickCount - 1);
    const m = param('frameMarginYd') + param('markerDiameterYd') / 2;
    const box: FieldBox = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (let t = 0; t <= snapIdx; t++) {
      for (let s = 0; s < f.slotCount; s++) {
        const i = t * f.slotCount + s, x = f.x[i]!, y = f.y[i]!;
        if (x - m < box.x0) box.x0 = x - m; if (x + m > box.x1) box.x1 = x + m;
        if (y - m < box.y0) box.y0 = y - m; if (y + m > box.y1) box.y1 = y + m;
      }
    }
    return Number.isFinite(box.x0) ? box : null;
  }

  private line(ctx: Canvas2DLike, x0: number, y0: number, x1: number, y1: number): void {
    const c = this.camera;
    ctx.moveTo(c.sx(x0, y0), c.sy(x0, y0));
    ctx.lineTo(c.sx(x1, y1), c.sy(x1, y1));
  }

  private polygon(ctx: Canvas2DLike, pts: readonly number[]): void {
    const c = this.camera;
    ctx.moveTo(c.sx(pts[0]!, pts[1]!), c.sy(pts[0]!, pts[1]!));
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(c.sx(pts[i]!, pts[i + 1]!), c.sy(pts[i]!, pts[i + 1]!));
    ctx.closePath();
  }

  private drawField(ctx: Canvas2DLike): void {
    const g = this.geometry, mk = this.markings, s = this.camera.scale;
    ctx.fillStyle = this.pal.turf;
    ctx.beginPath(); this.polygon(ctx, [0, 0, g.lengthYd, 0, g.lengthYd, g.widthYd, 0, g.widthYd]); ctx.fill();
    if (this.opts.stripes !== false) {
      ctx.fillStyle = this.stripeColour;
      ctx.beginPath();
      for (const [x0, x1] of mk.stripes) this.polygon(ctx, [x0, 0, x1, 0, x1, g.widthYd, x0, g.widthYd]);
      ctx.fill();
    }
    ctx.fillStyle = this.pal.endZone;
    for (const [x0, x1] of mk.endZones) { ctx.beginPath(); this.polygon(ctx, [x0, 0, x1, 0, x1, g.widthYd, x0, g.widthYd]); ctx.fill(); }
    const wet = wetTint(this.opts.weather);
    if (wet > 0) {
      // Rain darkens the turf, snow lightens it; lines are drawn after, at full strength.
      ctx.globalAlpha = wet;
      ctx.fillStyle = this.opts.weather!.precip.endsWith('snow') ? this.pal.lines : this.pal.shadow;
      ctx.beginPath(); this.polygon(ctx, [0, 0, g.lengthYd, 0, g.lengthYd, g.widthYd, 0, g.widthYd]); ctx.fill();
      ctx.globalAlpha = 1;
    }
    this.drawEndZoneNames(ctx);
    ctx.strokeStyle = this.pal.lines;
    // Lines are drawn about 4 inches wide (Rule 1-2-1) but never thinner than one pixel.
    ctx.lineWidth = Math.max(1, s / 9);
    ctx.beginPath();
    for (let i = 0; i < mk.lines.length; i += 4) this.line(ctx, mk.lines[i]!, mk.lines[i + 1]!, mk.lines[i + 2]!, mk.lines[i + 3]!);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, s / 12);
    ctx.beginPath();
    for (let i = 0; i < mk.ticks.length; i += 4) this.line(ctx, mk.ticks[i]!, mk.ticks[i + 1]!, mk.ticks[i + 2]!, mk.ticks[i + 3]!);
    ctx.stroke();
    // Goal posts from above: the crossbar in the plane of the end line.
    ctx.strokeStyle = this.pal.flag;
    ctx.lineWidth = Math.max(2, s / 4);
    ctx.beginPath();
    for (const [x, y0, y1] of mk.posts) this.line(ctx, x, y0, x, y1);
    ctx.stroke();
    // Yard numbers in painted block stencil (plan 2.1), bottoms toward the near sideline, 2 yd tall.
    const px = mk.numeralLengthYd * s;
    if (px >= 6) {
      ctx.fillStyle = this.pal.numbers;
      const southRad = -Math.PI / 2;
      for (const n of mk.numbers) this.paintText(ctx, n.text, n.x, n.y, px, n.bottomToward === 'south' ? southRad : -southRad);
    }
  }

  /** Block text painted on the field at a world spot, `px` tall, letter bottoms toward `towardRad`. */
  private paintText(ctx: Canvas2DLike, text: string, x: number, y: number, px: number, towardRad: number): void {
    const dx = this.camera.dirX(towardRad), dy = this.camera.dirY(towardRad);
    ctx.save();
    ctx.translate(this.camera.sx(x, y), this.camera.sy(x, y));
    ctx.rotate(Math.atan2(-dx, dy));
    fillBlockText(ctx, text, px);
    ctx.restore();
  }

  /**
   * Team names across each end zone in block letters, bottoms toward the field of play, kept the
   * decoration clearance from every line (NCAA 1-2-1-d). A colour under 3:1 on the end zone falls back
   * to the line colour (I9.1.1), so the name never disappears.
   */
  private drawEndZoneNames(ctx: Canvas2DLike): void {
    const ez = this.opts.endZones;
    if (!ez) return;
    const g = this.geometry, mk = this.markings, s = this.camera.scale, clear = mk.endZoneClearYd;
    const marks: [EndZoneMark | undefined, readonly [number, number], number][] = [[ez.west, mk.endZones[0]!, 0], [ez.east, mk.endZones[1]!, Math.PI]];
    for (const [mark, [x0, x1], toward] of marks) {
      if (!mark || !mark.text.trim()) continue;
      const depth = Math.max(0, x1 - x0 - 2 * clear), span = Math.max(0, g.widthYd - 2 * clear);
      const perHeight = blockWidth(mark.text, 1);
      const hYd = Math.min(depth * param('endZoneTextFrac'), perHeight > 0 ? span / perHeight : depth);
      if (hYd * s < 4) continue;
      const colour = this.opts.colours.sides[mark.side];
      ctx.fillStyle = contrastRatio(colour, this.pal.endZone) >= param('minContrast') ? colour : this.pal.lines;
      this.paintText(ctx, mark.text, (x0 + x1) / 2, g.centreY, hYd * s, toward);
    }
  }

  /** After the whistle: the gained line across the field at the dead-ball spot, and the spot itself (MB-3). */
  private drawAftermath(ctx: Canvas2DLike): void {
    const a = this.aftermathShown();
    if (!a) return;
    const g = this.geometry, cam = this.camera, r = Math.max(3, cam.scale * 0.4);
    ctx.strokeStyle = this.pal.cue;
    ctx.lineWidth = Math.max(1.5, cam.scale / 6);
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); this.line(ctx, a.x, 0, a.x, g.widthYd); ctx.stroke();
    ctx.setLineDash([]);
    const x = cam.sx(a.x, a.y), y = cam.sy(a.x, a.y);
    ctx.fillStyle = this.pal.lines; ctx.strokeStyle = this.pal.shadow; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  /** Rain streaks or snow flakes over the view, moving with play time and the engine's wind. */
  private drawWeather(ctx: Canvas2DLike): void {
    const p = this.particles;
    if (!p || this.opts.weatherParticles === false) return;
    const cam = this.camera, W = this.viewW, H = this.viewH, sec = this.sample.tick / this.play.ticksPerSecond;
    const wx = cam.dirX(p.windRad), wy = cam.dirY(p.windRad), drift = p.windMph * param('windDriftPerMph');
    const fall = p.kind === 'rain' ? param('rainFallPerS') : param('snowFallPerS');
    const du = wx * drift * sec, dv = (fall + wy * drift) * sec;
    const wrap = (v: number) => v - Math.floor(v);
    ctx.globalAlpha = param('weatherAlpha');
    if (p.kind === 'rain') {
      // Streak along the motion: straight down the screen plus the wind's push.
      const mx = wx * drift, my = fall + wy * drift, len = Math.hypot(mx, my) || 1, k = param('streakPx') / len;
      ctx.strokeStyle = this.pal.lines; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < p.u.length; i++) {
        const x = wrap(p.u[i]! + du) * W, y = wrap(p.v[i]! + dv) * H;
        ctx.moveTo(x, y); ctx.lineTo(x - mx * k, y - my * k);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = this.pal.lines;
      for (let i = 0; i < p.u.length; i++) ctx.fillRect(wrap(p.u[i]! + du) * W - 1.5, wrap(p.v[i]! + dv) * H - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  /** Field text: one pixel size at any zoom, merged repeats, never stacked (MB-4). */
  private drawNotes(ctx: Canvas2DLike): void {
    const merged = mergeNotes(this.notes, this.sample.tick);
    const cam = this.camera, px = param('fieldTextPx');
    this.placed = layoutNotes(merged, (x, y) => ({ x: cam.sx(x, y), y: cam.sy(x, y) }), px, param('fieldTextGapPx'));
    for (const b of this.placed) {
      // A shadow plate under caption text, the period character-generator look (plan 2.1).
      ctx.globalAlpha = 0.75; ctx.fillStyle = this.pal.shadow;
      ctx.fillRect(b.cx - b.w / 2, b.cy - b.h / 2, b.w, b.h);
      ctx.globalAlpha = 1; ctx.fillStyle = this.pal.lines;
      ctx.save(); ctx.translate(b.cx, b.cy); fillBlockText(ctx, b.text, px); ctx.restore();
    }
  }

  private drawSituationLines(ctx: Canvas2DLike): void {
    const g = this.geometry, st = this.play.situation;
    ctx.lineWidth = Math.max(2, this.camera.scale / 4);
    ctx.strokeStyle = this.pal.scrimmage;
    ctx.beginPath(); this.line(ctx, st.lineOfScrimmageX, 0, st.lineOfScrimmageX, g.widthYd); ctx.stroke();
    if (st.lineToGainX !== null) {
      ctx.strokeStyle = this.pal.lineToGain;
      ctx.beginPath(); this.line(ctx, st.lineToGainX, 0, st.lineToGainX, g.widthYd); ctx.stroke();
    }
  }

  /** Bar weight for a contact tier (MB-2): heavier hits draw a thicker bar; tier 0 is the untiered fallback. */
  private barWidth(tier: ContactTier | 0, r: number): number {
    return Math.max(1 + tier, r * param('contactBarPerTier') * Math.max(1, tier));
  }

  /** Contact bars: from the feed's tiered contacts when the feed has them, else from engaged markers. */
  private drawEngagements(ctx: Canvas2DLike, r: number): void {
    this.bars = [];
    if (this.opts.cueSwitches?.[cueSwitch('contact', 1)] === false) return;
    if (this.opts.contacts) { this.drawContactBars(ctx, r); return; }
    this.drawEngagedFallback(ctx, r);
  }

  private drawContactBars(ctx: Canvas2DLike, r: number): void {
    const n = activeCues(this.cues, this.sample.tick, this.cueBuf);
    const s = this.sample, cam = this.camera;
    ctx.strokeStyle = this.pal.cue;
    for (let k = 0; k < n; k++) {
      const c = this.cueBuf[k]!;
      if (c.shape !== 'contact') continue;
      const e = c.event, tier = c.tier!;
      const w = this.barWidth(tier, r);
      ctx.lineWidth = w;
      ctx.beginPath();
      const [a, b] = e.slots ?? [];
      if (a !== undefined && b !== undefined && a < s.x.length && b < s.x.length) {
        ctx.moveTo(cam.sx(s.x[a]!, s.y[a]!), cam.sy(s.x[a]!, s.y[a]!)); ctx.lineTo(cam.sx(s.x[b]!, s.y[b]!), cam.sy(s.x[b]!, s.y[b]!));
      } else {
        // One body named: a short bar across the contact spot.
        const x = cam.sx(e.x, e.y), y = cam.sy(e.x, e.y);
        ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
      }
      ctx.stroke();
      this.bars.push({ tier, widthPx: w });
    }
  }

  /** Contact bar between two engaged opponents whose markers touch (O2.3.2). Both must be reported engaged. */
  private drawEngagedFallback(ctx: Canvas2DLike, r: number): void {
    const s = this.sample, cam = this.camera, reach = param('engageContactYd');
    ctx.strokeStyle = this.pal.cue;
    ctx.lineWidth = this.barWidth(0, r);
    ctx.beginPath();
    for (let i = 0; i < this.looks.length; i++) {
      if (s.state[i] !== ENGAGED || !this.looks[i]!.offense) continue;
      let best = -1, bestD = reach * reach;
      for (let j = 0; j < this.looks.length; j++) {
        if (s.state[j] !== ENGAGED || this.looks[j]!.offense) continue;
        const dx = s.x[i]! - s.x[j]!, dy = s.y[i]! - s.y[j]!, dd = dx * dx + dy * dy;
        if (dd <= bestD) { bestD = dd; best = j; }
      }
      if (best >= 0) {
        ctx.moveTo(cam.sx(s.x[i]!, s.y[i]!), cam.sy(s.x[i]!, s.y[i]!)); ctx.lineTo(cam.sx(s.x[best]!, s.y[best]!), cam.sy(s.x[best]!, s.y[best]!));
        this.bars.push({ tier: 0, widthPx: ctx.lineWidth });
      }
    }
    ctx.stroke();
  }

  /** Pre-snap motion: two ghost positions taken from the stored ticks just before (O2.3.2). */
  private drawTrails(ctx: Canvas2DLike, r: number): void {
    const f = this.frames, s = this.sample, cam = this.camera;
    if (s.tick >= 0) return;
    const ti = Math.floor(s.tick - f.firstTick);
    if (ti < TRAIL_GHOSTS) return;
    const min = param('motionTrailMinYd');
    ctx.globalAlpha = GHOST_ALPHA;
    for (let slot = 0; slot < f.slotCount; slot++) {
      const a = (ti - TRAIL_GHOSTS) * f.slotCount + slot, b = ti * f.slotCount + slot;
      const dx = f.x[b]! - f.x[a]!, dy = f.y[b]! - f.y[a]!;
      if (dx * dx + dy * dy < min * min) continue;
      ctx.fillStyle = this.opts.colours.sides[this.looks[slot]!.side];
      for (let k = 1; k <= TRAIL_GHOSTS; k++) {
        const i = (ti - k) * f.slotCount + slot;
        ctx.beginPath(); ctx.arc(cam.sx(f.x[i]!, f.y[i]!), cam.sy(f.x[i]!, f.y[i]!), r * 0.8, 0, TWO_PI); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawMarker(ctx: Canvas2DLike, slot: number, r: number): void {
    const look = this.looks[slot]!, s = this.sample, cam = this.camera;
    const sx = cam.sx(s.x[slot]!, s.y[slot]!), sy = cam.sy(s.x[slot]!, s.y[slot]!);
    const colour = this.opts.colours.sides[look.side];
    const st = look.style;
    // Hips for the body (lying down), eyes for the facing tick: film shows the helmet (J1.6.2).
    const heading = s.headingRad[slot]!, gaze = s.gazeRad[slot]!;
    const hdx = cam.dirX(heading), hdy = cam.dirY(heading);
    const fdx = cam.dirX(gaze), fdy = cam.dirY(gaze);
    ctx.save();
    ctx.translate(sx, sy);
    if (s.state[slot] === DOWN) {
      // Flatten across the facing direction: the marker lies down.
      const a = Math.atan2(hdy, hdx);
      ctx.rotate(a); ctx.scale(param('downFlatten'), 1); ctx.rotate(-a);
    }
    const rr = st.shape === 'smallSquare' ? r * 0.7 : r;
    ctx.beginPath();
    if (st.shape === 'circle') ctx.arc(0, 0, rr, 0, TWO_PI);
    else if (st.shape === 'square' || st.shape === 'smallSquare') { ctx.moveTo(-rr, -rr); ctx.lineTo(rr, -rr); ctx.lineTo(rr, rr); ctx.lineTo(-rr, rr); ctx.closePath(); }
    else if (st.shape === 'diamond') { ctx.moveTo(0, -rr); ctx.lineTo(rr, 0); ctx.lineTo(0, rr); ctx.lineTo(-rr, 0); ctx.closePath(); }
    else {
      // Triangle pointing at the offense (O6.3.1).
      const toward = this.play.situation.attackDir === 1 ? Math.PI : 0;
      const tx = cam.dirX(toward), ty = cam.dirY(toward);
      const nx = -ty, ny = tx;
      ctx.moveTo(tx * rr, ty * rr);
      ctx.lineTo(-tx * rr * 0.7 + nx * rr * 0.9, -ty * rr * 0.7 + ny * rr * 0.9);
      ctx.lineTo(-tx * rr * 0.7 - nx * rr * 0.9, -ty * rr * 0.7 - ny * rr * 0.9);
      ctx.closePath();
    }
    ctx.fillStyle = st.fill === 'filled' ? colour : this.pal.turf;
    ctx.fill();
    // A side whose colour cannot reach 3:1 on this turf is outlined in the line colour (I9.1.1).
    ctx.strokeStyle = this.opts.colours.outlined[look.side] ? this.pal.lines : colour;
    ctx.lineWidth = Math.max(1.5, r * (st.outline === 'heavy' ? 0.45 : 0.2));
    ctx.stroke();
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    if (st.mark === 'bar') { ctx.lineWidth = Math.max(1, r * 0.2); ctx.beginPath(); ctx.moveTo(-rr * 1.2, rr * 1.25); ctx.lineTo(rr * 1.2, rr * 1.25); ctx.stroke(); }
    else if (st.mark === 'dot') { ctx.beginPath(); ctx.arc(rr * 0.85, -rr * 0.85, Math.max(1.5, r * 0.22), 0, TWO_PI); ctx.fill(); }
    // Facing tick: a short line from the edge in the facing direction (helmet direction on film).
    const tick = param('facingTickYd') * cam.scale * 0.5;
    ctx.lineWidth = Math.max(1.5, r * 0.18);
    ctx.beginPath(); ctx.moveTo(fdx * rr, fdy * rr); ctx.lineTo(fdx * (rr + tick), fdy * (rr + tick)); ctx.stroke();
    ctx.restore();
  }

  /** Officials as small striped squares (they are on film; J1.6.2 records them). */
  private drawOfficials(ctx: Canvas2DLike, r: number): void {
    const s = this.sample, cam = this.camera, h = r * 0.6;
    for (let k = 0; k < s.officialX.length; k++) {
      const x = cam.sx(s.officialX[k]!, s.officialY[k]!), y = cam.sy(s.officialX[k]!, s.officialY[k]!);
      ctx.fillStyle = this.pal.officialLight; ctx.fillRect(x - h, y - h, 2 * h, 2 * h);
      ctx.fillStyle = this.pal.officialDark; ctx.fillRect(x - h / 3, y - h, (2 * h) / 3, 2 * h);
    }
  }

  private drawBall(ctx: Canvas2DLike, r: number): void {
    const s = this.sample, cam = this.camera;
    if (s.ballCarrier >= 0) {
      const c = s.ballCarrier;
      ctx.strokeStyle = this.pal.flag;
      ctx.lineWidth = Math.max(1.5, r * 0.2);
      ctx.beginPath(); ctx.arc(cam.sx(s.x[c]!, s.y[c]!), cam.sy(s.x[c]!, s.y[c]!), r * 1.45, 0, TWO_PI); ctx.stroke();
    }
    const z = Math.max(0, s.ballZ);
    const br = (param('ballDiameterYd') / 2) * cam.scale * (1 + z * param('ballGrowPerYd'));
    const bx = cam.sx(s.ballX, s.ballY), by = cam.sy(s.ballX, s.ballY);
    if (z > 0) {
      const off = z * param('ballShadowPerYd') * cam.scale;
      ctx.globalAlpha = SHADOW_ALPHA; ctx.fillStyle = this.pal.shadow;
      ctx.beginPath(); ctx.arc(bx + off, by + off, br, 0, TWO_PI); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = this.pal.ball; ctx.strokeStyle = this.pal.ballEdge; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(bx, by, Math.max(2, br), 0, TWO_PI); ctx.fill(); ctx.stroke();
  }

  private drawCues(ctx: Canvas2DLike, r: number): void {
    const n = activeCues(this.cues, this.sample.tick, this.cueBuf);
    const cam = this.camera;
    for (let i = 0; i < n; i++) {
      const c = this.cueBuf[i]!, e = c.event;
      const x = cam.sx(e.x, e.y), y = cam.sy(e.x, e.y);
      ctx.lineWidth = Math.max(1.5, r * 0.25);
      switch (c.shape) {
        case 'passLine': {
          const t = this.passTargets.get(c);
          if (!t) break;
          ctx.strokeStyle = this.pal.cue; ctx.setLineDash([2, 4]);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cam.sx(t.x, t.y), cam.sy(t.x, t.y)); ctx.stroke();
          ctx.setLineDash([]);
          break;
        }
        case 'ring': ctx.strokeStyle = this.pal.cue; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, TWO_PI); ctx.stroke(); break;
        case 'cross':
          ctx.strokeStyle = this.pal.cue; ctx.beginPath();
          ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke(); break;
        case 'openRing':
          // Dropped pass: the catch ring left open, so it never reads as a catch in greyscale.
          ctx.strokeStyle = this.pal.cue; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0.25 * Math.PI, 1.75 * Math.PI); ctx.stroke(); break;
        case 'looseRing':
          // Loose ball (A-4): a dashed ring at the fumble spot, steady for the cue's life (no flash).
          ctx.strokeStyle = this.pal.cue; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.arc(x, y, r * 2, 0, TWO_PI); ctx.stroke(); ctx.setLineDash([]); break;
        case 'contact': break; // drawn under the markers by drawEngagements
        case 'flag':
          // The flag at its spot, with no name until the announcement (I7.1.2).
          ctx.fillStyle = this.pal.flag; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill(); break;
        case 'whistle':
          ctx.strokeStyle = this.pal.cue; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TWO_PI); ctx.stroke();
          ctx.beginPath(); ctx.arc(x, y, r * 2.8, 0, TWO_PI); ctx.stroke(); break;
        case 'boundary':
          ctx.strokeStyle = this.pal.cue; ctx.beginPath(); ctx.moveTo(x - r * 1.5, y); ctx.lineTo(x + r * 1.5, y); ctx.stroke(); break;
      }
    }
  }

  /** Jersey numbers inside markers, or as larger labels above them when markers are small (O2.3.2). */
  private drawLabels(ctx: Canvas2DLike, r: number): void {
    const s = this.sample, cam = this.camera, n = this.looks.length;
    const small = 2 * r < param('markerMinPx');
    const fontPx = small ? param('overlayLabelPx') : Math.max(8, r * 1.1);
    const d2 = (param('markerDiameterYd')) ** 2;
    // Two markers closer than one diameter: lift the later one's label so both stay readable.
    this.labelLift.fill(0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = s.x[i]! - s.x[j]!, dy = s.y[i]! - s.y[j]!;
      if (dx * dx + dy * dy < d2 && this.labelLift[j] === this.labelLift[i]) this.labelLift[j] = this.labelLift[i]! + 1;
    }
    ctx.font = `bold ${Math.round(fontPx)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const look = this.looks[i]!;
      const x = cam.sx(s.x[i]!, s.y[i]!), y = cam.sy(s.x[i]!, s.y[i]!);
      const lift = this.labelLift[i]! * (fontPx + LABEL_GAP_PX);
      const colour = this.opts.colours.sides[look.side];
      if (small || lift > 0) {
        ctx.fillStyle = colour;
        ctx.fillText(look.jersey, x, y - r - fontPx / 2 - LABEL_GAP_PX - lift);
      } else {
        ctx.fillStyle = look.style.fill === 'filled' ? this.ink[look.side] : colour;
        ctx.fillText(look.jersey, x, y);
      }
      if (this.opts.showPositionLetters) {
        ctx.fillStyle = colour;
        ctx.textAlign = 'left';
        ctx.fillText(look.letter, x + r + LABEL_GAP_PX, y + r);
        ctx.textAlign = 'center';
      }
    }
  }
}

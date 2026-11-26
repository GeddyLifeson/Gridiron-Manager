// Film overlays (N1.1.2, O2.6.2). Layers a coach draws on film: the play as called (own team only),
// each player's actual path, staff or user guesses (dashed, labelled with who drew them), the user's
// telestration, and the clock from snap to throw. Nothing here draws a probability, an engagement bar
// or a player's value (O2.6.2 rules); the inputs hold none.
import type { Canvas2DLike } from '../../field-view/index.ts';
import type { FilmFrames } from '../../field-view/index.ts';
import type { AnnotationLike, FilmEventLike, OverlayLineLike, PointLike } from './types.ts';

export const OVERLAY_LAYERS = ['assignments', 'paths', 'guesses', 'telestration', 'throwClock'] as const;
export type OverlayLayer = (typeof OVERLAY_LAYERS)[number];

/** Toggle keys (O2.6.2 "toggle keys"); free letters next to the O2.6.1 transport keys. */
export const OVERLAY_KEYS: Readonly<Record<string, OverlayLayer>> = { a: 'assignments', p: 'paths', g: 'guesses', t: 'telestration', c: 'throwClock' };

export const LEGEND: Readonly<Record<OverlayLayer, string>> = {
  assignments: 'Solid line: the assignment as called',
  paths: 'Thin line: where the player actually went',
  guesses: 'Dashed line: a guess, labelled with who drew it',
  telestration: 'Your drawing on this play',
  throwClock: 'Time from the snap to the throw',
};

export type OverlayRole = 'assignment' | 'route' | 'coverage' | 'eyeLine' | 'protection';

export interface OverlayShape {
  readonly layer: OverlayLayer;
  readonly kind: 'line' | 'circle' | 'arrow' | 'text';
  readonly points: readonly PointLike[];
  readonly dashed: boolean;
  readonly role: OverlayRole;
  readonly label?: string;
}

export interface OverlayInput {
  readonly frames: FilmFrames;
  readonly events: readonly FilmEventLike[];
  readonly ticksPerSecond: number;
  /** The club's own unit's called lines; empty on opponent film. */
  readonly assignments: readonly OverlayLineLike[];
  /** Guessed lines (staff or user). */
  readonly guesses: readonly OverlayLineLike[];
  readonly annotation: AnnotationLike | null;
  /** Slots whose actual path to draw (the clicked player, or all). */
  readonly pathSlots: readonly number[];
  /** Draw paths up to this tick. */
  readonly uptoTick: number;
}

/** Every shape of the layers that are on. Pure; the canvas draw below only projects them. */
export function buildOverlays(on: ReadonlySet<OverlayLayer>, inp: OverlayInput): OverlayShape[] {
  const out: OverlayShape[] = [];
  if (on.has('assignments')) for (const a of inp.assignments) {
    if (a.author !== 'call') continue;
    out.push({ layer: 'assignments', kind: 'line', points: a.points, dashed: false, role: 'assignment', label: a.words });
  }
  if (on.has('guesses')) for (const g of inp.guesses) {
    if (g.author === 'call') continue; // a guess is never drawn as the call
    out.push({ layer: 'guesses', kind: 'line', points: g.points, dashed: true, role: 'coverage', label: `${g.words} (${g.author === 'user' ? 'your guess' : `drawn by ${g.author.replace('staff:', 'staff #')}`})` });
  }
  if (on.has('paths')) {
    const f = inp.frames;
    const lastI = Math.max(0, Math.min(f.tickCount - 1, Math.floor(inp.uptoTick - f.firstTick)));
    for (const s of inp.pathSlots) {
      const pts: PointLike[] = [];
      for (let i = 0; i <= lastI; i++) pts.push({ x: f.x[i * f.slotCount + s]!, y: f.y[i * f.slotCount + s]! });
      if (pts.length > 1) out.push({ layer: 'paths', kind: 'line', points: pts, dashed: false, role: 'route' });
    }
  }
  if (on.has('telestration') && inp.annotation) for (const d of inp.annotation.drawings) {
    out.push({ layer: 'telestration', kind: d.shape, points: d.points, dashed: false, role: 'eyeLine' });
  }
  if (on.has('throwClock')) {
    const snap = inp.events.find((e) => e.kind === 'snap'), thr = inp.events.find((e) => e.kind === 'throw');
    if (snap && thr) out.push({ layer: 'throwClock', kind: 'text', points: [{ x: thr.x, y: thr.y }], dashed: false, role: 'eyeLine', label: `${((thr.tick - snap.tick) / inp.ticksPerSecond).toFixed(1)} s to throw` });
  }
  return out;
}

export interface Projector { sx(x: number, y: number): number; sy(x: number, y: number): number; readonly scale: number }

const DASH = [6, 4];
const ARROW_PX = 8;
const LINE_PX = 2, PATH_PX = 1;

/** Draws shapes over the field, colours from the overlay tokens (O6.2.1). */
export function drawOverlays(ctx: Canvas2DLike, cam: Projector, shapes: readonly OverlayShape[], colours: Readonly<Record<OverlayRole, string>>, fontPx: number): void {
  ctx.save();
  for (const sh of shapes) {
    const c = colours[sh.role];
    ctx.strokeStyle = c; ctx.fillStyle = c;
    ctx.lineWidth = sh.layer === 'paths' ? PATH_PX : LINE_PX;
    ctx.setLineDash(sh.dashed ? DASH : []);
    const p = sh.points.map((q) => [cam.sx(q.x, q.y), cam.sy(q.x, q.y)] as const);
    if (sh.kind === 'text') { ctx.font = `${fontPx}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(sh.label ?? '', p[0]![0], p[0]![1]); continue; }
    if (sh.kind === 'circle') {
      const r = Math.hypot(p[1]![0] - p[0]![0], p[1]![1] - p[0]![1]);
      ctx.beginPath(); ctx.arc(p[0]![0], p[0]![1], r, 0, 2 * Math.PI); ctx.stroke();
      continue;
    }
    ctx.beginPath();
    p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    if (sh.kind === 'arrow' && p.length >= 2) {
      const [x1, y1] = p[p.length - 1]!, [x0, y0] = p[p.length - 2]!;
      const a = Math.atan2(y1 - y0, x1 - x0);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x1 - ARROW_PX * Math.cos(a - Math.PI / 6), y1 - ARROW_PX * Math.sin(a - Math.PI / 6));
      ctx.moveTo(x1, y1); ctx.lineTo(x1 - ARROW_PX * Math.cos(a + Math.PI / 6), y1 - ARROW_PX * Math.sin(a + Math.PI / 6));
      ctx.stroke();
    }
  }
  ctx.restore();
}

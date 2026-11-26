// Telestrator (PV-12, plan 3.5; N1.1.2): the coach draws lines, arrows and circles on a frozen frame.
// A finished drawing is sent as the G-63 `FilmDraw` command, so it saves in the play's annotation and
// travels with every cut-up that holds the play. Drawing works only while the film is stopped.
import type { PointLike } from '../types.ts';
import type { Projector } from '../overlays.ts';

export const TELE_TOOLS = ['line', 'arrow', 'circle'] as const;
export type TeleTool = (typeof TELE_TOOLS)[number];

/** Shortest stroke kept, yards (a click without a drag draws nothing). Assumption, design. */
export const TELE_MIN_YD = 0.5;
/** Most points kept in a freehand line (the annotation stays small). */
export const TELE_MAX_POINTS = 64;

export interface TeleDrawing { readonly shape: TeleTool; readonly points: readonly PointLike[] }

/** Screen to field: the inverse of the camera's affine projection, solved from three probes. */
export function screenToField(cam: Projector): (px: number, py: number) => PointLike {
  const ox = cam.sx(0, 0), oy = cam.sy(0, 0);
  const ax = cam.sx(1, 0) - ox, ay = cam.sy(1, 0) - oy; // screen change per field x
  const bx = cam.sx(0, 1) - ox, by = cam.sy(0, 1) - oy; // per field y
  const det = ax * by - bx * ay;
  if (Math.abs(det) < 1e-12) throw new Error('camera projection cannot be inverted');
  return (px, py) => {
    const dx = px - ox, dy = py - oy;
    return { x: (dx * by - bx * dy) / det, y: (ax * dy - dx * ay) / det };
  };
}

/** One stroke at a time. Points are field yards. */
export class Telestrator {
  tool: TeleTool | null = null;
  private pts: PointLike[] = [];

  get drawing(): boolean { return this.pts.length > 0; }
  /** Live preview of the stroke being drawn. */
  get preview(): TeleDrawing | null { return this.tool && this.pts.length > 1 ? this.shapeOf(this.pts) : null; }

  /** `D` cycles off, line, arrow, circle. */
  cycle(): TeleTool | null {
    const i = this.tool === null ? -1 : TELE_TOOLS.indexOf(this.tool);
    this.tool = i + 1 >= TELE_TOOLS.length ? null : TELE_TOOLS[i + 1]!;
    this.pts = [];
    return this.tool;
  }
  begin(p: PointLike, filmStopped: boolean): boolean {
    if (!this.tool || !filmStopped) return false;
    this.pts = [p]; return true;
  }
  move(p: PointLike): void {
    if (!this.pts.length) return;
    if (this.tool === 'line' && this.pts.length < TELE_MAX_POINTS) this.pts.push(p);
    else this.pts[Math.max(1, this.pts.length - 1)] = p;
  }
  /** Ends the stroke; null when it was too short to keep. */
  end(): TeleDrawing | null {
    const pts = this.pts; this.pts = [];
    if (pts.length < 2) return null;
    const a = pts[0]!, z = pts[pts.length - 1]!;
    if (Math.hypot(z.x - a.x, z.y - a.y) < TELE_MIN_YD && this.tool !== 'line') return null;
    if (this.tool === 'line' && pathLength(pts) < TELE_MIN_YD) return null;
    return this.shapeOf(pts);
  }
  private shapeOf(pts: readonly PointLike[]): TeleDrawing {
    const tool = this.tool ?? 'line';
    // Arrows and circles keep two points (start and end; centre and rim), as the G-63 overlay draws them.
    return tool === 'line' ? { shape: 'line', points: [...pts] } : { shape: tool, points: [pts[0]!, pts[pts.length - 1]!] };
  }
}

function pathLength(p: readonly PointLike[]): number { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i]!.x - p[i - 1]!.x, p[i]!.y - p[i - 1]!.y); return s; }

/** The G-63 command that saves a drawing with the play. */
export function drawCommand(playId: string, d: TeleDrawing): { readonly type: 'FilmDraw'; readonly payload: { playId: string; shape: TeleTool; points: PointLike[] } } {
  return { type: 'FilmDraw', payload: { playId, shape: d.shape, points: d.points.map((p) => ({ x: p.x, y: p.y })) } };
}
export function eraseCommand(playId: string, index: number): { readonly type: 'FilmEraseDrawing'; readonly payload: { playId: string; index: number } } {
  return { type: 'FilmEraseDrawing', payload: { playId, index } };
}

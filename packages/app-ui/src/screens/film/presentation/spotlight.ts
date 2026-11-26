// Spotlight (PV-12, plan 3.5): one player stays bright and everyone else is dimmed, for grading one
// man's technique (N1.4). The dimming is a flat scrim over the drawn field with a hole round the
// player; it never moves or hides a marker, and the player's number is named in text beside the film.
import type { Canvas2DLike, FilmFrames } from '../../../field-view/index.ts';
import type { Projector } from '../overlays.ts';
import { slotAt } from './sample.ts';

/** Starting values, Assumption (design; tuned in playtesting). */
export const SPOTLIGHT = { radiusYd: 3, dimAlpha: 0.55, ringPx: 2, segments: 48 } as const;

export interface SpotlightColours { readonly scrim: string; readonly ring: string }

/** Screen circle round the slot at the tick. */
export function spotlightCircle(f: FilmFrames, cam: Projector, slot: number, tick: number): { x: number; y: number; r: number } {
  const p = slotAt(f, slot, tick);
  return { x: cam.sx(p.x, p.y), y: cam.sy(p.x, p.y), r: SPOTLIGHT.radiusYd * cam.scale };
}

/** Scrim over the whole frame with the hole cut by opposite winding (works with the nonzero rule). */
export function drawSpotlight(ctx: Canvas2DLike, w: number, h: number, c: { x: number; y: number; r: number }, colours: SpotlightColours): void {
  ctx.save();
  ctx.globalAlpha = SPOTLIGHT.dimAlpha;
  ctx.fillStyle = colours.scrim;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  for (let k = 0; k <= SPOTLIGHT.segments; k++) {
    const a = -(k / SPOTLIGHT.segments) * 2 * Math.PI; // counter to the outer rectangle
    const x = c.x + c.r * Math.cos(a), y = c.y + c.r * Math.sin(a);
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = colours.ring;
  ctx.lineWidth = SPOTLIGHT.ringPx;
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 2 * Math.PI); ctx.stroke();
  ctx.restore();
}

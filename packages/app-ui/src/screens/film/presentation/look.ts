// Film look (PV-12 consumes PV-18; plan 2.1): the 16mm coaching-film look before 1986 and the
// videotape look from 1986, plus the frame counter. PV-18 (packages/app-ui/src/presentation/era/) owns
// the grain, vignette, tape lines and the character-generator leader card; the viewer takes them
// through this port so the film room does not depend on the era package before it lands. Without a
// port the viewer draws plain film: the frame counter and plain title cards only. Grain is still (a
// fresh pattern per frame from `cosmetic.display`) and never moves a marker; no gate weave or jitter.
import type { Canvas2DLike } from '../../../field-view/index.ts';
import type { TitleCard } from './title-card.ts';

export type FilmStock = '16mm' | 'videotape';

/** Season the coaching film moved to videotape (plan 2.1: 16mm Verified, 1986 is 2 of 3). Display only. */
export const TAPE_FROM_SEASON = 1986;
/** 16mm film runs 24 frames a second; NTSC videotape timecode counts 30 frames a second (display only). */
export const FRAMES_PER_S: Readonly<Record<FilmStock, number>> = { '16mm': 24, videotape: 30 };

export function stockFor(season: number): FilmStock { return season < TAPE_FROM_SEASON ? '16mm' : 'videotape'; }

/** A structural `cosmetic.display` stream (PV-01). */
export interface DisplayDraw { uniform(): number }

export interface FilmLookSwitches { readonly reducedMotion: boolean; readonly highContrast: boolean; readonly plainFilm: boolean }

/** Grain and vignette are off under reduced motion, high contrast and the plain film switch (plan 2.1). */
export function lookActive(s: FilmLookSwitches): boolean { return !s.reducedMotion && !s.highContrast && !s.plainFilm; }

/** What PV-18 supplies. Every method draws over the finished field and overlays, never under them. */
export interface FilmLookPort {
  /** Grain, vignette and (tape) lines for one frame. */
  drawLook(ctx: Canvas2DLike, w: number, h: number, stock: FilmStock, draw: DisplayDraw): void;
  /** The leader card in the character-generator style. */
  drawLeader(ctx: Canvas2DLike, w: number, h: number, card: TitleCard, stock: FilmStock): void;
}

/** Film frame number since the start of the clip. */
export function filmFrame(tick: number, firstTick: number, ticksPerSecond: number, stock: FilmStock): number {
  return Math.max(0, Math.floor(((tick - firstTick) / ticksPerSecond) * FRAMES_PER_S[stock]));
}

/** "FR 00123" on film, "00:00:04:03" timecode on tape. */
export function frameCounter(frame: number, stock: FilmStock): string {
  if (stock === '16mm') return `FR ${String(frame).padStart(5, '0')}`;
  const f = frame % 30, s = Math.floor(frame / 30), p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(f)}`;
}

export interface PlainColours { readonly panel: string; readonly ink: string }

/** Plain frame counter, bottom right (the cue table's `film_frame_counter`, shown in plain and classic). */
export function drawFrameCounter(ctx: Canvas2DLike, w: number, h: number, text: string, c: PlainColours, fontPx: number): void {
  ctx.save();
  ctx.font = `${fontPx}px ui-monospace, monospace`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  const pad = 4, tw = text.length * fontPx * 0.62;
  ctx.globalAlpha = 0.8; ctx.fillStyle = c.panel; ctx.fillRect(w - tw - pad * 3, h - fontPx - pad * 3, tw + pad * 2, fontPx + pad * 2);
  ctx.globalAlpha = 1; ctx.fillStyle = c.ink; ctx.fillText(text, w - pad * 2, h - pad * 2);
  ctx.restore();
}

/** Plain title card: a flat panel with the lines in the body face, no motion. */
export function drawPlainCard(ctx: Canvas2DLike, w: number, h: number, card: TitleCard, c: PlainColours, fontPx: number): void {
  ctx.save();
  ctx.globalAlpha = 1; ctx.fillStyle = c.panel; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = c.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const rows = [card.head, ...card.lines], lh = fontPx * 1.6, top = h / 2 - ((rows.length - 1) * lh) / 2;
  rows.forEach((t, i) => { ctx.font = `${i === 0 ? 'bold ' : ''}${i === 0 ? Math.round(fontPx * 1.4) : fontPx}px system-ui, sans-serif`; ctx.fillText(t, w / 2, top + i * lh); });
  ctx.restore();
}

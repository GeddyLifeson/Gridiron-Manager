// PV-18: the film look drawn on a canvas, for the film room's FilmLookPort (PV-12, the film screens' look port).
// Grain, vignette and tape lines go over the finished field and overlays; the leader card is a still in the
// character-generator face. Only fillRect is used: no transform, so nothing under the look ever moves.
// Colours are the resolved era tokens of the active theme (canvas cannot read CSS variables).
import { resolveColours, type ThemeId, type ColourVisionId, type TokenFile, TOKENS } from '../../tokens/index.ts';
import { GRAIN, GRAIN_LIGHT, GRAIN_DARK, VIGNETTE, TAPE_LINES, grainFrame, type FilmStock, type UniformDraw } from './film.ts';
import { cgLayout, CG_ROWS, CG_SHADOW, type CgLayout } from './cg-font.ts';

/** The canvas calls the look needs; the field view's Canvas2DLike and a real 2D context both satisfy it. */
export interface FilmCanvas {
  fillStyle: unknown;
  globalAlpha: number;
  save(): void;
  restore(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/** The words of a leader card: a head line such as "REEL 2  3RD QTR" and up to three plain lines. */
export interface LeaderWords { readonly head: string; readonly lines: readonly string[] }

/** Vignette bands (design value, Assumption, cosmetic): a stepped edge darkening, since the canvas port has no gradients. */
export const VIGNETTE_BANDS = 8;

export interface FilmLookCanvas {
  drawLook(ctx: FilmCanvas, w: number, h: number, stock: FilmStock, draw: UniformDraw): void;
  drawLeader(ctx: FilmCanvas, w: number, h: number, card: LeaderWords, stock: FilmStock): void;
}

function drawRuns(ctx: FilmCanvas, l: CgLayout, x0: number, y0: number, cell: number): void {
  for (const r of l.runs) ctx.fillRect(x0 + r.x * cell, y0 + r.y * cell, r.w * cell, cell);
}

/** One caption line with its hard shadow, left edge at x0 (or centred when x0 is null). */
function captionLine(ctx: FilmCanvas, text: string, x0: number | null, y0: number, cell: number, w: number, ink: string, shadow: string): number {
  const l = cgLayout(text);
  const x = x0 ?? Math.round((w - l.cols * cell) / 2);
  ctx.fillStyle = shadow; drawRuns(ctx, l, x + CG_SHADOW.dx * cell, y0 + CG_SHADOW.dy * cell, cell);
  ctx.fillStyle = ink; drawRuns(ctx, l, x, y0, cell);
  return l.cols * cell;
}

/**
 * The film-room look for one theme and palette. The caller (the film viewer) decides whether the look is on
 * (filmLookActive); drawLeader is shown whenever a card is.
 */
export function filmLookCanvas(theme: ThemeId, vision: ColourVisionId = 'none', file: TokenFile = TOKENS): FilmLookCanvas {
  const era = resolveColours(theme, vision, file).era;
  const c = (k: string) => era[k]!;
  return {
    drawLook(ctx, w, h, stock, draw) {
      ctx.save();
      const g = GRAIN[stock];
      const cols = Math.ceil(w / g.cellPx), rows = Math.ceil(h / g.cellPx);
      const frame = grainFrame(draw, cols, rows, stock);
      ctx.globalAlpha = g.opacity;
      for (const [kind, colour] of [[GRAIN_LIGHT, c('grainLight')], [GRAIN_DARK, c('grainDark')]] as const) {
        ctx.fillStyle = colour;
        for (let i = 0; i < frame.length; i++) if (frame[i] === kind) ctx.fillRect((i % cols) * g.cellPx, Math.floor(i / cols) * g.cellPx, g.cellPx, g.cellPx);
      }
      if (stock === 'videotape') {
        ctx.globalAlpha = TAPE_LINES.opacity; ctx.fillStyle = c('grainDark');
        for (let y = 0; y < h; y += TAPE_LINES.spacingPx) ctx.fillRect(0, y, w, 1);
      }
      const v = VIGNETTE[stock];
      const depth = (Math.min(w, h) / 2) * (v.outer - v.inner);
      const band = depth / VIGNETTE_BANDS;
      ctx.fillStyle = c('vignette');
      ctx.globalAlpha = v.opacity / VIGNETTE_BANDS;
      for (let k = 0; k < VIGNETTE_BANDS; k++) {
        // Each band covers the edge strip from the border to depth (k+1) * band, so alpha stacks highest at the edge.
        const d = band * (VIGNETTE_BANDS - k);
        ctx.fillRect(0, 0, w, d); ctx.fillRect(0, h - d, w, d);
        ctx.fillRect(0, d, d, h - 2 * d); ctx.fillRect(w - d, d, d, h - 2 * d);
      }
      ctx.restore();
    },
    drawLeader(ctx, w, h, card, stock) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = c('leaderBg'); ctx.fillRect(0, 0, w, h);
      const rows = [card.head, ...card.lines.slice(0, 3)];
      const cols = (t: string) => Math.max(cgLayout(t).cols, 1);
      // Head line in large cells; the rest at most two thirds of that and never under 2 px a cell, each sized to
      // fit 80% of the width. Every cell is a whole pixel size so the blocks stay crisp.
      const headCell = Math.max(2, Math.floor(Math.min((w * 0.8) / cols(rows[0]!), h / (CG_ROWS * 5))));
      const bodyWidest = Math.max(...rows.slice(1).map(cols), 1);
      const bodyCell = Math.max(2, Math.min(Math.floor((headCell * 2) / 3), Math.floor((w * 0.8) / bodyWidest)));
      const lineGap = bodyCell * 4;
      const total = CG_ROWS * headCell + (rows.length - 1) * (CG_ROWS * bodyCell + lineGap) + (rows.length > 1 ? headCell * 4 - lineGap : 0);
      let y = Math.round((h - total) / 2);
      if (stock === '16mm') {
        // Film leader: a thin frame line like a slate border, in the leader ink.
        ctx.fillStyle = c('leaderInk');
        const m = headCell * 2;
        ctx.fillRect(m, m, w - 2 * m, 1); ctx.fillRect(m, h - m, w - 2 * m, 1);
        ctx.fillRect(m, m, 1, h - 2 * m); ctx.fillRect(w - m, m, 1, h - 2 * m);
      }
      captionLine(ctx, rows[0]!, null, y, headCell, w, c('leaderInk'), c('grainDark'));
      y += CG_ROWS * headCell + headCell * 4;
      for (const t of rows.slice(1)) { captionLine(ctx, t, null, y, bodyCell, w, c('leaderInk'), c('grainDark')); y += CG_ROWS * bodyCell + lineGap; }
      ctx.restore();
    },
  };
}

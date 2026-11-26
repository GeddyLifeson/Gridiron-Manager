// PV-18 film-room look (plan 2.1, O2.6): 16mm coaching film for seasons before the switch to tape,
// videotape after. Still grain (a fresh pattern each frame from `cosmetic.display`), a soft vignette,
// reel leader title cards and a frame counter. Nothing here moves: no gate weave, jitter or
// transform, because that would move marker positions. The look is layers drawn over the film, and
// it turns off under reduced motion, high contrast or the "plain film" switch.
import type { ThemeId } from '../../tokens/index.ts';

/**
 * Season the coaching film becomes videotape. Plan 2.1 period table: "the NFL moved coaching film to
 * videotape in 1986", status 2 of 3 (NFL.com film study article; Athletic Business, January 1992).
 * Flagged: not triple verified. It is cosmetic only and changes no game rule.
 */
export const FILM_TO_TAPE = { season: 1986, status: '2 of 3', sources: ['NFL.com film study article', 'Athletic Business, January 1992'] } as const;

export type FilmStock = '16mm' | 'videotape';

/** The stock a season's film is shown on, from the world calendar's season year. */
export function filmStockFor(seasonYear: number): FilmStock {
  if (!Number.isInteger(seasonYear)) throw new Error(`season year must be a whole year: ${seasonYear}`);
  return seasonYear < FILM_TO_TAPE.season ? '16mm' : 'videotape';
}

export interface FilmLookSettings {
  reducedMotion: boolean;
  theme: ThemeId;
  /** The "plain film" switch (plan 2.1). */
  plainFilm: boolean;
}

/** Grain, vignette and tape lines show only when none of reduced motion, high contrast or plain film is on. */
export function filmLookActive(s: FilmLookSettings): boolean {
  return !s.reducedMotion && !s.plainFilm && s.theme !== 'high-contrast';
}

/** The only draw a grain frame needs; structurally matches app-services' CosmeticRandom. */
export interface UniformDraw { uniform(): number }

/**
 * Grain density and opacity per stock. Design values (Assumption, cosmetic): tape has finer, fainter
 * noise than film. `cellPx` is the grain cell size at 100% interface scale.
 */
export const GRAIN = {
  '16mm': { cellPx: 3, lightShare: 0.035, darkShare: 0.045, opacity: 0.22 },
  videotape: { cellPx: 2, lightShare: 0.02, darkShare: 0.01, opacity: 0.12 },
} as const satisfies Record<FilmStock, { cellPx: number; lightShare: number; darkShare: number; opacity: number }>;

export const GRAIN_NONE = 0, GRAIN_LIGHT = 1, GRAIN_DARK = 2;

/**
 * One still grain frame: a cell per `cols x rows`, each none, light or dark. Exactly one draw per
 * cell, so a replayed play draws the same frames in the same order.
 */
export function grainFrame(draw: UniformDraw, cols: number, rows: number, stock: FilmStock): Uint8Array {
  const g = GRAIN[stock];
  const out = new Uint8Array(cols * rows);
  for (let i = 0; i < out.length; i++) {
    const u = draw.uniform();
    out[i] = u < g.lightShare ? GRAIN_LIGHT : u < g.lightShare + g.darkShare ? GRAIN_DARK : GRAIN_NONE;
  }
  return out;
}

/** Vignette and tape-line specs (design values, Assumption, cosmetic). Radii are fractions of the half-diagonal. */
export const VIGNETTE = {
  '16mm': { inner: 0.62, outer: 1.0, opacity: 0.35 },
  videotape: { inner: 0.75, outer: 1.0, opacity: 0.15 },
} as const satisfies Record<FilmStock, { inner: number; outer: number; opacity: number }>;
export const TAPE_LINES = { spacingPx: 3, opacity: 0.08 } as const;

/**
 * Layers drawn over the film, in order. Every layer is an overlay: none carries a position, offset,
 * scale or transform, so the film under it is never moved.
 */
export type FilmLayer =
  | { kind: 'grain'; stock: FilmStock; cellPx: number; opacity: number; light: 'grainLight'; dark: 'grainDark' }
  | { kind: 'vignette'; inner: number; outer: number; opacity: number; colour: 'vignette' }
  | { kind: 'tapeLines'; spacingPx: number; opacity: number; colour: 'grainDark' }
  | { kind: 'counter'; text: string; ink: 'counterInk'; bg: 'counterBg' };

export const FILM_LAYER_KINDS = ['grain', 'vignette', 'tapeLines', 'counter'] as const;

export interface FilmLayerInput extends FilmLookSettings { seasonYear: number; frame: number }

/** The overlay stack for a frame. The counter always shows (it is a reference, not decoration). */
export function filmLayers(i: FilmLayerInput): FilmLayer[] {
  const stock = filmStockFor(i.seasonYear);
  const out: FilmLayer[] = [];
  if (filmLookActive(i)) {
    const g = GRAIN[stock];
    out.push({ kind: 'grain', stock, cellPx: g.cellPx, opacity: g.opacity, light: 'grainLight', dark: 'grainDark' });
    out.push({ kind: 'vignette', ...VIGNETTE[stock], colour: 'vignette' });
    if (stock === 'videotape') out.push({ kind: 'tapeLines', ...TAPE_LINES, colour: 'grainDark' });
  }
  out.push({ kind: 'counter', text: frameCounter(i.frame, stock), ink: 'counterInk', bg: 'counterBg' });
  return out;
}

/**
 * Counter rates. Assumption (cosmetic display only, not researched): 24 frames a second for film and
 * 30 for the tape timecode's frame field. The counter is a label; it never sets playback speed,
 * which comes from the engine's ticks.
 */
export const COUNTER_RATE = { '16mm': 24, videotape: 30 } as const;

/** "FR 001234" on film; "00:01:02:15" timecode on tape. `frame` counts from 0 at the reel's start. */
export function frameCounter(frame: number, stock: FilmStock): string {
  const f = Math.max(0, Math.floor(frame));
  if (stock === '16mm') return `FR ${String(f).padStart(6, '0')}`;
  const rate = COUNTER_RATE.videotape;
  const ff = f % rate, totalS = Math.floor(f / rate);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(totalS / 3600))}:${p(Math.floor(totalS / 60) % 60)}:${p(totalS % 60)}:${p(ff)}`;
}

/** "1ST" .. "4TH", then "OT", "OT 2" ... */
export function quarterLabel(quarter: number): string {
  if (!Number.isInteger(quarter) || quarter < 1) throw new Error(`quarter must be 1 or more: ${quarter}`);
  if (quarter <= 4) return `${quarter}${['ST', 'ND', 'RD', 'TH'][quarter - 1]} QTR`;
  return quarter === 5 ? 'OT' : `OT ${quarter - 4}`;
}

/** Reel leader title card text, such as "REEL 2  3RD QTR" (film) or "TAPE 2  3RD QTR" (tape). */
export function leaderTitle(reel: number, quarter: number, stock: FilmStock): string {
  if (!Number.isInteger(reel) || reel < 1) throw new Error(`reel must be 1 or more: ${reel}`);
  return `${stock === '16mm' ? 'REEL' : 'TAPE'} ${reel}  ${quarterLabel(quarter)}`;
}

/** Title card spec: shown as a still between cut-ups, in the character-generator face. */
export interface LeaderCard { title: string; subtitle?: string; stock: FilmStock; bg: 'leaderBg'; ink: 'leaderInk' }
export function leaderCard(o: { reel: number; quarter: number; seasonYear: number; subtitle?: string }): LeaderCard {
  const stock = filmStockFor(o.seasonYear);
  return { title: leaderTitle(o.reel, o.quarter, stock), ...(o.subtitle ? { subtitle: o.subtitle.toUpperCase() } : {}), stock, bg: 'leaderBg', ink: 'leaderInk' };
}

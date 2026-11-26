// Field and team colours on the field view (I9.1.1, O2.3.2, O5, O6.2.1). Every colour comes from the
// design token file (`tokens/tokens.json`), by theme and colour-vision palette; this file holds none.
// Contrast is the WCAG ratio from the token module. The 3:1 threshold is the I9.1.1 starting value.
// When the home and away colours fail against the turf or each other, the away alternate is tried
// (O2.3.2), then the home alternate, then the theme's colour-blind-safe pair (one dark, one light,
// told apart by lightness alone).
import { contrastRatio, relativeLuminance, type ThemeId, type ColourVisionId } from '../tokens/index.ts';
import { resolveEraColours, type FieldSurface } from '../presentation/era/theme.ts';
import { param } from './params.ts';
import type { TeamColours } from './types.ts';

export { contrastRatio, relativeLuminance };

/** The token colours the field view draws with. */
export interface FieldPalette {
  readonly turf: string; readonly endZone: string; readonly surround: string;
  readonly lines: string; readonly numbers: string; readonly scrimmage: string; readonly lineToGain: string;
  readonly ball: string; readonly ballEdge: string; readonly flag: string; readonly cue: string; readonly shadow: string;
  readonly inkDark: string; readonly inkLight: string; readonly officialLight: string; readonly officialDark: string;
  /** Colour-blind-safe team pair (team.safeDark, team.safeLight). */
  readonly safeDark: string; readonly safeLight: string;
}

const FIELD_KEYS = ['turf', 'endZone', 'surround', 'lines', 'numbers', 'scrimmage', 'lineToGain', 'ball', 'ballEdge', 'flag', 'cue', 'shadow', 'inkDark', 'inkLight', 'officialLight', 'officialDark'] as const;

/**
 * The field colours for a theme and palette. `surface` is the venue's playing surface: the Classic theme
 * lays PV-18's flat grass or period artificial-turf colour over the turf, end zones and surround
 * (plan 2.1); the plain themes keep their own turf whatever the surface.
 */
export function fieldPalette(theme: ThemeId = 'light', vision: ColourVisionId = 'none', surface: FieldSurface = 'grass'): FieldPalette {
  const block = resolveEraColours({ theme, colourVision: vision, surface });
  const out: Record<string, string> = {};
  for (const k of FIELD_KEYS) {
    const v = block.field[k];
    if (v === undefined) throw new Error(`token field.${k} is missing from theme ${theme}`);
    out[k] = v;
  }
  const sd = block.team.safeDark, sl = block.team.safeLight;
  if (sd === undefined || sl === undefined) throw new Error(`tokens team.safeDark and team.safeLight are missing from theme ${theme}`);
  out.safeDark = sd; out.safeLight = sl;
  return out as unknown as FieldPalette;
}

export interface ResolvedColours {
  /** Indexed by side: 0 home, 1 visitor. */
  readonly sides: readonly [string, string];
  readonly source: 'primary' | 'awayAlternate' | 'homeAlternate' | 'colourBlindSafe';
  /**
   * Per side: the colour is under 3:1 against the turf even after the fallbacks (a dark colour on a
   * dark turf cannot reach it). The renderer then outlines that side's markers in the line colour.
   */
  readonly outlined: readonly [boolean, boolean];
}

function passes(a: string, b: string, turf: string, min: number): boolean {
  return contrastRatio(a, turf) >= min && contrastRatio(b, turf) >= min && contrastRatio(a, b) >= min;
}

export function resolveTeamColours(home: TeamColours, away: TeamColours, opts: { colourBlindSafe?: boolean; palette?: FieldPalette } = {}): ResolvedColours {
  const pal = opts.palette ?? fieldPalette();
  const min = param('minContrast');
  const done = (a: string, b: string, source: ResolvedColours['source']): ResolvedColours =>
    ({ sides: [a, b], source, outlined: [contrastRatio(a, pal.turf) < min, contrastRatio(b, pal.turf) < min] });
  if (!opts.colourBlindSafe) {
    if (passes(home.primary, away.primary, pal.turf, min)) return done(home.primary, away.primary, 'primary');
    if (passes(home.primary, away.alternate, pal.turf, min)) return done(home.primary, away.alternate, 'awayAlternate');
    if (passes(home.alternate, away.alternate, pal.turf, min)) return done(home.alternate, away.alternate, 'homeAlternate');
  }
  return done(pal.safeDark, pal.safeLight, 'colourBlindSafe');
}

/** Mixes two token colours (`#rrggbb`): `t` 0 gives `a`, 1 gives `b`. Derived colours stay on the tokens. */
export function mixColour(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  let out = '#';
  for (let i = 0; i < 3; i++) out += Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0');
  return out;
}

/** The ink (dark or light) that reads better on a marker fill. */
export function inkOn(fill: string, pal: FieldPalette): string {
  return contrastRatio(fill, pal.inkDark) >= contrastRatio(fill, pal.inkLight) ? pal.inkDark : pal.inkLight;
}

/** The venue's surface kind (engine-game venue `surfaceKind`) as the field surface the Classic theme paints. */
export function fieldSurfaceFor(kind: 'natural' | 'artificial' | null | undefined): FieldSurface {
  return kind === 'artificial' ? 'artificial' : 'grass';
}

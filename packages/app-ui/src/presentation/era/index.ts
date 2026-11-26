// PV-18 Classic era skin (plan 2.1): Classic theme colours, the lamp-board and character-generator
// display faces, and the 16mm / videotape film look. A skin only: it carries no information.
export {
  ERA_KEYS, FIELD_SURFACES, SURFACE_COLOURS, resolveEraColours, eraVar, ev, eraTokenVariables, checkSurfaceContrast,
  type EraKey, type FieldSurface, type SurfaceColours, type EraOptions, type EraContrastFailure,
} from './theme.ts';
export { GLYPH_COLS, GLYPH_ROWS, GLYPH_CHARS, glyphBits, normaliseChar, normaliseText } from './glyphs.ts';
export {
  lampLayout, segmentCells, clockText, SEGMENTS, SEGMENT_CHARS, SEGMENT_POLYGONS, DIGIT_BOX,
  type Lamp, type LampLayout, type LampOptions, type Segment, type SegmentCell,
} from './lamp-font.ts';
export {
  cgLayout, cgBits, lowerThirdLayout, CG_COLS, CG_ROWS, CG_SHADOW, CG_GAP, LOWER_THIRD_PAD,
  type CgRun, type CgLayout, type LowerThirdLayout, type LowerThirdLine,
} from './cg-font.ts';
export {
  FILM_TO_TAPE, GRAIN, GRAIN_NONE, GRAIN_LIGHT, GRAIN_DARK, VIGNETTE, TAPE_LINES, COUNTER_RATE, FILM_LAYER_KINDS,
  filmStockFor, filmLookActive, grainFrame, filmLayers, frameCounter, quarterLabel, leaderTitle, leaderCard,
  type FilmStock, type FilmLookSettings, type UniformDraw, type FilmLayer, type FilmLayerInput, type LeaderCard,
} from './film.ts';
export { LampText, type LampColour, SegmentClock, CgText, LowerThird, LeaderCardView, type LampTextProps, type SegmentClockProps, type CgTextProps, type LowerThirdProps, type LeaderCardViewProps } from './components.tsx';
export { filmLookCanvas, VIGNETTE_BANDS, type FilmCanvas, type FilmLookCanvas, type LeaderWords } from './film-canvas.ts';

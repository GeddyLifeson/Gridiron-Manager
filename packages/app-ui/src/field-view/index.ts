// G-03: the 2D overhead field and film renderer (I9.1, I9.3, O2.3, O6.3, O6.4, J1.1).
export * from './types.ts';
export { decodeTrajectory, encodeLayout0, facingToRad, radToFacing, FILM_MOVE_MODES, FILM_BALL_STATES, LAYOUT0_VERSION, LAYOUT1_VERSION, LAYOUT0_SLOTS, LAYOUT0_TICK_BYTES, TrajectoryFormatError, type FilmFrames, type TickSample } from './format.ts';
export { sampleFrames, newSample, lastTick, storedAt, type FrameSample } from './sample.ts';
export { Camera, type CameraContext, type FieldBox } from './camera.ts';
export { buildMarkings, markingStatus, markingsFor, PRO_MARKINGS, COLLEGE_MARKINGS, type FieldMarkings, type MarkingSet } from './markings.ts';
export { markerFor, positionLetter, DEFAULT_MARKERS, type MarkerStyle, type MarkerTable, type MarkerShape } from './markers.ts';
export { resolveTeamColours, fieldPalette, inkOn, mixColour, contrastRatio, relativeLuminance, type ResolvedColours, type FieldPalette } from './colours.ts';
export { buildCues, activeCues, cueDisplaySeconds, limitFlashes, switchedOn, cueSwitch, CUE_FOR, KICK_CUE_FOR, type Cue, type CueShape, type CueSwitches, type FieldContact, type FieldKick, type ContactTier } from './cues.ts';
export { Playback, ReplayAllowance, SPEEDS, FILM_STUDY_SPEEDS, stills, PlaybackRuleError, type PlaybackStill } from './playback.ts';
export { FieldRenderer, OverlaySourceError, type Canvas2DLike, type RenderOptions, type EndZoneMark, type Aftermath } from './renderer.ts';
export { blockText, blockWidth, blockCellCount, fillBlockText, BLOCK_CHARS, GLYPH_ROWS, GLYPH_COLS, ADVANCE_COLS } from './blockFont.ts';
export { mergeNotes, layoutNotes, noteLabel, type FieldNote, type MergedNote, type PlacedNote } from './fieldText.ts';
export { buildParticles, particleCount, wetTint, falls, PRECIP_KINDS, type FieldWeather, type PrecipKind, type CosmeticDraw, type WeatherParticles } from './weather.ts';
export { PARAMS, param } from './params.ts';
export { FieldView, type FieldViewProps } from './FieldView.tsx';

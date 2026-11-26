// PV-12 film room presentation: holds, spotlight, title cards, as run against as drawn, staff guesses
// with a confidence word, the telestrator and the film look port. Film room only (route test).
export { FreezeHolds } from './holds.ts';
export { slotAt } from './sample.ts';
export { SPOTLIGHT, spotlightCircle, drawSpotlight, type SpotlightColours } from './spotlight.ts';
export { TITLE_CARD_S, titleCard, quarterWord, TitleCardTimer, type TitleCard } from './title-card.ts';
export { AS_RUN_MIN_YD, asRunMisses, nearestOnLine, type AsRunMiss } from './as-run.ts';
export { TELE_TOOLS, TELE_MIN_YD, TELE_MAX_POINTS, Telestrator, screenToField, drawCommand, eraseCommand, type TeleTool, type TeleDrawing } from './telestrator.ts';
export { TAPE_FROM_SEASON, FRAMES_PER_S, stockFor, lookActive, filmFrame, frameCounter, drawFrameCounter, drawPlainCard, type FilmStock, type FilmLookPort, type FilmLookSwitches, type DisplayDraw } from './look.ts';
export { CONFIDENCE_WORDS, guessLabel, type ConfidenceWord } from './inference.ts';

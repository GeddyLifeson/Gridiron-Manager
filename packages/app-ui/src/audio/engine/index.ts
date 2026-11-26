// Audio engine (PV-06). Public surface for the recipe, crowd, cadence, ambience and music packages.
export * from './types.ts';
export { AudioEngine, LATE_DROP_SECONDS, DEFAULT_FADE_SECONDS, type BedDef, type BedHandle, type EngineOptions, type PreloadResult } from './engine.ts';
export { panFor, PAN_WIDTH, Ducker, RateLimiter, DUCK_LEVEL, DUCK_MAX_HOLD, DUCK_RELEASE, DUCK_ATTACK, type DuckWindow } from './mix.ts';
export { RankedQueue, CROWD_REACTION_RANK, type CrowdReaction, type QueueItem, type QueueDecision, type RankedQueueOptions } from './ranked-queue.ts';
export { buildRecipe, buildSustained, recipeSeconds, envelopeSeconds, variantCents, noiseBuffer } from './synth.ts';
export { createMusicOutput, MUSIC_BED_KEY, type MusicTrackLike, type MusicOutputLike } from './music.ts';
export { busSettingsFrom, monoFrom, BUS_DEFAULTS } from './settings.ts';
export { FakeAudioContext, FakeNode, FakeGain, FakeSource, FakeParam, FakeBufferSource, FakeOscillator, type FakeContextOptions } from './fake-context.ts';

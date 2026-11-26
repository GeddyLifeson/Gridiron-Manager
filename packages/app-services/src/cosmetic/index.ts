// Cosmetic random streams (PV-01; presentation-build-plan section 6; J13.2.1 amendment A-2; MB-16).
//
// Sound and visual variety (crowd timing, pitch variants, rain particle positions, stride phase) draw only
// from these two streams, `cosmetic.display` and `cosmetic.audio`. Each is keyed
// hash(worldSeed, 'cosmetic', channel, game, play, cosmeticSeed) with engine-core's stream generator, so:
//   - a cosmetic draw can never move a game stream: engine streams are keyed by their own names and scopes,
//     never by "the next number of a global generator" (J13.4.1);
//   - replaying a play (film) gives the same crowd and the same rain;
//   - turning audio off, changing the performance tier, or changing the cosmetic seed changes only how many
//     cosmetic numbers are drawn, never a game result (tested in test/cosmetic/).
// One way only: no core package reads a cosmetic stream (the core-purity lint flags the name), and no
// cosmetic value is written into game state. app-ui receives the plain `CosmeticRandom` interface, never an
// engine Stream, so it cannot hand one to the core.
import { seedFromHex, stream, type Stream } from '@gm/engine-core';

/** Reserved J13 stream name (amendment A-2). Presentation only; never read by a core package. */
export const COSMETIC_STREAM = 'cosmetic';
export const COSMETIC_CHANNELS = ['display', 'audio'] as const;
export type CosmeticChannel = (typeof COSMETIC_CHANNELS)[number];

/** Where a cosmetic draw belongs. `gameId` 0 with `playNumber` 0 is the menus and screens outside a game. */
export interface CosmeticScope {
  readonly gameId: number;
  readonly playNumber: number;
}

/** Variation draws for presentation. Same scope and seeds give the same sequence. */
export interface CosmeticRandom {
  /** `cosmetic.display` or `cosmetic.audio`. */
  readonly name: string;
  readonly channel: CosmeticChannel;
  readonly scope: CosmeticScope;
  /** Raw outputs consumed so far (for tests and debugging). */
  readonly draws: number;
  /** Uniform in [0, 1). */
  uniform(): number;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
  /** Integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number;
  chance(p: number): boolean;
  /** Index chosen with probability proportional to weights. */
  pick(weights: readonly number[]): number;
  /** Standard normal. */
  normal(): number;
}

export interface CosmeticStreams {
  readonly display: CosmeticRandom;
  readonly audio: CosmeticRandom;
}

function checkScopeField(label: string, n: number): void {
  if (!Number.isInteger(n) || n < 0 || n > 4294967295) throw new Error(`cosmetic ${label} must be a 32-bit unsigned integer, got ${n}`);
}

function wrap(s: Stream, channel: CosmeticChannel, scope: CosmeticScope): CosmeticRandom {
  return {
    name: `${COSMETIC_STREAM}.${channel}`,
    channel,
    scope,
    get draws() { return s.draws; },
    uniform: () => s.uniform(),
    range: (lo, hi) => lo + (hi - lo) * s.uniform(),
    int: (lo, hi) => s.int(lo, hi),
    chance: (p) => s.chance(p),
    pick: (w) => s.pick(w),
    normal: () => s.normal(),
  };
}

/**
 * One cosmetic stream. `worldSeedHex` is the save's master seed (1 to 16 hex digits); `cosmeticSeed` is a
 * presentation-only offset (default 0) a user or test may change without touching any game result.
 */
export function cosmeticStream(worldSeedHex: string, channel: CosmeticChannel, scope: CosmeticScope, cosmeticSeed = 0): CosmeticRandom {
  if (!COSMETIC_CHANNELS.includes(channel)) throw new Error(`unknown cosmetic channel ${String(channel)}`);
  checkScopeField('gameId', scope.gameId);
  checkScopeField('playNumber', scope.playNumber);
  checkScopeField('cosmeticSeed', cosmeticSeed);
  const s = stream(seedFromHex(worldSeedHex), COSMETIC_STREAM, [channel, scope.gameId, scope.playNumber, cosmeticSeed]);
  return wrap(s, channel, { gameId: scope.gameId, playNumber: scope.playNumber });
}

/**
 * The factory app-ui is handed: bound to one save's seed, it returns fresh display and audio streams for a
 * play. Calling it twice for the same play gives two streams that repeat the same sequence (film replays).
 */
export function cosmeticFactory(worldSeedHex: string, cosmeticSeed = 0): (scope: CosmeticScope) => CosmeticStreams {
  seedFromHex(worldSeedHex); // fail early on a bad seed
  checkScopeField('cosmeticSeed', cosmeticSeed);
  return (scope) => ({
    display: cosmeticStream(worldSeedHex, 'display', scope, cosmeticSeed),
    audio: cosmeticStream(worldSeedHex, 'audio', scope, cosmeticSeed),
  });
}

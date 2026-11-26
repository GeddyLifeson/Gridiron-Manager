// Season randomness (J13.2.1). Every seed and stream is keyed by what it decides (season, game id,
// decision label), never by the order the runner happened to reach it, so a season gives the same
// answer on one worker or many and after a save and reload.
import { deriveSeed, seedFromHex, seedToHex, stream, hash64Hex, canonicalBytes } from '@gm/engine-core';
import type { standings } from '@gm/league';
import type { Uniform } from './types.ts';

export const SEASON_STREAMS = { game: 'season.game', tieDraw: 'season.tieDraw', committee: 'season.committee' } as const;

export function gameSeedHex(seasonSeedHex: string, season: number, gameId: number): string {
  return seedToHex(deriveSeed(seedFromHex(seasonSeedHex), SEASON_STREAMS.game, [season, gameId]));
}

/** The seeded draw that ends a tiebreak list (C3.2.1 last step): one stream per labelled decision. */
export function tieDraw(seasonSeedHex: string, season: number): standings.TieDraw {
  return {
    draw(ids, label) {
      const s = stream(seedFromHex(seasonSeedHex), SEASON_STREAMS.tieDraw, [season, label]);
      const out = [...ids].sort((a, b) => a - b);
      for (let i = out.length - 1; i > 0; i--) {
        const j = s.int(0, i);
        const t = out[i]!; out[i] = out[j]!; out[j] = t;
      }
      return out;
    },
  };
}

export function uniformFor(seasonSeedHex: string, season: number): (label: string) => Uniform {
  return (label) => {
    const s = stream(seedFromHex(seasonSeedHex), SEASON_STREAMS.committee, [season, label]);
    return { next: () => s.uniform() };
  };
}

export function chainHash(previous: string, value: unknown): string {
  return hash64Hex(canonicalBytes({ previous, value }));
}

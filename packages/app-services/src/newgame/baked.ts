// The baked master data (Marlon 2026-11-26): data gathered from Marlon's own full 1869-to-today run ships
// with the game, read only. The new-game flow reads it for the setup screen's time estimate and the
// league shape at a start; a player's rerun or shorter history never writes it. The loader belongs to the
// bake thread (packages/world/src/bake/); this is the shape the picker reads, bound when it lands.
import { generation, loop } from '@gm/world';
import { stableJson } from './stable-json.ts';

export interface LeagueShape { readonly teamsActive: number; readonly people: number; readonly hallMembers: number }

export interface BakedHistory {
  /** True while the shipped file is not from a finished master run. The screen says the estimate is provisional. */
  readonly provisional: boolean;
  estimateHistorySeconds(input: { readonly seasons: number; readonly size: generation.SizePreset; readonly benchmarkRatio: number }): number;
  shapeAt(seasonsBack: number): LeagueShape | null;
}

/** Measured on the container, one core, small world (this PR's probe): one history season of real games and steps. */
export const MEASURED_SECONDS_PER_SEASON_SMALL = 126;

/**
 * The estimate before the bake lands: the X10.3.3 formula with this build's measured season time, scaled
 * by the machine's own benchmark ratio. Marked provisional.
 */
export const FALLBACK_BAKED: BakedHistory = Object.freeze({
  provisional: true,
  estimateHistorySeconds: ({ seasons, benchmarkRatio }: { seasons: number; size: generation.SizePreset; benchmarkRatio: number }) =>
    loop.scaledEstimate(loop.historySeconds({ seasons, gamesPerSeason: 0, gameMs: 0, seasonMs: MEASURED_SECONDS_PER_SEASON_SMALL * 1000 }), benchmarkRatio, 1),
  shapeAt: () => null,
});

/** A fingerprint of baked data, compared before and after a rerun (the never-changed check). */
export function bakedFingerprint(data: unknown): string {
  return stableJson(data);
}

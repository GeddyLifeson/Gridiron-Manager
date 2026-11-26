// The baked history format (Marlon 2026-11-26): what the game ships from the master data run, the full
// fictional history from 1869 to today on Marlon's own copy. The game only reads it. A player's own history,
// of any length and any number of reruns, never writes it (draftHistory, X10.3.1).
//
// The file is plain JSON so a browser can import it. Its digest is SHA-256 over the canonical bytes
// (engine-core canonicalBytes) of everything except the digest, so a changed number is caught on load.
// Format changes raise BAKE_FORMAT_VERSION; the loader refuses any version it does not know.
import { canonicalBytes } from '@gm/engine-core';
import { bytesToHex, sha256 } from '../generation/sha256.ts';

export const BAKE_FORMAT_VERSION = 1;
/** The run kind master-history.ts writes for a real run; anything else is a dry run and is never final. */
export const MASTER_RUN_KIND = 'MASTER DATA RUN';

/** Where one baked run came from. */
export interface BakedSource {
  readonly kind: string;
  readonly seedHex: string;
  readonly size: string;
  readonly firstSeasonYear: number;
  readonly seasons: number;
  readonly seasonsRun: number;
  readonly games: string;
  readonly status: string;
  readonly worldCode: string;
  readonly worldHash: string;
  readonly validationPass: boolean;
  readonly unbound: readonly string[];
  /** SHA-256 of the run's own files as read, so a bake names exactly which run it came from. */
  readonly inputDigest: string;
}

/** One season of the run, league-wide. */
export interface BakedSeason {
  readonly seasonYear: number;
  /** Wall time of the whole season on the machine that ran it (games plus yearly systems). */
  readonly ms: number;
  readonly games: number;
  readonly pointsPerTeamGame: number;
  readonly passRate: number;
  readonly teamsActive: number;
  readonly people: number;
  readonly hallMembers: number;
}

export interface Quantiles {
  readonly count: number; readonly mean: number;
  readonly p10: number; readonly p25: number; readonly p50: number; readonly p75: number; readonly p90: number; readonly max: number;
}

/** One complete decade of one competition's titles (X10.3.2 parity checks). */
export interface ParityDecade {
  readonly competitionId: number;
  readonly decadeStart: number;
  readonly seasons: number;
  readonly distinctChampions: number;
  /** Most titles by one team over the seasons in the decade. */
  readonly topShare: number;
}

export interface BakedRun {
  readonly source: BakedSource;
  /** True when this run cannot be final data; `provisionalReasons` says why. */
  readonly provisional: boolean;
  readonly provisionalReasons: readonly string[];
  readonly seasons: readonly BakedSeason[];
  /** Least-squares fit of season wall time: ms = msPerGame * games + seasonMs (both floored at 0). */
  readonly timing: { readonly msPerGame: number; readonly seasonMs: number; readonly totalSeconds: number };
  readonly parity: {
    readonly decades: readonly ParityDecade[];
    /** Over complete decades: the fewest distinct champions and the largest top share seen. */
    readonly minDistinctChampions: number | null;
    readonly maxTopShare: number | null;
  };
  readonly tenures: Quantiles | null;
  readonly hall: {
    readonly members: number; readonly players: number; readonly coaches: number; readonly charter: number;
    readonly firstBallotSeason: number | null;
    /** Members elected per ballot after the charter class. */
    readonly classSize: Quantiles | null;
  };
  readonly teams: {
    readonly total: number; readonly folded: number;
    /** Seasons from founding to folding, folded teams only. */
    readonly foldedLifespan: Quantiles | null;
    /** Teams founded (after the first season) and folded, by decade start. */
    readonly foundedByDecade: Readonly<Record<string, number>>;
    readonly foldedByDecade: Readonly<Record<string, number>>;
  };
}

export interface BakedHistory {
  readonly formatVersion: number;
  /** The size preset whose run is the master data (the full world). */
  readonly masterSize: string;
  /** True when the master size is missing or its run is provisional: the game must say estimates are provisional. */
  readonly provisional: boolean;
  /** Last season played in the run (the season before the career starts). */
  readonly endYear: number;
  /** One run per size preset, keyed by size. */
  readonly runs: Readonly<Record<string, BakedRun>>;
  /** SHA-256 hex over the canonical bytes of every other field. */
  readonly digest: string;
}

export type UnsignedBake = Omit<BakedHistory, 'digest'>;

export function bakeDigest(bake: UnsignedBake | BakedHistory): string {
  const { digest: _drop, ...rest } = bake as BakedHistory;
  return bytesToHex(sha256(canonicalBytes(rest)));
}

export function signBake(bake: UnsignedBake): BakedHistory {
  return { ...bake, digest: bakeDigest(bake) };
}

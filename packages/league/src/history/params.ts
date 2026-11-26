// Numbers for the history event log (G-22, X2.1, X2.4). The league lint bans numeric literals in .ts,
// so values live in params.json; this file names each one with its basis (plans/game-build-plan.md
// section 2: `bible` with the leaf, or `assumption`).
import type { ParamFile, WorldTier } from '@gm/schema';
import raw from './params.json' with { type: 'json' };

export const HISTORY_MODULE = 'league.history';

/** X2.4.1 rule 1: tier 1 keeps play-level detail for the current season plus this many prior seasons. */
export const RETAIN_PLAY_SEASONS: number = raw.retainPlaySeasons;

/**
 * FNV-1a 64-bit constants (the published offset basis and prime of the Fowler-Noll-Vo hash). They are
 * algorithm constants, not football facts. Used for the per-season running hash (X2.1.3 rule 4).
 */
export const FNV64_OFFSET_BASIS = BigInt(raw.fnv64OffsetBasis);
export const FNV64_PRIME = BigInt(raw.fnv64Prime);
/** FNV-1a 64 prime is 2^40 + 435; the fast path multiplies four 16-bit limbs (same result as BigInt). */
export const FNV_LIMB = raw.fnv64Limb;
export const HEX_RADIX: number = raw.hexRadix;
export const HASH_HEX_WIDTH: number = raw.hashHexWidth;
export const BITS_PER_HEX_DIGIT: number = raw.bitsPerHexDigit;

/**
 * Size budget for the event log, in bytes of canonical JSON before compression. X2.4.1 rule 6 leaves the
 * budget to P6. P6.6.1 sets no log figure yet, so this is P5.4.1's planning line "summaries about
 * 100 MB" at season 30 for the `standard` profile, read as the event log's share. Assumption until P6
 * measures it on the reference machine.
 */
export const SIZE_BUDGET_BYTES_AT_SEASON_30: number = raw.sizeBudgetBytesAtSeason30;
export const SEASONS_IN_SIZE_BUDGET: number = raw.seasonsInSizeBudget;

/** X13: the lowest fidelity tier. The summary row type is emitted at every tier down to it. */
export const LOWEST_TIER = raw.lowestTier as WorldTier;

export const PARAMS: ParamFile = {
  module: HISTORY_MODULE,
  version: '0.1.0',
  params: [
    {
      name: 'history.retain.playSeasons', value: RETAIN_PLAY_SEASONS, min: 0, max: raw.seasonsInSizeBudget, unit: 'seasons',
      belongsTo: HISTORY_MODULE, basis: 'bible', leaf: 'X2.4.1',
      constrainedBy: 'league history test "compaction keeps recent seasons"; P6 size measurement (X2.4.1 open question)',
      status: 'starting',
    },
    {
      name: 'history.size.budgetBytesAtSeason30', value: SIZE_BUDGET_BYTES_AT_SEASON_30, min: 0, max: SIZE_BUDGET_BYTES_AT_SEASON_30,
      unit: 'bytes', belongsTo: HISTORY_MODULE, basis: 'assumption', leaf: 'P5.4.1',
      constrainedBy: 'league history test "40-season size report"; P6.6.1 once it sets a log budget',
      status: 'starting',
    },
  ],
};

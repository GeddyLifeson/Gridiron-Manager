// The baked history shipped with the game, checked and frozen once. Browser-safe: a JSON module import.
// Until Marlon's master data run is baked, the shipped file is provisional and says so (`provisional`).
import data from './data/master-history.json' with { type: 'json' };
import type { BakedHistory } from './format.ts';
import { loadBakedHistory } from './load.ts';

let cached: BakedHistory | null = null;

/** The shipped baked history, loaded once. Read only: it is deep-frozen. */
export function bakedHistory(): BakedHistory {
  cached ??= loadBakedHistory(data);
  return cached;
}

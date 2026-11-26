// Recipe table rows (PV-07). A row is the audio engine's `SoundDef` (PV-06, `../engine/types.ts`)
// plus what this package adds: the information the sound carries, its era note and its mix level.
// The loudness trim lives in `trims.json`. `toSoundDefs()` in `index.ts` folds trim and mix into
// `recipe.gain` for the engine.

import type { SoundDef, SoundRecipe } from '../engine/types.ts';

/** Why a recipe may not play yet. `period-fact`: waits for PV-10 to check the plan 2.1 Assumption
 * that stadium organs and bands played in stoppages in the period. */
export type RecipeGate = 'period-fact';

export interface RecipeEntry extends Omit<SoundDef, 'recipe'> {
  /** Raw recipe at unit gain; `recipe.gain` is set by `toSoundDefs()`. */
  recipe: Omit<SoundRecipe, 'gain'>;
  /** The football information the sound carries (plan rule 1.2). */
  info: string;
  /** Plan section 4.2 phase. */
  phase: 'v1' | 'v2';
  /** How the sound follows the era look of plan section 2.1. */
  era: string;
  /** Beds (crowd, rain, wind, projector): the engine holds them with `startBed`. */
  bed?: boolean;
  /** Level in the mix relative to the loudness target (never above 0). */
  mixDb: number;
  /** Ranked queue priority for crowd reactions (MB-7): higher wins. */
  priority?: number;
  gate?: RecipeGate;
  /** Off by default in settings (play clock tick, hover tick, stadium ambience, projector). */
  offByDefault?: boolean;
}

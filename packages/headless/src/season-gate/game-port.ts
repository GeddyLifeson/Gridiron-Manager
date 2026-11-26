// The season runner's game port backed by the real game. The code lives in @gm/world season (real-game.ts)
// so the browser app plays the same season; these names stay here for the headless tools.
import { season } from '@gm/world';

export type RealPortOptions = season.RealPortOptions;
export const { realGamePort, seasonPlayerId } = season;

// The generated world's raw content (CR-G81-1): the G-11 world data (pro league, colleges, reference
// locations, blocked terms) and the G-18 name tables with their pure helpers. @gm/world binds these to
// `WorldContent` with `generation.defaultContent(RAW_WORLD_CONTENT, ...)`. Every name and place in them is
// fictional; the blocked-terms list and the real-name guard keep real teams and people out (A6).
// Plain JSON imports and a pure helper file, so the browser app can load the same content as the tools.
import proLeague from '../../data/world/pro-league.json' with { type: 'json' };
import college from '../../data/world/college.json' with { type: 'json' };
import locations from '../../data/world/reference-locations.json' with { type: 'json' };
import blocked from '../../data/world/blocked-terms.json' with { type: 'json' };
import firstNames from '../../data/names/first-names.json' with { type: 'json' };
import surnames from '../../data/names/surnames.json' with { type: 'json' };
import guard from '../../data/names/real-name-guard.json' with { type: 'json' };
import hometowns from '../../data/names/hometowns.json' with { type: 'json' };
import * as namesLib from '../../data/names/lib.ts';

export { namesLib };

/** The same shape as @gm/world `generation.RawContent` (written structurally: football-content may not import world). */
export const RAW_WORLD_CONTENT = {
  proLeague, college, locations, blocked, firstNames, surnames, guard, hometowns, lib: namesLib,
} as const;

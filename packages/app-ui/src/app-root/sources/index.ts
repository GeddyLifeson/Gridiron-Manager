// Route sources of the career root, one file per hub (unstarted-work items 2a to 2d), so the hubs never
// edit CareerRoot.tsx together. Each hub adds its spread here; the career root spreads the result into
// `buildRoutes` (one line, through the exports integrator).
import type { RouteSources } from '../../routes.ts';
import { leagueSources, type HubSourceInput } from './league.ts';
import { footballSources, type FootballHubInput } from './football.ts';

export { leagueSources, legendsQuery, type HubSourceInput } from './league.ts';
export { footballSources, gameplanCommand, type FootballHubInput, type FootballSourceOptions, type FootballSources } from './football.ts';
export { sourceTextIds } from './text.ts';
export { weekSources } from './week.ts';
export { filmSources } from './film.ts';

export function hubSources(input: HubSourceInput & FootballHubInput): Partial<RouteSources> {
  return {
    ...leagueSources(input),
    ...(input.football ? footballSources(input.football, { onChange: input.changed, print: input.print }) : {}),
  };
}

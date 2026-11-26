// Analytics screen package entry (G-71). The integrator adds `analyticsRoute(...)` to the shell's route
// table under the screen id below and re-exports this folder from @gm/app-ui.
import { createElement } from 'react';
import type { RouteEntry, ScreenProps } from '../../shell/index.ts';
import { AnalyticsScreen, parseTab } from './AnalyticsScreen.tsx';
import type { AnalyticsData } from './types.ts';

export * from './types.ts';
export { AnalyticsScreen, ChartGrid, at, analyticsTextIds, spotLabel, parseTab, LIMITS_NOTE_IDS, type AnalyticsScreenProps } from './AnalyticsScreen.tsx';

/** Existing registry screen this package fills (screens.json `film.statistics`, bible N2). */
export const ANALYTICS_SCREEN_ID = 'film.statistics';

/**
 * Route entry. `load` returns the current read-model data for this screen (subscribed by the worker
 * bridge: analyticsStrength, analyticsAccess, analyticsChart, analyticsTracking); `openGames` routes to
 * the film viewer with the games behind a team's strength. The tab lives in the view options (O1.1.3).
 */
export function analyticsRoute(load: (p: ScreenProps) => AnalyticsData, openGames?: (p: ScreenProps, teamId: number) => void): RouteEntry {
  return {
    render: (p) => createElement(AnalyticsScreen, {
      tab: parseTab(p.location.view.tab),
      data: load(p),
      onTab: (tab) => p.setView({ ...p.location.view, tab }),
      onOpenGames: openGames ? (teamId: number) => openGames(p, teamId) : undefined,
    }),
  };
}

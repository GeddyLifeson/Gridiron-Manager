// Legends screen package entry (G-84). The integrator adds `legendsRoute(...)` to the shell's route table
// under the screen id below (a new registry row, requested from the integrator) and re-exports this
// folder from @gm/app-ui.
import { createElement } from 'react';
import type { RouteEntry, ScreenProps } from '../../shell/index.ts';
import { LegendsScreen, parseTab } from './LegendsScreen.tsx';
import type { LegendsData, Link } from './types.ts';

export * from './types.ts';
export { LegendsScreen, lt, legendsTextIds, lineText, parseTab, type LegendsScreenProps } from './LegendsScreen.tsx';

/** Registry screen this package fills (requested row: hub league, route /league/legends, bible X3). */
export const LEGENDS_SCREEN_ID = 'league.legends';

/** Page link as view options, so back and forward and deep links keep the page open (O1.1.3). */
export function linkView(view: Record<string, string>, link: Link): Record<string, string> {
  return { ...view, tab: 'page', kind: link.kind, id: String(link.id) };
}

/**
 * Route entry. `load` returns the current read-model data (legendsPage, legendsChronicle, legendsEra,
 * legendsTree, legendsRivalry, legendsRecords, legendsSearch) for the view options; `provisional` says
 * whether a qualifier fact row is short of Verified (Q6.3.1).
 */
export function legendsRoute(load: (p: ScreenProps) => LegendsData, opts: {
  back?: (p: ScreenProps) => void; forward?: (p: ScreenProps) => void; provisional?: (factId: string) => boolean;
} = {}): RouteEntry {
  return {
    render: (p) => createElement(LegendsScreen, {
      tab: parseTab(p.location.view.tab),
      data: load(p),
      onTab: (tab) => p.setView({ ...p.location.view, tab }),
      onOpen: (link: Link) => p.setView(linkView(p.location.view, link)),
      onSearch: (text: string) => p.setView({ ...p.location.view, tab: 'search', q: text }),
      ...(opts.back ? { onBack: () => opts.back!(p) } : {}),
      ...(opts.forward ? { onForward: () => opts.forward!(p) } : {}),
      ...(opts.provisional ? { provisional: opts.provisional } : {}),
    }),
  };
}

// @gm/app-ui, free agency screen (item 7, registry id team.free_agency). The integrator adds the route entry
// to the shell's route table: `routes['team.free_agency'] = freeAgencyRoute(host)`.
import { createElement } from 'react';
import type { RouteEntry } from '../../shell/index.ts';
import { FreeAgencyScreen } from './FreeAgencyScreen.tsx';
import { TABS, type FaIntent, type FreeAgencyUi, type Tab } from './view.ts';

export { FreeAgencyScreen, type FreeAgencyScreenProps } from './FreeAgencyScreen.tsx';
export * from './view.ts';

export const FREE_AGENCY_SCREEN_ID = 'team.free_agency';

/** What the host supplies: the current read model for the user's club, and a sink for intents. */
export interface FreeAgencyHost {
  view(): FreeAgencyUi | null;
  dispatch(intent: FaIntent): void;
}

const isTab = (s: string | undefined): s is Tab => !!s && (TABS as readonly string[]).includes(s);

/** The route entry. The tab is a view option of the address (O1.1.3), so it survives back and forward. */
export function freeAgencyRoute(host: FreeAgencyHost): RouteEntry {
  return {
    render: (p) => createElement(FreeAgencyScreen, {
      view: host.view(),
      tab: isTab(p.location.view.tab) ? p.location.view.tab : 'market',
      readOnly: p.readOnly,
      onTab: (tab) => p.setView({ ...p.location.view, tab }),
      onIntent: (i) => host.dispatch(i),
    }),
  };
}

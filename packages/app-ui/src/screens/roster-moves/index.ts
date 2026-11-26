// @gm/app-ui, roster moves screen (G-70, registry id team.roster_moves). The integrator adds the route
// entry to the shell's route table: `routes['team.roster_moves'] = rosterMovesRoute(host)`.
import { createElement } from 'react';
import type { RouteEntry } from '../../shell/index.ts';
import { RosterMovesScreen } from './RosterMovesScreen.tsx';
import { TABS, type RosterIntent, type RosterMovesUi, type Tab } from './view.ts';

export { RosterMovesScreen, type RosterMovesScreenProps } from './RosterMovesScreen.tsx';
export * from './view.ts';

export const SCREEN_ID = 'team.roster_moves';

/** What the host supplies: the current read model for the user's club, and a sink for intents. */
export interface RosterMovesHost {
  view(): RosterMovesUi | null;
  dispatch(intent: RosterIntent): void;
}

const isTab = (s: string | undefined): s is Tab => !!s && (TABS as readonly string[]).includes(s);

/** The route entry. The tab is a view option of the address (O1.1.3), so it survives back and forward. */
export function rosterMovesRoute(host: RosterMovesHost): RouteEntry {
  return {
    render: (p) => createElement(RosterMovesScreen, {
      view: host.view(),
      tab: isTab(p.location.view.tab) ? p.location.view.tab : 'strip',
      readOnly: p.readOnly,
      onTab: (tab) => p.setView({ ...p.location.view, tab }),
      onIntent: (i) => host.dispatch(i),
    }),
  };
}

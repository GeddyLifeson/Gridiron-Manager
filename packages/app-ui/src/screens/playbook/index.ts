// @gm/app-ui, playbook library screen (G-67, registry id football.playbook). The integrator adds the route
// entry to the shell's route table: `routes['football.playbook'] = playbookRoute(host)`.
import { createElement } from 'react';
import type { RouteEntry } from '../../shell/index.ts';
import { PlaybookScreen } from './PlaybookScreen.tsx';
import { filterFromView, filterToView, TABS, type PlaybookIntent, type PlaybookUi, type Tab, type UiFilter } from './view.ts';

export { PlaybookScreen, type PlaybookScreenProps } from './PlaybookScreen.tsx';
export * from './view.ts';

export const SCREEN_ID = 'football.playbook';
export const SIDES = ['offense', 'defense', 'special_teams'] as const;
export type Side = (typeof SIDES)[number];

/** What the host supplies: the read model for the user's club, side and filter, and a sink for intents. */
export interface PlaybookHost {
  view(side: Side, filter: UiFilter): PlaybookUi | null;
  dispatch(side: Side, intent: PlaybookIntent): void;
}

const isTab = (s: string | undefined): s is Tab => !!s && (TABS as readonly string[]).includes(s);
const sideOf = (s: string | undefined): Side => ((SIDES as readonly string[]).includes(s ?? '') ? (s as Side) : 'offense');

/** The route entry. Side, tab and filter are view options of the address (O1.1.3), so they survive back and forward. */
export function playbookRoute(host: PlaybookHost): RouteEntry {
  return {
    render: (p) => {
      const side = sideOf(p.location.view.side);
      return createElement(PlaybookScreen, {
        view: host.view(side, filterFromView(p.location.view)),
        tab: isTab(p.location.view.tab) ? p.location.view.tab : 'library',
        readOnly: p.readOnly,
        onTab: (tab) => p.setView({ ...p.location.view, tab }),
        onFilter: (f) => p.setView(filterToView(p.location.view, f)),
        onIntent: (i) => host.dispatch(side, i),
      });
    },
  };
}

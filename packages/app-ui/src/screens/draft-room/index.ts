// @gm/app-ui, draft room screen (item 7, registry id team.draft). The integrator adds the route entry to
// the shell's route table: `routes['team.draft'] = draftRoomRoute(host)`.
import { createElement } from 'react';
import type { RouteEntry } from '../../shell/index.ts';
import { DraftRoomScreen } from './DraftRoomScreen.tsx';
import { TABS, type DraftIntent, type DraftRoomUi, type Tab } from './view.ts';

export { DraftRoomScreen, type DraftRoomScreenProps } from './DraftRoomScreen.tsx';
export * from './view.ts';

export const DRAFT_ROOM_SCREEN_ID = 'team.draft';

/** What the host supplies: the current read model for the user's club, and a sink for intents. */
export interface DraftRoomHost {
  view(): DraftRoomUi | null;
  dispatch(intent: DraftIntent): void;
}

const isTab = (s: string | undefined): s is Tab => !!s && (TABS as readonly string[]).includes(s);

/** The route entry. The tab is a view option of the address (O1.1.3), so it survives back and forward. */
export function draftRoomRoute(host: DraftRoomHost): RouteEntry {
  return {
    render: (p) => createElement(DraftRoomScreen, {
      view: host.view(),
      tab: isTab(p.location.view.tab) ? p.location.view.tab : 'board',
      readOnly: p.readOnly,
      onTab: (tab) => p.setView({ ...p.location.view, tab }),
      onIntent: (i) => host.dispatch(i),
    }),
  };
}

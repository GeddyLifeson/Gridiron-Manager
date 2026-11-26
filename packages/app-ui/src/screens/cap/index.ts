// @gm/app-ui, contracts and cap screen (registry id team.cap). The integrator adds the route entry to the
// shell's route table: `routes['team.cap'] = capRoute(host)`.
import { createElement } from 'react';
import type { RouteEntry } from '../../shell/index.ts';
import { CapScreen } from './CapScreen.tsx';
import { TABS, type CapIntent, type CapUi, type Tab } from './view.ts';

export { CapScreen, type CapScreenProps } from './CapScreen.tsx';
export * from './view.ts';

export const SCREEN_ID = 'team.cap';

/** What the host supplies: the current read model for the user's club, and a sink for intents. */
export interface CapHost {
  view(): CapUi | null;
  dispatch(intent: CapIntent): void;
}

const isTab = (s: string | undefined): s is Tab => !!s && (TABS as readonly string[]).includes(s);

/** The route entry. Tab and open contract are view options of the address (O1.1.3), so they survive back and forward. */
export function capRoute(host: CapHost): RouteEntry {
  return {
    render: (p) => {
      const sel = Number(p.location.view.contract);
      return createElement(CapScreen, {
        view: host.view(),
        tab: isTab(p.location.view.tab) ? p.location.view.tab : 'contracts',
        readOnly: p.readOnly,
        selected: p.location.view.contract !== undefined && Number.isInteger(sel) ? sel : null,
        onTab: (tab) => p.setView({ ...p.location.view, tab }),
        onSelect: (id) => {
          const next: Record<string, string> = { ...p.location.view };
          if (id === null) delete next.contract; else next.contract = String(id);
          p.setView(next);
        },
        onIntent: (i) => host.dispatch(i),
      });
    },
  };
}

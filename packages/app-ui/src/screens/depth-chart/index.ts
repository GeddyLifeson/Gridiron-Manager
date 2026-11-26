// @gm/app-ui, depth chart screen (registry id team.depth_chart). The integrator adds the route entry to
// the shell's route table: `routes['team.depth_chart'] = depthChartRoute(host)`.
import { createElement } from 'react';
import type { RouteEntry } from '../../shell/index.ts';
import { DepthChartScreen } from './DepthChartScreen.tsx';
import { TABS, type DepthChartUi, type DepthIntent, type Tab, type UiRosterCard } from './view.ts';

export { DepthChartScreen, type DepthChartScreenProps } from './DepthChartScreen.tsx';
export * from './view.ts';

export const SCREEN_ID = 'team.depth_chart';

/**
 * What the host supplies: the read model, the roster for the pickers, and a sink for edits. `dispatch`
 * returns the refusal message when app-services `applyDepthEdit` refuses the edit, else null.
 */
export interface DepthChartHost {
  view(): DepthChartUi | null;
  roster(): readonly UiRosterCard[];
  dispatch(intent: DepthIntent): string | null;
  lastRefusal?(): string | null;
}

const isTab = (s: string | undefined): s is Tab => !!s && (TABS as readonly string[]).includes(s);

/** The route entry. Tab and unit are view options of the address (O1.1.3). */
export function depthChartRoute(host: DepthChartHost): RouteEntry {
  return {
    render: (p) => createElement(DepthChartScreen, {
      view: host.view(),
      roster: host.roster(),
      tab: isTab(p.location.view.tab) ? p.location.view.tab : 'off',
      unitId: p.location.view.unit ?? null,
      readOnly: p.readOnly,
      refusal: host.lastRefusal?.() ?? null,
      onTab: (tab) => p.setView({ ...p.location.view, tab }),
      onUnit: (unit) => p.setView({ ...p.location.view, unit }),
      onIntent: (i) => { host.dispatch(i); },
    }),
  };
}

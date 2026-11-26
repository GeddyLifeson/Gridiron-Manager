// @gm/app-ui, install board screen (O3.3.2, registry id football.install). The integrator adds the route
// entry to the shell's route table: `routes['football.install'] = installRoute(host)`.
import { createElement } from 'react';
import type { RouteEntry } from '../../shell/index.ts';
import { InstallScreen } from './InstallScreen.tsx';
import { MODES, SIDES, type InstallIntent, type InstallUi, type Mode, type Side } from './view.ts';

export { InstallScreen, type InstallScreenProps } from './InstallScreen.tsx';
export * from './view.ts';

export const SCREEN_ID = 'football.install';

/** What the host supplies: the read model for the user's club, side and mode, and a sink for intents. */
export interface InstallHost {
  view(side: Side, mode: Mode): InstallUi | null;
  dispatch(side: Side, intent: InstallIntent): void;
}

const sideOf = (s: string | undefined): Side => ((SIDES as readonly string[]).includes(s ?? '') ? (s as Side) : 'offense');
const modeOf = (s: string | undefined): Mode => ((MODES as readonly string[]).includes(s ?? '') ? (s as Mode) : 'week');

/** The route entry. Side and mode are view options of the address (O1.1.3), so back and forward keep them. */
export function installRoute(host: InstallHost): RouteEntry {
  return {
    render: (p) => {
      const side = sideOf(p.location.view.side);
      const mode = modeOf(p.location.view.mode);
      return createElement(InstallScreen, {
        view: host.view(side, mode),
        readOnly: p.readOnly,
        onMode: (m) => p.setView({ ...p.location.view, mode: m }),
        onIntent: (i) => host.dispatch(side, i),
      });
    },
  };
}

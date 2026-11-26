// @gm/app-ui, player designer screen (G-92, D13.1). The integrator registers the screen (CR-G92-3:
// `people.player_designer`, modes normal only, never certified) and adds the route entry:
// `routes['people.player_designer'] = playerDesignerRoute(host)`.
import { createElement } from 'react';
import type { RouteEntry } from '../../shell/index.ts';
import { PlayerDesignerScreen } from './PlayerDesignerScreen.tsx';
import type { DesignerUiIntent, PlayerDesignerUi } from './view.ts';

export { PlayerDesignerScreen, type PlayerDesignerScreenProps } from './PlayerDesignerScreen.tsx';
export * from './view.ts';

export const SCREEN_ID = 'people.player_designer';

/** What the host supplies: the current designer model, and a sink for intents. */
export interface PlayerDesignerHost {
  view(): PlayerDesignerUi | null;
  dispatch(intent: DesignerUiIntent): void;
}

/** The route entry. "Edit a copy" on a player card reaches the host, which sends a `start_copy` intent. */
export function playerDesignerRoute(host: PlayerDesignerHost): RouteEntry {
  return {
    render: (p) => createElement(PlayerDesignerScreen, {
      view: host.view(),
      readOnly: p.readOnly,
      onIntent: (i) => host.dispatch(i),
    }),
  };
}

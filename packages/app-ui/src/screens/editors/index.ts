// @gm/app-ui, Mods and editors screen (G-96, proposed registry id school.mods). The integrator adds the
// registry row and the route entry: `routes['school.mods'] = editorsRoute(host)`.
import { createElement } from 'react';
import type { RouteEntry } from '../../shell/index.ts';
import { EditorsScreen } from './EditorsScreen.tsx';
import type { EditorsIntent, EditorsUi } from './view.ts';

export { EditorsScreen, type EditorsScreenProps } from './EditorsScreen.tsx';
export * from './view.ts';

export const SCREEN_ID = 'school.mods';

/** What the host supplies: the current Mods list and editor list, and a sink for intents. */
export interface EditorsHost {
  view(): EditorsUi | null;
  dispatch(intent: EditorsIntent): void;
}

export function editorsRoute(host: EditorsHost): RouteEntry {
  return { render: (p) => createElement(EditorsScreen, { view: host.view(), readOnly: p.readOnly, onIntent: (i) => host.dispatch(i) }) };
}

// Game management panel package entry (G-61). The panel sits in the game console's sideline region
// (O2.1.2); G-60 owns the console route `game.console` and embeds `GameManagementPanel`. Until it does,
// the integrator may mount `gameManagementRoute(...)` on `game.console` so the panel is reachable (CR-G61-3).
import { createElement } from 'react';
import type { RouteEntry, ScreenProps } from '../../shell/index.ts';
import { GameManagementPanel, parseTab } from './GameManagementPanel.tsx';
import type { GameManagementData } from './types.ts';

export * from './types.ts';
export { GameManagementPanel, gt, gmTextIds, mmss, spotText, parseTab, type GameManagementPanelProps } from './GameManagementPanel.tsx';
export { PROMPT_BINDINGS, panelContexts, keyFor, intentFor, release, type PanelIntent, type Hold } from './keys.ts';

/** Registry screen the panel fills until the console lands (screens.json `game.console`, O2.1.2, O2.4.1). */
export const GAME_MANAGEMENT_SCREEN_ID = 'game.console';

/**
 * Route entry. `load` returns the `gameManagement` read-model data (subscribed by the worker bridge);
 * `keyOf` reads the live key map; `pick` sends the bar option chosen by pointer. The tab lives in the view options.
 */
export function gameManagementRoute(load: (p: ScreenProps) => GameManagementData, keyOf: (action: string) => string, pick?: (p: ScreenProps, optionIndex: number) => void): RouteEntry {
  return {
    render: (p) => createElement(GameManagementPanel, {
      data: load(p),
      tab: parseTab(p.location.view.tab),
      onTab: (tab) => p.setView({ ...p.location.view, tab }),
      keyOf,
      onPick: pick ? (i: number) => pick(p, i) : undefined,
    }),
  };
}

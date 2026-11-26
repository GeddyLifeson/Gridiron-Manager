// G-60 game-day console screen. The integrator adds `gameCallingRoutes` to the shell's route table
// (game-build-plan section 2, "Screens"); the shell already routes `game.console` and hands it the keyboard.
import { createElement, type ReactNode } from 'react';
import type { RouteTable } from '../../shell/index.ts';
import { GameConsole, type ConsoleViewModel, type ConsolePresentation } from './GameConsole.tsx';

export * from './GameConsole.tsx';

export interface GameCallingSource {
  /** The console read model for this frame, or null before the first dead ball. */
  view(): ConsoleViewModel | null;
  /** The field view (G-03) for the current snap. */
  field?(): ReactNode;
  /** The G-61 game management panel for the sideline region (CR-G61-3: the integrator binds it). */
  sideline?(): ReactNode;
  /** PV-05 score strip and banners for this frame (teams, possession, conditions, look, banner queue). */
  presentation?(): ConsolePresentation | undefined;
}

export function gameCallingRoutes(source: GameCallingSource): RouteTable {
  return { 'game.console': {
    render: () => {
      const presentation = source.presentation?.();
      return createElement(GameConsole, { view: source.view(), field: source.field?.(), sideline: source.sideline?.(), ...(presentation ? { presentation } : {}) });
    },
  } };
}

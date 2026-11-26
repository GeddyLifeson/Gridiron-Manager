// Play designer screen package entry (G-90; O3.1). The integrator adds `playDesignerRoute(...)` to the
// shell's route table under the screen id below and re-exports this folder from @gm/app-ui.
import { createElement } from 'react';
import type { RouteEntry, ScreenProps } from '../../shell/index.ts';
import { PlayDesignerScreen } from './PlayDesignerScreen.tsx';
import type { DesignerCommand, DesignerViewData } from './types.ts';

export * from './types.ts';
export { PlayDesignerScreen, pt, designerTextIds, messageText, type PlayDesignerProps } from './PlayDesignerScreen.tsx';
export { keyCommands, type KeyPress } from './keys.ts';

/** Existing registry screen this package fills (screens.json `football.play_designer`, route /football/play-designer). */
export const PLAY_DESIGNER_SCREEN_ID = 'football.play_designer';

/**
 * The host's side of the screen: `view` is app-services `playDesigner.designerView(state, ports)` for the
 * open draft, `send` runs `playDesigner.send` and carries out its effects (autosave, hours, publish).
 */
export interface PlayDesignerController {
  view(p: ScreenProps): DesignerViewData;
  send(p: ScreenProps, cmd: DesignerCommand): void;
  openSample?(p: ScreenProps, runIndex: number): void;
}

export function playDesignerRoute(c: PlayDesignerController): RouteEntry {
  return {
    render: (p) => createElement(PlayDesignerScreen, {
      view: c.view(p),
      send: (cmd: DesignerCommand) => c.send(p, cmd),
      readOnly: p.readOnly,
      onOpenSample: c.openSample ? (i: number) => c.openSample!(p, i) : undefined,
    }),
  };
}

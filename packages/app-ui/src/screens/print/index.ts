// @gm/app-ui, print and export screen (O3.4.3, registry id football.print). It reads the same game plan
// read model as the call sheet screen, so a host that serves `football.call_sheet` serves this too. The
// integrator adds the route entry: `routes['football.print'] = printRoute(host)`.
import { createElement } from 'react';
import type { RouteEntry } from '../../shell/index.ts';
import { optionsFromView, type GameplanHost } from '../gameplan/index.ts';
import { UNITS, type Unit } from '../gameplan/view.ts';
import { PrintScreen } from './PrintScreen.tsx';
import { docsFromView, docsToView } from './view.ts';

export { PrintScreen, type PrintScreenProps } from './PrintScreen.tsx';
export * from './view.ts';

export const SCREEN_ID = 'football.print';

/** The game plan host plus the platform's print call (the browser's print dialog in the browser build). */
export interface PrintHost extends GameplanHost {
  print?(): void;
}

const unitOf = (s: string | undefined): Unit => ((UNITS as readonly string[]).includes(s ?? '') ? (s as Unit) : 'offense');

/** The route entry. Unit, paper, key hints and the pages chosen are view options of the address (O1.1.3). */
export function printRoute(host: PrintHost): RouteEntry {
  return {
    render: (p) => {
      const unit = unitOf(p.location.view.unit);
      return createElement(PrintScreen, {
        view: host.view(unit, optionsFromView(p.location.view)),
        unit,
        docs: docsFromView(p.location.view),
        onUnit: (u) => p.setView({ ...p.location.view, unit: u }),
        onIntent: (i) => {
          if (i.kind === 'settings') p.setView({ ...p.location.view, paper: i.paper, keys: i.keyHints ? '1' : '0', docs: docsToView(i.docs) });
          else if (i.kind === 'print') (host.print ?? (() => globalThis.print?.()))();
          else host.dispatch(unit, { kind: 'export_sheet' });
        },
      });
    },
  };
}

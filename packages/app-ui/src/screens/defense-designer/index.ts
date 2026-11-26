// Defensive call designer screen package entry (G-91). The integrator adds `defenseDesignerRoute(...)` to
// the shell's route table under the screen id below and re-exports this folder from @gm/app-ui (CR-G91-1).
import { createElement } from 'react';
import type { RouteEntry, ScreenProps } from '../../shell/index.ts';
import { DefenseDesignerScreen } from './DefenseDesignerScreen.tsx';
import { RUN_FAMILY_IDS, type DefenseDesignerView, type RunFamilyId } from './types.ts';

export * from './types.ts';
export { DefenseDesignerScreen, dt, designerTextIds, dutyText, canvasMap, CANVAS_DEFENSE_DEPTH_YD, CANVAS_OFFENSE_DEPTH_YD, type DefenseDesignerScreenProps, type CanvasMap } from './DefenseDesignerScreen.tsx';

/** Registry screen this package fills (screens.json `football.defense_designer`, bible O3.2.1). */
export const DEFENSE_DESIGNER_SCREEN_ID = 'football.defense_designer';

/** What the route asks the read model for: kept in the view options (O1.1.3) so a link restores it. */
export interface DefenseDesignerQuery { readonly lookId: string | null; readonly slot: string | null; readonly family: RunFamilyId }

export function parseFamily(v: string | undefined): RunFamilyId {
  return (RUN_FAMILY_IDS as readonly string[]).includes(v ?? '') ? (v as RunFamilyId) : 'insideZone';
}

export function parseQuery(view: Record<string, string>): DefenseDesignerQuery {
  return { lookId: view.look ?? null, slot: view.slot ?? null, family: parseFamily(view.family) };
}

/**
 * Route entry. `load` returns the read-model view (`defenseDesignerView` in app-services) for the query;
 * `handTo` opens the delegation control of the hours strip (O3.7.2). Look, selected defender and run family
 * live in the view options. A read-only shell (O1.1.4) draws the screen without handlers.
 */
export function defenseDesignerRoute(load: (p: ScreenProps, q: DefenseDesignerQuery) => DefenseDesignerView, handTo?: (p: ScreenProps) => void): RouteEntry {
  return {
    render: (p) => {
      const q = parseQuery(p.location.view);
      const set = (patch: Record<string, string>) => p.setView({ ...p.location.view, ...patch });
      return createElement(DefenseDesignerScreen, {
        view: load(p, q),
        onLook: (look: string) => set({ look }),
        onSelect: (slot: string) => set({ slot }),
        onFamily: (family: RunFamilyId) => set({ family }),
        onHandTo: handTo && !p.readOnly ? () => handTo(p) : undefined,
      });
    },
  };
}

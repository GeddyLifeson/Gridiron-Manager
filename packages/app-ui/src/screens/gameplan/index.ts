// @gm/app-ui, game plan builder and call sheet screens (G-68; registry ids football.game_plan and
// football.call_sheet). The integrator adds the route entries to the shell's route table:
// `routes['football.game_plan'] = gamePlanRoute(host)` and `routes['football.call_sheet'] = callSheetRoute(host)`.
import { createElement } from 'react';
import type { RouteEntry } from '../../shell/index.ts';
import { CallSheetScreen } from './CallSheetScreen.tsx';
import { GamePlanScreen } from './GamePlanScreen.tsx';
import { PAPERS, PLAN_TABS, SHEET_TABS, UNITS, type GameplanIntent, type GameplanView, type PlanTab, type SheetTab, type Unit } from './view.ts';

export { GamePlanScreen, type GamePlanScreenProps } from './GamePlanScreen.tsx';
export { CallSheetScreen, type CallSheetScreenProps } from './CallSheetScreen.tsx';
export * from './view.ts';

export const PLAN_SCREEN_ID = 'football.game_plan';
export const SHEET_SCREEN_ID = 'football.call_sheet';

/** View options the read model takes (all from the address, O1.1.3). */
export interface GameplanOptions { situation: string | null; paper: (typeof PAPERS)[number]; keyHints: boolean }

/** What the host supplies: the read model for the user's club and unit, and a sink for intents. */
export interface GameplanHost {
  view(unit: Unit, options: GameplanOptions): GameplanView | null;
  dispatch(unit: Unit, intent: GameplanIntent): void;
}

const unitOf = (s: string | undefined): Unit => ((UNITS as readonly string[]).includes(s ?? '') ? (s as Unit) : 'offense');

export function optionsFromView(view: Record<string, string>): GameplanOptions {
  const paper = (PAPERS as readonly string[]).includes(view.paper ?? '') ? (view.paper as GameplanOptions['paper']) : 'letter';
  return { situation: view.situation || null, paper, keyHints: view.keys !== '0' };
}

/** The game plan route. Unit, tab and selected situation live in the address, so back and forward keep them. */
export function gamePlanRoute(host: GameplanHost): RouteEntry {
  const isTab = (s: string | undefined): s is PlanTab => !!s && (PLAN_TABS as readonly string[]).includes(s);
  return {
    render: (p) => {
      const unit = unitOf(p.location.view.unit);
      return createElement(GamePlanScreen, {
        view: host.view(unit, optionsFromView(p.location.view)),
        tab: isTab(p.location.view.tab) ? p.location.view.tab : 'plan',
        readOnly: p.readOnly,
        onTab: (tab) => p.setView({ ...p.location.view, tab }),
        onSelectSituation: (id) => {
          const next: Record<string, string> = { ...p.location.view };
          if (id) next.situation = id; else delete next.situation;
          p.setView(next);
        },
        onIntent: (i) => host.dispatch(unit, i),
      });
    },
  };
}

/** The call sheet route. Paper and key hints of the print preview are view options of the address, not commands. */
export function callSheetRoute(host: GameplanHost): RouteEntry {
  const isTab = (s: string | undefined): s is SheetTab => !!s && (SHEET_TABS as readonly string[]).includes(s);
  return {
    render: (p) => {
      const unit = unitOf(p.location.view.unit);
      return createElement(CallSheetScreen, {
        view: host.view(unit, optionsFromView(p.location.view)),
        tab: isTab(p.location.view.tab) ? p.location.view.tab : 'layout',
        readOnly: p.readOnly,
        onTab: (tab) => p.setView({ ...p.location.view, tab }),
        onIntent: (i) => {
          if (i.kind === 'print') p.setView({ ...p.location.view, paper: i.paper, keys: i.keyHints ? '1' : '0' });
          else host.dispatch(unit, i);
        },
      });
    },
  };
}

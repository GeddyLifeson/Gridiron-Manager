// @gm/app-ui, office (home) screens (G-72): Today, Inbox and decisions, Calendar and advance. The
// integrator adds the routes to the shell's route table: `putAll(homeRoutes(s.home))` in buildRoutes
// (CR-G72-4). Below head coach the career package's assignment list takes office.today (O7.2.1); the
// integrator keeps that binding and uses `homeRoutes` for the head coach seat.
import { createElement } from 'react';
import type { RouteTable } from '../../shell/index.ts';
import { toPath } from '../people/index.ts';
import { AdvancePanel, InboxList, TodayScreen } from './HomeScreens.tsx';
import type { HomeIntent, TextOf, UiHome } from './view.ts';

export * from './HomeScreens.tsx';
export * from './view.ts';

export const HOME_SCREEN_IDS = { today: 'office.today', inbox: 'office.inbox', calendar: 'office.calendar' } as const;

export interface HomeHost {
  view(): UiHome | null;
  text?: TextOf;
  dispatch(intent: HomeIntent): void;
}

export function homeRoutes(host: HomeHost): RouteTable {
  const props = (readOnly: boolean, open: (to: string) => void) => ({
    view: host.view(), readOnly, ...(host.text ? { text: host.text } : {}),
    onIntent: (i: HomeIntent) => {
      const path = i.kind === 'open' ? toPath(i.screenId) : null;
      if (path) open(path); else host.dispatch(i);
    },
  });
  return {
    [HOME_SCREEN_IDS.today]: { render: (p) => createElement(TodayScreen, props(p.readOnly, p.navigate)) },
    [HOME_SCREEN_IDS.inbox]: { render: (p) => createElement(InboxList, props(p.readOnly, p.navigate)) },
    [HOME_SCREEN_IDS.calendar]: { render: (p) => createElement(AdvancePanel, props(p.readOnly, p.navigate)) },
  };
}

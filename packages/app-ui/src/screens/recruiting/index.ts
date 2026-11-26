// @gm/app-ui, recruiting board screen (O7.5.1, registry id league.recruiting, route /league/recruiting). The
// integrator adds the route entry to the shell's route table: `routes['league.recruiting'] = recruitingRoute(host)`.
import { createElement } from 'react';
import type { RouteEntry } from '../../shell/index.ts';
import { RecruitingScreen } from './RecruitingScreen.tsx';
import { TABS, type DayLabel, type RecruitingIntent, type RecruitingUi, type Tab } from './view.ts';

export { RecruitingScreen, GradeCell, type RecruitingScreenProps } from './RecruitingScreen.tsx';
export * from './view.ts';

export const SCREEN_ID = 'league.recruiting';

/** What the host supplies: the read model for the user's program (built for the board or the pool), a sink for intents, and day labels. */
export interface RecruitingHost {
  view(list: 'board' | 'pool'): RecruitingUi | null;
  dispatch(intent: RecruitingIntent): void;
  dayLabel?: DayLabel;
}

const isTab = (s: string | undefined): s is Tab => !!s && (TABS as readonly string[]).includes(s);
const cardOf = (s: string | undefined): number | null => (s && /^\d+$/.test(s) ? Number(s) : null);

/** The route entry. Tab and open card are view options of the address (O1.1.3), so they survive back and forward. */
export function recruitingRoute(host: RecruitingHost): RouteEntry {
  return {
    render: (p) => {
      const tab: Tab = isTab(p.location.view.tab) ? p.location.view.tab : 'board';
      return createElement(RecruitingScreen, {
        view: host.view(tab === 'pool' ? 'pool' : 'board'),
        tab,
        cardId: cardOf(p.location.view.card),
        readOnly: p.readOnly,
        ...(host.dayLabel ? { dayLabel: host.dayLabel } : {}),
        onTab: (t) => p.setView({ ...p.location.view, tab: t }),
        onCard: (id) => {
          const next: Record<string, string> = { ...p.location.view };
          if (id === null) delete next.card; else next.card = String(id);
          p.setView(next);
        },
        onIntent: (i) => host.dispatch(i),
      });
    },
  };
}

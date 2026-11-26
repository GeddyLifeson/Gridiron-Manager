// Decision log screen (film.decision_log; N3). The integrator adds `decisionLogRoutes(host)` to the shell's
// route table (`putAll(decisionLogRoutes(s.decisionLog))` in buildRoutes) and re-exports this folder.
import { createElement } from 'react';
import type { RouteTable } from '../../shell/index.ts';
import { DecisionLogScreen } from './DecisionLogScreen.tsx';
import type { UiDecisionFilter, UiDecisionLog } from './view.ts';

export * from './view.ts';
export { DecisionLogScreen, DecisionRowView, type DecisionLogScreenProps } from './DecisionLogScreen.tsx';

export const DECISION_LOG_SCREEN_ID = 'film.decision_log';

export interface DecisionLogHost {
  decisionLog(filter: UiDecisionFilter): UiDecisionLog | null;
  text?(key: string): string;
}

/** The filter lives in the address (O1.1.3). */
export function decisionFilterFromView(view: Record<string, string>): UiDecisionFilter {
  const scope = view.scope === 'game' || view.scope === 'week' ? view.scope : 'all';
  const who = view.who === 'mine' || view.who === 'staff' ? view.who : 'all';
  return { scope, type: view.type || null, gameId: view.game && /^\d+$/.test(view.game) ? Number(view.game) : null, who, clearlyWrongOnly: view.wrong === '1' };
}

export function viewFromDecisionFilter(f: UiDecisionFilter): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.scope !== 'all') out.scope = f.scope;
  if (f.type) out.type = f.type;
  if (f.gameId !== null) out.game = String(f.gameId);
  if (f.who !== 'all') out.who = f.who;
  if (f.clearlyWrongOnly) out.wrong = '1';
  return out;
}

export function decisionLogRoutes(host: DecisionLogHost): RouteTable {
  return {
    [DECISION_LOG_SCREEN_ID]: {
      render: (p) => {
        const filter = decisionFilterFromView(p.location.view);
        return createElement(DecisionLogScreen, {
          view: host.decisionLog(filter), filter, ...(host.text ? { text: (k: string) => host.text!(k) } : {}),
          onFilter: (f: UiDecisionFilter) => p.setView(viewFromDecisionFilter(f)),
        });
      },
    },
  };
}

// Coach's notebook screen (coach.notebook; E11, E10.4.1, E10.5.2). The integrator adds the registry row
// (screens.json, hub "coach"), the ladder access row, `notebookRoutes(s.notebook)` in buildRoutes and the
// barrel line. The host builds its source from app-services `notebook.buildNotebook`, `buildLedgerView`,
// `applyNotebookAction` and `exportNotebookText`.
import { createElement } from 'react';
import type { RouteTable } from '../../shell/index.ts';
import { NotebookScreen, type NotebookSource } from './NotebookScreen.tsx';
import { notebookStateFromView, viewFromNotebookState } from './view.ts';

export * from './view.ts';
export { NotebookScreen, NoteRowView, LedgerPage, LedgerRowView, type NotebookScreenProps, type NotebookSource } from './NotebookScreen.tsx';

export const NOTEBOOK_SCREEN_ID = 'coach.notebook';
export const NOTEBOOK_ROUTE = '/coach/notebook';
export const DECISION_LOG_ROUTE = '/film/decision-log';

export type NotebookHost = NotebookSource;

export function notebookRoutes(host: NotebookHost): RouteTable {
  return {
    [NOTEBOOK_SCREEN_ID]: {
      render: (p) => {
        const { tab, filter } = notebookStateFromView(p.location.view);
        return createElement(NotebookScreen, {
          source: host, tab, filter, readOnly: p.readOnly,
          onState: (t, f) => p.setView(viewFromNotebookState(t, f)),
          onOpenDecisionLog: () => p.navigate(DECISION_LOG_ROUTE),
        });
      },
    },
  };
}

// Coaching school screen package entry (G-94). The integrator adds `schoolRoute(...)` to the shell's route
// table under the screen ids below and re-exports this folder from @gm/app-ui.
import { createElement } from 'react';
import type { RouteEntry, ScreenProps } from '../../shell/index.ts';
import { SchoolScreen, parseTab } from './SchoolScreen.tsx';
import type { SchoolData, SchoolTab } from './types.ts';

export * from './types.ts';
export { SchoolScreen, WorkOn, st, schoolTextIds, parseTab, type SchoolScreenProps } from './SchoolScreen.tsx';

/** Registry screens this package fills (screens.json `school.lessons`, `school.drills`, bible N5). */
export const SCHOOL_SCREEN_IDS = { lessons: 'school.lessons', drills: 'school.drills' } as const;

/**
 * Route entry. `load` returns the school data (curriculum map, drill records, development page) from the
 * app-services teaching views; `openLesson` opens a lesson. `defaultTab` is the tab for the screen id the
 * entry is registered under; the view option `tab` overrides it (O1.1.3).
 */
export function schoolRoute(load: (p: ScreenProps) => SchoolData, defaultTab: SchoolTab = 'lessons', openLesson?: (p: ScreenProps, lessonId: string) => void): RouteEntry {
  return {
    render: (p) => createElement(SchoolScreen, {
      tab: p.location.view.tab === undefined ? defaultTab : parseTab(p.location.view.tab),
      data: load(p),
      onTab: (tab) => p.setView({ ...p.location.view, tab }),
      onOpenLesson: openLesson ? (id: string) => openLesson(p, id) : undefined,
    }),
  };
}

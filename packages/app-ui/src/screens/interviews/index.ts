// The user's interview screens: coach.interview (he is interviewed) and people.hiring (he hires his staff).
// The host builds each view with app-services `interviewRoom.buildSitView` / `buildHireView`, applies
// actions with `applySitAction` / `applyHireAction`, and runs career `interviews.runSearch` with
// `sitApplicant` (his answers and graded work) or feeds `candidatesFrom` (the search results) back in.
import { createElement } from 'react';
import type { RouteTable } from '../../shell/index.ts';
import { screenById } from '../../shell/registry.ts';
import { HiringScreen, InterviewScreen, type HireSource, type SitSource } from './InterviewScreens.tsx';

export { HiringScreen, InterviewScreen, type HireSource, type HiringScreenProps, type InterviewScreenProps, type SitSource } from './InterviewScreens.tsx';
export { it as ivText, ivTextIds } from './text.ts';

export const INTERVIEW_SCREEN_ID = 'coach.interview';
export const HIRING_SCREEN_ID = 'people.hiring';

export function interviewRoutes(host: { sit?: SitSource; hire?: HireSource }): RouteTable {
  const t: RouteTable = {};
  const sit = host.sit;
  const hire = host.hire;
  if (sit) {
    t[INTERVIEW_SCREEN_ID] = {
      render: (p) => createElement(InterviewScreen, {
        source: sit, readOnly: p.readOnly,
        onOpenTool: (tool) => { const s = screenById(tool); if (s) p.navigate(s.route); },
      }),
    };
  }
  if (hire) t[HIRING_SCREEN_ID] = { render: (p) => createElement(HiringScreen, { source: hire, readOnly: p.readOnly }) };
  return t;
}

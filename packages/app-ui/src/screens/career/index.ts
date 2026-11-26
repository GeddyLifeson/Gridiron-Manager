// Career screens by rung and the coach's own screens (G-85; O7.1.1, O7.2.1, O7.2.2, O7.6.1, O4.6). The
// integrator adds `careerRoutes(...)` to the shell's route table and re-exports this folder from @gm/app-ui.
// Permission badges come from the core (`career.ladder.seatView`) and go to the shell's `permissions` prop.
import { createElement } from 'react';
import type { RouteEntry, RouteTable, ScreenProps } from '../../shell/index.ts';
import type { HubId } from '../../shell/index.ts';
import DEFAULTS from './rung_defaults.json' with { type: 'json' };
import { AssignmentList } from './AssignmentList.tsx';
import { CareerScreen, ContractScreen, FinanceScreen, JobMarketScreen, LifeScreen, RecordScreen, parseCareerTab, type Intent } from './CoachScreens.tsx';
import type { AssignmentsView, CareerView, ContractView, FinanceView, JobMarketView, LifeView, RecordView, ScreenState } from './types.ts';

export * from './types.ts';
export { AssignmentList, type AssignmentListProps } from './AssignmentList.tsx';
export { CareerScreen, ContractScreen, FinanceScreen, JobMarketScreen, LifeScreen, RecordScreen, CAREER_TABS, parseCareerTab, type CareerTab, type Intent } from './CoachScreens.tsx';
export { ct, hasCareerText, money } from './text.ts';

/** Registry screens this package fills (screens.json, bible O4.6 and O7.6.1). */
export const CAREER_SCREEN_IDS = ['coach.career', 'coach.job_market', 'coach.contract', 'coach.record', 'coach.finance', 'coach.life'] as const;

export interface CareerLoaders {
  career(p: ScreenProps): CareerView;
  jobMarket(p: ScreenProps): JobMarketView;
  contract(p: ScreenProps): ContractView;
  record(p: ScreenProps): RecordView;
  finance(p: ScreenProps): FinanceView;
  life(p: ScreenProps): LifeView;
  onIntent?(p: ScreenProps, i: Intent): void;
}

/** Route entries for the six coach screens. The tab lives in the view options (O1.1.3). */
export function careerRoutes(l: CareerLoaders): RouteTable {
  const on = (p: ScreenProps) => (l.onIntent ? (i: Intent) => l.onIntent!(p, i) : undefined);
  const entry = (render: (p: ScreenProps) => ReturnType<typeof createElement>): RouteEntry => ({ render });
  return {
    'coach.career': entry((p) => createElement(CareerScreen, { view: l.career(p), tab: parseCareerTab(p.location.view.tab), onTab: (tab) => p.setView({ ...p.location.view, tab }), onIntent: on(p) })),
    'coach.job_market': entry((p) => createElement(JobMarketScreen, { view: l.jobMarket(p), onIntent: on(p) })),
    'coach.contract': entry((p) => createElement(ContractScreen, { view: l.contract(p) })),
    'coach.record': entry((p) => createElement(RecordScreen, { view: l.record(p), onIntent: on(p) })),
    'coach.finance': entry((p) => createElement(FinanceScreen, { view: l.finance(p), onIntent: on(p) })),
    'coach.life': entry((p) => createElement(LifeScreen, { view: l.life(p), onIntent: on(p) })),
  };
}

/** The assignment list as a route body for the Office screen below head coach (O7.2.1). */
export function assignmentsRoute(load: (p: ScreenProps) => AssignmentsView, onOpen?: (p: ScreenProps, screenId: string) => void, onCommand?: (p: ScreenProps, command: string, dutyId: string) => void): RouteEntry {
  return { render: (p) => createElement(AssignmentList, { view: load(p), onOpen: onOpen ? (s: string) => onOpen(p, s) : undefined, onCommand: onCommand ? (c: string, d: string) => onCommand(p, c, d) : undefined }) };
}

export type RungBand = '1' | '2' | '3' | '4-5' | '6' | '7' | '8-9';
export const RUNG_DEFAULTS = (DEFAULTS as unknown as { bands: Record<RungBand, Record<HubId, string>> }).bands;

/**
 * O7.2.2: where each hub opens for a seat. `states` is the core's badge table (listed screens only);
 * `hubScreens` lists each hub's registry ids in order. A band default the seat cannot open falls back to
 * the hub's first listed screen; a hub with nothing listed has no default (null).
 */
export function hubDefault(band: RungBand, hub: HubId, states: Readonly<Record<string, ScreenState>>, hubScreens: readonly string[]): string | null {
  const want = RUNG_DEFAULTS[band]?.[hub];
  if (want && states[want] !== undefined) return want;
  return hubScreens.find((id) => states[id] !== undefined) ?? null;
}

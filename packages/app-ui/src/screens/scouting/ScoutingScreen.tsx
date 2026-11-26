// Self-scout (football.self_scout, G8) and the opponent scouting report (week.scouting_report, H2).
// One component: the user sees his own tables exactly as an opponent's staff would (N2.3.1 rule 4).
import { createElement as h, type ReactNode } from 'react';
import type { RouteTable, ScreenProps } from '../../shell/index.ts';
import type { CellView, ScoutingView } from './model.ts';

export const SCOUTING_SCREEN_IDS = ['football.self_scout', 'week.scouting_report'] as const;
export type ScoutingScreenId = (typeof SCOUTING_SCREEN_IDS)[number];

/** Window choices of G8.1.1 (last three games by default, season and career one step away). */
export const WINDOW_CHOICES = [
  { id: 'last3', label: 'Last 3 games' },
  { id: 'last4', label: 'Last 4 games' },
  { id: 'season', label: 'Season' },
  { id: 'career', label: 'Career' },
] as const;

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** "rate, count of total, interval" (H2.2.1); counts only under 5 calls (G8.1.1). */
export function cellText(c: CellView, outcome: string): string {
  const o = c.outcomes.find((x) => x.outcome === outcome);
  if (!o) return `0 of ${c.calls}`;
  if (c.countsOnly || o.rate === null || o.low === null || o.high === null) return `${o.count} of ${c.calls}`;
  return `${pct(o.rate)}, ${o.count} of ${c.calls}, ${pct(o.low)} to ${pct(o.high)}`;
}

function table(v: ScoutingView): ReactNode {
  const outcomes = [...new Set(v.cells.flatMap((c) => c.outcomes.map((o) => o.outcome)))].sort();
  return h('table', { className: 'gm-table', 'aria-label': `Tendencies by ${v.cuts.join(' and ')}` },
    h('thead', null, h('tr', null, ...v.cuts.map((c) => h('th', { key: c, scope: 'col' }, c)), ...outcomes.map((o) => h('th', { key: o, scope: 'col' }, o)), h('th', { scope: 'col' }, 'Mark'))),
    h('tbody', null, ...v.cells.map((c) => h('tr', { key: c.key, 'data-thin': c.thin ? 'true' : undefined, 'data-band': c.band ?? undefined },
      ...v.cuts.map((k) => h('td', { key: k }, c.cuts[k] ?? '')),
      ...outcomes.map((o) => h('td', { key: o }, cellText(c, o))),
      h('td', null, c.band ? `${c.band}: ${c.bandOutcome} (${v.windowLabel}, ${c.calls} calls)` : c.thin ? 'thin' : '')))));
}

export function ScoutingScreen(props: { view: ScoutingView | null; screenId: ScoutingScreenId; window: string; setView?: (v: Record<string, string>) => void }): ReactNode {
  const { view } = props;
  const chooser = h('div', { role: 'group', 'aria-label': 'Window', className: 'gm-segmented' },
    ...WINDOW_CHOICES.map((w) => h('button', { key: w.id, type: 'button', 'aria-pressed': props.window === w.id ? 'true' : 'false', onClick: () => props.setView?.({ window: w.id }) }, w.label)));
  if (!view) return h('section', { 'data-scouting': props.screenId }, chooser, h('p', null, 'No charted plays in this window yet.'));
  return h('section', { 'data-scouting': props.screenId },
    h('p', null, `${view.teamName}: ${view.measure}, ${view.windowLabel} (${view.windowGames} games)`),
    view.taggerLine ? h('p', { className: 'gm-note' }, `Charted by staff: ${view.taggerLine}`) : null,
    chooser,
    table(view),
    view.predictability ? h('p', { 'data-predictability': 'true' }, `Predictability ${view.predictability.index.toFixed(3)} per call over ${view.predictability.calls} calls (lower is better)${view.predictability.words ? `: ${view.predictability.words}` : ''}`) : null,
    view.subject === 'self' && view.exposure.length ? h('section', { 'aria-label': 'What the opponent probably knows' },
      h('h2', null, 'What the next opponent probably knows'),
      h('ol', null, ...view.exposure.filter((e) => e.top).map((e) => h('li', { key: e.key }, `${e.label}: ${e.band}, ${e.calls} calls, ${pct(e.shareInWindow)} in their film`)))) : null,
    view.tells.length ? h('section', { 'aria-label': 'Tells' },
      h('h2', null, 'Tells'),
      h('ul', null, ...view.tells.map((t) => h('li', { key: `${t.feature}=${t.value}` }, `${t.feature} ${t.value}: ${t.givesAway} ${t.count} of ${t.snaps}${t.kept ? ' (kept as bait)' : ''}`)))) : null);
}

/** Route entries for the shell's table; `source` supplies the view for a screen and window. */
export function scoutingRoutes(source: (screenId: ScoutingScreenId, window: string) => ScoutingView | null): RouteTable {
  const entry = (id: ScoutingScreenId) => ({
    render: (p: ScreenProps) => {
      const window = p.location.view.window ?? 'last3';
      return h(ScoutingScreen, { view: source(id, window), screenId: id, window, setView: p.setView });
    },
  });
  return Object.fromEntries(SCOUTING_SCREEN_IDS.map((id) => [id, entry(id)]));
}

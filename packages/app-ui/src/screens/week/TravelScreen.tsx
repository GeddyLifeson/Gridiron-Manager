// Travel screen (H8.1.1 "What the user sees": a travel plan card listing two or three plans with what each
// changes: practice and meeting time lost, nights away, the body time of kickoff; the user picks one.
// H8.1.2: the travel day block by block. H8.2.1 body-time line; H8.2.2 altitude flag). Reads only the
// travel read model.
import { createElement as h, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import TEXT from './text.json' with { type: 'json' };
import type { ScreenProps, RouteEntry } from '../../shell/index.ts';

const T = TEXT.travel;

/** Structural copy of the app-services TravelView. */
export interface TravelScreenView {
  readonly weekId: string;
  readonly home: boolean;
  readonly gameId: string | null;
  readonly thursdayOnlyStandard: boolean;
  readonly altitude: boolean;
  readonly options: readonly {
    readonly plan: string; readonly isDefault: boolean; readonly chosen: boolean; readonly mode: string;
    readonly departs: string; readonly arrives: string; readonly returns: string; readonly nightsAway: number;
    readonly practicesLost: number; readonly practiceMinutesLost: number; readonly meetingMinutesLost: number; readonly blocksMoved: number;
    readonly bodyKickoff: string | null; readonly earlyBodyTime: boolean;
  }[];
  readonly travelDay: { readonly date: string; readonly blocks: readonly { readonly id: string; readonly type: string; readonly start: string; readonly minutes: number; readonly location: string }[] } | null;
}

const words = (s: string) => s.replace(/_/g, ' ');
const fill = (s: string, vals: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vals[k] ?? ''));
const look = (table: Record<string, string>, k: string) => table[k] ?? words(k);

export function TravelScreen(props: { model: TravelScreenView; onChoose?: (plan: string) => void }): ReactNode {
  const m = props.model;
  if (m.home) return h('section', { className: 'gm-travel', 'data-week': m.weekId }, h('h1', { style: { fontSize: '1.25rem' } }, T.title), h('p', null, T.home));
  return h('section', { className: 'gm-travel', 'data-week': m.weekId, style: { color: v('text.ink'), background: v('surface.bg') } },
    h('h1', { style: { fontSize: '1.25rem' } }, T.title),
    m.thursdayOnlyStandard ? h('p', { style: { color: v('state.caution') } }, T.thursday) : null,
    m.altitude ? h('p', { className: 'gm-altitude', style: { color: v('state.caution') } }, T.altitude) : null,
    h('div', { className: 'gm-travel-plans', style: { display: 'grid', gridTemplateColumns: `repeat(${m.options.length}, minmax(12rem, 1fr))`, gap: '0.5rem' } },
      ...m.options.map((o) => h('article', {
        key: o.plan, className: 'gm-travel-plan', 'data-plan': o.plan, 'aria-current': o.chosen ? 'true' : undefined,
        style: { border: `${o.chosen ? 2 : 1}px solid ${o.chosen ? v('accent.default') : v('line.default')}`, background: v('surface.panel'), padding: '0.5rem' },
      },
      h('h2', { style: { fontSize: '1rem', margin: 0 } }, look(T.plans, o.plan), o.isDefault ? h('small', { style: { color: v('text.muted') } }, ` (${T.default})`) : null),
      h('p', { style: { margin: '0.25rem 0', color: v('text.muted') } }, look(T.modes, o.mode)),
      h('p', { style: { margin: 0 } }, fill(T.departs, { at: o.departs })),
      h('p', { style: { margin: 0 } }, fill(T.arrives, { at: o.arrives })),
      h('p', { style: { margin: 0 } }, fill(T.returns, { at: o.returns })),
      h('p', { style: { margin: 0 } }, fill(T.nights, { n: o.nightsAway })),
      h('p', { style: { margin: 0, color: o.practicesLost > 0 ? v('state.caution') : v('text.ink') } }, fill(T.lost, { n: o.practicesLost, minutes: o.practiceMinutesLost, meetings: o.meetingMinutesLost })),
      h('p', { style: { margin: 0 } }, fill(T.moved, { n: o.blocksMoved })),
      o.bodyKickoff ? h('p', { className: 'gm-body-time', style: { margin: 0, color: o.earlyBodyTime ? v('state.caution') : v('text.ink') } }, fill(T.body, { time: o.bodyKickoff }), o.earlyBodyTime ? ` · ${T.early}` : '') : null,
      h('button', {
        type: 'button', 'data-choose': o.plan, 'aria-pressed': o.chosen, onClick: () => props.onChoose?.(o.plan),
        style: { marginTop: '0.5rem', background: o.chosen ? v('accent.default') : v('surface.raised'), color: o.chosen ? v('accent.onAccent') : v('text.ink'), border: `1px solid ${v('line.default')}` },
      }, o.chosen ? T.chosen : T.choose),
      )),
    ),
    m.travelDay ? h('section', { className: 'gm-travel-day' },
      h('h2', { style: { fontSize: '1rem' } }, fill(T.travelDay, { date: m.travelDay.date })),
      h('ul', null, ...m.travelDay.blocks.map((b) => h('li', { key: b.id, 'data-block': b.id }, `${b.start} ${words(b.type)} (${b.minutes}m) · ${words(b.location)}`))),
    ) : null,
  );
}

/** Route entry for registry id `week.travel`; the integrator adds it to the shell's route table. */
export function travelRoute(getModel: (p: ScreenProps) => TravelScreenView | null, onChoose?: (plan: string) => void): RouteEntry {
  return { render: (p) => { const model = getModel(p); return model ? h(TravelScreen, { model, ...(onChoose ? { onChoose } : {}) }) : null; } };
}

// Week schedule screen (H1.1.1 "What the user sees": a calendar with one column per day, each block a
// bar with start, length, type, who attends and who runs it; H1.1.2 limits panel; H9.1.1 documents).
// It reads only the week read model; every block is a button so the screen works by keyboard alone.
import { createElement as h, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import TEXT from './text.json' with { type: 'json' };
import type { ScreenProps, RouteEntry } from '../../shell/index.ts';

/** Structural copy of the app-services WeekScheduleModel (app-ui reads app-services only through its public entry). */
export interface WeekScheduleView {
  readonly weekId: string;
  readonly shape: string;
  readonly home: boolean;
  readonly days: readonly { readonly date: string; readonly label: string; readonly kind: string; readonly blocks: readonly {
    readonly id: string; readonly type: string; readonly owner: string; readonly start: string; readonly minutes: number;
    readonly attendees: readonly string[]; readonly leader: string; readonly location: string; readonly session: string | null;
    readonly unplanned: boolean; readonly done: boolean; readonly padded: boolean;
  }[] }[];
  readonly hard: readonly { readonly plain: string; readonly penalty: string; readonly leaf: string }[];
  readonly soft: readonly string[];
  readonly coachHours: number;
  readonly documents: readonly { readonly id: string; readonly type: string; readonly state: string; readonly late: boolean }[];
}

const words = (s: string) => s.replace(/_/g, ' ');

export function WeekSchedule(props: { model: WeekScheduleView; onOpen?: (blockId: string, owner: string) => void }): ReactNode {
  const m = props.model;
  const shape = (TEXT.shape as Record<string, string>)[m.shape] ?? m.shape;
  return h('section', { className: 'gm-week', 'data-week': m.weekId },
    h('p', { className: 'gm-week-shape' }, shape, ' · ', TEXT.coachHours.replace('{hours}', m.coachHours.toFixed(1))),
    h('div', { className: 'gm-week-grid', role: 'grid', style: { display: 'grid', gridTemplateColumns: `repeat(${m.days.length}, minmax(9rem, 1fr))`, gap: '0.5rem' } },
      ...m.days.map((d) => h('div', { key: d.date, role: 'gridcell', className: 'gm-week-day', 'aria-label': `${d.label} ${d.date}` },
        h('h2', { style: { fontSize: '1rem' } }, d.label, ' ', h('small', { style: { color: v('text.muted') } }, d.date)),
        ...d.blocks.map((b) => h('button', {
          key: b.id, type: 'button', className: 'gm-week-block', 'data-block': b.id, 'data-owner': b.owner,
          onClick: () => props.onOpen?.(b.id, b.owner),
          style: { display: 'block', width: '100%', textAlign: 'left', marginBottom: '0.25rem', padding: '0.25rem', border: `1px solid ${v('line.default')}`, background: b.done ? v('surface.panel') : v('surface.raised'), color: v('text.ink') },
        },
        `${b.start} ${words(b.session ?? b.type)} (${b.minutes}m)`,
        h('br'), h('small', null, `${b.attendees.map(words).join(', ')} · ${words(b.leader)}`),
        b.padded ? h('small', { className: 'gm-tag' }, ` · ${TEXT.padded}`) : null,
        b.unplanned ? h('small', { className: 'gm-tag', style: { color: v('state.caution') } }, ` · ${TEXT.unplanned}`) : null,
        b.done ? h('small', { className: 'gm-tag' }, ` · ${TEXT.done}`) : null,
        )),
      )),
    ),
    h('aside', { className: 'gm-week-limits', 'aria-label': TEXT.limits },
      h('h2', { style: { fontSize: '1rem' } }, TEXT.limits),
      m.hard.length === 0 && m.soft.length === 0 ? h('p', null, TEXT.noFindings) : null,
      ...m.hard.map((f, i) => h('p', { key: `h${i}`, style: { color: v('state.bad') } }, `${f.plain} (${f.leaf}). ${f.penalty}`)),
      ...m.soft.map((f, i) => h('p', { key: `s${i}`, style: { color: v('state.caution') } }, `${f}. ${TEXT.soft}`)),
    ),
    h('aside', { className: 'gm-week-docs', 'aria-label': TEXT.documents },
      h('h2', { style: { fontSize: '1rem' } }, TEXT.documents),
      h('ul', null, ...m.documents.map((d) => h('li', { key: d.id }, `${words(d.type)}: ${words(d.state)}${d.late ? ` (${TEXT.late})` : ''}`))),
    ),
  );
}

/** Route entry for registry id `week.schedule`; the integrator adds it to the shell's route table. */
export function weekScheduleRoute(getModel: (p: ScreenProps) => WeekScheduleView | null, onOpen?: (blockId: string, owner: string) => void): RouteEntry {
  return { render: (p) => { const model = getModel(p); return model ? h(WeekSchedule, { model, ...(onOpen ? { onOpen } : {}) }) : null; } };
}

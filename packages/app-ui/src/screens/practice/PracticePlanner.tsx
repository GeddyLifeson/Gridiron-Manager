// Practice planner screen (H3.1.1 "What the user sees": periods as rows with minutes, type, tempo, groups
// and leader; a sidebar with expected reps, the minutes left in the block and install coverage; H3.6.1
// limits panel; H3.3.2 participation sheet). It reads only the practice read model; every period is a
// button so the grid works by keyboard alone (Q1.5.2).
import { createElement as h, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import TEXT from './text.json' with { type: 'json' };
import type { ScreenProps, RouteEntry } from '../../shell/index.ts';

/** Structural copy of the league `PracticeView` (app-ui reads league data only through read models). */
export interface PracticePlannerView {
  readonly practiceId: string;
  readonly pads: string;
  readonly periods: readonly {
    readonly number: number; readonly minutes: number; readonly type: string; readonly plain: string; readonly tempo: string;
    readonly groups: readonly string[]; readonly leader: string; readonly reps: number; readonly load: number; readonly scripted: boolean;
  }[];
  readonly minutes: { readonly planned: number; readonly block: number; readonly transitions: number; readonly remaining: number };
  readonly expectedReps: number;
  readonly coverage: { readonly zero: number; readonly one: number; readonly more: number };
  readonly paddedLeft: number | null;
  readonly hours: { readonly dayLimitMinutes: number; readonly usedToday: number; readonly status: string | null; readonly provisional: boolean } | null;
  readonly findings: readonly { readonly hard: boolean; readonly plain: string; readonly penalty: string; readonly leaf: string }[];
  readonly participation: readonly { readonly personId: string; readonly label: string; readonly reason: string }[];
}

const words = (s: string) => s.replace(/_/g, ' ');
const fill = (s: string, vals: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vals[k] ?? ''));
const cell = { padding: '0.25rem 0.5rem', textAlign: 'left' as const };

export function PracticePlanner(props: { model: PracticePlannerView; onOpen?: (period: number) => void }): ReactNode {
  const m = props.model;
  const heads = [TEXT.period, TEXT.minutes, TEXT.type, TEXT.tempo, TEXT.groups, TEXT.leader, TEXT.reps];
  return h('section', { className: 'gm-practice', 'data-practice': m.practiceId },
    h('p', { className: 'gm-practice-pads' }, (TEXT.pads as Record<string, string>)[m.pads] ?? m.pads),
    h('table', { className: 'gm-practice-grid', style: { borderCollapse: 'collapse', width: '100%' } },
      h('thead', null, h('tr', null, ...heads.map((t) => h('th', { key: t, scope: 'col', style: cell }, t)))),
      h('tbody', null, ...m.periods.map((p) => h('tr', { key: p.number, style: { borderTop: `1px solid ${v('line.default')}` } },
        h('td', { style: cell }, h('button', { type: 'button', 'data-period': p.number, onClick: () => props.onOpen?.(p.number), title: p.plain, style: { background: v('surface.raised'), color: v('text.ink'), border: `1px solid ${v('line.default')}` } }, String(p.number))),
        h('td', { style: cell }, String(p.minutes)),
        h('td', { style: cell }, words(p.type), p.scripted || p.reps === 0 ? null : h('small', { style: { color: v('state.caution') } }, ` · ${TEXT.noScript}`)),
        h('td', { style: cell }, p.tempo),
        h('td', { style: cell }, p.groups.map(words).join(', ')),
        h('td', { style: cell }, words(p.leader)),
        h('td', { style: cell }, String(p.reps)),
      ))),
    ),
    h('aside', { className: 'gm-practice-side', 'aria-label': TEXT.reps },
      h('p', null, fill(TEXT.planned, m.minutes)),
      h('p', null, fill(TEXT.expectedReps, { reps: m.expectedReps })),
      h('p', null, fill(TEXT.coverage, m.coverage)),
      m.paddedLeft === null ? null : h('p', null, fill(TEXT.padded, { left: m.paddedLeft })),
      m.hours === null ? null : h('p', null, fill(TEXT.hours, { used: m.hours.usedToday, limit: m.hours.dayLimitMinutes }),
        m.hours.provisional ? h('small', { style: { color: v('state.caution') } }, ` (${TEXT.provisional})`) : null),
    ),
    h('aside', { className: 'gm-practice-limits', 'aria-label': TEXT.limits },
      h('h2', { style: { fontSize: '1rem' } }, TEXT.limits),
      m.findings.length === 0 ? h('p', null, TEXT.noFindings) : null,
      ...m.findings.map((f, i) => h('p', { key: i, style: { color: f.hard ? v('state.bad') : v('state.caution') } }, `${f.plain} (${f.leaf})${f.penalty ? `. ${f.penalty}` : ''}`)),
    ),
    h('aside', { className: 'gm-practice-participation', 'aria-label': TEXT.participation },
      h('h2', { style: { fontSize: '1rem' } }, TEXT.participation),
      h('ul', null, ...m.participation.map((p) => h('li', { key: p.personId }, `${p.personId}: ${(TEXT.labels as Record<string, string>)[p.label] ?? p.label}${p.reason === 'none' ? '' : ` (${words(p.reason)})`}`))),
    ),
  );
}

/** Route entry for registry id `practice.planner`; the integrator adds it to the shell's route table. */
export function practicePlannerRoute(getModel: (p: ScreenProps) => PracticePlannerView | null, onOpen?: (period: number) => void): RouteEntry {
  return { render: (p) => { const model = getModel(p); return model ? h(PracticePlanner, { model, ...(onOpen ? { onOpen } : {}) }) : null; } };
}

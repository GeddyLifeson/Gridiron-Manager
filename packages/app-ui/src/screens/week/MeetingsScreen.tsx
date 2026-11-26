// Meetings screen (H4.1.1 "What the user sees": each meeting shows its type; opening it shows the agenda
// editor, or the leader's planned agenda for review when the user does not lead it. H4.1.2: items with
// minutes, a timeline that marks long stretches without a break and the day's total meeting time, the
// leader's report in words afterwards. H4.2.3: the night-before tone). No attention value is drawn
// (K9, audit Part 17). Reads only the meetings read model.
import { createElement as h, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import TEXT from './text.json' with { type: 'json' };
import type { ScreenProps, RouteEntry } from '../../shell/index.ts';

const T = TEXT.meetings;

/** Structural copy of the app-services MeetingsView. */
export interface MeetingsScreenView {
  readonly weekId: string;
  readonly longStretchMinutes: number;
  readonly days: readonly {
    readonly date: string; readonly label: string; readonly totalMinutes: number; readonly capMinutes: number; readonly overCap: boolean;
    readonly meetings: readonly {
      readonly blockId: string; readonly type: string; readonly start: string; readonly minutes: number; readonly leader: string;
      readonly attendees: readonly string[]; readonly editable: boolean; readonly done: boolean; readonly defaultAgenda: boolean;
      readonly agenda: readonly { readonly n: number; readonly kind: string; readonly label: string; readonly minutes: number; readonly runMinutes: number; readonly warnings: readonly string[] }[];
      readonly planned: number; readonly left: number; readonly itemKinds: readonly string[];
      readonly tone: string | null; readonly tones: readonly string[]; readonly report: string | null;
    }[];
  }[];
}

export type MeetingCommand =
  | { readonly kind: 'add_item'; readonly blockId: string; readonly itemKind: string }
  | { readonly kind: 'remove_item'; readonly blockId: string; readonly n: number }
  | { readonly kind: 'set_tone'; readonly blockId: string; readonly tone: string };

const words = (s: string) => s.replace(/_/g, ' ');
const fill = (s: string, vals: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vals[k] ?? ''));
const look = (table: Record<string, string>, k: string) => table[k] ?? words(k);
const btn = { background: v('surface.raised'), color: v('text.ink'), border: `1px solid ${v('line.default')}`, padding: '0.125rem 0.5rem', marginRight: '0.25rem' };
const cell = { padding: '0.125rem 0.5rem', textAlign: 'left' as const };

type Meeting = MeetingsScreenView['days'][number]['meetings'][number];

function MeetingCard(props: { m: Meeting; onCommand?: (c: MeetingCommand) => void }): ReactNode {
  const { m, onCommand } = props;
  const send = (c: MeetingCommand) => onCommand?.(c);
  const status = m.left >= 0 ? fill(T.left, { left: m.left }) : fill(T.over, { over: -m.left });
  return h('article', { className: 'gm-meeting', 'data-block': m.blockId, 'data-type': m.type, style: { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '0.5rem', marginBottom: '0.5rem' } },
    h('h3', { style: { fontSize: '1rem', margin: 0 } }, `${m.start} ${look(T.types, m.type)} (${m.minutes}m)`, m.done ? h('small', { className: 'gm-tag' }, ` · ${T.done}`) : null),
    h('p', { style: { margin: '0.25rem 0', color: v('text.muted') } }, `${words(m.leader)} · ${m.attendees.map(words).join(', ')} · `, h('strong', { style: { color: m.editable ? v('accent.default') : v('text.muted') } }, m.editable ? T.lead : T.review)),
    m.defaultAgenda ? h('p', { style: { margin: 0 } }, T.default) : h('table', { className: 'gm-agenda', style: { borderCollapse: 'collapse', width: '100%' } },
      h('tbody', null, ...m.agenda.map((r) => h('tr', { key: r.n, 'data-row': r.n, style: { borderTop: `1px solid ${v('line.default')}` } },
        h('td', { style: cell }, String(r.n)),
        h('td', { style: cell }, look(T.kinds, r.kind)),
        h('td', { style: cell }, r.label),
        h('td', { style: cell }, `${r.minutes}m`),
        h('td', { style: { ...cell, color: v('state.caution') } }, r.warnings.map((w) => look(T.warn, w)).join('; ')),
        m.editable && !m.done ? h('td', { style: cell }, h('button', { type: 'button', style: btn, onClick: () => send({ kind: 'remove_item', blockId: m.blockId, n: r.n }) }, T.remove)) : null,
      )))),
    m.defaultAgenda ? null : h('p', { className: 'gm-agenda-time', style: { margin: '0.25rem 0', color: m.left < 0 ? v('state.bad') : v('text.ink') } }, `${fill(T.planned, { planned: m.planned, minutes: m.minutes })}, ${status}`),
    m.tones.length > 0 ? h('fieldset', { className: 'gm-tone', style: { border: 'none', padding: 0 } },
      h('legend', null, T.tone),
      ...m.tones.map((t) => h('button', {
        key: t, type: 'button', 'aria-pressed': m.tone === t, disabled: !m.editable || m.done,
        style: { ...btn, background: m.tone === t ? v('accent.default') : v('surface.raised'), color: m.tone === t ? v('accent.onAccent') : v('text.ink') },
        onClick: () => send({ kind: 'set_tone', blockId: m.blockId, tone: t }),
      }, look(T.tones, t)))) : null,
    m.editable && !m.done ? h('div', { className: 'gm-agenda-add' }, h('span', null, `${T.add}: `),
      ...m.itemKinds.map((k) => h('button', { key: k, type: 'button', 'data-kind': k, style: btn, onClick: () => send({ kind: 'add_item', blockId: m.blockId, itemKind: k }) }, look(T.kinds, k)))) : null,
    m.report ? h('p', { className: 'gm-meeting-report' }, h('strong', null, `${T.report}: `), m.report) : null,
  );
}

export function MeetingsScreen(props: { model: MeetingsScreenView; onCommand?: (c: MeetingCommand) => void }): ReactNode {
  const m = props.model;
  return h('section', { className: 'gm-meetings', 'data-week': m.weekId, style: { color: v('text.ink'), background: v('surface.bg') } },
    h('h1', { style: { fontSize: '1.25rem' } }, T.title),
    h('p', { style: { color: v('text.muted') } }, fill(T.longStretchNote, { minutes: m.longStretchMinutes })),
    ...m.days.map((d) => h('section', { key: d.date, className: 'gm-meetings-day', 'aria-label': `${d.label} ${d.date}` },
      h('h2', { style: { fontSize: '1rem' } }, d.label, ' ', h('small', { style: { color: v('text.muted') } }, d.date)),
      d.meetings.length === 0 ? h('p', null, T.none) : null,
      ...d.meetings.map((x) => h(MeetingCard, { key: x.blockId, m: x, ...(props.onCommand ? { onCommand: props.onCommand } : {}) })),
      d.meetings.length === 0 ? null : h('p', { className: 'gm-meetings-total', style: { color: d.overCap ? v('state.bad') : v('text.muted') } },
        fill(T.dayTotal, { total: d.totalMinutes, cap: d.capMinutes }), d.overCap ? `. ${T.overCap}` : ''),
    )),
  );
}

/** Route entry for registry id `week.meetings`; the integrator adds it to the shell's route table. */
export function meetingsRoute(getModel: (p: ScreenProps) => MeetingsScreenView | null, onCommand?: (c: MeetingCommand) => void): RouteEntry {
  return { render: (p) => { const model = getModel(p); return model ? h(MeetingsScreen, { model, ...(onCommand ? { onCommand } : {}) }) : null; } };
}

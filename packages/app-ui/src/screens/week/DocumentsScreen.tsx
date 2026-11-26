// Game-week documents screen (H9.1.1 "What the user sees": a Documents panel with each document's state,
// author, due time and recipients; assign an author, review and approve, send back, or write it himself.
// H9.1.1 rule 6: a detail switch that shows only late or sent-back documents. H9.1.2: a workload bar per
// staff member). Quality and seeded errors never reach it (K9). Reads only the documents read model.
import { createElement as h, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import TEXT from './text.json' with { type: 'json' };
import type { ScreenProps, RouteEntry } from '../../shell/index.ts';

const T = TEXT.docs;

/** Structural copy of the app-services DocumentsView. */
export interface DocumentsScreenView {
  readonly weekId: string;
  readonly detail: 'all' | 'exceptions';
  readonly rows: readonly {
    readonly id: string; readonly type: string; readonly leaf: string; readonly state: string; readonly author: string; readonly reviewer: string | null;
    readonly due: string; readonly recipients: readonly string[]; readonly playersSee: boolean; readonly late: boolean; readonly sentBack: boolean;
    readonly version: number; readonly hours: number; readonly actions: readonly string[];
  }[];
  readonly hidden: number;
  readonly workload: readonly { readonly author: string; readonly assigned: number; readonly available: number | null; readonly over: boolean }[];
}

export type DocumentCommand = { readonly kind: 'doc_action'; readonly id: string; readonly action: string } | { readonly kind: 'detail'; readonly detail: 'all' | 'exceptions' };

const words = (s: string) => s.replace(/_/g, ' ');
const fill = (s: string, vals: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vals[k] ?? ''));
const look = (table: Record<string, string>, k: string) => table[k] ?? words(k);
const cell = { padding: '0.25rem 0.5rem', textAlign: 'left' as const };
const btn = { background: v('surface.raised'), color: v('text.ink'), border: `1px solid ${v('line.default')}`, padding: '0.125rem 0.5rem', marginRight: '0.25rem' };
const hrs = (x: number) => (Math.round(x * 10) / 10).toString();

export function DocumentsScreen(props: { model: DocumentsScreenView; onCommand?: (c: DocumentCommand) => void }): ReactNode {
  const m = props.model;
  const send = (c: DocumentCommand) => props.onCommand?.(c);
  const heads = [TEXT.documents, T.state, T.author, T.due, T.recipients, T.actions];
  return h('section', { className: 'gm-documents', 'data-week': m.weekId, style: { color: v('text.ink'), background: v('surface.bg') } },
    h('h1', { style: { fontSize: '1.25rem' } }, T.title),
    h('div', { role: 'group' },
      h('button', { type: 'button', 'aria-pressed': m.detail === 'all', style: btn, onClick: () => send({ kind: 'detail', detail: 'all' }) }, T.showAll),
      h('button', { type: 'button', 'aria-pressed': m.detail === 'exceptions', style: btn, onClick: () => send({ kind: 'detail', detail: 'exceptions' }) }, T.showExceptions)),
    h('table', { className: 'gm-documents-table', style: { borderCollapse: 'collapse', width: '100%', marginTop: '0.5rem' } },
      h('thead', null, h('tr', null, ...heads.map((x) => h('th', { key: x, scope: 'col', style: cell }, x)))),
      h('tbody', null, ...m.rows.map((r) => h('tr', { key: r.id, 'data-doc': r.id, style: { borderTop: `1px solid ${v('line.default')}` } },
        h('td', { style: cell }, words(r.type), r.version > 1 ? ` v${r.version}` : '', r.playersSee ? h('small', { style: { color: v('text.muted') } }, ` · ${T.playersSee}`) : null),
        h('td', { style: cell }, look(T.states, r.state),
          r.late ? h('small', { style: { color: v('state.bad') } }, ` · ${T.late}`) : null,
          r.sentBack ? h('small', { style: { color: v('state.caution') } }, ` · ${T.sentBack}`) : null),
        h('td', { style: cell }, words(r.author), r.reviewer ? h('small', { style: { color: v('text.muted') } }, ` / ${words(r.reviewer)}`) : null),
        h('td', { style: cell }, r.due),
        h('td', { style: cell }, r.recipients.map(words).join(', ')),
        h('td', { style: cell }, ...r.actions.map((a) => h('button', { key: a, type: 'button', 'data-action': a, style: btn, onClick: () => send({ kind: 'doc_action', id: r.id, action: a }) }, look(T.act, a)))),
      ))),
    ),
    m.hidden > 0 ? h('p', { style: { color: v('text.muted') } }, fill(T.hidden, { n: m.hidden })) : null,
    h('aside', { className: 'gm-workload', 'aria-label': T.workload },
      h('h2', { style: { fontSize: '1rem' } }, T.workload),
      ...m.workload.map((w) => {
        const share = w.available && w.available > 0 ? Math.min(1, w.assigned / w.available) : 0;
        return h('div', { key: w.author, 'data-author': w.author, style: { marginBottom: '0.25rem' } },
          h('span', null, `${words(w.author)}: `, w.available === null ? fill(T.hoursOpen, { assigned: hrs(w.assigned) }) : fill(T.hours, { assigned: hrs(w.assigned), available: hrs(w.available) }),
            w.over ? h('strong', { style: { color: v('state.bad') } }, ` · ${T.over}`) : null),
          w.available === null ? null : h('div', { role: 'presentation', style: { height: '0.375rem', background: v('surface.raised'), border: `1px solid ${v('line.default')}` } },
            h('div', { style: { height: '100%', width: `${share * 100}%`, background: w.over ? v('state.bad') : v('state.good') } })),
        );
      }),
    ),
  );
}

/** Route entry for registry id `week.documents`; the integrator adds it to the shell's route table. */
export function documentsRoute(getModel: (p: ScreenProps) => DocumentsScreenView | null, onCommand?: (c: DocumentCommand) => void): RouteEntry {
  return { render: (p) => { const model = getModel(p); return model ? h(DocumentsScreen, { model, ...(onCommand ? { onCommand } : {}) }) : null; } };
}

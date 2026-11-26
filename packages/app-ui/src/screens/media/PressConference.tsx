// Media screen with the press conference (O4.5.2 "What the user sees": this week's sessions with times; a
// press conference runs as a series of questions with response choices and a time limit. H7.2.1: answers
// are stances, never scripts, and show no numbers; a session-wide "standard coach-speak" answers the rest
// in one click; after the session a digest shows the headline). When the clock runs out the coach gives the
// bland answer. Reads only the press read model.
import { createElement as h, useEffect, useState, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import TEXT from './text.json' with { type: 'json' };
import type { ScreenProps, RouteEntry } from '../../shell/index.ts';

/** Structural copy of the app-services PressView. */
export interface PressScreenView {
  readonly sessions: readonly { readonly blockId: string; readonly session: string; readonly date: string; readonly start: string; readonly minutes: number; readonly done: boolean }[];
  readonly live: {
    readonly kind: string; readonly speaker: string; readonly asked: number; readonly target: number;
    readonly current: { readonly n: number; readonly text: string; readonly outlet: string; readonly followUp: boolean } | null;
    readonly choices: readonly { readonly id: string; readonly violation: boolean }[];
    readonly timeLimitSeconds: number;
    readonly history: readonly { readonly n: number; readonly text: string; readonly outlet: string; readonly choice: string; readonly timedOut: boolean }[];
    readonly done: boolean;
    readonly headline: { readonly choice: string; readonly topicId: string } | null;
  } | null;
}

export type PressCommand =
  | { readonly kind: 'answer'; readonly choice: string; readonly timedOut: boolean }
  | { readonly kind: 'bland_all' }
  | { readonly kind: 'open_session'; readonly blockId: string };

const words = (s: string) => s.replace(/_/g, ' ');
const fill = (s: string, vals: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vals[k] ?? ''));
const look = (table: Record<string, string>, k: string) => table[k] ?? words(k);
const btn = { background: v('surface.raised'), color: v('text.ink'), border: `1px solid ${v('line.default')}`, padding: '0.25rem 0.75rem', margin: '0 0.5rem 0.5rem 0' };

/** The answer clock (O4.5.2). Restarts on each new question; at zero it sends the bland default once. */
function useAnswerClock(limit: number, questionN: number | null, onExpire: () => void): number {
  const [clock, setClock] = useState<{ n: number | null; left: number }>({ n: questionN, left: limit });
  // A new question restarts the clock in the same render, so a stale zero can never expire it twice.
  const left = clock.n === questionN ? clock.left : limit;
  useEffect(() => {
    if (questionN === null) return undefined;
    if (left <= 0) { onExpire(); return undefined; }
    const t = setTimeout(() => setClock({ n: questionN, left: left - 1 }), 1000);
    return () => clearTimeout(t);
  }, [left, questionN]);
  return left;
}

export function PressConference(props: { model: PressScreenView; onCommand?: (c: PressCommand) => void; clock?: boolean }): ReactNode {
  const m = props.model;
  const live = m.live;
  const send = (c: PressCommand) => props.onCommand?.(c);
  const fallback = live?.choices.find((c) => c.id === 'bland') ?? live?.choices.find((c) => c.id === 'refer_to_report') ?? live?.choices.find((c) => c.id === 'decline');
  const left = useAnswerClock(live?.timeLimitSeconds ?? 0, props.clock === false ? null : live?.current?.n ?? null, () => { if (fallback) send({ kind: 'answer', choice: fallback.id, timedOut: true }); });
  return h('section', { className: 'gm-media', style: { color: v('text.ink'), background: v('surface.bg') } },
    h('h1', { style: { fontSize: '1.25rem' } }, TEXT.title),
    h('section', { className: 'gm-media-sessions', 'aria-label': TEXT.sessions },
      h('h2', { style: { fontSize: '1rem' } }, TEXT.sessions),
      m.sessions.length === 0 ? h('p', null, TEXT.noSessions) : h('ul', null, ...m.sessions.map((s) => h('li', { key: s.blockId, 'data-session': s.blockId },
        h('button', { type: 'button', style: { ...btn, margin: 0 }, disabled: s.done, onClick: () => send({ kind: 'open_session', blockId: s.blockId }) },
          `${s.date} ${s.start} ${look(TEXT.sessionKinds, s.session)} (${s.minutes}m)`),
        s.done ? h('small', { className: 'gm-tag' }, ` · ${TEXT.done}`) : null)))),
    live === null ? h('p', null, TEXT.between) : h('section', { className: 'gm-press', 'data-kind': live.kind },
      h('h2', { style: { fontSize: '1rem' } }, look(TEXT.kinds, live.kind)),
      live.current ? h('div', { className: 'gm-press-question', 'data-question': live.current.n, style: { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '0.75rem' } },
        h('p', { style: { margin: 0, color: v('text.muted') } }, fill(TEXT.progress, { n: live.asked, target: live.target }), ' · ', look(TEXT.outlets, live.current.outlet),
          live.current.followUp ? h('small', { className: 'gm-tag', style: { color: v('state.caution') } }, ` · ${TEXT.followUp}`) : null),
        h('blockquote', { style: { margin: '0.5rem 0', fontSize: '1.125rem' } }, live.current.text),
        h('div', { role: 'group', 'aria-label': TEXT.title }, ...live.choices.map((c) => h('button', {
          key: c.id, type: 'button', 'data-choice': c.id, style: c.violation ? { ...btn, borderColor: v('state.bad') } : btn,
          title: c.violation ? TEXT.violation : undefined, onClick: () => send({ kind: 'answer', choice: c.id, timedOut: false }),
        }, look(TEXT.choices, c.id), c.violation ? h('small', { style: { color: v('state.bad') } }, ` (${TEXT.violation})`) : null))),
        h('p', { className: 'gm-press-clock', 'aria-live': 'polite', style: { margin: 0, color: left <= 5 ? v('state.bad') : v('text.muted') } }, fill(TEXT.timeLeft, { s: Math.max(0, left) })),
        h('button', { type: 'button', 'data-bland-all': 'true', style: btn, onClick: () => send({ kind: 'bland_all' }) }, TEXT.blandAll),
      ) : h('p', null, TEXT.over),
      live.headline ? h('p', { className: 'gm-press-headline', style: { fontWeight: 'bold' } },
        fill(TEXT.headline, { stance: look(TEXT.headlines, live.headline.choice), topic: words(live.headline.topicId) })) : null,
      live.history.length === 0 ? null : h('section', { className: 'gm-press-history' },
        h('h3', { style: { fontSize: '1rem' } }, TEXT.answered),
        h('ol', null, ...live.history.map((a) => h('li', { key: a.n, value: a.n },
          h('span', { style: { color: v('text.muted') } }, `${look(TEXT.outlets, a.outlet)}: `), a.text, ' ',
          h('em', null, `(${look(TEXT.choices, a.choice)}${a.timedOut ? `, ${TEXT.timedOut}` : ''})`))))),
    ),
  );
}

/** Route entry for registry id `people.media`; the integrator adds it to the shell's route table. */
export function pressRoute(getModel: (p: ScreenProps) => PressScreenView | null, onCommand?: (c: PressCommand) => void): RouteEntry {
  return { render: (p) => { const model = getModel(p); return model ? h(PressConference, { model, ...(onCommand ? { onCommand } : {}) }) : null; } };
}

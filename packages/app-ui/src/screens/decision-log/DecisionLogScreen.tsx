// Decision log screen (film.decision_log; N3.2, N3.3, N3.4). Every logged decision with what was in front
// of the coach, the model's view as it stood at the time (with its range and what the model lacks), and
// the outcome. A single play call is never classed (N3.3.2); people and roster decisions show follow-up
// checks instead of a score (N3.3.3). Draws read-model data only; holds no football logic.
import type { ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import { TermText } from '../glossary/TermText.tsx';
import { clock, dt, pct, type UiDecisionFilter, type UiDecisionLog, type UiDecisionRow, type UiModelLine } from './view.ts';

type TextOf = (key: string) => string;
const box = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };

function when(r: UiDecisionRow): string {
  if (r.scope === 'game' && r.gameId !== null) {
    return dt('dl.when.game', { date: r.worldDate, game: r.gameId, period: r.period ?? '-', clock: r.clockTenths !== null ? clock(r.clockTenths) : '-', play: r.playIndex ?? '-' });
  }
  return dt('dl.when.week', { date: r.worldDate });
}

function who(r: UiDecisionRow): string {
  const base = r.actor === 'user' ? dt('dl.who.user') : r.actor === 'default' ? dt('dl.who.default') : dt(`dl.who.${r.actor}`, { id: r.actorId ?? '-' });
  if (r.basis === 'own_decision') return base;
  return `${base}, ${dt(`dl.basis.${r.basis}`, { id: r.viaId ?? '-' })}`;
}

function Model({ m, text }: { m: UiModelLine; text: TextOf }): ReactNode {
  switch (m.kind) {
    case 'pending': return <p className="gm-line">{dt('dl.model.pending')}</p>;
    case 'game_management': return (
      <div data-model="game_management" data-class={m.class}>
        <p><strong>{dt(`dl.model.class.${m.class}`)}</strong> · {dt('dl.model.best', { option: text(m.bestLabelKey) })}</p>
        <p>{dt('dl.model.cost', { cost: pct(m.cost), margin: pct(m.margin) })}</p>
        <ul>{m.options.map((o) => <li key={o.optionId} data-option={o.optionId}>{dt('dl.model.option', { option: text(o.labelKey), value: pct(o.value), low: pct(o.low), high: pct(o.high), thin: o.sparse ? dt('dl.model.thin') : '' })}</li>)}</ul>
        {m.lacks.length ? <p data-lacks>{dt('dl.model.lacks', { list: m.lacks.map(text).join(', ') })}</p> : null}
      </div>
    );
    case 'play_call': return (
      <p data-model="play_call">{dt('dl.model.call', { foresight: m.foresight.toFixed(2), n: m.foresightSample, pred: pct(m.predictability) })}</p>
    );
    case 'follow_up': return (
      <div data-model="follow_up">
        <p>{dt('dl.model.followUp', { dates: m.due.join(', ') || '-' })}</p>
        {m.done.map((f) => <p key={f.dueDate}>{dt('dl.model.followUpDone', { date: f.dueDate, people: f.people, overlap: dt(f.bandsOverlapped ? 'dl.yes' : 'dl.no') })}</p>)}
      </div>
    );
  }
}

function resultText(result: unknown, text: TextOf): string {
  if (typeof result === 'string') return text(result);
  if (result === null || result === undefined) return '-';
  if (typeof result === 'object') return Object.entries(result as Record<string, unknown>).map(([k, x]) => `${k} ${typeof x === 'object' ? JSON.stringify(x) : String(x)}`).join(', ');
  return String(result);
}

export function DecisionRowView({ r, text }: { r: UiDecisionRow; text: TextOf }) {
  return (
    <article data-decision={r.id} data-type={r.type} style={box}>
      <h3><TermText text={text(r.type)} /></h3>
      <p className="gm-line">{when(r)} · {who(r)} · {dt('dl.time', { seconds: r.secondsToDecide.toFixed(1) })}</p>
      <p>{r.notMade ? dt('dl.notMade') : dt('dl.chosen', { option: text(r.chosenLabelKey) })}</p>
      {r.information.length ? <p data-info>{dt('dl.info', { list: r.information.map((i) => (i.viewed ? text(i.source) : dt('dl.info.notOpened', { source: text(i.source) }))).join(', ') })}</p> : null}
      <h4>{dt('dl.model.title')}</h4>
      <Model m={r.model} text={text} />
      {r.outcome ? (
        <p data-outcome>{dt('dl.outcome', { result: resultText(r.outcome.result, text) })}{r.outcome.luck ? ` · ${dt('dl.outcome.luck', { expected: r.outcome.luck.expected.toFixed(2), actual: r.outcome.luck.actual.toFixed(2) })}` : ''}</p>
      ) : <p className="gm-line">{dt('dl.outcome.none')}</p>}
      {r.supersededBy.length ? <p>{dt('dl.superseded', { ids: r.supersededBy.join(', ') })}</p> : null}
    </article>
  );
}

export interface DecisionLogScreenProps {
  view: UiDecisionLog | null;
  filter: UiDecisionFilter;
  text?: TextOf;
  onFilter(f: UiDecisionFilter): void;
}

export function DecisionLogScreen({ view, filter, text = (k) => k, onFilter }: DecisionLogScreenProps) {
  if (!view || view.total === 0) return <section aria-label={dt('dl.title')}><h1>{dt('dl.title')}</h1><p className="gm-line">{dt('dl.none')}</p></section>;
  const s = view.summary;
  return (
    <section aria-label={dt('dl.title')} data-screen="film.decision_log">
      <h1>{dt('dl.title')}</h1>
      <div role="group" aria-label={dt('dl.filter.scope')}>
        <label>{dt('dl.filter.scope')}{' '}
          <select value={filter.scope} onChange={(e) => onFilter({ ...filter, scope: e.currentTarget.value as UiDecisionFilter['scope'] })}>
            {(['all', 'game', 'week'] as const).map((k) => <option key={k} value={k}>{dt(`dl.filter.scope.${k}`)}</option>)}
          </select>
        </label>{' '}
        <label>{dt('dl.filter.type')}{' '}
          <select value={filter.type ?? ''} onChange={(e) => onFilter({ ...filter, type: e.currentTarget.value || null })}>
            <option value="">{dt('dl.filter.type.all')}</option>
            {view.types.map((t) => <option key={t} value={t}>{text(t)}</option>)}
          </select>
        </label>{' '}
        <label>{dt('dl.filter.game')}{' '}
          <select value={filter.gameId === null ? '' : String(filter.gameId)} onChange={(e) => onFilter({ ...filter, gameId: e.currentTarget.value ? Number(e.currentTarget.value) : null })}>
            <option value="">{dt('dl.filter.game.all')}</option>
            {view.games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>{' '}
        <label>{dt('dl.filter.who')}{' '}
          <select value={filter.who} onChange={(e) => onFilter({ ...filter, who: e.currentTarget.value as UiDecisionFilter['who'] })}>
            {(['all', 'mine', 'staff'] as const).map((k) => <option key={k} value={k}>{dt(`dl.filter.who.${k}`)}</option>)}
          </select>
        </label>{' '}
        <label><input type="checkbox" checked={filter.clearlyWrongOnly} onChange={(e) => onFilter({ ...filter, clearlyWrongOnly: e.currentTarget.checked })} /> {dt('dl.filter.wrong')}</label>
      </div>
      <p className="gm-line" data-summary>{dt('dl.summary', { shown: view.rows.length, total: view.total, right: s.clearlyRight, toss: s.tossUp, wrong: s.clearlyWrong, cost: pct(s.costTotal), pending: s.pendingModel })}</p>
      {view.rows.map((r) => <DecisionRowView key={r.id} r={r} text={text} />)}
    </section>
  );
}

// The coach's notebook screen (coach.notebook; E11.4.1, E10.4.1, E10.5.2). Notes: the whole file with
// filters by kind, subject type, tag, season and job, plain-text search, and pin, edit, merge, delete and
// export. Words and deeds: each commitment he made and what he did since, as counts of decisions that kept
// or broke it, with no label or grade of ours. No count of notes, streak or completion measure is drawn
// (E11.4.1 rule 6). Draws read-model data only; holds no football logic.
import { useState, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import {
  NO_FILTER, PROMPT_TRIGGERS, dateText, nt, pct,
  type NotebookTab, type UiActionResult, type UiLedgerRow, type UiLedgerView, type UiNoteRow, type UiNotebookAction, type UiNotebookFilter, type UiNotebookView,
} from './view.ts';

const box = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };

export interface NotebookSource {
  notebook(filter: UiNotebookFilter): UiNotebookView | null;
  /** His own statement and ledger, and on a staff the boss's as the staff sees it (E10.5.2). */
  ledger(): { readonly own: UiLedgerView | null; readonly boss: UiLedgerView | null };
  act(a: UiNotebookAction): UiActionResult;
  /** The shell saves the text file (core code writes no files). */
  exportText(): void;
}

export interface NotebookScreenProps {
  source: NotebookSource;
  tab: NotebookTab;
  filter: UiNotebookFilter;
  readOnly?: boolean;
  onState(tab: NotebookTab, filter: UiNotebookFilter): void;
  onOpenDecisionLog?(): void;
}

function Select<T extends string | number>({ label, value, options, name, onPick }: { label: string; value: T | null; options: readonly T[]; name: (o: T) => string; onPick(o: T | null): void }) {
  return (
    <label>{label}{' '}
      <select value={value === null ? '' : String(value)} onChange={(e) => {
        const raw = e.currentTarget.value;
        onPick(raw === '' ? null : (options.find((o) => String(o) === raw) ?? null));
      }}>
        <option value="">{nt('nb.filter.any')}</option>
        {options.map((o) => <option key={String(o)} value={String(o)}>{name(o)}</option>)}
      </select>
    </label>
  );
}

interface RowProps {
  r: UiNoteRow; readOnly: boolean; selected: boolean; editing: boolean;
  onSelect(on: boolean): void; onEdit(): void; onCancel(): void; act(a: UiNotebookAction): void;
}

export function NoteRowView({ r, readOnly, selected, editing, onSelect, onEdit, onCancel, act }: RowProps) {
  const [draft, setDraft] = useState(r.text);
  const meta = nt('nb.meta', { date: dateText(r.created), kind: nt(`nb.kind.${r.kind}`), job: r.job.name });
  return (
    <article data-note={r.id} data-kind={r.kind} data-pinned={r.pinned ? '1' : undefined} style={box}>
      <p className="gm-line">{r.pinned ? <strong>{nt('nb.pinned')} · </strong> : null}{meta}</p>
      {r.inheritedFrom !== null ? <p className="gm-line" data-inherited>{nt('nb.inherited', { name: r.inheritedFrom })}</p> : null}
      {r.attachment ? <p className="gm-line">{nt(`nb.attachment.${r.attachment}`)}</p> : null}
      {editing ? (
        <div>
          <label>{nt('nb.edit.label')}<br /><textarea value={draft} rows={4} cols={60} onChange={(e) => setDraft(e.currentTarget.value)} /></label>
          <div>
            <button type="button" onClick={() => act({ kind: 'edit', id: r.id, text: draft })}>{nt('nb.act.save')}</button>{' '}
            <button type="button" onClick={onCancel}>{nt('nb.act.cancel')}</button>
          </div>
        </div>
      ) : <p data-text style={{ whiteSpace: 'pre-wrap' }}>{r.text}</p>}
      <p className="gm-line">{r.subjects.length ? nt('nb.about', { list: r.subjects.map((s) => s.name).join('; ') }) : nt('nb.about.none')}</p>
      {r.tags.length ? <p className="gm-line">{nt('nb.tags', { list: r.tags.join(', ') })}</p> : null}
      {r.subjectMeasure ? <p className="gm-line">{nt('nb.measure', { measure: r.subjectMeasure })}</p> : null}
      {r.edited ? <p className="gm-line">{nt('nb.edited', { date: dateText(r.edited) })}</p> : null}
      {readOnly ? null : (
        <div role="group">
          <button type="button" onClick={() => act({ kind: 'pin', id: r.id, pinned: !r.pinned })}>{nt(r.pinned ? 'nb.act.unpin' : 'nb.act.pin')}</button>{' '}
          {editing ? null : <><button type="button" onClick={() => { setDraft(r.text); onEdit(); }}>{nt('nb.act.edit')}</button>{' '}</>}
          <button type="button" onClick={() => act({ kind: 'delete', id: r.id })}>{nt('nb.act.delete')}</button>{' '}
          <label><input type="checkbox" checked={selected} onChange={(e) => onSelect(e.currentTarget.checked)} /> {nt('nb.act.select')}</label>
        </div>
      )}
    </article>
  );
}

function NotesPage({ view, filter, readOnly, setFilter, act, exportText }: {
  view: UiNotebookView | null; filter: UiNotebookFilter; readOnly: boolean; setFilter(f: UiNotebookFilter): void; act(a: UiNotebookAction): boolean; exportText(): void;
}) {
  const [selected, setSelected] = useState<readonly number[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [tags, setTags] = useState('');
  const f = view?.facets;
  const write = readOnly ? null : (
    <div style={box} data-write>
      <label>{nt('nb.write.label')}<br /><textarea value={text} rows={3} cols={60} onChange={(e) => setText(e.currentTarget.value)} /></label><br />
      <label>{nt('nb.write.tags')} <input type="text" value={tags} onChange={(e) => setTags(e.currentTarget.value)} /></label>{' '}
      <button type="button" onClick={() => {
        const list = tags.split(',').map((t) => t.trim()).filter((t) => t !== '');
        if (act({ kind: 'write', text, ...(list.length ? { tags: list } : {}) })) { setText(''); setTags(''); }
      }}>{nt('nb.act.write')}</button>
    </div>
  );
  if (!view || view.blank) return <div>{write}<p className="gm-line">{nt('nb.blank')}</p></div>;
  return (
    <div>
      {write}
      <div role="group" aria-label={nt('nb.filter.text')}>
        <label>{nt('nb.filter.text')} <input type="search" value={filter.text} onChange={(e) => setFilter({ ...filter, text: e.currentTarget.value })} /></label>{' '}
        <Select label={nt('nb.filter.kind')} value={filter.kind} options={f!.kinds} name={(k) => nt(`nb.kind.${k}`)} onPick={(kind) => setFilter({ ...filter, kind })} />{' '}
        <Select label={nt('nb.filter.subject')} value={filter.subjectType} options={f!.subjectTypes} name={(s) => nt(`nb.subject.${s}`)} onPick={(subjectType) => setFilter({ ...filter, subjectType })} />{' '}
        <Select label={nt('nb.filter.tag')} value={filter.tag} options={f!.tags} name={(t) => t} onPick={(tag) => setFilter({ ...filter, tag })} />{' '}
        <Select label={nt('nb.filter.season')} value={filter.season} options={f!.seasons} name={(s) => String(s)} onPick={(season) => setFilter({ ...filter, season })} />{' '}
        <Select label={nt('nb.filter.job')} value={filter.job} options={f!.jobs.map((j) => j.key)} name={(k) => f!.jobs.find((j) => j.key === k)?.name ?? k} onPick={(job) => setFilter({ ...filter, job })} />{' '}
        <button type="button" onClick={() => setFilter(NO_FILTER)}>{nt('nb.filter.clear')}</button>
      </div>
      <div role="group">
        <button type="button" onClick={exportText}>{nt('nb.act.export')}</button>{' '}
        {readOnly ? null : <button type="button" disabled={selected.length < 2} onClick={() => { if (act({ kind: 'merge', ids: selected })) setSelected([]); }}>{nt('nb.act.merge')}</button>}
      </div>
      {readOnly ? null : (
        <p className="gm-line">{nt('nb.prompts')}:{' '}
          {PROMPT_TRIGGERS.map((t) => (
            <label key={t}><input type="checkbox" checked={view.promptsOn[t]} onChange={(e) => act({ kind: 'prompt', trigger: t, on: e.currentTarget.checked })} /> {nt(`nb.prompt.${t}`)}{' '}</label>
          ))}
        </p>
      )}
      {view.rows.length === 0 ? <p className="gm-line">{nt('nb.nomatch')}</p> : view.rows.map((r) => (
        <NoteRowView key={r.id} r={r} readOnly={readOnly} selected={selected.includes(r.id)} editing={editing === r.id}
          onSelect={(on) => setSelected(on ? [...selected, r.id] : selected.filter((x) => x !== r.id))}
          onEdit={() => setEditing(r.id)} onCancel={() => setEditing(null)}
          act={(a) => { if (act(a) && a.kind === 'edit') setEditing(null); }} />
      ))}
    </div>
  );
}

export function LedgerRowView({ r }: { r: UiLedgerRow }) {
  const said = nt('nb.ledger.said', { date: dateText(r.stated), audience: nt(`nb.audience.${r.audience}`) });
  return (
    <tr data-commitment={r.catalogueId} data-behaviour={r.behaviour} data-dropped={r.dropped ? '1' : undefined}>
      <th scope="row">{r.wording ?? nt(r.textKey)}</th>
      <td>{said}{r.dropped ? <><br />{nt('nb.ledger.dropped', { date: dateText(r.dropped) })}</> : null}</td>
      <td>{nt(`nb.measure.${r.measure}`)}{r.fromDiscipline ? <><br />{nt('nb.ledger.fromDiscipline')}</> : null}</td>
      <td>{r.kept}</td>
      <td>{r.broke}</td>
      <td>
        {nt(`nb.behaviour.${r.behaviour}`, { kept: r.kept, broke: r.broke })}
        {r.consistency !== null && r.behaviour === 'kept_and_broke' ? <><br />{nt('nb.ledger.window', { share: pct(r.consistency), seasons: r.windowSeasons })}</> : null}
        {r.recentKept.length ? <><br />{nt('nb.ledger.recentKept', { ids: r.recentKept.map((id) => `#${id}`).join(', ') })}</> : null}
        {r.recentBroke.length ? <><br />{nt('nb.ledger.recentBroke', { ids: r.recentBroke.map((id) => `#${id}`).join(', ') })}</> : null}
      </td>
    </tr>
  );
}

export function LedgerPage({ ledger, onOpenDecisionLog }: { ledger: UiLedgerView; onOpenDecisionLog?: () => void }): ReactNode {
  const boss = ledger.whose === 'boss';
  return (
    <section data-ledger={ledger.whose} style={box}>
      <h2>{boss ? nt('nb.ledger.boss', { name: ledger.ownerName ?? '' }) : nt('nb.ledger.own')}</h2>
      {!boss && ledger.draft ? <p className="gm-line" data-draft>{nt('nb.ledger.draft')}</p> : null}
      <h3>{nt(boss ? 'nb.ledger.statement.boss' : 'nb.ledger.statement')}</h3>
      {ledger.statement ? <blockquote style={{ whiteSpace: 'pre-wrap' }}>{ledger.statement}</blockquote> : <p className="gm-line">{nt('nb.ledger.statement.none')}</p>}
      {ledger.rows.length === 0 ? <p className="gm-line">{nt('nb.ledger.none')}</p> : (
        <>
          <table>
            <thead><tr>
              {(['commitment', 'said', 'measure', 'kept', 'broke', 'done'] as const).map((c) => <th key={c} scope="col">{nt(`nb.ledger.col.${c}`)}</th>)}
            </tr></thead>
            <tbody>{ledger.rows.map((r) => <LedgerRowView key={r.catalogueId} r={r} />)}</tbody>
          </table>
          <p data-overall>{nt('nb.ledger.overall', { kept: ledger.overall.kept, broke: ledger.overall.broke })}</p>
          {onOpenDecisionLog ? <button type="button" onClick={onOpenDecisionLog}>{nt('nb.ledger.openLog')}</button> : null}
        </>
      )}
    </section>
  );
}

export function NotebookScreen({ source, tab, filter, readOnly = false, onState, onOpenDecisionLog }: NotebookScreenProps) {
  const [, bump] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const act = (a: UiNotebookAction): boolean => {
    const r = source.act(a);
    setError(r.ok ? null : r.key);
    bump((n) => n + 1);
    return r.ok;
  };
  const tabs = (['notes', 'ledger'] as const);
  let body: ReactNode;
  if (tab === 'notes') {
    body = <NotesPage view={source.notebook(filter)} filter={filter} readOnly={readOnly} setFilter={(f) => onState('notes', f)} act={act} exportText={() => source.exportText()} />;
  } else {
    const l = source.ledger();
    body = (
      <div>
        {l.own ? <LedgerPage ledger={l.own} {...(onOpenDecisionLog ? { onOpenDecisionLog } : {})} /> : <p className="gm-line">{nt('nb.ledger.none')}</p>}
        {l.boss ? <LedgerPage ledger={l.boss} /> : null}
      </div>
    );
  }
  return (
    <section aria-label={nt('nb.title')} data-screen="coach.notebook">
      <h1>{nt('nb.title')}</h1>
      <div role="tablist">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === tab} data-tab={t} onClick={() => onState(t, filter)}>{nt(`nb.tab.${t}`)}</button>
        ))}
      </div>
      {readOnly ? <p className="gm-line">{nt('nb.readonly')}</p> : null}
      {error ? <p role="alert" data-error={error}>{nt(`nb.error.${error}`)}</p> : null}
      {body}
    </section>
  );
}

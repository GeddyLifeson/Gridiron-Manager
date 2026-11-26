// Playbook library screen (G-67; O3.3.1 over G3 and G4). Holds no football logic: calls, lengths, gaps,
// word warnings, the size check and every lock arrive in the read model, and every action is an intent the
// host turns into a command. Everything works by keyboard: filters are form fields and every action is a
// button (Q1.5.2). A control the user's job does not hold names its holder and offers a suggestion.
import { useState, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import { pt, ROLES, TABS, type PlaybookIntent, type PlaybookUi, type Tab, type UiFilter, type UiLock, type UiRow } from './view.ts';

export interface PlaybookScreenProps {
  view: PlaybookUi | null;
  tab: Tab;
  readOnly: boolean;
  onTab(tab: Tab): void;
  onFilter(filter: UiFilter): void;
  onIntent(intent: PlaybookIntent): void;
}

const WARN_COLOUR = { none: 'state.good', amber: 'state.caution', red: 'state.bad' } as const;
const box = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };

function Badge({ colour, children }: { colour: string; children: ReactNode }) {
  return <span className="pb-badge" style={{ borderLeft: `4px solid ${v(colour)}`, paddingLeft: '4px' }}>{children}</span>;
}

/** A button under a lock: allowed runs the action; held elsewhere offers a suggestion or shows the holder. */
function Action({ lock, readOnly, label, onClick, disabled }: { lock: UiLock; readOnly: boolean; label: string; onClick(): void; disabled?: boolean }) {
  if (readOnly) return null;
  if (lock.allowed) return <button type="button" disabled={disabled} onClick={onClick}>{label}</button>;
  const holder = pt(`pb.holder.${lock.heldBy ?? 'head_coach'}`);
  if (!lock.suggest) return <span className="gm-line" data-locked="true">{pt('pb.lock.heldBy', { holder })}</span>;
  return <button type="button" disabled={disabled} data-suggest="true" title={pt('pb.lock.heldBy', { holder })} onClick={onClick}>{`${label} · ${pt('pb.action.suggest', { holder })}`}</button>;
}

function Filters({ view, onFilter }: { view: PlaybookUi; onFilter(f: UiFilter): void }) {
  const f = view.filter;
  const set = (patch: UiFilter) => onFilter({ ...f, ...patch });
  const select = (key: 'formation' | 'concept' | 'personnel') => (
    <label>{pt(`pb.filter.${key}`)}{' '}
      <select value={f[key] ?? ''} onChange={(e) => set({ [key]: e.target.value || undefined })}>
        <option value="">{pt('pb.filter.any')}</option>
        {view.options[key].map((o) => <option key={o.id} value={o.id}>{o.word}</option>)}
      </select>
    </label>
  );
  return (
    <fieldset className="pb-filters" style={box}>
      <legend>{pt('pb.filter.title')}</legend>
      <label>{pt('pb.filter.text')}{' '}<input type="search" value={f.text ?? ''} onChange={(e) => set({ text: e.target.value || undefined })} /></label>{' '}
      {select('formation')}{' '}{select('concept')}{' '}{select('personnel')}{' '}
      <label>{pt('pb.filter.role')}{' '}
        <select value={f.role ?? ''} onChange={(e) => set({ role: e.target.value || undefined })}>
          <option value="">{pt('pb.filter.any')}</option>
          {ROLES.map((r) => <option key={r} value={r}>{pt(`pb.role.${r}`)}</option>)}
        </select>
      </label>{' '}
      <label><input type="checkbox" checked={!!f.includeRetired} onChange={(e) => set({ includeRetired: e.target.checked || undefined })} /> {pt('pb.filter.retired')}</label>{' '}
      <button type="button" onClick={() => onFilter({})}>{pt('pb.filter.clear')}</button>
    </fieldset>
  );
}

function Row({ r, view, readOnly, selected, onSelect, onIntent }: { r: UiRow; view: PlaybookUi; readOnly: boolean; selected: boolean; onSelect(on: boolean): void; onIntent(i: PlaybookIntent): void }) {
  return (
    <tr data-play={r.id} data-status={r.status} data-over={r.overLimit ? 'true' : undefined}>
      <td><input type="checkbox" aria-label={pt('pb.select', { call: r.call })} checked={selected} onChange={(e) => onSelect(e.target.checked)} /></td>
      <th scope="row">{r.call}{r.tags.length ? <span className="gm-line"> {r.tags.join(' ')}</span> : null}</th>
      <td>{r.section}</td>
      <td>
        {!readOnly && view.locks.edit_side_playbook.allowed ? (
          <select aria-label={pt('pb.action.setRole', { call: r.call })} value={r.role} onChange={(e) => onIntent({ kind: 'set_role', playId: r.id, role: e.target.value })}>
            {ROLES.map((x) => <option key={x} value={x}>{pt(`pb.role.${x}`)}</option>)}
          </select>
        ) : pt(`pb.role.${r.role}`)}
      </td>
      <td>{pt(`pb.status.${r.status}`)}</td>
      <td>{r.readinessEstimate === null ? pt('pb.noEstimate') : `${Math.round(r.readinessEstimate * 100)}%`}</td>
      <td>{r.called}</td>
      <td>{r.avgResult === null ? pt('pb.noSample') : pt('pb.result', { avg: r.avgResult, sample: r.sample })}</td>
      <td>
        {pt('pb.length', { seconds: r.lengthS, words: r.words })}
        {r.overLimit ? <> <Badge colour="state.bad">{pt('pb.overLimit')}</Badge></> : null}
        {r.latestStartS !== null ? <span className="gm-line"> {pt('pb.latestStart', { seconds: r.latestStartS })}</span> : null}
      </td>
      <td><Action lock={view.locks.draft_play} readOnly={readOnly} label={pt('pb.action.duplicate', { call: r.call })} onClick={() => onIntent({ kind: 'duplicate', playId: r.id })} /></td>
    </tr>
  );
}

function Library({ view, readOnly, onFilter, onIntent }: { view: PlaybookUi; readOnly: boolean; onFilter(f: UiFilter): void; onIntent(i: PlaybookIntent): void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const sel = picked.filter((id) => view.rows.some((r) => r.id === id));
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...p.filter((x) => x !== id), id] : p.filter((x) => x !== id)));
  const retiredSel = sel.filter((id) => view.rows.find((r) => r.id === id)?.status === 'retired');
  const liveSel = sel.filter((id) => !retiredSel.includes(id));
  return (
    <section aria-label={pt('pb.tab.library')}>
      <Filters view={view} onFilter={onFilter} />
      <p role="status" data-counter="plays">{pt('pb.count', { shown: view.rows.length, total: view.total })}</p>
      {readOnly ? <p className="gm-line">{pt('pb.readOnly')}</p> : null}
      <nav aria-label={pt('pb.sections')}>
        <ul className="pb-sections">{view.sections.map((s) => <li key={s.key} data-section={s.key}>{s.key} ({s.count})</li>)}</ul>
      </nav>
      <div className="pb-bulk">
        <Action lock={view.locks.edit_side_playbook} readOnly={readOnly} disabled={!liveSel.length} label={pt('pb.action.retire', { count: liveSel.length })} onClick={() => onIntent({ kind: 'retire', playIds: liveSel })} />{' '}
        <Action lock={view.locks.edit_side_playbook} readOnly={readOnly} disabled={!retiredSel.length} label={pt('pb.action.restore', { count: retiredSel.length })} onClick={() => onIntent({ kind: 'restore', playIds: retiredSel })} />{' '}
        <Action lock={view.locks.view} readOnly={false} disabled={!sel.length} label={pt('pb.action.export', { count: sel.length })} onClick={() => onIntent({ kind: 'export', playIds: sel })} />
      </div>
      <table data-table="library">
        <thead><tr>
          {['select', 'call', 'section', 'role', 'status', 'readiness', 'called', 'result', 'length', 'actions'].map((c) => <th key={c} scope="col">{pt(`pb.col.${c}`)}</th>)}
        </tr></thead>
        <tbody>
          {view.rows.map((r) => <Row key={r.id} r={r} view={view} readOnly={readOnly} selected={sel.includes(r.id)} onSelect={(on) => toggle(r.id, on)} onIntent={onIntent} />)}
        </tbody>
      </table>
    </section>
  );
}

function Families({ view }: { view: PlaybookUi }) {
  const call = (id: string) => view.rows.find((r) => r.id === id)?.call ?? id;
  const gaps = view.families.flatMap((f) => f.gaps);
  return (
    <section aria-label={pt('pb.families.title')}>
      {gaps.length === 0 ? <p className="gm-line">{pt('pb.families.noGaps')}</p> : null}
      <ul>
        {view.families.map((f) => (
          <li key={f.key} data-family={f.key} style={box}>
            <strong>{f.key}</strong> ({f.plays.length})
            {f.gaps.map((g) => <p key={g} role="note" data-gap={g}><Badge colour="state.caution">{pt('pb.families.gap', { play: call(g) })}</Badge></p>)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Words({ view, readOnly, onIntent }: { view: PlaybookUi; readOnly: boolean; onIntent(i: PlaybookIntent): void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const lock = view.locks.edit_side_playbook;
  return (
    <section aria-label={pt('pb.words.title')}>
      <table data-table="words">
        <thead><tr>{['type', 'word', 'syllables', 'usedBy'].map((c) => <th key={c} scope="col">{pt(`pb.words.${c}`)}</th>)}<th scope="col" /></tr></thead>
        <tbody>
          {view.words.map((w) => (
            <tr key={w.partId} data-word={w.partId} data-duplicate={w.duplicate ? 'true' : undefined}>
              <td>{w.type}</td>
              <th scope="row">{w.word}
                {w.duplicate ? <> <Badge colour="state.bad">{pt('pb.words.duplicate')}</Badge></> : null}
                {w.soundsLike.length ? <> <Badge colour="state.caution">{pt('pb.words.soundsLike', { words: w.soundsLike.map((id) => view.words.find((x) => x.partId === id)?.word ?? id).join(', ') })}</Badge></> : null}
              </th>
              <td>{w.syllables}</td>
              <td>{w.usedBy}</td>
              <td>
                {!readOnly && lock.allowed ? (
                  <input aria-label={pt('pb.words.newWord', { word: w.word })} value={draft[w.partId] ?? ''} onChange={(e) => setDraft({ ...draft, [w.partId]: e.target.value })} />
                ) : null}{' '}
                <Action lock={lock} readOnly={readOnly} disabled={lock.allowed && !(draft[w.partId] ?? '').trim()} label={pt('pb.words.rename', { word: w.word })}
                  onClick={() => onIntent({ kind: 'rename_word', partId: w.partId, word: (draft[w.partId] ?? '').trim() })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Size({ view }: { view: PlaybookUi }) {
  const s = view.size;
  if (!s) return <p className="gm-line">{pt('pb.size.none')}</p>;
  return (
    <section aria-label={pt('pb.tab.size')} data-warning={s.warning}>
      <p role="status"><Badge colour={WARN_COLOUR[s.warning]}>{pt(`pb.size.warning.${s.warning}`)}</Badge></p>
      <p>{pt('pb.size.ceiling', { ceiling: `${Math.round(s.readinessCeiling * 100)}%` })}</p>
      <p>{pt('pb.size.upkeep', { upkeep: s.upkeep, capacity: s.capacity })}</p>
      {s.warnings.map((w) => <p key={w} role="note">{w}</p>)}
      <ol data-board="section-upkeep">{s.sectionUpkeep.map((x) => <li key={x.section}>{pt('pb.size.section', { section: x.section, units: x.units, share: Math.round(x.share * 100) })}</li>)}</ol>
    </section>
  );
}

export function PlaybookScreen({ view, tab, readOnly, onTab, onFilter, onIntent }: PlaybookScreenProps) {
  if (!view) return <p className="gm-line">{pt('pb.empty')}</p>;
  return (
    <div className="pb-screen" data-team={view.teamId} data-side={view.side}>
      <h1>{pt(`pb.side.${view.side}`)}</h1>
      <div role="tablist">
        {TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => onTab(t)}>{pt(`pb.tab.${t}`)}</button>)}
      </div>
      <div role="tabpanel">
        {tab === 'library' ? <Library view={view} readOnly={readOnly} onFilter={onFilter} onIntent={onIntent} /> : null}
        {tab === 'families' ? <Families view={view} /> : null}
        {tab === 'words' ? <Words view={view} readOnly={readOnly} onIntent={onIntent} /> : null}
        {tab === 'size' ? <Size view={view} /> : null}
      </div>
    </div>
  );
}

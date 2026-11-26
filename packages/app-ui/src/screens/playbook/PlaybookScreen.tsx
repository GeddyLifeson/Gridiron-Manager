// Playbook library screen (G-67; O3.3.1 over G3 and G4). Holds no football logic: calls, lengths, gaps,
// word warnings, the size check and every lock arrive in the read model, and every action is an intent the
// host turns into a command. Everything works by keyboard: filters are form fields and every action is a
// button (Q1.5.2). A control the user's job does not hold names its holder and offers a suggestion.
import { useState, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import { pt, ROLES, STATUSES, TABS, SORT_KEYS, sortRows, stepIndex, type PlaybookIntent, type PlaybookUi, type SavedFilter, type SortKey, type Tab, type UiFilter, type UiLock, type UiRow, type UiSort, type UiFolder } from './view.ts';

export interface PlaybookScreenProps {
  view: PlaybookUi | null;
  tab: Tab;
  readOnly: boolean;
  onTab(tab: Tab): void;
  onFilter(filter: UiFilter): void;
  onIntent(intent: PlaybookIntent): void;
  /** Column sort and the selected play for the detail pane; both live in the address (O1.1.3). */
  sort?: UiSort | null;
  onSort?(sort: UiSort | null): void;
  selectedPlay?: string | null;
  onSelectPlay?(id: string | null): void;
  /** Saved filter sets (O3.3.1), a user preference the host keeps. */
  savedFilters?: readonly SavedFilter[];
  /** Open one folder in the library (filter and tab change together). */
  onOpenFolder?(folderId: string): void;
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

function Filters({ view, onFilter, onIntent, saved }: { view: PlaybookUi; onFilter(f: UiFilter): void; onIntent(i: PlaybookIntent): void; saved: readonly SavedFilter[] }) {
  const [name, setName] = useState('');
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
      <label>{pt('pb.filter.status')}{' '}
        <select value={f.status ?? ''} onChange={(e) => set({ status: e.target.value || undefined })}>
          <option value="">{pt('pb.filter.any')}</option>
          {STATUSES.map((x) => <option key={x} value={x}>{pt(`pb.status.${x}`)}</option>)}
        </select>
      </label>{' '}
      <label>{pt('pb.filter.situation')}{' '}<input value={f.situation ?? ''} onChange={(e) => set({ situation: e.target.value || undefined })} /></label>{' '}
      <label><input type="checkbox" checked={!!f.includeRetired} onChange={(e) => set({ includeRetired: e.target.checked || undefined })} /> {pt('pb.filter.retired')}</label>{' '}
      <button type="button" onClick={() => onFilter({})}>{pt('pb.filter.clear')}</button>
      <div className="pb-saved" data-saved-filters={saved.length}>
        {saved.length ? (
          <label>{pt('pb.filter.saved')}{' '}
            <select value="" onChange={(e) => { const s = saved.find((x) => x.name === e.target.value); if (s) onFilter(s.filter); }}>
              <option value="">{pt('pb.filter.pickSaved')}</option>
              {saved.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
            </select>
          </label>
        ) : null}{' '}
        <label>{pt('pb.filter.saveName')}{' '}<input value={name} onChange={(e) => setName(e.target.value)} /></label>{' '}
        <button type="button" disabled={!name.trim()} onClick={() => { onIntent({ kind: 'save_filter', name: name.trim(), filter: f }); setName(''); }}>{pt('pb.filter.save')}</button>
      </div>
    </fieldset>
  );
}

/** Folder controls of one row when a folder is open: drag to reorder, or the arrow buttons by keyboard. */
interface RowFolder { folder: UiFolder; at: number; onDrop(fromId: string, at: number): void }

function Row({ r, view, readOnly, selected, open, onSelect, onOpen, onIntent, inFolder }: { r: UiRow; view: PlaybookUi; readOnly: boolean; selected: boolean; open: boolean; onSelect(on: boolean): void; onOpen(): void; onIntent(i: PlaybookIntent): void; inFolder?: RowFolder }) {
  const drag = inFolder && !readOnly ? {
    draggable: true,
    onDragStart: (e: { dataTransfer: { setData(k: string, v: string): void } }) => e.dataTransfer.setData('text/plain', r.id),
    onDragOver: (e: { preventDefault(): void }) => e.preventDefault(),
    onDrop: (e: { preventDefault(): void; dataTransfer: { getData(k: string): string } }) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id && id !== r.id) inFolder.onDrop(id, inFolder.at); },
  } : {};
  return (
    <tr data-play={r.id} data-status={r.status} data-over={r.overLimit ? 'true' : undefined} aria-current={open ? 'true' : undefined} {...drag}>
      <td><input type="checkbox" aria-label={pt('pb.select', { call: r.call })} checked={selected} onChange={(e) => onSelect(e.target.checked)} /></td>
      <th scope="row"><button type="button" className="pb-open" title={pt('pb.detail.open', { call: r.call })} onClick={onOpen}>{r.call}</button>{r.tags.length ? <span className="gm-line"> {r.tags.join(' ')}</span> : null}</th>
      <td>{r.family}</td>
      <td>{r.personnel}</td>
      <td>{r.formation}</td>
      <td>{r.concept}</td>
      <td>{r.protection || pt('pb.none')}</td>
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
      <td>
        <Action lock={view.locks.draft_play} readOnly={readOnly} label={pt('pb.action.duplicate', { call: r.call })} onClick={() => onIntent({ kind: 'duplicate', playId: r.id })} />
        {inFolder && !readOnly ? (
          <span className="pb-folder-row" data-folder-at={inFolder.at}>
            {' '}<button type="button" disabled={inFolder.at === 0} onClick={() => onIntent({ kind: 'file_plays', folderId: inFolder.folder.id, playIds: [r.id], index: stepIndex(inFolder.at, -1, inFolder.folder.playIds.length) })}>{pt('pb.folders.playUp', { call: r.call })}</button>
            {' '}<button type="button" disabled={inFolder.at === inFolder.folder.playIds.length - 1} onClick={() => onIntent({ kind: 'file_plays', folderId: inFolder.folder.id, playIds: [r.id], index: stepIndex(inFolder.at, 1, inFolder.folder.playIds.length) })}>{pt('pb.folders.playDown', { call: r.call })}</button>
            {' '}<button type="button" onClick={() => onIntent({ kind: 'unfile_plays', folderId: inFolder.folder.id, playIds: [r.id] })}>{pt('pb.folders.remove', { call: r.call })}</button>
          </span>
        ) : null}
      </td>
    </tr>
  );
}

const COLS: readonly (SortKey | 'select' | 'actions')[] = ['select', 'call', 'family', 'personnel', 'formation', 'concept', 'protection', 'section', 'role', 'status', 'readiness', 'called', 'result', 'length', 'actions'];

/** O3.3.1 detail pane: every field of the selected play, and the hand-offs to the install board and the plan. */
function Detail({ r, view, readOnly, onIntent, onClose }: { r: UiRow; view: PlaybookUi; readOnly: boolean; onIntent(i: PlaybookIntent): void; onClose(): void }) {
  const field = (k: string, val: string | number) => <><dt>{pt(`pb.detail.${k}`)}</dt><dd>{val}</dd></>;
  return (
    <aside className="pb-detail" data-detail={r.id} aria-label={pt('pb.detail.title', { call: r.call })} style={box}>
      <h2>{r.call}</h2>
      <dl>
        {field('family', r.family)}{field('section', r.section)}{field('personnel', r.personnel)}{field('formation', r.formation)}
        {field('concept', r.concept)}{field('protection', r.protection || pt('pb.none'))}{field('tags', r.tags.length ? r.tags.join(', ') : pt('pb.none'))}
        {field('role', pt(`pb.role.${r.role}`))}{field('status', pt(`pb.status.${r.status}`))}
        {field('readiness', r.readinessEstimate === null ? pt('pb.noEstimate') : `${Math.round(r.readinessEstimate * 100)}%`)}
        {field('called', r.lastCalledWeek === null ? String(r.called) : pt('pb.detail.calledWeek', { called: r.called, week: r.lastCalledWeek }))}
        {field('result', r.avgResult === null ? pt('pb.noSample') : pt('pb.result', { avg: r.avgResult, sample: r.sample }))}
        {field('length', pt('pb.length', { seconds: r.lengthS, words: r.words }))}
        {r.latestStartS !== null ? field('latestStart', pt('pb.latestStart', { seconds: r.latestStartS })) : null}
      </dl>
      <Action lock={view.locks.edit_side_playbook} readOnly={readOnly} label={pt('pb.action.addToInstall', { count: 1 })} onClick={() => onIntent({ kind: 'add_to_install', playIds: [r.id] })} />{' '}
      <Action lock={view.locks.build_plan_and_sheet} readOnly={readOnly} label={pt('pb.action.addToPlan', { count: 1 })} onClick={() => onIntent({ kind: 'add_to_plan', playIds: [r.id] })} />{' '}
      <button type="button" onClick={onClose}>{pt('pb.detail.close')}</button>
    </aside>
  );
}

function Library({ view, readOnly, onFilter, onIntent, sort, onSort, selectedPlay, onSelectPlay, saved }: {
  view: PlaybookUi; readOnly: boolean; onFilter(f: UiFilter): void; onIntent(i: PlaybookIntent): void;
  sort: UiSort | null; onSort(s: UiSort | null): void; selectedPlay: string | null; onSelectPlay(id: string | null): void; saved: readonly SavedFilter[];
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const rows = sortRows(view.rows, sort);
  const open = selectedPlay ? view.rows.find((r) => r.id === selectedPlay) ?? null : null;
  const header = (c: (typeof COLS)[number]) => {
    if (c === 'select' || c === 'actions' || !(SORT_KEYS as readonly string[]).includes(c)) return <th key={c} scope="col">{pt(`pb.col.${c}`)}</th>;
    const on = sort?.key === c;
    const next: UiSort | null = !on ? { key: c, dir: 'asc' } : sort!.dir === 'asc' ? { key: c, dir: 'desc' } : null;
    return (
      <th key={c} scope="col" aria-sort={on ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" data-sort={c} onClick={() => onSort(next)}>{pt(`pb.col.${c}`)}{on ? ` ${pt(`pb.sort.${sort!.dir}`)}` : ''}</button>
      </th>
    );
  };
  const sel = picked.filter((id) => view.rows.some((r) => r.id === id));
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...p.filter((x) => x !== id), id] : p.filter((x) => x !== id)));
  const retiredSel = sel.filter((id) => view.rows.find((r) => r.id === id)?.status === 'retired');
  const liveSel = sel.filter((id) => !retiredSel.includes(id));
  const folder = view.filter.folder ? view.folders.find((x) => x.id === view.filter.folder) ?? null : null;
  const inFolder = (id: string): RowFolder | undefined => {
    if (!folder) return undefined;
    const at = folder.playIds.indexOf(id);
    return at < 0 ? undefined : { folder, at, onDrop: (from, to) => onIntent({ kind: 'file_plays', folderId: folder.id, playIds: [from], index: to }) };
  };
  return (
    <section aria-label={pt('pb.tab.library')}>
      <Filters view={view} onFilter={onFilter} onIntent={onIntent} saved={saved} />
      <p role="status" data-counter="plays">{pt('pb.count', { shown: view.rows.length, total: view.total })}</p>
      {readOnly ? <p className="gm-line">{pt('pb.readOnly')}</p> : null}
      {folder ? <p role="note" data-open-folder={folder.id}>{pt('pb.folders.showing', { name: folder.name })}</p> : null}
      <nav aria-label={pt('pb.sections')}>
        <ul className="pb-sections">{view.sections.map((s) => <li key={s.key} data-section={s.key}>{s.key} ({s.count})</li>)}</ul>
      </nav>
      <div className="pb-bulk">
        <Action lock={view.locks.edit_side_playbook} readOnly={readOnly} disabled={!liveSel.length} label={pt('pb.action.retire', { count: liveSel.length })} onClick={() => onIntent({ kind: 'retire', playIds: liveSel })} />{' '}
        <Action lock={view.locks.edit_side_playbook} readOnly={readOnly} disabled={!retiredSel.length} label={pt('pb.action.restore', { count: retiredSel.length })} onClick={() => onIntent({ kind: 'restore', playIds: retiredSel })} />{' '}
        <Action lock={view.locks.edit_side_playbook} readOnly={readOnly} disabled={!liveSel.length} label={pt('pb.action.addToInstall', { count: liveSel.length })} onClick={() => onIntent({ kind: 'add_to_install', playIds: liveSel })} />{' '}
        <Action lock={view.locks.build_plan_and_sheet} readOnly={readOnly} disabled={!liveSel.length} label={pt('pb.action.addToPlan', { count: liveSel.length })} onClick={() => onIntent({ kind: 'add_to_plan', playIds: liveSel })} />{' '}
        <Action lock={view.locks.view} readOnly={false} disabled={!sel.length} label={pt('pb.action.export', { count: sel.length })} onClick={() => onIntent({ kind: 'export', playIds: sel })} />{' '}
        {!readOnly && view.folders.length ? (
          <label>{pt('pb.folders.addTo', { count: sel.length })}{' '}
            <select data-add-to-folder="true" value="" disabled={!sel.length} onChange={(e) => { if (e.target.value) onIntent({ kind: 'file_plays', folderId: e.target.value, playIds: sel }); }}>
              <option value="">{pt('pb.folders.pick')}</option>
              {view.folders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      {open ? <Detail r={open} view={view} readOnly={readOnly} onIntent={onIntent} onClose={() => onSelectPlay(null)} /> : null}
      <table data-table="library">
        <thead><tr>
          {COLS.map(header)}
        </tr></thead>
        <tbody>
          {rows.map((r) => <Row key={r.id} r={r} view={view} readOnly={readOnly} selected={sel.includes(r.id)} open={open?.id === r.id} onSelect={(on) => toggle(r.id, on)} onOpen={() => onSelectPlay(r.id)} onIntent={onIntent} inFolder={inFolder(r.id)} />)}
        </tbody>
      </table>
    </section>
  );
}

/** "My folders" (G3.1.1 labels, kept the coach's way): make, rename, order, delete and open folders. */
function Folders({ view, readOnly, onIntent, onOpen }: { view: PlaybookUi; readOnly: boolean; onIntent(i: PlaybookIntent): void; onOpen(id: string): void }) {
  const [name, setName] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const n = view.folders.length;
  return (
    <section aria-label={pt('pb.folders.title')}>
      {!readOnly ? (
        <p>
          <label>{pt('pb.folders.newName')}{' '}<input value={name} onChange={(e) => setName(e.target.value)} /></label>{' '}
          <button type="button" disabled={!name.trim()} onClick={() => { onIntent({ kind: 'create_folder', name: name.trim() }); setName(''); }}>{pt('pb.folders.create')}</button>
        </p>
      ) : null}
      {n === 0 ? <p className="gm-line">{pt('pb.folders.none')}</p> : null}
      <ol data-board="folders">
        {view.folders.map((f, i) => (
          <li key={f.id} data-folder={f.id} style={box}>
            <button type="button" onClick={() => onOpen(f.id)}>{pt('pb.folders.open', { name: f.name })}</button>{' '}
            <span className="gm-line">{pt('pb.folders.count', { count: f.playIds.length })}</span>
            {!readOnly ? (
              <span>
                {' '}<button type="button" disabled={i === 0} onClick={() => onIntent({ kind: 'reorder_folder', folderId: f.id, index: stepIndex(i, -1, n) })}>{pt('pb.folders.up', { name: f.name })}</button>
                {' '}<button type="button" disabled={i === n - 1} onClick={() => onIntent({ kind: 'reorder_folder', folderId: f.id, index: stepIndex(i, 1, n) })}>{pt('pb.folders.down', { name: f.name })}</button>
                {' '}<input aria-label={pt('pb.folders.rename', { name: f.name })} value={names[f.id] ?? ''} onChange={(e) => setNames({ ...names, [f.id]: e.target.value })} />
                {' '}<button type="button" disabled={!(names[f.id] ?? '').trim()} onClick={() => { onIntent({ kind: 'rename_folder', folderId: f.id, name: (names[f.id] ?? '').trim() }); setNames({ ...names, [f.id]: '' }); }}>{pt('pb.folders.rename', { name: f.name })}</button>
                {' '}<button type="button" onClick={() => onIntent({ kind: 'delete_folder', folderId: f.id })}>{pt('pb.folders.delete', { name: f.name })}</button>
              </span>
            ) : null}
          </li>
        ))}
      </ol>
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

export function PlaybookScreen({ view, tab, readOnly, onTab, onFilter, onIntent, sort = null, onSort = () => {}, selectedPlay = null, onSelectPlay = () => {}, savedFilters = [], onOpenFolder }: PlaybookScreenProps) {
  if (!view) return <p className="gm-line">{pt('pb.empty')}</p>;
  return (
    <div className="pb-screen" data-team={view.teamId} data-side={view.side}>
      <h1>{pt(`pb.side.${view.side}`)}</h1>
      <div role="tablist">
        {TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => onTab(t)}>{pt(`pb.tab.${t}`)}</button>)}
      </div>
      <div role="tabpanel">
        {tab === 'library' ? <Library view={view} readOnly={readOnly} onFilter={onFilter} onIntent={onIntent} sort={sort} onSort={onSort} selectedPlay={selectedPlay} onSelectPlay={onSelectPlay} saved={savedFilters} /> : null}
        {tab === 'folders' ? <Folders view={view} readOnly={readOnly} onIntent={onIntent} onOpen={(id) => (onOpenFolder ? onOpenFolder(id) : onFilter({ folder: id }))} /> : null}
        {tab === 'families' ? <Families view={view} /> : null}
        {tab === 'words' ? <Words view={view} readOnly={readOnly} onIntent={onIntent} /> : null}
        {tab === 'size' ? <Size view={view} /> : null}
      </div>
    </div>
  );
}

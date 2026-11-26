// Settings, Mods and the editor list (G-96; P7.1.1, P7.5.1). Holds no validation logic: the host scans
// the user content folder with tools' assessUserContent and passes the result. Pack text is shown as
// plain text only (P7.2.1); React escapes markup, and packText removes control characters. Every action
// is a button (Q1.5.2).
import { useState } from 'react';
import { v } from '../../tokens/index.ts';
import { et, packText, type EditorsIntent, type EditorsUi, type UiPack } from './view.ts';

export interface EditorsScreenProps {
  view: EditorsUi | null;
  readOnly: boolean;
  onIntent(intent: EditorsIntent): void;
}

const box = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };

function PackRow({ p, open, onToggle, onIntent }: { p: UiPack; open: boolean; onToggle(): void; onIntent(i: EditorsIntent): void }) {
  const errors = p.problems.filter((x) => x.severity === 'error').length;
  const warnings = p.problems.filter((x) => x.severity === 'warning' || x.severity === 'flag').length;
  return (
    <>
      <tr data-pack={p.packId} data-selectable={p.selectable ? 'yes' : 'no'}>
        <td>{packText(p.name)} <small>({packText(p.packId)})</small></td>
        <td>{packText(p.version)}</td>
        <td>{packText(p.author)}</td>
        <td>{p.kinds.map(packText).join(', ')}</td>
        <td>{et(`ed.signature.${p.signature}`)}</td>
        <td style={{ borderLeft: `4px solid ${v(p.selectable ? 'state.good' : 'state.bad')}` }}>
          {et(p.selectable ? 'ed.status.ok' : 'ed.status.refused')}{' '}
          {errors || warnings ? <span>{et('ed.problems.count', { errors, warnings })}</span> : null}
        </td>
        <td>
          {p.problems.length || p.ignored.length ? <button type="button" aria-expanded={open} onClick={onToggle}>{et(open ? 'ed.problems.hide' : 'ed.problems.show')}</button> : null}{' '}
          {!p.selectable ? <button type="button" onClick={() => onIntent({ type: 'export_errors', packId: p.packId, origin: p.origin })}>{et('ed.problems.export')}</button> : null}
        </td>
      </tr>
      {open ? (
        <tr data-problems={p.packId}>
          <td colSpan={7}>
            <ul>
              {p.problems.map((x, i) => <li key={i} data-severity={x.severity}><code>{x.code}</code> {packText(x.file)}{x.path ? ` ${packText(x.path)}` : ''}: {packText(x.message)}</li>)}
              {p.ignored.map((x) => <li key={`i-${x.file}`} data-severity="info">{et('ed.problems.ignored', { file: packText(x.file), reason: packText(x.reason) })}</li>)}
            </ul>
            {p.neutralisedCount ? <p>{et('ed.problems.neutralised', { count: p.neutralisedCount })}</p> : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function EditorsScreen({ view, readOnly, onIntent }: EditorsScreenProps) {
  const [open, setOpen] = useState<string | null>(null);
  if (!view) return <section aria-label={et('ed.title')}><h1>{et('ed.title')}</h1></section>;
  return (
    <section aria-label={et('ed.title')} className="ed-screen">
      <h1>{et('ed.title')}</h1>
      <section aria-label={et('ed.packs.title')} style={box}>
        <h2>{et('ed.packs.title')}</h2>
        {view.folder ? <p>{et('ed.packs.folder', { folder: view.folder })}</p> : null}
        <button type="button" onClick={() => onIntent({ type: 'rescan' })}>{et('ed.packs.rescan')}</button>{' '}
        {view.canImport && !readOnly ? <button type="button" onClick={() => onIntent({ type: 'import' })}>{et('ed.packs.import')}</button> : null}
        {view.packs.length === 0 ? <p>{et('ed.packs.none')}</p> : (
          <table>
            <thead><tr>{['pack', 'version', 'author', 'kinds', 'signature', 'status'].map((c) => <th key={c} scope="col">{et(`ed.col.${c}`)}</th>)}<th /></tr></thead>
            <tbody>
              {view.packs.map((p) => <PackRow key={`${p.packId}|${p.origin}`} p={p} open={open === `${p.packId}|${p.origin}`} onToggle={() => setOpen(open === `${p.packId}|${p.origin}` ? null : `${p.packId}|${p.origin}`)} onIntent={onIntent} />)}
            </tbody>
          </table>
        )}
      </section>
      <section aria-label={et('ed.editors.title')} style={box}>
        <h2>{et('ed.editors.title')}</h2>
        <p>{et('ed.editors.note')}</p>
        <ul>
          {view.editors.map((e) => {
            const blocked = view.certified && !e.certifiedAllowed;
            return (
              <li key={e.id} data-editor={e.id}>
                {e.title}{' '}
                <button type="button" disabled={blocked || readOnly} onClick={() => onIntent({ type: 'open_editor', editorId: e.id })}>{et('ed.editors.open')}</button>
                {blocked ? <small> {et('ed.editors.certified')}</small> : null}
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}

// Player designer screen (G-92; D13.1.1, D13.1.2). Holds no football logic: missing fields, warnings,
// derived values, the staff grade and whether the player can be saved all arrive in the model, and every
// action is an intent. Every control is a native input or button, so all of it works by keyboard (Q1.5.2).
import { useState, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import { fieldLabel, pt, sectionLabel, warningText, type DesignerUiIntent, type PlayerDesignerUi, type UiField } from './view.ts';

export interface PlayerDesignerScreenProps {
  view: PlayerDesignerUi | null;
  readOnly: boolean;
  onIntent(intent: DesignerUiIntent): void;
}

const box = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };

function Marker({ colour, children }: { colour: string; children: ReactNode }) {
  return <span className="pd-marker" style={{ borderLeft: `4px solid ${v(colour)}`, paddingLeft: '4px', marginLeft: '4px' }}>{children}</span>;
}

const num = (s: string): number | null => (s.trim() === '' ? null : Number(s));

function FieldInput({ f, path, value, disabled, onIntent }: { f: UiField; path: string; value: number | string | null; disabled: boolean; onIntent(i: DesignerUiIntent): void }) {
  const label = path === f.path ? fieldLabel(path) : `${fieldLabel(f.path)} ${pt('pd.col.ceiling')}`;
  if (f.kind === 'side') {
    return (
      <select aria-label={label} value={String(value ?? 'right')} disabled={disabled} onChange={(e) => onIntent({ kind: 'set_field', path, value: e.target.value })}>
        <option value="right">{pt('pd.side.right')}</option>
        <option value="left">{pt('pd.side.left')}</option>
      </select>
    );
  }
  return (
    <input
      aria-label={label} aria-invalid={f.missing || f.warned} disabled={disabled}
      type={f.kind === 'number' ? 'number' : 'text'} step={f.kind === 'number' ? 'any' : undefined} defaultValue={value === null ? '' : String(value)} key={`${path}:${String(value)}`}
      onBlur={(e) => onIntent({ kind: 'set_field', path, value: f.kind === 'number' ? num(e.target.value) : e.target.value })}
    />
  );
}

function Section({ id, fields, readOnly, onIntent }: { id: string; fields: readonly UiField[]; readOnly: boolean; onIntent(i: DesignerUiIntent): void }) {
  const attrs = fields.some((f) => f.ceilingPath);
  return (
    <fieldset data-section={id} style={box}>
      <legend>{sectionLabel(id)}</legend>
      <table>
        {attrs ? <thead><tr><th scope="col" /><th scope="col">{pt('pd.col.current')}</th><th scope="col">{pt('pd.col.ceiling')}</th><th scope="col" /></tr></thead> : null}
        <tbody>
          {fields.map((f) => (
            <tr key={f.path} data-field={f.path}>
              <th scope="row">{fieldLabel(f.path)}</th>
              <td><FieldInput f={f} path={f.path} value={f.value} disabled={readOnly || f.locked} onIntent={onIntent} /></td>
              {f.ceilingPath ? <td><FieldInput f={f} path={f.ceilingPath} value={f.ceiling ?? null} disabled={readOnly || f.locked} onIntent={onIntent} /></td> : null}
              <td>
                {f.missing ? <Marker colour="state.caution">{pt('pd.marker.missing')}</Marker> : null}
                {f.warned ? <Marker colour="state.bad">{pt('pd.marker.warned')}</Marker> : null}
                {f.locked ? <Marker colour="state.neutral">{pt('pd.marker.locked')}</Marker> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  );
}

function StartPanel({ view, onIntent }: { view: PlayerDesignerUi; onIntent(i: DesignerUiIntent): void }) {
  const [position, setPosition] = useState(view.position ?? view.positions[0] ?? 'QB');
  const list = view.archetypeCatalog[position] ?? [];
  const [arch, setArch] = useState<string>('');
  const archetypeId = list.some((a) => a.id === arch) ? arch : list[0]?.id ?? '';
  const [m, setM] = useState({ ageYears: '22', heightIn: '', weightLb: '', fortyS: '', fill: 'generate' as 'generate' | 'hand' });
  const ready = num(m.heightIn) !== null && num(m.weightLb) !== null && num(m.fortyS) !== null && num(m.ageYears) !== null;
  return (
    <section aria-label={pt('pd.start.title')} style={box} className="pd-start">
      <h2>{pt('pd.start.title')}</h2>
      <label>{pt('pd.start.position')}{' '}
        <select value={position} onChange={(e) => setPosition(e.target.value)}>{view.positions.map((p) => <option key={p} value={p}>{p}</option>)}</select>
      </label>
      <div data-start="archetype">
        <strong>{pt('pd.start.archetype')}</strong>{' '}
        <label>{pt('pd.start.archetypePick')}{' '}
          <select value={archetypeId} onChange={(e) => setArch(e.target.value)}>{list.map((a) => <option key={a.id} value={a.id}>{pt(a.labelId)}</option>)}</select>
        </label>{' '}
        <button type="button" disabled={!archetypeId} onClick={() => onIntent({ kind: 'start_archetype', position, archetypeId })}>{pt('pd.start.go')}</button>
      </div>
      <div data-start="measurables">
        <strong>{pt('pd.start.measurables')}</strong>{' '}
        {(['ageYears', 'heightIn', 'weightLb', 'fortyS'] as const).map((k) => (
          <label key={k}>{k === 'ageYears' ? pt('pd.start.age') : fieldLabel(k === 'fortyS' ? 'tests.fortyS' : k)}{' '}
            <input type="number" step="any" value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} />{' '}
          </label>
        ))}
        <label>{pt('pd.start.fill')}{' '}
          <select value={m.fill} onChange={(e) => setM({ ...m, fill: e.target.value as 'generate' | 'hand' })}>
            <option value="generate">{pt('pd.start.fill.generate')}</option>
            <option value="hand">{pt('pd.start.fill.hand')}</option>
          </select>
        </label>{' '}
        <button type="button" disabled={!ready} onClick={() => onIntent({
          kind: 'start_measurables', position, ageYears: num(m.ageYears)!, heightIn: num(m.heightIn)!, weightLb: num(m.weightLb)!, fortyS: num(m.fortyS)!, fill: m.fill,
        })}>{pt('pd.start.go')}</button>
      </div>
      <div data-start="blank">
        <button type="button" onClick={() => onIntent({ kind: 'start_blank' })}>{pt('pd.start.blank')}</button>
      </div>
    </section>
  );
}

function SidePanel({ view, readOnly, onIntent }: { view: PlayerDesignerUi; readOnly: boolean; onIntent(i: DesignerUiIntent): void }) {
  return (
    <aside className="pd-side" style={box}>
      <h2>{pt('pd.panel.derived')}</h2>
      <dl>{view.derived.map((d) => <div key={d.attribute}><dt>{fieldLabel(`attributes.${d.attribute}`)}</dt><dd>{d.value}</dd></div>)}</dl>
      <h2>{pt('pd.panel.grade')}</h2>
      <p className="pd-grade">{view.staffGrade ? view.staffGrade.text : '—'}</p>
      <h2>{pt('pd.panel.warnings')}</h2>
      {view.warnings.length === 0 ? <p>{pt('pd.panel.noWarnings')}</p> : (
        <ul className="pd-warnings">{view.warnings.map((w, i) => <li key={i} data-kind={w.kind}>{warningText(w, view.position)}</li>)}</ul>
      )}
      <label className="pd-sandbox">
        <input type="checkbox" checked={view.sandbox} disabled={readOnly} onChange={(e) => onIntent({ kind: 'set_sandbox', on: e.target.checked })} />{' '}
        {pt('pd.sandbox')}
      </label>
      <p className="gm-line">{pt('pd.sandbox.note')}</p>
      {view.missing.length ? <p className="pd-missing">{pt('pd.missing', { count: view.missing.length })}</p> : null}
      {view.blockers.length ? <ul className="pd-blockers">{view.blockers.map((b) => <li key={b}>{pt(`pd.blocker.${b}`)}</li>)}</ul> : null}
      <button type="button" disabled={readOnly || !view.canCommit} onClick={() => onIntent({ kind: 'commit' })}>{pt('pd.save')}</button>
    </aside>
  );
}

export function PlayerDesignerScreen({ view, readOnly, onIntent }: PlayerDesignerScreenProps) {
  if (!view) return <p className="gm-line">…</p>;
  const r = view.result;
  return (
    <div className="pd-screen">
      <h1>{pt('pd.title')}</h1>
      {!view.open && view.refusal ? <p role="alert">{pt('pd.closed', { message: view.refusal.message })}</p> : <p className="gm-line">{pt('pd.intro')}</p>}
      {view.open && view.marksWorldEdited ? <p className="pd-edited">{pt('pd.edited')}</p> : null}
      {r ? <p role="status">{r.ok ? pt('pd.saved', { id: r.personId }) : pt('pd.refused', { rule: r.rule, message: r.message })}</p> : null}
      {view.open && !readOnly ? <StartPanel view={view} onIntent={onIntent} /> : null}
      {view.hasSheet ? (
        <div className="pd-sheet">
          {view.realPerson ? <p className="pd-real">{pt('pd.real')}</p> : null}
          {view.archetypes.length && !readOnly ? (
            <div className="pd-apply">
              {view.archetypes.map((a) => (
                <button key={a.id} type="button" aria-pressed={view.archetypeId === a.id} onClick={() => onIntent({ kind: 'apply_archetype', archetypeId: a.id })}>
                  {pt('pd.apply')}: {pt(a.labelId)}
                </button>
              ))}
            </div>
          ) : null}
          <SidePanel view={view} readOnly={readOnly} onIntent={onIntent} />
          {view.sections.map((s) => <Section key={s.id} id={s.id} fields={s.fields} readOnly={readOnly} onIntent={onIntent} />)}
        </div>
      ) : null}
    </div>
  );
}

// In-game playbook search and sideline play drawing (I2.3, O2.4). Opened from the console by the playbook
// search key or its button. It shows what app-services finds (commands/game-calling in-game.ts) and sends back
// the pick; the play clock keeps running the whole time (there is no pause). A drawn call is marked shaky:
// it was never repped as a whole, and it goes in by radio or messenger, not the wristband.
import { useState, type ReactNode } from 'react';
import { ct } from './GameConsole.tsx';

export interface DeskTag { id: string; kind: string; label: string; group: string; installed: boolean }
export interface DeskCall { id: string; label: string; readiness: 'ready' | 'shaky' | 'not_installed'; onSheet: boolean; offense: boolean; tags: readonly DeskTag[] }
export interface DeskDraw { tagIds: string[]; strength: 'left' | 'right' | null; runDirection: 'left' | 'middle' | 'right' | null; label: string }

export interface InGameDeskProps {
  /** Calls matching the search text, from the sheet and the rest of the plan. */
  search(text: string): readonly DeskCall[];
  /** Put the call (drawn when `draw` is given) on the sheet's in-game box and select it. Returns a refusal, or null. */
  onAdd(callId: string, draw: DeskDraw | null): string | null;
  onClose(): void;
}

export function InGameDesk({ search, onAdd, onClose }: InGameDeskProps): ReactNode {
  const [text, setText] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [strength, setStrength] = useState<DeskDraw['strength']>(null);
  const [run, setRun] = useState<DeskDraw['runDirection']>(null);
  const [name, setName] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const results = search(text);
  const chosen = pick ? results.find((c) => c.id === pick) ?? null : null;
  const add = (draw: DeskDraw | null) => {
    if (!chosen) return;
    const r = onAdd(chosen.id, draw);
    setRefusal(r);
    if (!r) onClose();
  };
  const toggle = (t: DeskTag) => setTags((cur) => (cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur.filter((x) => chosen?.tags.find((y) => y.id === x)?.group !== t.group), t.id]));
  return (
    <section data-in-game-desk aria-label={ct('desk.title')} style={{ padding: 8, border: '1px solid currentColor', overflow: 'auto', maxHeight: '100%' }}>
      <header><strong>{ct('desk.title')}</strong> <span className="gm-line">{ct('desk.clockRuns')}</span> <button type="button" onClick={onClose}>{ct('desk.close')}</button></header>
      <label>{ct('desk.search')} <input type="search" autoFocus value={text} onChange={(e) => setText(e.target.value)} /></label>
      <ol data-desk-results>
        {results.slice(0, 30).map((c) => (
          <li key={c.id} data-call={c.id} aria-current={c.id === pick ? 'true' : undefined}>
            <button type="button" onClick={() => { setPick(c.id); setTags([]); setStrength(null); setRun(null); setName(''); setRefusal(null); }}>{c.label}</button>
            <span className="gm-line"> {ct(`desk.readiness.${c.readiness}`)}{c.onSheet ? '' : ` · ${ct('desk.offSheet')}`}</span>
          </li>
        ))}
      </ol>
      {results.length === 0 ? <p className="gm-line">{ct('desk.none')}</p> : null}
      {chosen ? (
        <div data-desk-draw={chosen.id}>
          <p><button type="button" data-desk-add onClick={() => add(null)}>{ct('desk.add', { call: chosen.label })}</button></p>
          {chosen.offense && chosen.readiness !== 'not_installed' ? (
            <fieldset>
              <legend>{ct('desk.draw')}</legend>
              <p className="gm-line">{ct('desk.drawNote')}</p>
              <label>{ct('desk.strength')} <select value={strength ?? ''} onChange={(e) => setStrength((e.target.value || null) as DeskDraw['strength'])}><option value="">{ct('desk.asDrawn')}</option><option value="left">{ct('desk.left')}</option><option value="right">{ct('desk.right')}</option></select></label>{' '}
              <label>{ct('desk.run')} <select value={run ?? ''} onChange={(e) => setRun((e.target.value || null) as DeskDraw['runDirection'])}><option value="">{ct('desk.asDrawn')}</option><option value="left">{ct('desk.left')}</option><option value="middle">{ct('desk.middle')}</option><option value="right">{ct('desk.right')}</option></select></label>
              {chosen.tags.length ? (
                <ul>{chosen.tags.map((t) => (
                  <li key={t.id}><label><input type="checkbox" disabled={!t.installed} checked={tags.includes(t.id)} onChange={() => toggle(t)} /> {t.label} <span className="gm-line">({t.kind}{t.installed ? '' : `, ${ct('desk.notInstalled')}`})</span></label></li>
                ))}</ul>
              ) : <p className="gm-line">{ct('desk.noTags')}</p>}
              <label>{ct('desk.name')} <input value={name} onChange={(e) => setName(e.target.value)} /></label>{' '}
              <button type="button" data-desk-draw-add disabled={!tags.length && !strength && !run} onClick={() => add({ tagIds: tags, strength, runDirection: run, label: name })}>{ct('desk.drawAdd')}</button>
            </fieldset>
          ) : null}
        </div>
      ) : null}
      {refusal ? <p role="alert">{refusal}</p> : null}
    </section>
  );
}

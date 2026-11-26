// Play designer screen (G-90: O3.1.1 to O3.1.4, O3.7.2). Centre: the field canvas from 10 yards behind
// the line to 25 past it with the hash selector; left: the parts in spoken order; right: the selected
// player's properties; bottom: the validator. Tabs: Draw, Rules, Against, Test bench, Notes. The canvas
// is a view of the play data and holds none of its own; every change is a command to the session.
import { useEffect, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import TEXT from './text.json';
import { keyCommands } from './keys.ts';
import {
  DESIGNER_TABS, type BenchBlockView, type DesignerCommand, type DesignerViewData, type HashSpot, type MessageView, type RateView, type Yd2,
} from './types.ts';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;

/** Designer text by id with `{slot}` filled; an unknown id shows itself so a gap is visible (O6.6.1). */
export function pt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}
export const designerTextIds = (): string[] => Object.keys(STRINGS);

/** A validator message's text: the designer's message key when the text file has it, else the code in words. */
export function messageText(m: MessageView): string {
  const s = STRINGS[m.messageKey];
  return s ?? m.code.replace(/_/g, ' ');
}

const n1 = (x: number) => (Math.round(x * 10) / 10).toString();
const pct = (x: number | null) => (x === null ? '-' : (x * 100).toFixed(0));
/** Drawn yards to SVG user units: x is lateral (right positive), y is minus depth (upfield is up). */
const sx = (a: Yd2) => a[1];
const sy = (a: Yd2) => -a[0];
const pathD = (from: Yd2, pts: readonly Yd2[]) => [from, ...pts].map((q, i) => `${i ? 'L' : 'M'}${n1(sx(q))} ${n1(sy(q))}`).join(' ');

export interface PlayDesignerProps {
  readonly view: DesignerViewData;
  readonly send: (cmd: DesignerCommand) => void;
  readonly readOnly?: boolean;
  /** Opens one bench run in the play viewer (O2.6). */
  readonly onOpenSample?: (runIndex: number) => void;
}

function HoursStrip({ view, send, readOnly }: PlayDesignerProps) {
  const h = view.hours;
  const owner = h.owner.kind === 'coach' ? pt('pd.hours.coach') : h.owner.name;
  return (
    <div className="gm-strip" data-part="hours">
      <span>{pt('pd.hours', { used: n1(h.usedThisWeekH), left: n1(h.leftThisWeekH), owner })}</span>
      {h.leftThisWeekH <= 0 && <span className="gm-warn" data-hours="zero"> {pt('pd.hours.zero')}</span>}
      {h.assistants.length > 0 && !readOnly && (
        <label> {pt('pd.hours.handTo')}{' '}
          <select value="" onChange={(e) => e.target.value && send({ type: 'delegate', assistantId: e.target.value })}>
            <option value="" />
            {h.assistants.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

function Toolbar({ view, send, readOnly }: PlayDesignerProps) {
  const e = view.editor;
  return (
    <div className="gm-toolbar" role="toolbar">
      <fieldset className="gm-inline" data-part="hash">
        <legend>{pt('pd.hash')}</legend>
        {(['left', 'middle', 'right'] as HashSpot[]).map((h) => (
          <label key={h}><input type="radio" name="pd-hash" checked={view.hash === h} onChange={() => send({ type: 'hash', hash: h })} /> {pt(`pd.hash.${h}`)}</label>
        ))}
      </fieldset>
      <button type="button" disabled={readOnly || !e.canUndo} onClick={() => send({ type: 'undo' })}>{pt('pd.undo')}</button>
      <button type="button" disabled={readOnly || !e.canRedo} onClick={() => send({ type: 'redo' })}>{pt('pd.redo')}</button>
      <button type="button" disabled={readOnly} onClick={() => send({ type: 'mirror' })}>{pt('pd.flip')}</button>
      <button type="button" disabled={readOnly} onClick={() => send({ type: 'publish', confirmIllegal: false })} data-action="publish">{pt('pd.publish')}</button>
      <span className="gm-line" data-dirty={e.dirty}>{e.dirty ? pt('pd.unpublished') : pt('pd.saved', { n: e.base })}</span>
      {e.versions.length > 0 && (
        <label> {pt('pd.versions')}{' '}
          <select value="" disabled={readOnly} onChange={(ev) => ev.target.value && send({ type: 'restore_version', n: Number(ev.target.value) })}>
            <option value="" />
            {e.versions.map((v) => <option key={v.n} value={v.n}>{pt('pd.restore', { n: v.n, label: v.label })}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

function PublishPanel({ view, send }: PlayDesignerProps) {
  const p = view.publish;
  if (p.confirm) {
    return (
      <div className="gm-dialog" role="alertdialog" data-part="confirm">
        <p>{pt('pd.confirm')}</p>
        <ul>{p.confirm.map((m, i) => <li key={i}>{messageText(m)}</li>)}</ul>
        <button type="button" onClick={() => send({ type: 'publish', confirmIllegal: true })}>{pt('pd.confirm.yes')}</button>
        <button type="button" onClick={() => send({ type: 'cancel_publish' })}>{pt('pd.confirm.no')}</button>
      </div>
    );
  }
  if (p.refused) return <p className="gm-warn" role="alert" data-part="refused">{pt('pd.refused', { list: p.refused.map(messageText).join('; ') })}</p>;
  if (p.last) {
    return (
      <p className="gm-line" role="status" data-part="published">
        {pt(p.last.illegalAsDrawn ? 'pd.published.illegal' : 'pd.published', { n: p.last.version })}
        {p.last.newTeaching.length > 0 && ` ${pt('pd.published.teaching', { list: p.last.newTeaching.join(', ') })}`}
      </p>
    );
  }
  return null;
}

function Parts({ view, send, readOnly }: PlayDesignerProps) {
  return (
    <nav className="gm-panel" aria-label={pt('pd.parts')} data-part="parts">
      <ol>
        {view.parts.map((r) => (
          <li key={r.kind} data-part-kind={r.kind}>
            <span className="gm-label">{pt(`pd.part.${r.kind}`)}</span>{' '}
            <span>{r.value || pt('pd.part.none')}</span>
            {r.options.length > 0 && (
              <select aria-label={pt('pd.part.choose', { part: pt(`pd.part.${r.kind}`) })} value="" disabled={readOnly}
                onChange={(e) => e.target.value && send({ type: 'choose_part', kind: r.kind, id: e.target.value })}>
                <option value="" />
                {r.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Properties({ view, send, readOnly }: PlayDesignerProps) {
  const p = view.properties;
  if (!p) return <aside className="gm-panel" data-part="properties"><p className="gm-line">{pt('pd.props.none')}</p></aside>;
  const editRole = (edit: Record<string, unknown> & { type: string }) => send({ type: 'edit', edit: { ...edit, role: p.role } });
  return (
    <aside className="gm-panel" aria-label={pt('pd.props')} data-part="properties" data-role={p.role}>
      <h3>{p.letter} ({p.role})</h3>
      <p data-readout>{p.readout}</p>
      <p>{pt('pd.props.depth', { d: n1(-p.at[0]), l: n1(Math.abs(p.at[1])), side: pt(p.at[1] >= 0 ? 'pd.props.side.right' : 'pd.props.side.left') })} · {pt(p.onLine ? 'pd.props.onLine' : 'pd.props.offLine')}</p>
      <label>{pt('pd.props.letter')} <input value={p.letter} maxLength={2} disabled={readOnly} onChange={(e) => editRole({ type: 'set_letter', letter: e.target.value })} /></label>
      <label>{pt('pd.props.stance')} <input value={p.stance} disabled={readOnly} onChange={(e) => editRole({ type: 'set_stance', stance: e.target.value })} /></label>
      <label><input type="checkbox" checked={p.reportsEligible} disabled={readOnly} onChange={(e) => editRole({ type: 'set_flags', reportsEligible: e.target.checked, extraTackle: p.extraTackle })} /> {pt('pd.props.reportsEligible')}</label>
      <label><input type="checkbox" checked={p.extraTackle} disabled={readOnly} onChange={(e) => editRole({ type: 'set_flags', reportsEligible: p.reportsEligible, extraTackle: e.target.checked })} /> {pt('pd.props.extraTackle')}</label>
      <label>{pt('pd.props.assignment')}{' '}
        <select value={p.behavior} disabled={readOnly} onChange={(e) => send({ type: 'set_behavior', behavior: e.target.value })}>
          {[...new Set([p.behavior, ...p.behaviors])].filter(Boolean).map((b) => <option key={b} value={b}>{b.replace(/_/g, ' ')}</option>)}
        </select>
      </label>
      <p data-route>{p.routeName ? pt('pd.props.route', { name: p.routeName }) : p.pathPoints ? pt('pd.props.customPath', { n: p.pathPoints }) : pt('pd.props.noPath')}</p>
      <div className="gm-inline">
        <button type="button" disabled={readOnly} onClick={() => send({ type: 'draw_begin', target: 'path' })}>{pt('pd.draw.route')}</button>
        <button type="button" disabled={readOnly} onClick={() => send({ type: 'draw_begin', target: 'motion' })}>{pt('pd.draw.motion')}</button>
        <button type="button" disabled={readOnly || p.pathPoints === 0} onClick={() => send({ type: 'clear_path' })}>{pt('pd.draw.clear')}</button>
      </div>
      {p.rules.length > 0 && <><h4>{pt('pd.props.rules')}</h4><ul>{p.rules.map((r, i) => <li key={i}>{r}</li>)}</ul></>}
      {p.keys.length > 0 && <p>{pt('pd.props.keys')}: {p.keys.join(', ')}</p>}
      <label>{pt('pd.props.coachingPoint')} <textarea value={p.coachingPoint} disabled={readOnly} onChange={(e) => editRole({ type: 'set_coaching_point', text: e.target.value })} /></label>
    </aside>
  );
}

function toYards(svg: SVGSVGElement, clientX: number, clientY: number): Yd2 | null {
  const m = svg.getScreenCTM();
  if (!m) return null;
  const pnt = svg.createSVGPoint();
  pnt.x = clientX; pnt.y = clientY;
  const u = pnt.matrixTransform(m.inverse());
  return [-u.y, u.x];
}

function Canvas({ view, send, readOnly }: PlayDesignerProps) {
  const c = view.canvas;
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [left, right] = c.lines.sidelines;
  const box = `${n1(left)} ${-c.pastYd} ${n1(right - left)} ${c.pastYd + c.behindYd}`;
  const yardLines: number[] = [];
  for (let d = -Math.floor(c.behindYd / 5) * 5; d <= c.pastYd; d += 5) yardLines.push(d);
  const yards = (e: RPointerEvent) => (svgRef.current ? toYards(svgRef.current, e.clientX, e.clientY) : null);
  const onDown = (e: RPointerEvent) => {
    if (readOnly || !c.drawing) return;
    const at = yards(e);
    if (at) send({ type: 'draw_point', raw: at, kind: e.shiftKey ? 'settle' : 'cut' });
  };
  const onUp = (e: RPointerEvent) => {
    if (!drag) return;
    const at = yards(e);
    setDrag(null);
    if (at) send({ type: 'drag', role: drag, raw: at, free: e.altKey });
  };
  const byRole = new Map(c.markers.map((m) => [m.role, m]));
  return (
    <svg ref={svgRef} className="gm-field" viewBox={box} role="img" aria-label={pt('pd.canvas', { behind: c.behindYd, past: c.pastYd })}
      onPointerDown={onDown} onPointerUp={onUp} data-part="canvas" preserveAspectRatio="xMidYMid meet">
      <defs>
        <marker id="gm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" />
        </marker>
      </defs>
      <rect x={left} y={-c.pastYd} width={right - left} height={c.pastYd + c.behindYd} className="gm-field-grass" />
      {yardLines.map((d) => <line key={d} x1={left} x2={right} y1={-d} y2={-d} className={d === 0 ? 'gm-field-los' : 'gm-field-line'} data-yard={d} />)}
      {c.lines.hashes.map((x, i) => <line key={`h${i}`} x1={x} x2={x} y1={-c.pastYd} y2={c.behindYd} className="gm-field-hash" strokeDasharray="0.3 0.7" data-hash={i ? 'right' : 'left'} />)}
      {c.lines.numbers?.map((x, i) => <line key={`n${i}`} x1={x} x2={x} y1={-c.pastYd} y2={c.behindYd} className="gm-field-numbers" strokeDasharray="0.2 2.8" />)}
      {c.look?.markers.map((m, i) => (
        <g key={`d${i}`} className="gm-look" data-look-marker>
          <text x={sx(m.at)} y={sy(m.at)} textAnchor="middle" dominantBaseline="central" fontSize={1.1} fill="grey">{m.label}</text>
        </g>
      ))}
      {c.motions.map((mo) => {
        const from = byRole.get(mo.role)?.at;
        return from ? <path key={`m${mo.index}`} d={pathD(from, mo.path)} className="gm-motion" fill="none" strokeDasharray="0.6 0.4" data-motion={mo.role} /> : null;
      })}
      {c.markers.map((m) => (
        <g key={m.role} data-marker={m.role} data-selected={m.selected} data-highlighted={m.highlighted}
          onPointerDown={(e) => { if (!readOnly && !c.drawing) { e.stopPropagation(); setDrag(m.role); send({ type: 'select', role: m.role }); } }}
          onContextMenu={(e) => { e.preventDefault(); send({ type: 'select', role: m.role }); send({ type: 'tab', tab: 'rules' }); }}>
          <title>{pt('pd.canvas.marker', { letter: m.letter, role: m.role, readout: m.routeName ?? m.behavior })}</title>
          {m.path.length > 0 && <path d={pathD(m.at, m.path)} fill="none" className="gm-route" markerEnd="url(#gm-arrow)" />}
          {m.lineman
            ? <rect x={sx(m.at) - 0.8} y={sy(m.at) - 0.8} width={1.6} height={1.6} className={m.selected ? 'gm-player gm-selected' : m.highlighted ? 'gm-player gm-highlight' : 'gm-player'} />
            : <circle cx={sx(m.at)} cy={sy(m.at)} r={0.85} className={m.selected ? 'gm-player gm-selected' : m.highlighted ? 'gm-player gm-highlight' : 'gm-player'} />}
          <text x={sx(m.at)} y={sy(m.at)} textAnchor="middle" dominantBaseline="central" fontSize={0.9}>{m.letter}</text>
        </g>
      ))}
      {c.drawing && (() => {
        const from = byRole.get(c.drawing.role)?.at;
        return from ? <path d={pathD(from, c.drawing.points)} fill="none" className="gm-route gm-drawing" data-drawing={c.drawing.target} /> : null;
      })()}
    </svg>
  );
}

function Validator({ view, send, readOnly, messages }: PlayDesignerProps & { messages: readonly MessageView[] }) {
  const [reason, setReason] = useState<Record<string, string>>({});
  const live = messages.filter((m) => !m.dismissed);
  return (
    <section className="gm-panel" aria-label={pt('pd.validator')} data-part="validator" aria-live="polite">
      <p className="gm-line">{live.length === 0 ? pt('pd.validator.clean') : pt('pd.validator.summary', { illegal: view.counts.illegal, unsound: view.counts.unsound, note: view.counts.note })}</p>
      <ul>
        {messages.map((m, i) => {
          const key = `${m.code}:${m.roles.join(',')}`;
          return (
            <li key={i} data-level={m.level} data-code={m.code} data-dismissed={m.dismissed}>
              <button type="button" className="gm-link" onClick={() => send({ type: 'highlight', roles: m.roles })}>
                <span className={`gm-level gm-level-${m.level}`}>{pt(`pd.level.${m.level}`)}</span> {messageText(m)}{m.roles.length ? ` (${m.roles.join(', ')})` : ''}
              </button>
              {m.detail && <span> {m.detail}</span>}
              <span className="gm-cite"> {pt(m.level === 'illegal' ? 'pd.msg.cite' : 'pd.msg.check', { citation: m.citation, leaf: m.leaf })}</span>
              {m.foul && <span> {pt('pd.msg.foul', { foul: m.foul })}</span>}
              {m.level === 'unsound' && !m.dismissed && !readOnly && (
                <span>
                  {' '}<input aria-label={pt('pd.msg.reason')} value={reason[key] ?? ''} onChange={(e) => setReason({ ...reason, [key]: e.target.value })} />
                  <button type="button" disabled={!(reason[key] ?? '').trim()} onClick={() => send({ type: 'dismiss', code: m.code, role: m.roles[0] ?? null, reason: reason[key] ?? '' })}>{pt('pd.msg.dismiss')}</button>
                </span>
              )}
              {m.dismissed && !readOnly && <button type="button" onClick={() => send({ type: 'restore_warning', code: m.code, role: m.roles[0] ?? null })}>{pt('pd.msg.restore')}</button>}
            </li>
          );
        })}
      </ul>
      {view.error && <p className="gm-warn" role="alert">{pt(view.error)}</p>}
    </section>
  );
}

function RulesTab({ view, send, readOnly }: PlayDesignerProps) {
  const r = view.rules;
  const edit = (e: Record<string, unknown> & { type: string }) => send({ type: 'edit', edit: e });
  return (
    <section className="gm-panel" data-part="rules">
      <p>{pt('pd.rules.kind')}: {r.kind.replace(/_/g, ' ')} · {pt('pd.rules.status', { status: r.status })}</p>
      <label><input type="checkbox" checked={r.shotgun} disabled={readOnly} onChange={(e) => edit({ type: 'set_shotgun', shotgun: e.target.checked })} /> {pt('pd.rules.shotgun')}</label>
      <label>{pt('pd.rules.runDirection')}{' '}
        <select value={r.runDirection ?? ''} disabled={readOnly} onChange={(e) => edit({ type: 'set_run_direction', runDirection: e.target.value || null })}>
          <option value="" />
          {['left', 'middle', 'right'].map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
      <p>{pt('pd.rules.protection')}: {r.protection ?? pt('pd.part.none')}</p>
      <p>{pt('pd.rules.qb', { action: r.qb.action || pt('pd.part.none'), steps: r.qb.dropSteps, read: r.qb.readType || pt('pd.part.none') })}</p>
      {r.qb.progression.length > 0 && <p>{pt('pd.rules.progression')}: {r.qb.progression.map((x) => `${x.role} ${n1(x.eyesAtS)} s`).join(', ')}</p>}
      <p>{pt('pd.rules.intent', { role: r.intent.role })}</p>
      <h4>{pt('pd.rules.presnap')}</h4>
      {r.presnap.length === 0 ? <p>{pt('pd.rules.presnap.none')}</p> : (
        <ol>{r.presnap.map((st) => (
          <li key={st.index}>{pt('pd.rules.presnap.step', { n: st.index + 1, kind: st.kind, roles: st.roles.join(', ') })}{' '}
            <button type="button" disabled={readOnly} onClick={() => send({ type: 'remove_presnap', index: st.index })}>{pt('pd.rules.remove')}</button></li>
        ))}</ol>
      )}
      {r.ruleFailures.length > 0 && <p className="gm-warn">{pt('pd.rules.failures', { list: r.ruleFailures.map((f) => (f.role ? `${f.ruleId} (${f.role})` : f.ruleId)).join(', ') })}</p>}
    </section>
  );
}

function AgainstTab({ view, send }: PlayDesignerProps) {
  return (
    <section className="gm-panel" data-part="against">
      <label>{pt('pd.against')}{' '}
        <select value={view.canvas.look?.id ?? ''} onChange={(e) => send({ type: 'look', id: e.target.value || null })}>
          <option value="">{pt('pd.against.none')}</option>
          {view.looks.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </label>
      <p className="gm-line">{pt('pd.against.note')}</p>
    </section>
  );
}

function rateLine(name: string, r: RateView): string {
  if (r.of === 0 || r.rate === null) return pt('pd.bench.rate.none', { name });
  return pt('pd.bench.rate', { name, pct: pct(r.rate), count: r.count, of: r.of, low: pct(r.low), high: pct(r.high) });
}

function BenchBlock({ b, onOpenSample }: { b: BenchBlockView; onOpenSample?: (i: number) => void }) {
  const max = Math.max(1, ...b.histogram.counts);
  return (
    <div className="gm-bench-block" data-opponent={b.opponent}>
      <h4>{pt('pd.bench.block', { opponent: b.opponent, n: b.runs })}</h4>
      <p>{b.yards.mean === null ? '-' : pt('pd.bench.yards', { mean: n1(b.yards.mean), low: n1(b.yards.low ?? 0), high: n1(b.yards.high ?? 0) })}</p>
      <p>{rateLine(pt('pd.bench.completion'), b.completion)}</p>
      <p>{rateLine(pt('pd.bench.pressure'), b.pressure)}</p>
      <p>{rateLine(pt('pd.bench.turnovers'), b.turnovers)}</p>
      <figure>
        <figcaption>{pt('pd.bench.histogram', { min: b.histogram.minYd })}</figcaption>
        <svg viewBox={`0 0 ${b.histogram.counts.length} 10`} className="gm-histogram" role="img" aria-label={b.histogram.counts.join(', ')}>
          {b.histogram.counts.map((v, i) => <rect key={i} x={i + 0.1} width={0.8} y={10 - (10 * v) / max} height={(10 * v) / max} />)}
        </svg>
      </figure>
      {Object.keys(b.targets).length > 0 && <p>{pt('pd.bench.targets')}: {Object.entries(b.targets).map(([k, v]) => `${k} ${v}`).join(', ')}</p>}
      {b.failures.length > 0 && <p>{pt('pd.bench.failures')}: {b.failures.map((f) => `${f.contest.replace(/_/g, ' ')} ${f.count}`).join(', ')}</p>}
      {b.samples.length > 0 && (
        <p>{pt('pd.bench.samples')}:{' '}
          {b.samples.map((i) => <button key={i} type="button" className="gm-link" onClick={() => onOpenSample?.(i)}>{pt('pd.bench.sample', { n: i + 1 })}</button>)}
        </p>
      )}
    </div>
  );
}

function BenchTab({ view, send, readOnly, onOpenSample }: PlayDesignerProps) {
  const b = view.bench;
  if (!b.available) return <section className="gm-panel" data-part="bench"><p>{pt('pd.bench.unavailable')}</p></section>;
  if (b.inGame) return <section className="gm-panel" data-part="bench"><p>{pt('pd.bench.inGame')}</p></section>;
  const f = b.form;
  const num = (k: 'down' | 'distanceYd' | 'yardsToGoal' | 'runs' | 'seed', v: string) => send({ type: 'bench_form', patch: { [k]: Number(v) } });
  const r = b.report;
  return (
    <section className="gm-panel" data-part="bench">
      <fieldset>
        <legend>{pt('pd.bench.defenses')}</legend>
        {b.defenses.map((d) => (
          <label key={d.id}><input type="checkbox" checked={f.defenseIds.includes(d.id)} disabled={readOnly}
            onChange={(e) => send({ type: 'bench_form', patch: { defenseIds: e.target.checked ? [...f.defenseIds, d.id] : f.defenseIds.filter((x) => x !== d.id) } })} /> {d.label}</label>
        ))}
      </fieldset>
      <label>{pt('pd.bench.down')} <input type="number" min={1} max={4} value={f.down} onChange={(e) => num('down', e.target.value)} /></label>
      <label>{pt('pd.bench.distance')} <input type="number" min={1} value={f.distanceYd} onChange={(e) => num('distanceYd', e.target.value)} /></label>
      <label>{pt('pd.bench.toGoal')} <input type="number" min={1} max={99} value={f.yardsToGoal} onChange={(e) => num('yardsToGoal', e.target.value)} /></label>
      <label>{pt('pd.hash')}{' '}
        <select value={f.hash} onChange={(e) => send({ type: 'bench_form', patch: { hash: e.target.value as HashSpot } })}>
          {(['left', 'middle', 'right'] as HashSpot[]).map((h) => <option key={h} value={h}>{pt(`pd.hash.${h}`)}</option>)}
        </select>
      </label>
      <label>{pt('pd.bench.runs')} <input type="number" min={1} value={f.runs} onChange={(e) => num('runs', e.target.value)} /></label>
      <label>{pt('pd.bench.seed')} <input type="number" value={f.seed} onChange={(e) => num('seed', e.target.value)} /></label>
      <label>{pt('pd.bench.knowledge')}{' '}
        <select value={f.knowledge} onChange={(e) => send({ type: 'bench_form', patch: { knowledge: e.target.value as typeof f.knowledge } })}>
          {(['fully_installed', 'current_readiness'] as const).map((k) => <option key={k} value={k}>{pt(`pd.bench.knowledge.${k}`)}</option>)}
        </select>
      </label>
      <button type="button" disabled={readOnly} onClick={() => send({ type: 'bench_run' })} data-action="bench-run">{pt('pd.bench.run', { h: r ? n1(r.hourCharge.hours) : '?' })}</button>
      {r && (r.refusedBecause
        ? <p className="gm-warn" role="alert">{pt(`pd.bench.refused.${r.refusedBecause}`)}</p>
        : (
          <div data-part="bench-report">
            <p className="gm-line">{r.partial ? pt('pd.bench.partial', { done: r.runsDone, req: r.runsRequested }) : pt('pd.bench.done', { done: r.runsDone, seed: r.seed, h: n1(r.hourCharge.hours) })}</p>
            {r.overall && <BenchBlock b={r.overall} onOpenSample={onOpenSample} />}
            {r.byOpponent.length > 1 && r.byOpponent.map((x) => <BenchBlock key={x.opponent} b={x} onOpenSample={onOpenSample} />)}
          </div>
        ))}
    </section>
  );
}

function NotesTab({ view, send, readOnly }: PlayDesignerProps) {
  return (
    <section className="gm-panel" data-part="notes">
      <label>{pt('pd.notes')} <textarea value={view.notes} disabled={readOnly} onChange={(e) => send({ type: 'notes', text: e.target.value })} /></label>
      {view.dismissed.length > 0 && (
        <><h4>{pt('pd.notes.dismissed')}</h4><ul>{view.dismissed.map((d, i) => <li key={i}>{d.code}{d.role ? ` (${d.role})` : ''}: {d.reason}</li>)}</ul></>
      )}
    </section>
  );
}

/** Validator messages shown with the O3.1.3 debounce, so typing does not flicker the panel. */
function useDebounced<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (ms <= 0) { setShown(value); return; }
    const id = setTimeout(() => setShown(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return shown;
}

export function PlayDesignerScreen(props: PlayDesignerProps) {
  const { view, send, readOnly } = props;
  const messages = useDebounced(view.messages, view.debounceMs);
  const legRef = useRef('');
  const onKeyDown = (e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: EventTarget; preventDefault(): void }) => {
    if (readOnly) return;
    const tag = (e.target as { tagName?: string }).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const out = keyCommands({ key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey }, view.canvas.drawing !== null, legRef.current);
    legRef.current = out.legDigits;
    if (out.commands.length) { e.preventDefault(); for (const c of out.commands) send(c); }
  };
  const d = view.canvas.drawing;
  let body: ReactNode;
  switch (view.tab) {
    case 'rules': body = <RulesTab {...props} />; break;
    case 'against': body = <AgainstTab {...props} />; break;
    case 'bench': body = <BenchTab {...props} />; break;
    case 'notes': body = <NotesTab {...props} />; break;
    default: body = null;
  }
  return (
    <div className="gm-screen gm-play-designer" data-screen-body="play-designer" data-play={view.playId} tabIndex={0} onKeyDown={onKeyDown}>
      <HoursStrip {...props} />
      <div role="tablist" aria-label={pt('pd.tabs')} className="gm-tabs">
        {DESIGNER_TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={view.tab === t} data-tab={t} onClick={() => send({ type: 'tab', tab: t })}>{pt(`pd.tab.${t}`)}</button>
        ))}
      </div>
      <Toolbar {...props} />
      {view.missingPositions.length > 0 && <p className="gm-warn" role="alert" data-part="missing">{pt('pd.missing', { list: view.missingPositions.join(', ') })}</p>}
      <PublishPanel {...props} />
      <div className="gm-designer-grid">
        <Parts {...props} />
        <div className="gm-designer-centre">
          <Canvas {...props} />
          {d && <p className="gm-line" role="status" data-part="drawing">{pt('pd.draw.drawing', { target: pt(`pd.draw.target.${d.target}`), role: d.role, leg: d.legYd === null ? pt('pd.draw.leg.default') : pt('pd.draw.leg.yd', { yd: d.legYd }) })}</p>}
          {body}
        </div>
        <Properties {...props} />
      </div>
      <Validator {...props} messages={messages} />
      <p className="gm-help">{pt('pd.keys')}</p>
    </div>
  );
}

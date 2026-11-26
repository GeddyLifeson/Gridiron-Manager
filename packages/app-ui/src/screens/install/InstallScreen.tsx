// Install board (O3.3.2 over G5, D9 and H1). Days are columns and install units are cards; each day shows
// its teaching load per position group against the G5.2.1 daily limit and turns to a warning with the
// projected loss when a group goes over. The side list shows readiness by position group as the staff
// estimates it, the players who lag, and what that means for mental errors (D9.4.1). The screen holds no
// football logic: every number arrives in the read model. Cards move by drag or by the "move to" field, so
// everything works by keyboard (Q1.5.2).
import type { DragEvent, ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import { ib, per100, MODES, type InstallIntent, type InstallUi, type Mode, type UiCard, type UiDay, type UiLock } from './view.ts';

export interface InstallScreenProps {
  view: InstallUi | null;
  readOnly: boolean;
  onMode(mode: Mode): void;
  onIntent(intent: InstallIntent): void;
}

const panel = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), color: v('text.ink'), padding: '8px', margin: '8px 0' };
const DRAG_TYPE = 'text/x-gm-install-unit';

function Badge({ colour, children }: { colour: string; children: ReactNode }) {
  return <span className="ib-badge" style={{ borderLeft: `4px solid ${v(colour)}`, paddingLeft: '4px', marginRight: '4px' }}>{children}</span>;
}

/** Label for a control under the edit lock: allowed acts, held elsewhere suggests to the holder. */
function lockLabel(lock: UiLock, label: string): string | null {
  if (lock.allowed) return label;
  if (!lock.suggest) return null;
  return ib('ib.suggest', { label, holder: ib(`ib.holder.${lock.heldBy ?? 'head_coach'}`) });
}

function period(p: UiCard['periods'][number]): string {
  return ib(`ib.period.${p.kind}`, { label: p.label, minutes: p.minutes ?? 0, reps: p.reps ?? 0 });
}

function Card({ c, view, readOnly, onIntent }: { c: UiCard; view: InstallUi; readOnly: boolean; onIntent(i: InstallIntent): void }) {
  const lock = view.locks.edit;
  const canMove = !readOnly && (lock.allowed || lock.suggest);
  const label = (x: string) => view.readiness.find((r) => r.unitId === x)?.label ?? x;
  const current = c.tray ? '' : view.days.find((d) => d.cards.some((k) => k.unitId === c.unitId))?.id ?? '';
  const moveLabel = lockLabel(lock, ib('ib.card.moveTo', { label: c.label }));
  const upLabel = lockLabel(lock, ib('ib.card.alwaysUpToggle', { label: c.label }));
  return (
    <li className="ib-card" data-unit={c.unitId} data-missing={c.missing.length ? 'true' : undefined} style={panel}
      draggable={canMove} onDragStart={(e: DragEvent) => e.dataTransfer.setData(DRAG_TYPE, c.unitId)}>
      <strong>{c.label}</strong> <span className="gm-line">{ib(`ib.card.kind.${c.kind}`)} · {ib('ib.card.load', { load: c.load })}</span>
      <div className="gm-line">{c.groups.map((g) => ib('ib.card.group', { group: g.group, units: g.units })).join(' · ')}</div>
      <div>
        {c.installed ? <Badge colour="state.good">{ib('ib.card.installed')}</Badge> : <Badge colour="state.caution">{ib('ib.card.notInstalled')}</Badge>}
        {c.alwaysUp ? <Badge colour="accent.default">{ib('ib.card.alwaysUp')}</Badge> : null}
        {c.missing.length ? <Badge colour="state.bad">{ib('ib.card.missing', { units: c.missing.map(label).join(', ') })}</Badge> : null}
        {c.tray ? <Badge colour="line.strong">{ib(`ib.tray.${c.tray}`)}</Badge> : null}
      </div>
      <ul className="ib-periods">{c.periods.length ? c.periods.map((p, i) => <li key={i} data-period={p.kind}>{period(p)}</li>) : <li className="gm-line">{ib('ib.period.none')}</li>}</ul>
      {canMove && moveLabel ? (
        <label>{moveLabel}{' '}
          <select value={current} onChange={(e) => onIntent({ kind: 'place', unitId: c.unitId, dayId: e.target.value || null })}>
            <option value="">{ib('ib.card.tray')}</option>
            {view.days.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
      ) : null}{' '}
      {canMove && upLabel ? <label><input type="checkbox" checked={c.alwaysUp} onChange={(e) => onIntent({ kind: 'always_up', unitId: c.unitId, on: e.target.checked })} /> {upLabel}</label> : null}
    </li>
  );
}

function Day({ d, view, readOnly, onIntent }: { d: UiDay; view: InstallUi; readOnly: boolean; onIntent(i: InstallIntent): void }) {
  const canMove = !readOnly && (view.locks.edit.allowed || view.locks.edit.suggest);
  return (
    <section className="ib-day" data-day={d.id} data-overloaded={d.overloaded ? 'true' : undefined} aria-label={d.label}
      style={{ ...panel, minWidth: '14em', flex: '1 1 0' }}
      onDragOver={(e: DragEvent) => { if (canMove) e.preventDefault(); }}
      onDrop={(e: DragEvent) => { const id = e.dataTransfer.getData(DRAG_TYPE); if (canMove && id) { e.preventDefault(); onIntent({ kind: 'place', unitId: id, dayId: d.id }); } }}>
      <header style={{ borderBottom: `2px solid ${v(d.overloaded ? 'state.bad' : 'line.default')}` }}>
        <h2>{d.label}{d.overloaded ? <> <Badge colour="state.bad">{ib('ib.day.overloaded')}</Badge></> : null}</h2>
        <p className="gm-line" data-load={d.id}>{d.load.map((l) => ib('ib.day.load', { group: l.group, units: l.units, limit: l.limit })).join(' · ')}</p>
        {d.load.filter((l) => l.over > 0).map((l) => <p key={l.group} role="alert" data-over={l.group}>{ib('ib.day.over', { group: l.group, over: l.over, lost: Math.round(l.lostShare * 100) })}</p>)}
      </header>
      {d.cards.length ? <ul className="ib-cards">{d.cards.map((c) => <Card key={c.unitId} c={c} view={view} readOnly={readOnly} onIntent={onIntent} />)}</ul> : <p className="gm-line">{ib('ib.day.empty')}</p>}
    </section>
  );
}

function Readiness({ view }: { view: InstallUi }) {
  return (
    <aside className="ib-readiness" aria-label={ib('ib.ready.title')} style={panel}>
      <h2>{ib('ib.ready.title')}</h2>
      <p className="gm-line">{ib('ib.ready.note')}</p>
      <ul>
        {view.readiness.map((u) => (
          <li key={u.unitId} data-ready={u.unitId}>
            <strong>{u.label}</strong> {u.installed ? <Badge colour="state.good">{ib('ib.card.installed')}</Badge> : null}
            <ul>
              {u.groups.map((g) => (
                <li key={g.group} data-group={g.group}>
                  {g.unjudged ? ib('ib.ready.unjudged', { group: g.group, players: g.players }) : ib('ib.ready.group', { group: g.group, readiness: Math.round(g.readiness), weakest: Math.round(g.weakest), players: g.players })}
                  {g.laggers.length ? (
                    <ul>{g.laggers.map((l) => <li key={l.player} data-lagger={l.player}>{ib('ib.ready.lagger', { name: l.name, position: l.position, estimate: Math.round(l.estimate), chance: per100(l.errorChance), delay: l.delayS })}</li>)}</ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function InstallScreen({ view, readOnly, onMode, onIntent }: InstallScreenProps) {
  if (!view) return <p className="gm-line">{ib('ib.empty')}</p>;
  const lock = view.locks.edit;
  const label = (x: string) => view.readiness.find((r) => r.unitId === x)?.label ?? x;
  const fill = lockLabel(lock, ib('ib.fill'));
  return (
    <div className="ib-screen" data-team={view.teamId} data-side={view.side} data-mode={view.mode}>
      <h1>{ib(`ib.side.${view.side}`)} · {ib(`ib.title.${view.mode}`)}</h1>
      <div role="tablist">
        {MODES.map((m) => <button key={m} type="button" role="tab" aria-selected={m === view.mode} onClick={() => onMode(m)}>{ib(`ib.mode.${m}`)}</button>)}
      </div>
      <p role="status" data-counter="install">{ib('ib.totals', { ...view.totals })}</p>
      <p className="gm-line">{ib('ib.numbers', { limit: view.numbers.dailyLimit, threshold: view.numbers.threshold })}</p>
      {view.numbers.shortWeek ? <p role="note"><Badge colour="state.caution">{ib('ib.shortWeek')}</Badge></p> : null}
      {readOnly ? <p className="gm-line">{ib('ib.readOnly')}</p> : null}
      {!readOnly && fill ? <button type="button" data-suggest={lock.allowed ? undefined : 'true'} onClick={() => onIntent({ kind: 'fill' })}>{fill}</button> : null}
      {!readOnly && !fill ? <span className="gm-line" data-locked="true">{ib('ib.heldBy', { holder: ib(`ib.holder.${lock.heldBy ?? 'head_coach'}`) })}</span> : null}
      <div className="ib-board" data-board="install" style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
        {view.days.map((d) => <Day key={d.id} d={d} view={view} readOnly={readOnly} onIntent={onIntent} />)}
      </div>
      <section className="ib-tray" data-tray="install" aria-label={ib('ib.tray.title')} style={panel}
        onDragOver={(e: DragEvent) => { if (!readOnly) e.preventDefault(); }}
        onDrop={(e: DragEvent) => { const id = e.dataTransfer.getData(DRAG_TYPE); if (!readOnly && id) { e.preventDefault(); onIntent({ kind: 'place', unitId: id, dayId: null }); } }}>
        <h2>{ib('ib.tray.title')}</h2>
        {view.tray.length ? <ul className="ib-cards">{view.tray.map((c) => <Card key={c.unitId} c={c} view={view} readOnly={readOnly} onIntent={onIntent} />)}</ul> : <p className="gm-line">{ib('ib.tray.empty')}</p>}
      </section>
      <Readiness view={view} />
      <section aria-label={ib('ib.order.title')} style={panel}>
        <h2>{ib('ib.order.title')}</h2>
        {view.orderProblem ? <p role="alert">{ib('ib.order.problem', { text: view.orderProblem })}</p> : <ol data-order="install">{view.order.map((x) => <li key={x}>{label(x)}</li>)}</ol>}
      </section>
    </div>
  );
}

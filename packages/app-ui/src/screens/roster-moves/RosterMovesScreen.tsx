// Roster moves screen (G-70; H6.1.1 strip, H6.1.2 buttons, H6.2.1 to H6.2.3 active list, H6.3.1
// elevations). Holds no football logic: counts, limits, gaps and legality all arrive in the read model,
// and every action is an intent the host turns into a command. Everything works by keyboard: each
// move is a button, so no drag is needed (Q1.5.2).
import { useState, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import { rt, TABS, type RosterIntent, type RosterMovesUi, type Tab, type UiPlayer } from './view.ts';

export interface RosterMovesScreenProps {
  view: RosterMovesUi | null;
  tab: Tab;
  readOnly: boolean;
  onTab(tab: Tab): void;
  onIntent(intent: RosterIntent): void;
}

const LEVEL_COLOUR = { ok: 'state.good', amber: 'state.caution', red: 'state.bad' } as const;
const STATUS_COLOUR: Record<string, string> = { not_open: 'state.neutral', open: 'state.good', amber: 'state.caution', red: 'state.bad', closed: 'state.neutral' };
const box = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };

function Badge({ colour, children }: { colour: string; children: ReactNode }) {
  return <span className="rm-badge" style={{ borderLeft: `4px solid ${v(colour)}`, paddingLeft: '4px' }}>{children}</span>;
}

function decisionLabel(view: RosterMovesUi, move: string): string {
  return rt(`rm.button.${view.buttons[move] ?? 'ask'}`);
}

function Strip({ view, onTab }: { view: RosterMovesUi; onTab(t: Tab): void }) {
  if (!view.markers.length) return <p className="gm-line">{rt('rm.strip.bye')}</p>;
  return (
    <ol aria-label={rt('rm.strip.title')} className="rm-strip">
      {view.markers.map((m) => (
        <li key={m.type} data-marker={m.type} data-status={m.status} style={box}>
          <strong>{rt(`rm.marker.${m.type}`)}</strong>{' '}
          <Badge colour={STATUS_COLOUR[m.status] ?? 'state.neutral'}>{rt(`rm.status.${m.status}`)}</Badge>{' '}
          {m.status !== 'closed' && m.status !== 'not_open' ? <span>{rt('rm.strip.hoursLeft', { hours: m.hoursLeft })}</span> : null}{' '}
          {(m.target === 'active_list' || m.target === 'elevations') ? (
            <button type="button" onClick={() => onTab(m.target as Tab)}>{rt('rm.strip.open')}</button>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function PlayerLine({ p, view, readOnly, locked, onIntent }: { p: UiPlayer; view: RosterMovesUi; readOnly: boolean; locked: boolean; onIntent(i: RosterIntent): void }) {
  const reason = view.active?.staffReasons[String(p.personId)];
  return (
    <li data-player={p.personId}>
      <span>{p.position} {p.name}</span>
      {p.elevated ? <> <Badge colour="accent.default">{rt('rm.active.elevated')}</Badge></> : null}
      {p.out ? <> <Badge colour="state.bad">{rt('rm.active.out')}</Badge></> : null}
      {p.specialTeamsFirsts > 0 ? <span className="gm-line"> ST {p.specialTeamsFirsts}</span> : null}
      {reason ? <span className="gm-line"> {rt('rm.active.staffReason', { reason: rt(`rm.reason.${reason}`) })}</span> : null}
      {!readOnly && !locked ? (
        <> <button type="button" onClick={() => onIntent({ kind: 'set_active', personId: p.personId, active: !p.active })}>
          {rt(p.active ? 'rm.active.makeInactive' : 'rm.active.makeActive', { name: p.name })}
        </button></>
      ) : null}
    </li>
  );
}

function ActiveList({ view, readOnly, onIntent }: { view: RosterMovesUi; readOnly: boolean; onIntent(i: RosterIntent): void }) {
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const a = view.active;
  const dressable = view.players.filter((p) => p.candidate);
  const name = (id: number) => view.players.find((p) => p.personId === id)?.name ?? `#${id}`;
  if (!a) {
    return (
      <section aria-label={rt('rm.tab.active_list')}>
        <p className="gm-line">{rt('rm.college.note')}</p>
        <ul>{dressable.map((p) => <PlayerLine key={p.personId} p={p} view={view} readOnly={readOnly} locked={false} onIntent={onIntent} />)}</ul>
      </section>
    );
  }
  const unconfirmed = a.redGaps.filter((g) => !confirmed.includes(g));
  const canSubmit = !readOnly && !a.locked && !a.refusal && unconfirmed.length === 0;
  const qbs = view.players.filter((p) => p.candidate && p.quarterback && !p.active);
  return (
    <section aria-label={rt('rm.tab.active_list')}>
      <p role="status" data-counter="active">
        <strong>{rt('rm.active.counter', { count: a.count, limit: a.limit })}</strong>{' · '}
        {rt('rm.active.linemen', { linemen: a.linemenActive, min: a.minLinemen })}{' · '}
        {rt('rm.active.floor', { floor: a.floor })}{' · '}
        {rt('rm.active.inactiveCount', { count: a.inactives.length })}{' · '}
        {a.locked ? rt('rm.active.locked') : rt('rm.active.toLock', { minutes: a.minutesToLock })}
      </p>
      {a.refusal ? <p role="alert" data-refusal={a.refusal.rule}>{rt('rm.active.refused', { message: a.refusal.message, fix: a.refusal.fix })}</p> : null}
      {a.outDressed.map((id) => <p key={id} role="alert" data-out-dressed={id}>{rt('rm.active.outWarning', { name: name(id) })}</p>)}
      {readOnly ? <p className="gm-line">{rt('rm.readOnly')}</p> : null}
      <div className="rm-columns" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <div style={box}>
          <h2>{rt('rm.active.column.active')}</h2>
          <ul data-column="active">{dressable.filter((p) => p.active).map((p) => <PlayerLine key={p.personId} p={p} view={view} readOnly={readOnly} locked={a.locked} onIntent={onIntent} />)}</ul>
        </div>
        <div style={box}>
          <h2>{rt('rm.active.column.inactive')}</h2>
          <ul data-column="inactive">{dressable.filter((p) => !p.active).map((p) => <PlayerLine key={p.personId} p={p} view={view} readOnly={readOnly} locked={a.locked} onIntent={onIntent} />)}</ul>
        </div>
        <div style={box}>
          <h2>{rt('rm.coverage.title')}</h2>
          <table data-board="coverage">
            <thead><tr><th scope="col">Job</th><th scope="col">{rt('rm.coverage.starter')}</th><th scope="col">{rt('rm.coverage.backup')}</th><th scope="col">{rt('rm.coverage.emergency')}</th><th scope="col" /></tr></thead>
            <tbody>
              {view.coverage.map((c) => (
                <tr key={`${c.unitId}/${c.role}`} data-level={c.level}>
                  <th scope="row">{c.unitId} {c.role}</th>
                  <td>{c.starter === null ? rt('rm.coverage.empty') : name(c.starter)}</td>
                  <td>{c.backup === null ? rt('rm.coverage.empty') : name(c.backup)}</td>
                  <td>{c.emergency === null ? rt('rm.coverage.empty') : name(c.emergency)}</td>
                  <td><Badge colour={LEVEL_COLOUR[c.level]}>{rt(`rm.level.${c.level}`)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>{rt('rm.coverage.units')}</h3>
          <ul data-board="units">
            {view.units.map((u) => (
              <li key={u.unitId} data-level={u.level}>{u.unitId}: {rt('rm.coverage.unitCount', { named: u.named, needed: u.needed })} <Badge colour={LEVEL_COLOUR[u.level]}>{rt(`rm.level.${u.level}`)}</Badge></li>
            ))}
          </ul>
        </div>
      </div>
      {a.emergencyQbOffered && !readOnly && !a.locked ? (
        <label>{rt('rm.active.emergencyQb')}{' '}
          <select value={a.emergencyQb ?? ''} onChange={(e) => onIntent({ kind: 'emergency_qb', personId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">{rt('rm.active.emergencyQbNone')}</option>
            {qbs.map((q) => <option key={q.personId} value={q.personId}>{q.name}</option>)}
          </select>
        </label>
      ) : null}
      {!readOnly && !a.locked ? (
        <div>
          {a.redGaps.map((g) => (
            <label key={g} data-gap={g}>
              <input type="checkbox" checked={confirmed.includes(g)} onChange={(e) => setConfirmed(e.target.checked ? [...confirmed, g] : confirmed.filter((x) => x !== g))} />
              {rt('rm.active.confirmGap', { gap: g })}
            </label>
          ))}
          <button type="button" onClick={() => onIntent({ kind: 'use_staff_list' })}>{rt('rm.active.useStaff')}</button>{' '}
          <button type="button" disabled={!canSubmit} onClick={() => onIntent({ kind: 'submit_list', confirmedGaps: confirmed })}>
            {rt('rm.active.submit')} ({decisionLabel(view, 'game_day_list')})
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Elevations({ view, readOnly, onIntent }: { view: RosterMovesUi; readOnly: boolean; onIntent(i: RosterIntent): void }) {
  const e = view.elevations;
  if (!e) return <p className="gm-line">{rt('rm.college.note')}</p>;
  if (!e.rows.length) return <p className="gm-line">{rt('rm.elev.none')}</p>;
  return (
    <section aria-label={rt('rm.elev.title')}>
      <p role="status" data-counter="elevations">{rt('rm.elev.used', { used: e.usedThisGame, perGame: e.perGame })}</p>
      <ul>
        {e.rows.map((r) => (
          <li key={r.personId} data-elevation={r.personId} aria-disabled={r.blocked ? 'true' : undefined}>
            <span>{r.position} {r.name}</span>{' · '}
            <span>{r.left === null ? rt('rm.elev.unlimited') : rt('rm.elev.left', { left: r.left })}</span>{' '}
            {r.elevated ? <Badge colour="accent.default">{rt('rm.elev.elevated')}</Badge>
              : r.blocked ? <span className="gm-line" data-blocked>{r.blocked}</span>
                : !readOnly ? <button type="button" onClick={() => onIntent({ kind: 'elevate', personId: r.personId })}>{rt('rm.elev.elevate', { name: r.name })} ({decisionLabel(view, 'elevate')})</button> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RosterMovesScreen({ view, tab, readOnly, onTab, onIntent }: RosterMovesScreenProps) {
  if (!view) return <p className="gm-line">{rt('rm.strip.bye')}</p>;
  const tabs = TABS.filter((t) => t !== 'elevations' || view.hasPracticeSquad);
  return (
    <div className="rm-screen" data-club={view.clubId}>
      <div role="tablist">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => onTab(t)}>{rt(`rm.tab.${t}`)}</button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'strip' ? <Strip view={view} onTab={onTab} /> : null}
        {tab === 'active_list' ? <ActiveList view={view} readOnly={readOnly} onIntent={onIntent} /> : null}
        {tab === 'elevations' ? <Elevations view={view} readOnly={readOnly} onIntent={onIntent} /> : null}
      </div>
    </div>
  );
}

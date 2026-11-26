// Depth chart screen (team.depth_chart; M2.1 lists and lineups, M2.2 packages, M2.3 snap plan, M2.4
// special teams, M2.5 battles, M2.1.3 emergency card). Holds no football logic: lineups, inheritance,
// shares and problems arrive in the read model, and every change is an edit the host applies with
// app-services `applyDepthEdit`. The chart saved here is what the played game reads. Every move is a
// button, so no drag is needed (Q1.5.2).
import { useState } from 'react';
import { v } from '../../tokens/index.ts';
import { dt, TABS, type DepthChartUi, type DepthIntent, type Tab, type UiJob, type UiRosterCard, type UiUnit } from './view.ts';

export interface DepthChartScreenProps {
  view: DepthChartUi | null;
  roster: readonly UiRosterCard[];
  tab: Tab;
  unitId: string | null;
  readOnly: boolean;
  /** The last edit's refusal, shown until the next edit. */
  refusal: string | null;
  onTab(tab: Tab): void;
  onUnit(unitId: string): void;
  onIntent(intent: DepthIntent): void;
}

const box = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };
const mark = (tone: string) => ({ borderLeft: `4px solid ${v(tone)}`, paddingLeft: '4px' });

function AddPicker({ unit, job, roster, onIntent }: { unit: UiUnit; job: UiJob; roster: readonly UiRosterCard[]; onIntent(i: DepthIntent): void }) {
  const listed = new Set(job.list.map((e) => e.personId));
  const offer = roster.filter((r) => !listed.has(r.personId));
  const [pick, setPick] = useState(offer[0]?.personId ?? 0);
  if (!offer.length) return null;
  return (
    <form onSubmit={(e) => { e.preventDefault(); onIntent({ kind: 'add', unitId: unit.unitId, job: job.job, personId: pick }); }}>
      <select aria-label={dt('dc.add', { job: job.job })} value={pick} onChange={(e) => setPick(Number(e.target.value))}>
        {offer.map((r) => <option key={r.personId} value={r.personId}>{r.position} {r.name}</option>)}
      </select>
      <button type="submit">{dt('dc.addButton')}</button>
    </form>
  );
}

function JobLine({ unit, job, roster, readOnly, onIntent }: { unit: UiUnit; job: UiJob; roster: readonly UiRosterCard[]; readOnly: boolean; onIntent(i: DepthIntent): void }) {
  const onFieldName = job.list.find((e) => e.personId === job.onField)?.name;
  return (
    <tr data-job={job.job} data-inherited={job.inherited ? 'yes' : 'no'} style={{ borderTop: `1px solid ${v('line.default')}` }}>
      <th scope="row" style={{ textAlign: 'left' }}>
        {job.job}{job.mapsTo ? <span className="gm-line"> {dt('dc.mapsTo', { job: job.mapsTo })}</span> : null}
        {job.inherited && unit.base ? <div className="gm-line">{dt('dc.inherited', { base: unit.base })}</div> : null}
      </th>
      <td>
        {job.list.length === 0 ? <span style={mark('state.bad')}>{dt('dc.empty')}</span> : (
          <ol data-list={`${unit.unitId}/${job.job}`}>
            {job.list.map((e, i) => (
              <li key={e.personId} data-person={e.personId}>
                <span>{e.position} {e.name}</span>
                {e.out ? <> <span style={mark('state.bad')}>{dt('dc.out')}</span></> : null}
                {!e.active && !e.out ? <> <span style={mark('state.neutral')}>{dt('dc.inactive')}</span></> : null}
                {readOnly || job.inherited ? null : (
                  <>
                    {' '}<button type="button" disabled={i === 0} aria-label={dt('dc.up', { name: e.name, job: job.job })}
                      onClick={() => onIntent({ kind: 'move', unitId: unit.unitId, job: job.job, personId: e.personId, toIndex: i - 1 })}>↑</button>
                    <button type="button" disabled={i === job.list.length - 1} aria-label={dt('dc.down', { name: e.name, job: job.job })}
                      onClick={() => onIntent({ kind: 'move', unitId: unit.unitId, job: job.job, personId: e.personId, toIndex: i + 1 })}>↓</button>
                    <button type="button" aria-label={dt('dc.remove', { name: e.name, job: job.job })}
                      onClick={() => onIntent({ kind: 'remove', unitId: unit.unitId, job: job.job, personId: e.personId })}>×</button>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
        {readOnly ? null : <AddPicker unit={unit} job={job} roster={roster} onIntent={onIntent} />}
        {!readOnly && unit.base && !job.inherited ? (
          <button type="button" onClick={() => onIntent({ kind: 'inherit', unitId: unit.unitId, job: job.job })}>{dt('dc.useBase', { base: unit.base, job: job.job })}</button>
        ) : null}
      </td>
      <td data-on-field={job.onField ?? 'none'}>{onFieldName ?? <span style={mark('state.bad')}>{dt('dc.empty')}</span>}</td>
    </tr>
  );
}

function UnitPanel({ view, side, unitId, roster, readOnly, onUnit, onIntent }: { view: DepthChartUi; side: 'off' | 'def' | 'st'; unitId: string | null; roster: readonly UiRosterCard[]; readOnly: boolean; onUnit(id: string): void; onIntent(i: DepthIntent): void }) {
  const units = view.units.filter((u) => u.side === side);
  const unit = units.find((u) => u.unitId === unitId) ?? units[0];
  if (!unit) return <p className="gm-line">{dt('dc.noChart')}</p>;
  const names = new Map(unit.jobs.flatMap((j) => j.list.map((e) => [e.personId, e.name] as const)));
  return (
    <section aria-label={dt(`dc.tab.${side}`)}>
      <div role="group" aria-label={dt('dc.unit.pick')}>
        {units.map((u) => <button key={u.unitId} type="button" aria-pressed={u.unitId === unit.unitId} onClick={() => onUnit(u.unitId)}>{u.unitId}</button>)}
      </div>
      <div style={box} data-unit={unit.unitId}>
        <h2>{unit.unitId}</h2>
        {unit.base ? <p className="gm-line">{dt('dc.unit.package', { base: unit.base })}</p> : null}
        {unit.core ? <p className="gm-line">{dt('dc.unit.core')}</p> : null}
        {unit.gaps.length ? <p role="alert" style={mark('state.bad')}>{dt('dc.unit.gaps', { jobs: unit.gaps.join(', ') })}</p> : null}
        <table data-table="jobs" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th scope="col">{dt('dc.col.job')}</th><th scope="col">{dt('dc.col.list')}</th><th scope="col">{dt('dc.col.onField')}</th></tr></thead>
          <tbody>{unit.jobs.map((j) => <JobLine key={j.job} unit={unit} job={j} roster={roster} readOnly={readOnly} onIntent={onIntent} />)}</tbody>
        </table>
        {unit.shares.length ? (
          <>
            <h3>{dt('dc.shares')}</h3>
            <ul data-shares={unit.unitId}>{unit.shares.map((s) => <li key={s.personId}>{dt('dc.share', { name: names.get(s.personId) ?? `#${s.personId}`, pct: Math.round(s.share * 100) })}</li>)}</ul>
          </>
        ) : null}
      </div>
      {side === 'st' ? <SpecialTeams view={view} /> : null}
    </section>
  );
}

function SpecialTeams({ view }: { view: DepthChartUi }) {
  const name = new Map(view.specialTeams.map((r) => [r.personId, r.name]));
  return (
    <div style={box} data-board="special-teams">
      <h3>{dt('dc.st.title')}</h3>
      <ul>{view.specialTeams.map((r) => <li key={r.personId}>{dt('dc.st.row', { name: r.name, count: r.firsts })}</li>)}</ul>
      {view.lowValueBackups.length ? <p className="gm-line">{dt('dc.st.lowValue', { names: view.lowValueBackups.map((id) => name.get(id) ?? `#${id}`).join(', ') })}</p> : null}
    </div>
  );
}

function Emergency({ view, roster, readOnly, onIntent }: { view: DepthChartUi; roster: readonly UiRosterCard[]; readOnly: boolean; onIntent(i: DepthIntent): void }) {
  return (
    <table data-table="emergency">
      <tbody>
        {view.emergency.map((e) => {
          const need = dt(`dc.emergency.need.${e.need}`);
          return (
            <tr key={e.need} data-need={e.need}>
              <th scope="row">{need}</th>
              <td>{e.name ?? <span style={mark('state.caution')}>{dt('dc.emergency.none')}</span>}</td>
              <td>
                {readOnly ? null : (
                  <>
                    <select aria-label={dt('dc.emergency.set', { need })} value={e.personId ?? ''} onChange={(ev) => onIntent({ kind: 'emergency', need: e.need, personId: ev.target.value === '' ? null : Number(ev.target.value) })}>
                      <option value="">{dt('dc.emergency.none')}</option>
                      {roster.map((r) => <option key={r.personId} value={r.personId}>{r.position} {r.name}</option>)}
                    </select>
                    {e.personId !== null ? <button type="button" onClick={() => onIntent({ kind: 'emergency', need: e.need, personId: null })}>{dt('dc.emergency.clear', { need })}</button> : null}
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Battles({ view, readOnly, onIntent }: { view: DepthChartUi; readOnly: boolean; onIntent(i: DepthIntent): void }) {
  if (!view.battles.length) return <p className="gm-line">{dt('dc.battle.none')}</p>;
  return (
    <>
      {view.battles.map((b) => (
        <section key={`${b.unitId}/${b.job}`} style={box} data-battle={`${b.unitId}/${b.job}`}>
          <h3>{dt('dc.battle.title', { unit: b.unitId, job: b.job, day: b.decideBy })}</h3>
          {b.late ? <p role="alert" style={mark('state.bad')}>{dt('dc.battle.late')}</p> : null}
          {b.readinessPenalty ? <p style={mark('state.caution')}>{dt('dc.battle.readiness')}</p> : null}
          <ul>
            {b.competitors.map((c) => (
              <li key={c.personId}>
                {dt('dc.battle.row', { name: c.name, split: Math.round(c.split * 100), reps: c.reps })}
                {' · '}{c.raw === null ? dt('dc.battle.noGrade') : dt('dc.battle.grade', { raw: Math.round(c.raw), weighted: c.weighted === null ? '' : Math.round(c.weighted) })}
                {readOnly ? null : <> <button type="button" onClick={() => onIntent({ kind: 'decide_battle', unitId: b.unitId, job: b.job, winner: c.personId })}>{dt('dc.battle.decide', { name: c.name })}</button></>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Problems({ view }: { view: DepthChartUi }) {
  if (!view.problems.length) return <p className="gm-line">{dt('dc.problems.none')}</p>;
  return <ul data-board="problems">{view.problems.map((p, i) => <li key={i} data-leaf={p.leaf} style={mark('state.caution')}>{p.unitId}: {p.message} ({p.leaf})</li>)}</ul>;
}

export function DepthChartScreen(props: DepthChartScreenProps) {
  const { view, tab, readOnly, roster, onIntent } = props;
  if (!view) return <p className="gm-line">{dt('dc.noChart')}</p>;
  const filled = Object.values(view.simDepth).filter((ids) => ids.length > 0).length;
  return (
    <div className="dc-screen" style={{ color: v('text.ink'), background: v('surface.bg') }}>
      <h1>{dt('dc.title', { week: view.week })}</h1>
      {view.locked ? <p role="status" style={mark('state.caution')}>{dt('dc.locked')}</p> : null}
      {readOnly ? <p className="gm-line">{dt('dc.readOnly')}</p> : null}
      {props.refusal ? <p role="alert" data-refusal>{dt('dc.refused', { message: props.refusal })}</p> : null}
      <p className="gm-line" data-game-map={filled}>{dt('dc.gameMap', { count: filled })}</p>
      <div role="tablist">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => props.onTab(t)}>
            {dt(`dc.tab.${t}`)}{t === 'problems' && view.problems.length ? ` (${view.problems.length})` : ''}
          </button>
        ))}
      </div>
      {tab === 'off' || tab === 'def' || tab === 'st' ? (
        <UnitPanel view={view} side={tab} unitId={props.unitId} roster={roster} readOnly={readOnly} onUnit={props.onUnit} onIntent={onIntent} />
      ) : null}
      {tab === 'emergency' ? <Emergency view={view} roster={roster} readOnly={readOnly} onIntent={onIntent} /> : null}
      {tab === 'battles' ? <Battles view={view} readOnly={readOnly} onIntent={onIntent} /> : null}
      {tab === 'problems' ? <Problems view={view} /> : null}
    </div>
  );
}

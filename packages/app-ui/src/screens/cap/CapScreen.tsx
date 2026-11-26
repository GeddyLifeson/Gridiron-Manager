// Contracts and cap screen (team.cap; C6.1 to C6.4 pro, T7 college). Holds no cap arithmetic: charges,
// room, previews and refusals all arrive in the read model, and every action is an intent the host
// turns into a command. Each rule value shows its fact row and is flagged when short of triple
// verification (Q6). Everything works by keyboard (Q1.5.2).
import { useState, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import { ct, money, TABS, verified, type CapIntent, type CapUi, type CollegeBudgetUi, type ProCapUi, type Tab, type UiContract, type UiMove, type UiProvenance } from './view.ts';

export interface CapScreenProps {
  view: CapUi | null;
  tab: Tab;
  readOnly: boolean;
  selected: number | null;
  onTab(tab: Tab): void;
  onSelect(contractId: number | null): void;
  onIntent(intent: CapIntent): void;
}

const box = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };
const num = { textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const };
const counter = { background: v('era.counterBg'), color: v('era.counterInk'), padding: '2px 6px', fontVariantNumeric: 'tabular-nums' as const };

function Source({ p }: { p: UiProvenance }) {
  const ok = verified(p);
  return (
    <span className="cap-source" data-fact={p.factId ?? 'none'} data-verified={ok ? 'yes' : 'no'} style={{ color: v('text.muted'), fontSize: '0.85em' }}>
      {' '}({p.factId ? ct('cap.fact', { factId: p.factId, status: p.status ?? '' }) : ct('cap.fact.missing')}
      {ok ? null : <> · <span style={{ borderLeft: `4px solid ${v('state.caution')}`, paddingLeft: '4px' }}>{ct('cap.fact.flag')}</span></>})
    </span>
  );
}

function Figure({ label, cents, source, tone }: { label: string; cents: number; source?: UiProvenance; tone?: string }): ReactNode {
  return (
    <div data-figure={label}>
      <span>{label}</span>{' '}
      <strong style={{ ...counter, ...(tone ? { borderLeft: `4px solid ${v(tone)}` } : {}) }}>{money(cents)}</strong>
      {source ? <Source p={source} /> : null}
    </div>
  );
}

function Summary({ view }: { view: ProCapUi }) {
  const over = view.roomCents < 0;
  return (
    <section aria-label={ct('cap.summary.room')} style={box}>
      <Figure label={ct('cap.summary.cap')} cents={view.capCents} source={view.capSource} />
      {view.adjustmentCents !== 0 ? <Figure label={ct('cap.summary.adjustment')} cents={view.adjustmentCents} /> : null}
      <Figure label={ct('cap.summary.salary')} cents={view.teamSalaryCents} />
      <Figure label={ct('cap.summary.room')} cents={view.roomCents} tone={over ? 'state.bad' : 'state.good'} />
      {over ? <p role="alert">{ct('cap.summary.over', { amount: money(-view.roomCents) })}</p> : null}
      {view.phase === 'offseason' ? (
        <p className="gm-line">{ct('cap.summary.offseason', { n: view.topN })} {ct('cap.summary.counted', { count: view.countedInFull })}<Source p={view.topNSource} /></p>
      ) : null}
      <p className="gm-line">
        {ct(`cap.timing.${view.timing}`)} · {ct('cap.summary.june1', { used: view.june1.used, allowed: view.june1.allowed })}<Source p={view.june1.source} />
        {' · '}{ct('cap.summary.proration', { years: view.prorationMaxYears })}<Source p={view.prorationSource} />
      </p>
    </section>
  );
}

const bonuses = (r: UiContract) => r.thisYear.rosterBonusCents + r.thisYear.workoutBonusCents + r.thisYear.likelyIncentivesCents;

function Contracts({ view, onSelect }: { view: ProCapUi; onSelect(id: number): void }) {
  if (!view.rows.length) return <p className="gm-line">{ct('cap.empty')}</p>;
  return (
    <table data-table="contracts" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th scope="col">{ct('cap.col.player')}</th><th scope="col">{ct('cap.col.position')}</th>
          <th scope="col" style={num}>{ct('cap.col.base')}</th><th scope="col" style={num}>{ct('cap.col.proration')}</th>
          <th scope="col" style={num}>{ct('cap.col.bonuses')}</th><th scope="col" style={num}>{ct('cap.col.counts')}</th>
          <th scope="col">{ct('cap.col.through')}</th>
        </tr>
      </thead>
      <tbody>
        {view.rows.map((r) => (
          <tr key={r.contractId} data-contract={r.contractId} data-full={r.countedInFull ? 'yes' : 'no'} style={{ borderTop: `1px solid ${v('line.default')}` }}>
            <th scope="row" style={{ textAlign: 'left' }}>
              <button type="button" onClick={() => onSelect(r.contractId)} aria-label={ct('cap.open', { name: r.name })}>{r.name}</button>
              {r.rookie ? <span className="gm-line"> {r.rookie.round === null ? ct('cap.rookie.undrafted', { length: r.rookie.length }) : ct('cap.rookie', { round: r.rookie.round, length: r.rookie.length })}</span> : null}
            </th>
            <td>{r.position}</td>
            <td style={num}>{money(r.thisYear.baseCents)}</td>
            <td style={num}>{money(r.thisYear.prorationCents)}</td>
            <td style={num}>{money(bonuses(r))}</td>
            <td style={num}>{money(r.countsCents)}{r.countedInFull ? null : <span className="gm-line"> {ct('cap.reduced')}</span>}</td>
            <td>{r.lastLeagueYear}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MoveLine({ m, name, contractId, readOnly, onIntent }: { m: UiMove; name: string; contractId: number; readOnly: boolean; onIntent(i: CapIntent): void }) {
  return (
    <li data-move={m.kind} style={box}>
      <strong>{ct(`cap.move.${m.kind}`)}</strong>{' '}
      {m.refused ? <span role="note" data-refused={m.kind}>{ct('cap.move.refused', { reason: m.refused })}</span> : (
        <>
          <span>{ct('cap.move.dead', { now: money(m.deadThisYearCents) })}</span>
          {m.deadNextYearCents > 0 ? <span>, {ct('cap.move.deadNext', { next: money(m.deadNextYearCents) })}</span> : null}
          {m.guaranteedOwedCents > 0 ? <span> · {ct('cap.move.owed', { owed: money(m.guaranteedOwedCents) })}</span> : null}
          {' · '}
          <span style={{ borderLeft: `4px solid ${v(m.savingCents >= 0 ? 'state.good' : 'state.bad')}`, paddingLeft: '4px' }}>
            {m.savingCents >= 0 ? ct('cap.move.saving', { saving: money(m.savingCents) }) : ct('cap.move.cost', { cost: money(-m.savingCents) })}
          </span>
          {' · '}<span>{ct('cap.move.roomAfter', { room: money(m.roomAfterCents) })}</span>
          {m.chargeUntilJune2Cents !== null ? <span className="gm-line"> {ct('cap.move.untilJune2')}</span> : null}
          {readOnly ? null : (
            <> <button type="button" onClick={() => onIntent(m.kind === 'trade' ? { kind: 'shop', contractId } : { kind: 'release', contractId, june1: m.kind === 'release_june1' })}>
              {ct(m.kind === 'trade' ? 'cap.move.shop' : m.kind === 'release_june1' ? 'cap.move.doJune1' : 'cap.move.do', { name })}
            </button></>
          )}
        </>
      )}
    </li>
  );
}

function Detail({ row, readOnly, onIntent }: { row: UiContract; readOnly: boolean; onIntent(i: CapIntent): void }) {
  return (
    <section aria-label={ct('cap.detail.title', { name: row.name, form: row.form })} data-detail={row.contractId} style={box}>
      <h2>{ct('cap.detail.title', { name: row.name, form: row.form })}</h2>
      <table data-table="contract-years">
        <thead><tr>{row.byYear.map((b) => <th key={b.leagueYear} scope="col" style={num}>{b.leagueYear}</th>)}</tr></thead>
        <tbody><tr>{row.byYear.map((b) => <td key={b.leagueYear} style={num}>{money(b.chargeCents)}</td>)}</tr></tbody>
      </table>
      <ul>
        {row.tranches.map((t, i) => <li key={i}>{ct('cap.detail.tranche', { source: ct(`cap.source.${t.source}`), amount: money(t.amountCents), year: t.paidLeagueYear })}: {t.byYear.map((b) => `${b.leagueYear} ${money(b.cents)}`).join(', ')}</li>)}
      </ul>
      <p className="gm-line">{ct('cap.detail.remaining', { amount: money(row.remainingProrationCents) })} · {ct('cap.detail.minimum', { amount: money(row.minimumSalaryCents) })}</p>
      {row.rookie ? (
        <p className="gm-line">
          {row.rookie.round === null ? ct('cap.rookie.undrafted', { length: row.rookie.length }) : ct('cap.rookie', { round: row.rookie.round, length: row.rookie.length })}
          <Source p={row.rookie.lengthSource} />
          {row.rookie.increaseBreachYear !== null ? <span role="alert"> {ct('cap.rookie.breach', { year: row.rookie.increaseBreachYear })}</span> : null}
        </p>
      ) : null}
      <h3>{ct('cap.move.title')}</h3>
      {readOnly ? <p className="gm-line">{ct('cap.readOnly')}</p> : null}
      <ul data-moves={row.contractId}>{row.moves.map((m) => <MoveLine key={m.kind} m={m} name={row.name} contractId={row.contractId} readOnly={readOnly} onIntent={onIntent} />)}</ul>
    </section>
  );
}

function Years({ view }: { view: ProCapUi }) {
  return (
    <table data-table="years">
      <thead><tr>
        <th scope="col">{ct('cap.col.year')}</th><th scope="col" style={num}>{ct('cap.col.cap')}</th><th scope="col" style={num}>{ct('cap.col.committed')}</th>
        <th scope="col" style={num}>{ct('cap.col.dead')}</th><th scope="col" style={num}>{ct('cap.col.room')}</th>
      </tr></thead>
      <tbody>
        {view.years.map((y) => (
          <tr key={y.leagueYear} data-year={y.leagueYear}>
            <th scope="row">{y.leagueYear}</th>
            <td style={num}>{y.capCents === null ? ct('cap.notSet') : <>{money(y.capCents)}<Source p={y.capSource} /></>}</td>
            <td style={num}>{money(y.committedCents)}</td>
            <td style={num}>{money(y.deadCents)}</td>
            <td style={num}>{y.roomCents === null ? ct('cap.notSet') : money(y.roomCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Dead({ view }: { view: ProCapUi }) {
  if (!view.other.length) return <p className="gm-line">{ct('cap.dead.none')}</p>;
  return (
    <table data-table="dead">
      <thead><tr><th scope="col">{ct('cap.col.player')}</th><th scope="col">{ct('cap.col.kind')}</th><th scope="col" style={num}>{ct('cap.col.amount')}</th></tr></thead>
      <tbody>{view.other.map((o, i) => <tr key={i} data-kind={o.kind}><th scope="row">{o.label}</th><td>{ct(`cap.kind.${o.kind}`)}</td><td style={num}>{money(o.amountCents)}</td></tr>)}</tbody>
    </table>
  );
}

function ProSheet({ view, tab, readOnly, selected, onTab, onSelect, onIntent }: CapScreenProps & { view: ProCapUi }) {
  const row = selected === null ? null : view.rows.find((r) => r.contractId === selected) ?? null;
  return (
    <>
      <h1>{ct('cap.title.pro', { year: view.leagueYear })}</h1>
      <Summary view={view} />
      <div role="tablist">
        {TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => onTab(t)}>{ct(`cap.tab.${t}`)}</button>)}
      </div>
      {tab === 'contracts' ? <Contracts view={view} onSelect={(id) => onSelect(id)} /> : null}
      {tab === 'years' ? <Years view={view} /> : null}
      {tab === 'dead' ? <Dead view={view} /> : null}
      {row ? <Detail row={row} readOnly={readOnly} onIntent={onIntent} /> : null}
    </>
  );
}

function PayLine({ line, readOnly, onIntent }: { line: CollegeBudgetUi['lines'][number]; readOnly: boolean; onIntent(i: CapIntent): void }) {
  const [dollars, setDollars] = useState(String(Math.round(line.amountCents / 100)));
  return (
    <tr data-pay={line.personId}>
      <th scope="row">{line.name}</th><td>{line.position}</td><td style={num}>{money(line.amountCents)}</td>
      <td>
        {readOnly ? null : (
          <form onSubmit={(e) => { e.preventDefault(); const d = Number(dollars); if (Number.isFinite(d)) onIntent({ kind: 'set_pay', personId: line.personId, amountCents: Math.round(d * 100) }); }}>
            <input aria-label={ct('cap.college.amount', { name: line.name })} inputMode="numeric" value={dollars} onChange={(e) => setDollars(e.target.value)} size={10} />
            <button type="submit">{ct('cap.college.set')}</button>
          </form>
        )}
      </td>
    </tr>
  );
}

function CollegeSheet({ view, readOnly, onIntent }: { view: CollegeBudgetUi; readOnly: boolean; onIntent(i: CapIntent): void }) {
  return (
    <>
      <h1>{ct('cap.title.college', { year: view.academicYear })}</h1>
      <section style={box} aria-label={ct('cap.college.football')}>
        <Figure label={ct('cap.college.cap')} cents={view.capCents} source={view.capSource} />
        <Figure label={ct('cap.college.credit')} cents={view.scholarshipCreditCents} source={view.creditSource} />
        <Figure label={ct('cap.college.room')} cents={view.paymentRoomCents} />
        <Figure label={ct('cap.college.pool', { tier: ct(`cap.tier.${view.tier}`) })} cents={view.schoolPoolCents} />
        <Figure label={ct('cap.college.football')} cents={view.footballCents} />
        <Figure label={ct('cap.college.reserve')} cents={view.reserveCents} />
        {view.reserveReleasedCents > 0 ? <Figure label={ct('cap.college.released')} cents={view.reserveReleasedCents} /> : null}
        <Figure label={ct('cap.college.total')} cents={view.totalCents} />
        {view.leftCents !== null ? <Figure label={ct('cap.college.left')} cents={view.leftCents} tone="state.good" /> : null}
        {view.refused ? <p role="alert" data-refused={view.refused}>{ct(`cap.college.refused.${view.refused}`)}</p> : null}
        <p className="gm-line">{ct('cap.college.paid', { count: view.paidPlayers, limit: view.aidLimit })}<Source p={view.aidSource} /></p>
        <p className="gm-line">{ct('cap.college.qbShare', { pct: Math.round(view.quarterbackShare * 100) })}</p>
        <p className="gm-line">{ct('cap.college.report', { amount: money(view.reportThresholdCents) })}<Source p={view.reportSource} /></p>
      </section>
      {readOnly ? <p className="gm-line">{ct('cap.readOnly')}</p> : null}
      <table data-table="pay">
        <thead><tr><th scope="col">{ct('cap.col.player')}</th><th scope="col">{ct('cap.col.position')}</th><th scope="col" style={num}>{ct('cap.col.amount')}</th><th scope="col" /></tr></thead>
        <tbody>{view.lines.map((l) => <PayLine key={l.personId} line={l} readOnly={readOnly} onIntent={onIntent} />)}</tbody>
      </table>
    </>
  );
}

export function CapScreen(props: CapScreenProps) {
  const { view } = props;
  if (!view) return <p className="gm-line">{ct('cap.empty')}</p>;
  return (
    <div className="cap-screen" data-level={view.level} style={{ color: v('text.ink'), background: v('surface.bg') }}>
      {view.level === 'pro' ? <ProSheet {...props} view={view} /> : <CollegeSheet view={view} readOnly={props.readOnly} onIntent={props.onIntent} />}
    </div>
  );
}

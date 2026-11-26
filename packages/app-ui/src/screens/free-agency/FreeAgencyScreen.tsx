// Free agency screen (item 7, registry id team.free_agency; M5.1.1 target list, M5.2.1 the call, M5.3.1
// keep, tender or tag, C8.2.1 the window, L7 agents, L5.2.1 power). Holds no football logic: rights, the
// agent's ask and read, cap room, legal tenders and tags all arrive in the read model, and every action is an
// intent the host turns into a command. Grades are the ones the club's staff assigned (MA-48). An illegal
// call is offered with its warning, never hidden (M5.2.1 rule 5). Everything works by keyboard (Q1.5.2).
import { useState, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import { EMPHASES, ft, money, TABS, type Emphasis, type FaIntent, type FreeAgencyUi, type Tab, type UiGrade, type UiMarketRow, type UiOwnRow } from './view.ts';

export interface FreeAgencyScreenProps {
  view: FreeAgencyUi | null;
  tab: Tab;
  readOnly: boolean;
  onTab(tab: Tab): void;
  onIntent(intent: FaIntent): void;
}

const box = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };
const READ_COLOUR = { close: 'state.good', talking: 'state.caution', far_apart: 'state.bad' } as const;
const DOLLARS = 100;

function Badge({ colour, children }: { colour: string; children: ReactNode }) {
  return <span className="fa-badge" style={{ borderLeft: `4px solid ${v(colour)}`, paddingLeft: '4px' }}>{children}</span>;
}

function Grade({ g }: { g: UiGrade }) {
  if (g.state === 'unwatched') return <span data-grade="unwatched">{ft('fa.grade.unwatched')}</span>;
  return <span data-grade="graded" title={ft('fa.grade.band', { band: g.bandText })}>{g.text}</span>;
}

function authorityLine(view: FreeAgencyUi): string {
  const a = view.authority;
  return a.authority === 'advise' ? ft(`fa.authority.advise.${a.holder}`) : ft(`fa.authority.${a.authority}`);
}

function OfferForm({ row, view, onIntent }: { row: UiMarketRow; view: FreeAgencyUi; onIntent(i: FaIntent): void }) {
  const [years, setYears] = useState(row.offer?.years ?? row.askYears);
  const [apy, setApy] = useState(Math.round((row.offer?.apyCents ?? row.askApyCents.mid) / DOLLARS));
  const [guaranteed, setGuaranteed] = useState(Math.round((row.offer?.guaranteedCents ?? row.askGuaranteeCents.mid) / DOLLARS));
  const ask = view.authority.authority === 'advise';
  return (
    <div data-offer-form={row.personId}>
      <label>{ft('fa.offer.years')} <input type="number" min={1} value={years} onChange={(e) => setYears(Number(e.target.value))} /></label>{' '}
      <label>{ft('fa.offer.apy')} <input type="number" min={0} value={apy} onChange={(e) => setApy(Number(e.target.value))} /></label>{' '}
      <label>{ft('fa.offer.guaranteed')} <input type="number" min={0} value={guaranteed} onChange={(e) => setGuaranteed(Number(e.target.value))} /></label>{' '}
      <button type="button" onClick={() => onIntent({ kind: 'offer', personId: row.personId, years, apyCents: apy * DOLLARS, guaranteedCents: guaranteed * DOLLARS })}>
        {ft(ask ? 'fa.offer.ask' : 'fa.offer.make', { name: row.name })}
      </button>
    </div>
  );
}

function Call({ row, onIntent }: { row: UiMarketRow; onIntent(i: FaIntent): void }) {
  const [emphasis, setEmphasis] = useState<Emphasis>(row.saysHeWants ?? 'role');
  const [promise, setPromise] = useState(false);
  if (row.call.blockedByAgent) return <p className="gm-line" data-call="blocked">{ft('fa.call.blocked')}</p>;
  return (
    <div data-call={row.call.legal ? 'legal' : 'illegal'}>
      {!row.call.legal ? <p role="alert">{ft('fa.call.illegal', { reason: row.call.reason })}</p> : null}
      {row.call.usesWindowCall ? <p className="gm-line">{ft('fa.call.windowCall')}</p> : null}
      <div role="group" aria-label={ft('fa.call.title')} className="gm-segmented">
        {EMPHASES.map((e) => (
          <button key={e} type="button" aria-pressed={emphasis === e ? 'true' : 'false'} onClick={() => setEmphasis(e)}>{ft('fa.call.pitch', { emphasis: ft(`fa.want.${e}`) })}</button>
        ))}
      </div>
      <label><input type="checkbox" checked={promise} onChange={(e) => setPromise(e.target.checked)} /> {ft('fa.call.promise')}</label>{' '}
      <button type="button" onClick={() => onIntent({ kind: 'call', personId: row.personId, emphasis, specificPromise: promise })}>{ft('fa.call.button', { name: row.name })}</button>
    </div>
  );
}

function MarketRow({ row, view, readOnly, onIntent }: { row: UiMarketRow; view: FreeAgencyUi; readOnly: boolean; onIntent(i: FaIntent): void }) {
  const status = row.offerSheet ? ft('fa.rights.offerSheet') : row.canSign ? ft('fa.rights.canSign') : ft('fa.rights.cannot');
  const actOnContracts = !readOnly && view.authority.authority !== 'delegated' && view.phase !== 'before_window';
  return (
    <tr data-free-agent={row.personId} data-rights={row.rights}>
      <td>{ft('fa.player.line', { position: row.position, name: row.name, age: row.age, club: row.priorClubName })}</td>
      <td><Grade g={row.grade} /></td>
      <td>{ft(`fa.cls.${row.cls}`)}<br /><span className="gm-line" title={row.rightsReason}>{status}</span></td>
      <td>
        {ft('fa.ask.line', { years: row.askYears, low: money(row.askApyCents.low), high: money(row.askApyCents.high) })}<br />
        <span className="gm-line">{ft('fa.ask.guarantee', { low: money(row.askGuaranteeCents.low), high: money(row.askGuaranteeCents.high) })}</span>
      </td>
      <td>
        {ft('fa.interest.suitors', { count: row.publicSuitors })}<br />
        {row.saysHeWants ? ft('fa.interest.wants', { want: ft(`fa.want.${row.saysHeWants}`) }) : <span className="gm-line">{ft('fa.interest.unknown')}</span>}<br />
        <span className="gm-line">{row.agentName ? ft('fa.agent.line', { name: row.agentName, stance: ft(`fa.agent.stance.${row.agentStance}`) }) : ft('fa.agent.self')}</span>
      </td>
      <td>
        {row.offer ? <p>{ft('fa.offer.line', { years: row.offer.years, apy: money(row.offer.apyCents), guaranteed: money(row.offer.guaranteedCents) })} ({ft(`fa.offer.status.${row.offer.status}`)})</p> : null}
        {row.agentRead ? <Badge colour={READ_COLOUR[row.agentRead]}>{ft(`fa.read.${row.agentRead}`)}</Badge> : null}
        {actOnContracts ? <OfferForm row={row} view={view} onIntent={onIntent} /> : null}
        {!readOnly ? <Call row={row} onIntent={onIntent} /> : null}
      </td>
    </tr>
  );
}

function Market({ view, readOnly, onIntent }: { view: FreeAgencyUi; readOnly: boolean; onIntent(i: FaIntent): void }) {
  return (
    <table className="gm-table" aria-label={ft('fa.market.title')} data-board="free-agents">
      <thead>
        <tr>
          <th scope="col">{ft('fa.col.player')}</th><th scope="col">{ft('fa.col.grade')}</th><th scope="col">{ft('fa.col.status')}</th>
          <th scope="col">{ft('fa.col.ask')}</th><th scope="col">{ft('fa.col.interest')}</th><th scope="col">{ft('fa.col.offer')}</th>
        </tr>
      </thead>
      <tbody>{view.market.map((r) => <MarketRow key={r.personId} row={r} view={view} readOnly={readOnly} onIntent={onIntent} />)}</tbody>
    </table>
  );
}

function OwnPlayer({ row, view, readOnly, onIntent }: { row: UiOwnRow; view: FreeAgencyUi; readOnly: boolean; onIntent(i: FaIntent): void }) {
  const act = !readOnly && view.authority.authority !== 'delegated';
  const ask = view.authority.authority === 'advise';
  return (
    <article style={box} data-own={row.personId}>
      <h3>{ft('fa.own.line', { position: row.position, name: row.name, age: row.age })}</h3>
      <p>{ft(`fa.cls.${row.cls}`)} · <Grade g={row.grade} /> · {ft('fa.ask.line', { years: row.askYears, low: money(row.askApyCents.low), high: money(row.askApyCents.high) })}</p>
      {row.tender ? <p data-tendered={row.tender.level}>{ft('fa.own.tendered', { level: ft(`fa.level.${row.tender.level}`), salary: money(row.tender.salaryCents) })}</p> : null}
      <ul>
        {row.tenders.map((t) => (
          <li key={t.level} data-tender={t.level} data-ok={t.ok ? 'true' : 'false'}>
            {t.ok && act && t.salaryCents !== null
              ? <button type="button" onClick={() => onIntent({ kind: 'tender', personId: row.personId, level: t.level })}>{ft(ask ? 'fa.own.askTender' : 'fa.own.tender', { level: ft(`fa.level.${t.level}`), salary: money(t.salaryCents) })}</button>
              : <span className="gm-line">{ft('fa.own.tenderNo', { level: ft(`fa.level.${t.level}`), reason: t.reason ?? '' })}</span>}
          </li>
        ))}
        {row.tags.map((t) => (
          <li key={t.kind} data-tag={t.kind} data-ok={t.ok ? 'true' : 'false'}>
            {t.ok && act
              ? <button type="button" onClick={() => onIntent({ kind: 'tag', personId: row.personId, tag: t.kind })}>{ft(ask ? 'fa.own.askTag' : 'fa.own.tag', { kind: ft(`fa.tag.${t.kind}`) })}</button>
              : <span className="gm-line">{ft('fa.own.tagNo', { kind: ft(`fa.tag.${t.kind}`), reason: t.reason ?? '' })}</span>}
          </li>
        ))}
      </ul>
    </article>
  );
}

export function FreeAgencyScreen({ view, tab, readOnly, onTab, onIntent }: FreeAgencyScreenProps) {
  if (!view) return <p className="gm-line">{ft('fa.none')}</p>;
  return (
    <div className="fa-screen" data-club={view.clubId} data-phase={view.phase} data-authority={view.authority.authority}>
      <div style={box} role="status" data-counter="cap">
        <p><strong>{ft(`fa.phase.${view.phase}`)}</strong>{view.firstWave ? <> {ft('fa.firstWave')}</> : null}</p>
        <p>
          {ft('fa.cap.room', { room: money(view.capRoomCents) })}{' · '}{ft('fa.cap.committed', { committed: money(view.committedCents) })}{' · '}
          <span style={{ color: v(view.roomAfterOffersCents < 0 ? 'state.bad' : 'text.ink') }}>{ft('fa.cap.after', { after: money(view.roomAfterOffersCents) })}</span>{' · '}
          {ft('fa.roster', { count: view.rosterCount, limit: view.rosterLimit })}
          {view.windowCalls !== null ? <>{' · '}{ft('fa.calls', { used: view.windowCallsUsed, calls: view.windowCalls })}</> : null}
        </p>
        <p data-authority-line="true">{authorityLine(view)}</p>
      </div>
      {readOnly ? <p className="gm-line">{ft('fa.readOnly')}</p> : null}
      <div role="tablist">
        {TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => onTab(t)}>{ft(`fa.tab.${t}`)}</button>)}
      </div>
      <div role="tabpanel">
        {tab === 'market' ? <Market view={view} readOnly={readOnly} onIntent={onIntent} /> : null}
        {tab === 'own' ? (view.own.length ? view.own.map((r) => <OwnPlayer key={r.personId} row={r} view={view} readOnly={readOnly} onIntent={onIntent} />) : <p className="gm-line">{ft('fa.own.none')}</p>) : null}
      </div>
    </div>
  );
}

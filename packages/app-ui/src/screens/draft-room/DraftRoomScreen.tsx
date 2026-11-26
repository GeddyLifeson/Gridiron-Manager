// Draft room screen (item 7, registry id team.draft; C7.3.1 draft screen, M4.5.1 the coach in the room,
// C7.5.1 offer cards). Holds no football logic: the board order, the clock, who may act and the chart totals
// all arrive in the read model, and every action is an intent the host turns into a command. The clock is
// shown, never paused (C7.3.1 rule 5). Grades are the ones the club's staff assigned (MA-48); a player
// nobody watched shows no grade. Every action is a button, so all of it works by keyboard (Q1.5.2).
import type { ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import { clockText, dt, TABS, userMayAct, type DraftIntent, type DraftRoomUi, type Tab, type UiBoardLine, type UiPickLabel, type UiStance } from './view.ts';

export interface DraftRoomScreenProps {
  view: DraftRoomUi | null;
  tab: Tab;
  readOnly: boolean;
  onTab(tab: Tab): void;
  onIntent(intent: DraftIntent): void;
}

const box = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };
const NEED_COLOUR = { high: 'state.bad', some: 'state.caution', low: 'state.neutral' } as const;

function Badge({ colour, children }: { colour: string; children: ReactNode }) {
  return <span className="dr-badge" style={{ borderLeft: `4px solid ${v(colour)}`, paddingLeft: '4px' }}>{children}</span>;
}

function authorityLine(view: DraftRoomUi): string {
  const a = view.authority;
  return a.authority === 'advise' ? dt(`dr.authority.advise.${a.holder}`) : dt(`dr.authority.${a.authority}`);
}

function stanceText(view: DraftRoomUi, s: UiStance): string {
  if (s.kind === 'silent' || s.kind === 'made') return dt(`dr.stance.${s.kind}`);
  const who = view.board.find((b) => b.personId === s.personId)?.name ?? '';
  return dt(`dr.stance.${s.kind}`, { name: who });
}

function pickLabel(p: UiPickLabel): string {
  return p.overall === null ? dt('dr.pickLabel.future', { year: p.year, round: p.round }) : dt('dr.pickLabel.slot', { overall: p.overall });
}

function Clock({ view }: { view: DraftRoomUi }) {
  if (view.complete) return <p role="status" data-draft="complete">{dt('dr.complete')}</p>;
  const c = view.clock;
  if (!c) return <p role="status">{view.waitingForDay !== null ? dt('dr.waitingDay', { day: view.waitingForDay }) : dt('dr.none')}</p>;
  const colour = c.userOnClock ? 'accent.default' : 'line.default';
  return (
    <div role="timer" aria-label={dt('dr.clock.label')} data-clock={c.overall} data-user-on-clock={c.userOnClock ? 'true' : undefined}
      style={{ ...box, borderLeft: `6px solid ${v(colour)}` }}>
      <strong>{dt('dr.clock.on', { club: c.clubName, round: c.round, inRound: c.inRound, overall: c.overall })}</strong>{' · '}
      <span data-seconds-left={c.secondsLeft}>{dt('dr.clock.left', { time: clockText(c.secondsLeft) })}</span>{' · '}
      <span className="gm-line">{dt('dr.clock.runs')}</span>
      {c.userOnClock ? <p role="alert">{dt('dr.clock.you')}</p> : null}
      {view.userExpired ? <p role="alert" data-expired="true">{dt('dr.clock.expired')}</p> : null}
    </div>
  );
}

function Lean({ view, readOnly, onIntent }: { view: DraftRoomUi; readOnly: boolean; onIntent(i: DraftIntent): void }) {
  const top = view.lean[0];
  const advise = view.authority.authority === 'advise';
  return (
    <section aria-label={dt(advise ? 'dr.lean.gm' : 'dr.lean.title')} style={box} data-lean={top?.personId}>
      <h2>{dt(advise ? 'dr.lean.gm' : 'dr.lean.title')}</h2>
      {top ? <p>{dt('dr.lean.likes', { name: top.name, position: top.position })}</p> : null}
      {view.lean.length ? <p className="gm-line">{dt('dr.lean.top', { names: view.lean.map((l) => l.name).join(', ') })}</p> : null}
      {advise ? (
        <>
          <p data-stance={view.stance?.kind ?? 'silent'}>{dt('dr.stance.current', { stance: stanceText(view, view.stance ?? { kind: 'silent' }) })}</p>
          <p className="gm-line">{dt(`dr.insist.${view.nextInsist}`, { count: view.insistsMade })}</p>
          {!readOnly && top ? (
            <div>
              <button type="button" onClick={() => onIntent({ kind: 'voice', strength: 'recommend', personId: top.personId, trade: false })}>{dt('dr.lean.back')}</button>{' '}
              <button type="button" onClick={() => onIntent({ kind: 'silent' })}>{dt('dr.lean.silent')}</button>
            </div>
          ) : null}
        </>
      ) : null}
      {!readOnly && !userMayAct(view) && !view.complete ? <button type="button" onClick={() => onIntent({ kind: 'advance' })}>{dt('dr.lean.advance')}</button> : null}
    </section>
  );
}

function Grade({ line }: { line: UiBoardLine }) {
  const g = line.grade;
  if (g.state === 'unwatched') return <span data-grade="unwatched">{dt('dr.board.unwatched')}</span>;
  return <span data-grade="graded" title={dt('dr.board.band', { band: g.bandText })}>{g.text}</span>;
}

function Actions({ line, view, readOnly, onIntent }: { line: UiBoardLine; view: DraftRoomUi; readOnly: boolean; onIntent(i: DraftIntent): void }) {
  if (readOnly || line.taken) return null;
  const a = view.authority.authority;
  if (a === 'decide') {
    return userMayAct(view) ? <button type="button" onClick={() => onIntent({ kind: 'pick', personId: line.personId })}>{dt('dr.board.pick', { name: line.name })}</button> : null;
  }
  if (a === 'delegated') return null;
  return (
    <>
      {(['mention', 'recommend', 'insist'] as const).map((s) => (
        <button key={s} type="button" onClick={() => onIntent({ kind: 'voice', strength: s, personId: line.personId, trade: false })}>{dt(`dr.board.${s}`, { name: line.name })}</button>
      ))}
    </>
  );
}

function Board({ view, readOnly, onIntent }: { view: DraftRoomUi; readOnly: boolean; onIntent(i: DraftIntent): void }) {
  return (
    <table className="gm-table" aria-label={dt('dr.board.title')} data-board="draft">
      <thead>
        <tr>
          <th scope="col">{dt('dr.board.rank')}</th><th scope="col">{dt('dr.board.player')}</th><th scope="col">{dt('dr.board.grade')}</th>
          <th scope="col">{dt('dr.board.potential')}</th><th scope="col">{dt('dr.board.consensus')}</th><th scope="col">{dt('dr.board.status')}</th><th scope="col" />
        </tr>
      </thead>
      <tbody>
        {view.board.map((b) => (
          <tr key={b.personId} data-prospect={b.personId} data-taken={b.taken ? 'true' : undefined} style={b.taken ? { color: v('text.muted') } : undefined}>
            <td>{b.rank}</td>
            <td>{b.taken ? <s>{b.position} {b.name}</s> : <>{b.position} {b.name}</>}{b.school ? <span className="gm-line"> {b.school}</span> : null}</td>
            <td><Grade line={b} /></td>
            <td>{b.potential ? dt('dr.board.potentialBy', { text: b.potential.text, evaluator: b.potential.evaluator }) : dt('dr.board.noProjection')}</td>
            <td>{b.consensusRank}</td>
            <td>{b.taken ? dt('dr.board.taken', { club: b.taken.clubName, overall: b.taken.overall }) : dt('dr.board.available')}</td>
            <td><Actions line={b} view={view} readOnly={readOnly} onIntent={onIntent} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Needs({ view }: { view: DraftRoomUi }) {
  return (
    <section aria-label={dt('dr.needs.title')} style={box}>
      <h2>{dt('dr.needs.title')}</h2>
      <ul>
        {view.needs.map((n) => (
          <li key={n.position} data-need={n.position} data-word={n.word}>
            <Badge colour={NEED_COLOUR[n.word]}>{n.position} {dt(`dr.needs.${n.word}`)}</Badge>{' '}
            <span className="gm-line">{dt(`dr.needs.frame.${n.frame}`)}</span>
            {n.coachAsked ? <span className="gm-line"> ({dt('dr.needs.asked')})</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Picks({ view }: { view: DraftRoomUi }) {
  return (
    <section aria-label={dt('dr.picks.title')}>
      <h2>{dt('dr.held.title')}</h2>
      <ul data-list="held">
        {view.held.map((h) => (
          <li key={h.pickId} data-pick={h.pickId} data-status={h.status}>
            {h.overall === null ? dt('dr.held.future', { year: h.year, round: h.round }) : dt('dr.held.slot', { year: h.year, round: h.round, overall: h.overall })}
            {h.fromClubName ? <span className="gm-line"> {dt('dr.held.from', { club: h.fromClubName })}</span> : null}
            {h.status === 'used' ? <span className="gm-line"> {dt('dr.held.used')}</span> : null}
            {h.locked ? <span className="gm-line"> {dt('dr.held.locked')}</span> : null}
          </li>
        ))}
      </ul>
      <h2>{dt('dr.picks.title')}</h2>
      <ol data-list="picks">
        {view.picks.map((p) => (
          <li key={p.overall} data-overall={p.overall} data-mine={p.mine ? 'true' : undefined} style={p.mine ? { borderLeft: `4px solid ${v('accent.default')}`, paddingLeft: '4px' } : undefined}>
            {dt('dr.picks.line', { overall: p.overall, club: p.clubName, name: p.name, position: p.position })}
            {p.late ? <span className="gm-line"> ({dt('dr.picks.late')})</span> : null}
          </li>
        ))}
      </ol>
      <h2>{dt('dr.log.title')}</h2>
      <ul data-list="log">
        {view.log.map((l) => (
          <li key={l.overall} data-log={l.overall} data-stance={l.stance}>
            {dt('dr.log.line', { overall: l.overall, name: l.personName, stance: dt(`dr.stance.${l.stance}`, { name: '' }).trim() })}{' · '}
            <span className="gm-line">{dt(`dr.log.by.${l.decidedBy}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Offers({ view, readOnly, onIntent }: { view: DraftRoomUi; readOnly: boolean; onIntent(i: DraftIntent): void }) {
  if (!view.offers.length) return <p className="gm-line">{dt('dr.offers.none')}</p>;
  const decide = view.authority.authority === 'decide';
  const actionable = view.authority.authority !== 'delegated' && !readOnly;
  return (
    <section aria-label={dt('dr.offers.title')}>
      {view.offers.map((o) => (
        <article key={o.id} data-offer={o.id} style={box}>
          <h3>{dt('dr.offers.from', { club: o.withClubName })}</h3>
          <p>{dt('dr.offers.give', { picks: o.give.map(pickLabel).join(', ') })}</p>
          <p>{dt('dr.offers.get', { picks: o.get.map(pickLabel).join(', ') })}</p>
          <p data-totals={`${o.giveTotal}/${o.getTotal}`}>{dt('dr.offers.totals', { give: o.giveTotal, get: o.getTotal })}</p>
          <p className="gm-line">{dt(o.personnelLean === 'take' ? 'dr.offers.leanTake' : 'dr.offers.leanPass')}</p>
          {o.beforeClockEnds ? <p role="alert">{dt('dr.offers.clock')}</p> : null}
          {actionable ? (
            <div>
              <button type="button" onClick={() => onIntent({ kind: 'answer_offer', offerId: o.id, take: true })}>{dt(decide ? 'dr.offers.take' : 'dr.offers.askTake')}</button>{' '}
              <button type="button" onClick={() => onIntent({ kind: 'answer_offer', offerId: o.id, take: false })}>{dt(decide ? 'dr.offers.refuse' : 'dr.offers.askRefuse')}</button>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}

function Ticker({ view }: { view: DraftRoomUi }) {
  return (
    <section aria-label={dt('dr.ticker.title')} style={box}>
      <h2>{dt('dr.ticker.title')}</h2>
      <ul aria-live="polite" data-list="ticker">
        {view.ticker.map((t) => (
          <li key={t.seq} data-wire={t.kind}>{dt(`dr.ticker.${t.kind}`, { club: t.clubName ?? '', person: t.personName ?? '', overall: t.overall ?? '', with: t.withClubName ?? '' })}</li>
        ))}
      </ul>
    </section>
  );
}

export function DraftRoomScreen({ view, tab, readOnly, onTab, onIntent }: DraftRoomScreenProps) {
  if (!view) return <p className="gm-line">{dt('dr.none')}</p>;
  return (
    <div className="dr-screen" data-club={view.clubId} data-authority={view.authority.authority}>
      <Clock view={view} />
      <p data-authority-line="true">{authorityLine(view)}</p>
      {readOnly ? <p className="gm-line">{dt('dr.readOnly')}</p> : null}
      <div className="dr-columns" style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '12px' }}>
        <div>
          <div role="tablist">
            {TABS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => onTab(t)}>{dt(`dr.tab.${t}`)}</button>
            ))}
          </div>
          <div role="tabpanel">
            {tab === 'board' ? <Board view={view} readOnly={readOnly} onIntent={onIntent} /> : null}
            {tab === 'picks' ? <Picks view={view} /> : null}
            {tab === 'offers' ? <Offers view={view} readOnly={readOnly} onIntent={onIntent} /> : null}
          </div>
        </div>
        <aside>
          <Lean view={view} readOnly={readOnly} onIntent={onIntent} />
          <Needs view={view} />
          <Ticker view={view} />
        </aside>
      </div>
    </div>
  );
}

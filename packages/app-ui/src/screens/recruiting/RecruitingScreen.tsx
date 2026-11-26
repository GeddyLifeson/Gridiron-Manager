// Recruiting board screen (O7.5.1, T4). Holds no football logic: grades, reads, rules broken, next contact,
// calendar and counts all arrive in the read model, and every action is an intent the host turns into a
// command. Grades appear only for prospects the staff has watched, with who graded, when and after how much
// watching, and confidence in words; the numeric band shows only on request (MA-48). An act that breaks a
// rule stays offered: choosing it shows the rule and both choices (L8.2.5). Every action is a button, so
// the whole board works by keyboard (Q1.5.2). Colours come from theme tokens only, so the Classic theme
// (PV-18, the default) and every other theme apply unchanged.
import { useState, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import { rb, TABS, type DayLabel, type RecruitingIntent, type RecruitingUi, type Tab, type UiAction, type UiGrade, type UiRow } from './view.ts';

export interface RecruitingScreenProps {
  view: RecruitingUi | null;
  tab: Tab;
  /** Prospect whose card is open (a view option of the address, O1.1.3), or null. */
  cardId: number | null;
  readOnly: boolean;
  dayLabel?: DayLabel;
  onTab(tab: Tab): void;
  onCard(personId: number | null): void;
  onIntent(intent: RecruitingIntent): void;
}

const box = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), color: v('text.ink'), padding: '8px', margin: '8px 0' };
const muted = { color: v('text.muted') };
const PERIOD_COLOUR: Record<string, string> = { contact: 'state.good', evaluation: 'accent.default', quiet: 'state.caution', dead: 'state.bad' };
const CONFIDENCE_COLOUR = { firm: 'state.good', fair: 'state.caution', thin: 'state.neutral' } as const;
const defaultDay: DayLabel = (d) => `day ${d}`;

function Badge({ colour, children }: { colour: string; children: ReactNode }) {
  return <span className="rb-badge" style={{ borderLeft: `4px solid ${v(colour)}`, paddingLeft: '4px' }}>{children}</span>;
}

const periodWord = (p: string | null) => rb(`rb.period.${p ?? 'none'}`);
const rulesWords = (rules: readonly string[]) => rules.map((r) => rb(`rb.breach.${r}`)).join('; ');

function watchedWords(g: UiGrade): string {
  return g.looks.map((l) => rb(`rb.look.${l.kind}`, { count: l.count })).join(', ');
}

export function GradeCell({ g, day, full }: { g: UiGrade | null; day: DayLabel; full: boolean }) {
  const [band, setBand] = useState(false);
  if (!g) return <span style={muted}>{rb('rb.grade.none')}</span>;
  const grader = rb(`rb.grade.grader.${g.grader}`);
  return (
    <span className="rb-grade">
      <strong>{rb('rb.grade.value', { value: g.value, max: g.scaleMax })}</strong>{' '}
      <Badge colour={CONFIDENCE_COLOUR[g.confidence]}>{rb('rb.grade.confidence', { word: rb(`rb.grade.confidence.${g.confidence}`) })}</Badge>
      {full ? (
        <>
          <br /><span style={muted}>{g.lastLookDay === null
            ? rb('rb.grade.byUndated', { grader, watched: watchedWords(g) })
            : rb('rb.grade.by', { grader, date: day(g.lastLookDay), watched: watchedWords(g) })}</span>
          {g.measured ? <><br />{rb('rb.measured', { height: g.measured.heightIn, weight: g.measured.weightLb, forty: g.measured.fortyS.toFixed(2) })}</> : null}
          {g.userGrade !== null ? <><br />{rb('rb.grade.mine', { value: Math.round(g.userGrade) })}</> : null}
          <br /><button type="button" aria-expanded={band} onClick={() => setBand(!band)}>{rb(band ? 'rb.grade.hideBand' : 'rb.grade.showBand')}</button>
          {band ? (
            <ul className="rb-band">
              {Object.entries(g.band).map(([family, width]) => <li key={family}>{rb('rb.grade.band', { family, width: width.toFixed(1) })}</li>)}
            </ul>
          ) : null}
        </>
      ) : null}
    </span>
  );
}

function ReadCell({ row, day }: { row: UiRow; day: DayLabel }) {
  const r = row.read;
  if (!r || r.standing === 'unknown') return <span style={muted}>{rb('rb.read.none')}</span>;
  return (
    <span>
      {r.standing}{r.basis && r.asOf !== null ? <span style={muted}> {rb('rb.read.basis', { basis: r.basis, date: day(r.asOf) })}</span> : null}
    </span>
  );
}

function statusWords(row: UiRow): string {
  const s = row.status;
  const base = s.kind === 'open' ? rb('rb.status.open') : rb(`rb.status.${s.kind}`, { team: s.team ?? '' });
  return s.ours ? `${base} ${rb('rb.status.ours')}` : base;
}

function nextWords(row: UiRow, today: number, day: DayLabel): string {
  if (row.nextContactDay === null) return rb('rb.next.none');
  return row.nextContactDay === today ? rb('rb.next.today') : rb('rb.next.day', { date: day(row.nextContactDay) });
}

function BoardTable({ view, day, onCard }: { view: RecruitingUi; day: DayLabel; onCard(id: number): void }) {
  return (
    <>
      <p style={muted}>{rb('rb.list.total', { shown: view.rows.length, total: view.total })}</p>
      <table className="rb-board">
        <thead>
          <tr>
            {['name', 'pos', 'region', 'public', 'grade', 'read', 'status', 'next'].map((c) => <th key={c} scope="col">{rb(`rb.col.${c}`)}</th>)}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((r) => (
            <tr key={r.personId} data-prospect={r.personId} style={{ borderBottom: `1px solid ${v('line.default')}` }}>
              <td><button type="button" aria-label={rb('rb.card.open', { name: r.name })} onClick={() => onCard(r.personId)}>{r.name}</button></td>
              <td>{r.position}</td>
              <td>{r.region}</td>
              <td>{rb('rb.public', { stars: r.publicStars, rank: r.publicRank === null ? '' : rb('rb.public.rank', { rank: r.publicRank }) })}</td>
              <td><GradeCell g={r.grade} day={day} full={false} /></td>
              <td><ReadCell row={r} day={day} /></td>
              <td>{statusWords(r)}</td>
              <td>{nextWords(r, view.day, day)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ActionButton({ a, prospectId, readOnly, onIntent, onWarn }: { a: UiAction; prospectId: number; readOnly: boolean; onIntent(i: RecruitingIntent): void; onWarn(a: UiAction): void }) {
  const label = a.button === 'suggest' ? rb('rb.act.suggest', { act: rb(`rb.act.${a.kind}`) }) : rb(`rb.act.${a.kind}`);
  return (
    <li data-act={a.kind} data-breaks={a.breaches.length > 0 ? 'yes' : 'no'}>
      {/* Nothing is disabled for a rule (L8.2.5): a breach opens the warning first. */}
      <button type="button" disabled={readOnly} onClick={() => (a.breaches.length && a.button === 'do_it' ? onWarn(a) : onIntent({ kind: 'act', act: a.kind, prospectId, goAhead: false }))}>{label}</button>{' '}
      <span style={muted}>{rb('rb.act.hours', { hours: a.hours })}</span>
      {a.breaches.length ? <> <Badge colour="state.bad">{rb('rb.act.breaks', { rules: rulesWords(a.breaches) })}</Badge></> : null}
    </li>
  );
}

function Warning({ a, onBack, onAnyway }: { a: UiAction; onBack(): void; onAnyway(): void }) {
  return (
    <div role="alertdialog" aria-label={rb('rb.warn.title')} className="rb-warning" style={{ ...box, borderColor: v('state.bad') }}>
      <strong>{rb('rb.warn.title')}</strong>
      <p>{rb('rb.warn.rule', { rules: rulesWords(a.breaches) })}</p>
      {a.warning ? <p>{rb('rb.warn.body', { body: a.warning.body, penalty: rb(`rb.warn.penalty.${a.warning.penaltyText}`) })}</p> : null}
      <p style={muted}>{rb('rb.warn.logged')}</p>
      <button type="button" onClick={onBack}>{rb('rb.warn.back')}</button>{' '}
      <button type="button" onClick={onAnyway}>{rb('rb.warn.anyway')}</button>
    </div>
  );
}

function Card({ view, row, day, readOnly, onClose, onIntent }: { view: RecruitingUi; row: UiRow; day: DayLabel; readOnly: boolean; onClose(): void; onIntent(i: RecruitingIntent): void }) {
  const [warn, setWarn] = useState<UiAction | null>(null);
  const [mine, setMine] = useState<string>(row.grade?.userGrade !== null && row.grade?.userGrade !== undefined ? String(Math.round(row.grade.userGrade)) : '');
  const id = row.personId;
  const evaluate = view.rights.evaluate;
  const offerRight = view.rights.offer;
  const can = !readOnly;
  const verbLabel = (right: string, text: string) => (right === 'suggest' ? rb('rb.act.suggest', { act: text }) : text);
  return (
    <section aria-label={rb('rb.card.title', { name: row.name, pos: row.position, height: row.heightIn, weight: row.weightLb, region: row.region })} className="rb-card" style={box}>
      <h3>{rb('rb.card.title', { name: row.name, pos: row.position, height: row.heightIn, weight: row.weightLb, region: row.region })}</h3>
      <button type="button" onClick={onClose}>{rb('rb.card.close')}</button>
      <p>{rb(`rb.source.${row.source}`)} · {rb('rb.public', { stars: row.publicStars, rank: row.publicRank === null ? '' : rb('rb.public.rank', { rank: row.publicRank }) })} · {statusWords(row)}</p>
      <p><GradeCell g={row.grade} day={day} full /></p>
      <p><ReadCell row={row} day={day} /></p>
      {row.read && row.read.reasons.length ? (
        <ul>{row.read.reasons.map((x) => <li key={`${x.key}-${x.day}`}>{x.positive ? '+' : '−'} {x.key} <span style={muted}>({x.basis}, {day(x.day)})</span></li>)}</ul>
      ) : null}
      {row.firmness ? <p>{rb('rb.card.firmness', { word: row.firmness.word, basis: row.firmness.basis })}</p> : null}
      {row.academics ? <p>{rb('rb.card.academics', { word: row.academics.word, basis: row.academics.basis })}</p> : null}
      <h4>{rb('rb.card.circle')}</h4>
      {row.circle.length ? (
        <ul>{row.circle.map((c) => <li key={c.memberId}>{rb('rb.card.circleRow', { name: c.name, relation: c.relation, influence: c.influence, cares: c.caresAbout.join(', ') || rb('rb.card.none') })}</li>)}</ul>
      ) : <p style={muted}>{rb('rb.card.none')}</p>}
      <h4>{rb('rb.card.rivals')}</h4>
      <p>{row.read && row.read.rivals.length ? row.read.rivals.map((r) => `${r.team} (${r.basis})`).join(', ') : rb('rb.card.none')}</p>
      <h4>{rb('rb.card.otherOffers')}</h4>
      <p>{row.otherOffers.length ? row.otherOffers.join(', ') : rb('rb.card.none')}</p>
      <p>{rb('rb.card.visits', { official: row.visits.official.length, unofficial: row.visits.unofficial.length })}</p>
      {row.ourOffer ? <p>{rb('rb.card.offer', { date: day(row.ourOffer.day), committable: row.ourOffer.committable ? rb('rb.card.committable') : '' })}</p> : null}
      {row.inQueue ? <p>{rb('rb.card.queue')}</p> : null}
      <p>{rb('rb.col.next')}: {nextWords(row, view.day, day)}</p>

      <h4>{rb('rb.act.title')}</h4>
      {warn ? (
        <Warning a={warn} onBack={() => setWarn(null)} onAnyway={() => { onIntent({ kind: 'act', act: warn.kind, prospectId: id, goAhead: true }); setWarn(null); }} />
      ) : null}
      <ul className="rb-actions">
        {evaluate !== 'none' ? (['first_pass_film', 'full_film'] as const).map((look) => (
          <li key={look} data-act={look}>
            <button type="button" disabled={!can} onClick={() => onIntent({ kind: 'film', prospectId: id, look })}>{verbLabel(evaluate, rb(`rb.act.film.${look}`))}</button>
          </li>
        )) : null}
        {row.actions.map((a) => <ActionButton key={a.kind} a={a} prospectId={id} readOnly={!can} onIntent={onIntent} onWarn={setWarn} />)}
        {evaluate !== 'none' && !row.inQueue ? (
          <li data-act="queue"><button type="button" disabled={!can} onClick={() => onIntent({ kind: 'queue', prospectId: id })}>{verbLabel(evaluate, rb('rb.act.queue'))}</button></li>
        ) : null}
        {offerRight !== 'none' && !row.ourOffer && row.status.kind !== 'signed' ? (
          <>
            <li data-act="offer"><button type="button" disabled={!can} onClick={() => onIntent({ kind: 'offer', prospectId: id, committable: false })}>{verbLabel(offerRight, rb('rb.act.offer'))}</button></li>
            <li data-act="offer_committable"><button type="button" disabled={!can} onClick={() => onIntent({ kind: 'offer', prospectId: id, committable: true })}>{verbLabel(offerRight, rb('rb.act.offerCommittable'))}</button></li>
          </>
        ) : null}
        {offerRight !== 'none' && row.ourOffer ? (
          <>
            <li data-act="set_committable"><button type="button" disabled={!can} onClick={() => onIntent({ kind: 'set_committable', prospectId: id, committable: !row.ourOffer!.committable })}>
              {verbLabel(offerRight, rb(row.ourOffer.committable ? 'rb.act.unsetCommittable' : 'rb.act.setCommittable'))}
            </button></li>
            <li data-act="withdraw"><button type="button" disabled={!can} onClick={() => onIntent({ kind: 'withdraw', prospectId: id })}>{verbLabel(offerRight, rb('rb.act.withdraw'))}</button></li>
          </>
        ) : null}
      </ul>
      {row.grade && evaluate !== 'none' ? (
        <p>
          <label>{rb('rb.grade.mine', { value: '' })}<input type="number" min={0} max={row.grade.scaleMax} value={mine} disabled={!can} onChange={(e) => setMine(e.target.value)} /></label>{' '}
          <button type="button" disabled={!can || mine === '' || Number.isNaN(Number(mine))} onClick={() => onIntent({ kind: 'grade', prospectId: id, grade: Number(mine) })}>{rb('rb.grade.setMine')}</button>
        </p>
      ) : null}
    </section>
  );
}

function Filters({ view, readOnly, onIntent }: { view: RecruitingUi; readOnly: boolean; onIntent(i: RecruitingIntent): void }) {
  const positions = view.numbers.rows.map((r) => r.position);
  const regions = view.area.map((a) => a.region);
  const set = (over: Partial<RecruitingUi['filter']>) => onIntent({ kind: 'filter', ...view.filter, ...over });
  const pick = (label: string, value: string | null, options: readonly string[], text: (o: string) => string, on: (x: string | null) => void) => (
    <label>{label}{' '}
      <select value={value ?? ''} disabled={readOnly} onChange={(e) => on(e.target.value === '' ? null : e.target.value)}>
        <option value="">{rb('rb.filter.any')}</option>
        {options.map((o) => <option key={o} value={o}>{text(o)}</option>)}
      </select>{' '}
    </label>
  );
  return (
    <div className="rb-filters">
      {pick(rb('rb.filter.position'), view.filter.position, positions, (o) => o, (x) => set({ position: x }))}
      {pick(rb('rb.filter.region'), view.filter.region, regions, (o) => o, (x) => set({ region: x }))}
      {pick(rb('rb.filter.source'), view.filter.source, ['high_school', 'juco'], (o) => rb(`rb.source.${o}`), (x) => set({ source: x }))}
    </div>
  );
}

function CalendarTab({ view, day }: { view: RecruitingUi; day: DayLabel }) {
  const c = view.calendar;
  const unknown = rb('rb.cal.unknown');
  const d = (n: number | null) => (n === null ? unknown : day(n));
  return (
    <section style={box}>
      <h3>{rb('rb.cal.title', { from: day(c.from), to: day(c.to) })}</h3>
      <ol className="rb-calendar">
        {c.stretches.map((s) => (
          <li key={s.from} data-period={s.period ?? 'none'}><Badge colour={PERIOD_COLOUR[s.period ?? ''] ?? 'state.neutral'}>{rb('rb.cal.stretch', { from: day(s.from), to: day(s.to), period: periodWord(s.period) })}</Badge></li>
        ))}
      </ol>
      <p>{rb('rb.cal.early', { open: d(c.signing.earlyOpen), close: d(c.signing.earlyClose) })}</p>
      <p>{rb('rb.cal.february', { date: d(c.signing.february) })}</p>
      <p>{rb('rb.cal.visits', { hosted: c.visitsHosted, cap: c.visitCap === null ? '' : rb('rb.cal.cap', { cap: c.visitCap }) })}</p>
    </section>
  );
}

function NumbersTab({ view }: { view: RecruitingUi }) {
  const n = view.numbers;
  const cols = ['position', 'returning', 'target', 'committed', 'signed', 'offers', 'open', 'held'] as const;
  return (
    <section style={box}>
      <h3>{rb('rb.num.title')}</h3>
      <table className="rb-numbers">
        <thead><tr>{cols.map((c) => <th key={c} scope="col">{rb(`rb.num.col.${c}`)}</th>)}</tr></thead>
        <tbody>
          {n.rows.map((r) => (
            <tr key={r.position} data-position={r.position}>
              <td>{r.position}</td><td>{r.returning}</td><td>{r.target}</td><td>{r.committed}</td><td>{r.signed}</td><td>{r.offersOut}</td>
              <td style={r.open < 0 ? { color: v('state.bad') } : undefined}>{r.open}</td><td>{r.heldForTransfer}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{rb('rb.num.total', { total: n.total, limit: n.limit === null ? '' : rb('rb.num.limit', { limit: n.limit }) })}</p>
      {n.placesOpen !== null ? <p>{rb('rb.num.places', { places: n.placesOpen })}</p> : null}
      {n.signeeCap !== null ? <p>{rb('rb.num.cap', { cap: n.signeeCap })}</p> : null}
    </section>
  );
}

function AreaTab({ view }: { view: RecruitingUi }) {
  return (
    <section style={box}>
      <h3>{rb('rb.area.title')}</h3>
      <ul>{view.area.map((a) => <li key={a.region} data-region={a.region}>{rb('rb.area.row', { region: a.region, prospects: a.prospects, graded: a.graded, offered: a.offered, committed: a.committedToUs })}</li>)}</ul>
    </section>
  );
}

function ViolationsTab({ view, day }: { view: RecruitingUi; day: DayLabel }) {
  return (
    <section style={box}>
      <h3>{rb('rb.viol.title')}</h3>
      <p style={muted}>{rb('rb.viol.note')}</p>
      {view.violations.length === 0 ? <p>{rb('rb.viol.none')}</p> : (
        <ul>{view.violations.map((x) => (
          <li key={x.logId} data-log={x.logId}>{rb('rb.viol.row', { date: day(x.day), actor: x.actor, prospect: x.prospect ? rb('rb.viol.with', { prospect: x.prospect }) : '', rules: rulesWords(x.rules) })}</li>
        ))}</ul>
      )}
    </section>
  );
}

function PortalTab({ view, day }: { view: RecruitingUi; day: DayLabel }) {
  const p = view.portal;
  return (
    <section style={box}>
      <h3>{rb('rb.portal.title')}</h3>
      {!p.available ? <p>{rb('rb.portal.none')}</p> : (
        <>
          <p>{p.window ? (p.openNow ? rb('rb.portal.open', { open: day(p.window.open), close: day(p.window.close) }) : rb('rb.portal.closed')) : rb('rb.portal.noWindow')}</p>
          <p style={muted}>{rb('rb.portal.note')}</p>
          <ul>{p.rows.map((r) => <li key={r.personId}>{rb('rb.portal.row', { name: r.name, pos: r.position, team: r.fromTeam, date: day(r.enteredDay) })}</li>)}</ul>
        </>
      )}
    </section>
  );
}

export function RecruitingScreen({ view, tab, cardId, readOnly, dayLabel, onTab, onCard, onIntent }: RecruitingScreenProps) {
  const day = dayLabel ?? defaultDay;
  if (!view) return <p className="gm-line">{rb('rb.empty')}</p>;
  const card = cardId === null ? null : view.rows.find((r) => r.personId === cardId) ?? null;
  return (
    <div className="rb-screen" data-screen="league.recruiting" style={{ background: v('surface.bg'), color: v('text.ink') }}>
      <h2>{rb('rb.title', { year: view.classYear })}</h2>
      <p>
        <Badge colour={PERIOD_COLOUR[view.period ?? ''] ?? 'state.neutral'}>{rb('rb.header.period', { period: periodWord(view.period) })}</Badge>
        {view.hoursLeft !== null ? <> · {rb('rb.header.hours', { hours: view.hoursLeft })}</> : null}
      </p>
      <p style={muted}>{rb('rb.header.counts', view.counts)}</p>
      <div role="tablist" className="rb-tabs">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => onTab(t)}
            style={t === tab ? { borderBottom: `2px solid ${v('accent.default')}` } : undefined}>{rb(`rb.tab.${t}`)}</button>
        ))}
      </div>
      {(tab === 'board' || tab === 'pool') ? (
        <>
          <Filters view={view} readOnly={false} onIntent={onIntent} />
          {card ? <Card key={card.personId} view={view} row={card} day={day} readOnly={readOnly} onClose={() => onCard(null)} onIntent={onIntent} /> : null}
          <BoardTable view={view} day={day} onCard={(id) => onCard(id)} />
        </>
      ) : null}
      {tab === 'calendar' ? <CalendarTab view={view} day={day} /> : null}
      {tab === 'numbers' ? <NumbersTab view={view} /> : null}
      {tab === 'area' ? <AreaTab view={view} /> : null}
      {tab === 'violations' ? <ViolationsTab view={view} day={day} /> : null}
      {tab === 'portal' ? <PortalTab view={view} day={day} /> : null}
    </div>
  );
}

// People screens (G-72; O4.1 player card, O4.2.1 roster table, O4.3.1 staff and coach card, O4.4.1 locker
// room, O4.5.1 owner and general manager). They hold no football logic and no hidden value: every grade,
// read and count arrives in the read model, and every action is an intent the host turns into a command.
// Everything works by keyboard: tabs and actions are buttons (Q1.5.2). No headshots or team marks.
import { useState, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import {
  CARD_TABS, dateText, pt, type CardTab, type PeopleIntent, type TextOf, type UiCard, type UiCoachCard, type UiHealthRow, type UiLockerRoom,
  type UiOwner, type UiRead, type UiRoster, type UiStaff,
} from './view.ts';

const box = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };
const idText: TextOf = (k) => k;

function Empty() { return <p className="gm-line">{pt('pp.none')}</p>; }

function Read({ label, read, text }: { label: string; read: UiRead | null; text: TextOf }) {
  if (!read) return <p data-read={label}><strong>{label}:</strong> {pt('pp.notEvaluated')}</p>;
  return (
    <div data-read={label}>
      <p><strong>{label}:</strong> {text(read.textKey)}{read.trend ? ` (${pt(`pp.trend.${read.trend}`)})` : ''}</p>
      {read.reasons.length ? <ul>{read.reasons.map((r) => <li key={r.eventId} data-event={r.eventId}>{text(r.textKey)}</li>)}</ul> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section aria-label={title} style={box}><h2>{title}</h2>{children}</section>;
}

// --- O4.1 player card -----------------------------------------------------------------------------------

function height(inches: number): string { return `${Math.floor(inches / 12)}' ${Math.round(inches % 12)}"`; }
function money(cents: number): string { return `$${Math.round(cents / 100).toLocaleString('en-US')}`; }

function Header({ c }: { c: UiCard }) {
  const h = c.header;
  return (
    <header data-card-header>
      <h1>{h.jersey !== null ? `${h.jersey} ` : ''}{h.name}</h1>
      <p>
        {[h.position, ...h.altPositions].join(' / ')}
        {h.age !== null ? ` · ${pt('pp.card.age', { age: h.age })}` : ''}
        {h.heightIn !== null && h.weightLb !== null ? ` · ${pt('pp.card.size', { height: height(h.heightIn), weight: h.weightLb })}` : ''}
        {h.experience !== null ? ` · ${h.experience === 0 ? pt('pp.card.rookie') : pt('pp.card.exp', { years: h.experience })}` : ''}
      </p>
      {h.status ? <p>{pt('pp.card.status', { status: h.status })}</p> : null}
      {h.contract ? (
        <p data-contract>{pt('pp.card.contract', { years: h.contract.years, through: h.contract.throughYear })}
          {h.contract.thisYearCents !== null ? ` · ${pt('pp.card.contractPay', { pay: money(h.contract.thisYearCents) })}` : ''}</p>
      ) : null}
      {h.designed ? <span data-mark="designed">{pt('pp.card.designed')}</span> : null}
      {h.imported ? <span data-mark="imported">{pt('pp.card.imported')}</span> : null}
    </header>
  );
}

function Grades({ c, readOnly, onIntent }: { c: UiCard; readOnly: boolean; onIntent(i: PeopleIntent): void }) {
  const [band, setBand] = useState(false);
  return (
    <div data-tab="grades">
      {c.gradesNoteKey ? <p className="gm-line" data-grades-note>{pt(c.gradesNoteKey)}</p> : null}
      <table>
        <tbody>
          {c.grades.map((g) => (
            <tr key={g.attribute} data-grade={g.attribute} data-state={g.state}>
              <th scope="row">{g.attribute}</th>
              {/* MA-48: a graded cell shows what someone assigned; an unwatched one shows no number. */}
              <td>{g.state === 'graded' ? (band ? `${g.label} (${g.bandText}), ${g.grader}, ${g.n} looks, ${dateText(g.asOf)}` : g.text) : pt('pp.notEvaluated')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={() => setBand(!band)}>{pt(band ? 'pp.card.grade.hideBand' : 'pp.card.grade.showBand')}</button>{' '}
      {!readOnly ? <button type="button" onClick={() => onIntent({ kind: 'reevaluate', personId: c.personId })}>{pt('pp.card.grade.reevaluate')}</button> : null}
      <h3>{pt('pp.card.measured')}</h3>
      <ul>{c.measured.map((m) => <li key={m.key} data-measured={m.key}>{m.key}: {m.value} {m.unit}</li>)}</ul>
    </div>
  );
}

function Knowledge({ c, text }: { c: UiCard; text: TextOf }) {
  if (!c.knowledge) return <p className="gm-line" data-tab="knowledge">{pt('pp.card.knowledge.none')}</p>;
  return (
    <ul data-tab="knowledge">
      {c.knowledge.map((k) => (
        <li key={k.conceptId} data-concept={k.conceptId}>
          {text(k.conceptId)}: <strong>{k.word}</strong>
          {k.lastPractised ? ` · ${pt('pp.card.knowledge.practised', { date: dateText(k.lastPractised) })}` : ''}
          {k.mentalErrors.length ? ` · ${pt('pp.card.knowledge.errors', { count: k.mentalErrors.length })}` : ''}
          {` · ${pt(k.readyThisWeek ? 'pp.card.knowledge.ready' : 'pp.card.knowledge.notReady')}`}
        </li>
      ))}
    </ul>
  );
}

function InjuryLine({ r, text }: { r: UiHealthRow; text: TextOf }) {
  return (
    <li data-injury={r.injuryId}>
      {text(r.typeId)} ({r.bodyRegion}){r.designation ? ` · ${text(r.designation)}` : ''}
      {r.returnDays ? ` · ${pt('pp.card.health.return', { low: r.returnDays[0], high: r.returnDays[1] })}` : ''}
    </li>
  );
}

function Health({ c, text, onIntent }: { c: UiCard; text: TextOf; onIntent(i: PeopleIntent): void }) {
  const m = c.health.medical;
  return (
    <div data-tab="health">
      {c.health.current.length ? <ul>{c.health.current.map((r) => <InjuryLine key={r.injuryId} r={r} text={text} />)}</ul> : <p>{pt('pp.card.health.clear')}</p>}
      {/* O4.1.4: clearance is the medical staff's decision, shown as a fact with no control to change it. */}
      {m ? (
        <div data-medical>
          <p>{pt('pp.card.health.clearance', { clearance: pt(`pp.clearance.${m.clearance}`) })}</p>
          {m.limits.length ? <p>{pt('pp.card.health.limits', { limits: m.limits.map(text).join(', ') })}</p> : null}
          <p>{pt('pp.card.health.risk', { risk: text(m.reinjuryRiskKey) })}</p>
          <p>{pt('pp.card.health.load', { load: text(m.loadBandKey) })}</p>
        </div>
      ) : null}
      {c.ownPlayer ? <button type="button" onClick={() => onIntent({ kind: 'open', to: 'team.health' })}>{pt('pp.card.health.decide')}</button> : null}
      {c.health.history.length ? <><h3>{pt('pp.card.health.history')}</h3><ul>{c.health.history.map((r) => <InjuryLine key={r.injuryId} r={r} text={text} />)}</ul></> : null}
    </div>
  );
}

function PersonTabView({ c, text, readOnly, onIntent }: { c: UiCard; text: TextOf; readOnly: boolean; onIntent(i: PeopleIntent): void }) {
  const p = c.person;
  if (!p) return <p className="gm-line" data-tab="person">{pt('pp.notEvaluated')}</p>;
  return (
    <div data-tab="person">
      <p>{pt('pp.card.person.role', { promised: p.rolePromisedKey ? text(p.rolePromisedKey) : '-', given: p.roleGivenKey ? text(p.roleGivenKey) : '-' })}</p>
      <Read label={pt('pp.card.person.morale')} read={p.morale} text={text} />
      <Read label={pt('pp.card.person.trust')} read={p.trust} text={text} />
      <Read label={pt('pp.card.person.respect')} read={p.respect} text={text} />
      <h3>{pt('pp.card.person.promises')}</h3>
      <ul>{p.openPromises.map((x) => <li key={x.promiseId} data-promise={x.promiseId}>{text(x.subjectKey)}{x.due ? ` · ${pt('pp.card.person.due', { date: dateText(x.due) })}` : ''}</li>)}</ul>
      {p.personality ? <><h3>{pt('pp.card.person.personality')}</h3><ul>{p.personality.map((t) => <li key={t.traitKey}>{text(t.traitKey)}: {text(t.readKey)} ({text(t.confidenceKey)})</li>)}</ul></> : null}
      {p.standingKey ? <p>{pt('pp.card.person.standing', { standing: text(p.standingKey) })}</p> : null}
      {p.meetings.length ? <><h3>{pt('pp.card.person.meetings')}</h3><ul>{p.meetings.map((x, i) => <li key={i}>{dateText(x.date)}: {text(x.subjectKey)} · {text(x.outcomeKey)}</li>)}</ul></> : null}
      {p.offField ? <><h3>{pt('pp.card.person.offField')}</h3><ul data-offfield>{p.offField.map((e) => <li key={e.eventId}>{text(e.textKey)}</li>)}</ul></> : null}
      {!readOnly ? <button type="button" onClick={() => onIntent({ kind: 'meeting', personId: c.personId, subjectKey: 'meeting.one_on_one' })}>{pt('pp.card.person.schedule')}</button> : null}
    </div>
  );
}

function Notes({ c, readOnly, text, onIntent }: { c: UiCard; readOnly: boolean; text: TextOf; onIntent(i: PeopleIntent): void }) {
  const [draft, setDraft] = useState('');
  return (
    <div data-tab="notes">
      <ul>{c.notes.map((n, i) => <li key={i}>{dateText(n.date)}: {text(n.textKey)}</li>)}</ul>
      {!readOnly && c.ownPlayer ? (
        <label>{pt('pp.card.notes.label')}{' '}
          <input value={draft} onChange={(e) => setDraft(e.target.value)} />{' '}
          <button type="button" disabled={!draft.trim()} onClick={() => { onIntent({ kind: 'note', personId: c.personId, text: draft }); setDraft(''); }}>{pt('pp.card.notes.add')}</button>
        </label>
      ) : null}
    </div>
  );
}

function Overview({ c, text }: { c: UiCard; text: TextOf }) {
  const graded = c.grades.filter((g) => g.state === 'graded');
  return (
    <div data-tab="overview">
      <ul>{graded.map((g) => <li key={g.attribute}>{g.attribute}: {g.state === 'graded' ? g.label : ''}</li>)}</ul>
      {c.health.current.map((r) => <InjuryLine key={r.injuryId} r={r} text={text} />)}
      {c.person?.morale ? <p>{pt('pp.card.person.morale')}: {text(c.person.morale.textKey)}</p> : null}
    </div>
  );
}

export interface PlayerCardProps {
  view: UiCard | null; tab: CardTab; readOnly: boolean; text?: TextOf;
  onTab(tab: CardTab): void; onIntent(intent: PeopleIntent): void;
}

export function PlayerCardScreen({ view, tab, readOnly, text = idText, onTab, onIntent }: PlayerCardProps) {
  if (!view) return <Empty />;
  return (
    <div className="pp-card" data-person={view.personId}>
      <Header c={view} />
      <div role="tablist">
        {CARD_TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => onTab(t)}>{pt(`pp.card.tab.${t}`)}</button>)}
      </div>
      <div role="tabpanel">
        {tab === 'overview' ? <Overview c={view} text={text} /> : null}
        {tab === 'grades' ? <Grades c={view} readOnly={readOnly} onIntent={onIntent} /> : null}
        {tab === 'performance' ? <p className="gm-line" data-tab="performance">{pt('pp.card.performance.elsewhere')}</p> : null}
        {tab === 'knowledge' ? <Knowledge c={view} text={text} /> : null}
        {tab === 'health' ? <Health c={view} text={text} onIntent={onIntent} /> : null}
        {tab === 'person' ? <PersonTabView c={view} text={text} readOnly={readOnly} onIntent={onIntent} /> : null}
        {tab === 'history' ? <p className="gm-line" data-tab="history">{pt('pp.card.history.none')}</p> : null}
        {tab === 'notes' ? <Notes c={view} readOnly={readOnly} text={text} onIntent={onIntent} /> : null}
      </div>
    </div>
  );
}

// --- O4.2.1 roster table --------------------------------------------------------------------------------

export function RosterScreen({ view, text = idText, onIntent }: { view: UiRoster | null; text?: TextOf; onIntent(i: PeopleIntent): void }) {
  if (!view) return <Empty />;
  return (
    <div className="pp-roster" data-club={view.clubId}>
      <p role="status" data-counters>
        {view.limits.map((l) => (
          <span key={l.list} data-limit={l.list} data-over={l.over ? 'true' : undefined}>
            {l.limit === null ? pt('pp.roster.counterNoLimit', { list: text(l.list), count: l.count }) : pt('pp.roster.counter', { list: text(l.list), count: l.count, limit: l.limit })}
            {l.over ? ` (${pt('pp.roster.over')})` : ''}{' · '}
          </span>
        ))}
      </p>
      {view.lists.map((list) => {
        const rows = view.rows.filter((r) => r.list === list);
        if (!rows.length) return null;
        return (
          <Section key={list} title={text(list)}>
            <table data-list={list}>
              <thead><tr>{['no', 'name', 'pos', 'age', 'exp', 'report'].map((c) => <th key={c} scope="col">{pt(`pp.roster.col.${c}`)}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.personId} data-player={r.personId}>
                    <td>{r.jersey ?? ''}</td>
                    <td><button type="button" onClick={() => onIntent({ kind: 'open', to: `/team/player/${r.personId}` })}>{r.name}</button></td>
                    <td>{r.position}</td><td>{r.age ?? ''}</td><td>{r.experience ?? ''}</td><td>{r.designation ? text(r.designation) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        );
      })}
      <ul data-subtotals>
        {view.subtotals.map((s) => <li key={s.position}>{s.planned === null ? pt('pp.roster.subtotal', { position: s.position, count: s.count }) : pt('pp.roster.subtotalPlan', { position: s.position, count: s.count, planned: s.planned })}</li>)}
      </ul>
      {view.requests.length ? (
        <Section title={pt('pp.roster.requests')}>
          <ul>{view.requests.map((r) => <li key={r.requestId} data-request={r.state}>{text(r.moveKey)}: {pt(`pp.roster.request.${r.state}`)}{r.reasonKey ? ` · ${text(r.reasonKey)}` : ''}</li>)}</ul>
        </Section>
      ) : null}
    </div>
  );
}

// --- O4.3.1 staff and coach card ------------------------------------------------------------------------

export function StaffScreen({ view, text = idText, onIntent }: { view: UiStaff | null; text?: TextOf; onIntent(i: PeopleIntent): void }) {
  if (!view) return <Empty />;
  const ids = new Set(view.seats.map((s) => s.jobId));
  const roots = view.seats.filter((s) => s.reportsToJobId === null || !ids.has(s.reportsToJobId));
  const tree = (seats: typeof view.seats, seen: Set<number>): ReactNode => (
    <ul>
      {seats.filter((s) => !seen.has(s.jobId)).map((s) => {
        const next = new Set(seen).add(s.jobId);
        const kids = view.seats.filter((k) => k.reportsToJobId === s.jobId && !next.has(k.jobId));
        return (
          <li key={s.jobId} data-seat={s.jobId}>
            <strong>{text(s.catalogueId)}</strong>{': '}
            {s.holderPersonId !== null ? (
              <button type="button" onClick={() => onIntent({ kind: 'open', to: `/people/coach/${s.holderPersonId}` })}>{s.holderName}</button>
            ) : <span data-vacant>{pt('pp.staff.vacant')}{s.coveringPersonId !== null ? `, ${pt('pp.staff.covering', { name: `#${s.coveringPersonId}` })}` : ''}{s.coverCostKey ? ` · ${text(s.coverCostKey)}` : ''}</span>}
            {s.holding !== 'permanent' ? ` (${pt(`pp.staff.${s.holding}`)})` : ''}
            {kids.length ? tree(kids, next) : null}
          </li>
        );
      })}
    </ul>
  );
  return <div className="pp-staff" data-club={view.clubId}><h1>{pt('pp.staff.title')}</h1>{tree(roots, new Set())}</div>;
}

export function CoachCardScreen({ view, text = idText, readOnly, onIntent }: { view: UiCoachCard | null; text?: TextOf; readOnly: boolean; onIntent(i: PeopleIntent): void }) {
  if (!view) return <Empty />;
  return (
    <div className="pp-coach" data-person={view.personId}>
      <h1>{view.name}</h1>
      <p>{view.catalogueId ? text(view.catalogueId) : ''}{view.positionGroupTaught ? ` · ${view.positionGroupTaught}` : ''}</p>
      {view.background.length ? <ul>{view.background.map((b) => <li key={b}>{text(b)}</li>)}</ul> : null}
      <Section title={pt('pp.coach.record')}>
        {/* E9.5.2: the record with its sample, never a skill value. */}
        {view.noBook ? <p data-nobook>{pt('pp.coach.noBook')}</p> : (
          <ul>{view.record.map((r) => <li key={r.key} data-record={r.key}>{text(r.key)}: {pt('pp.coach.sample', { count: r.eventIds.length })}{r.labelKey ? ` · ${text(r.labelKey)}` : ''}</li>)}</ul>
        )}
      </Section>
      <Section title={pt('pp.coach.systems')}>
        <ul>{view.systems.map((s) => <li key={s.familyId}>{pt('pp.coach.seasons', { family: text(s.familyId), seasons: s.seasons })}</li>)}</ul>
      </Section>
      {view.relationship ? <><Read label={pt('pp.coach.trust')} read={view.relationship.trust} text={text} /><Read label={pt('pp.coach.loyalty')} read={view.relationship.loyalty} text={text} /></> : null}
      {view.ambitionKeys.length ? <Section title={pt('pp.coach.ambitions')}><ul>{view.ambitionKeys.map((a) => <li key={a}>{text(a)}</li>)}</ul></Section> : null}
      {view.contract ? <p data-contract>{pt('pp.card.contract', { years: view.contract.years, through: view.contract.throughYear })}</p> : null}
      {view.proposals.length ? (
        <Section title={pt('pp.coach.proposals')}>
          <ul>{view.proposals.map((p) => <li key={p.eventId}>{dateText(p.date)}: {text(p.taskKey)} · {text(p.resultKey)}</li>)}</ul>
        </Section>
      ) : null}
      {!readOnly ? <button type="button" onClick={() => onIntent({ kind: 'meeting', personId: view.personId, subjectKey: 'meeting.staff' })}>{pt('pp.coach.meet')}</button> : null}
    </div>
  );
}

// --- O4.4.1 locker room ---------------------------------------------------------------------------------

export function LockerRoomScreen({ view, text = idText, names = (id: number) => `#${id}`, onIntent }: { view: UiLockerRoom | null; text?: TextOf; names?: (id: number) => string; onIntent(i: PeopleIntent): void }) {
  if (!view) return <Empty />;
  return (
    <div className="pp-room" data-club={view.clubId}>
      {view.lostRoom ? <p role="alert" data-lost-room>{pt('pp.room.lost')} {view.lostRoom.causeKeys.map(text).join('; ')}</p> : null}
      <Read label={pt('pp.room.culture')} read={view.culture} text={text} />
      <Read label={pt('pp.room.buyIn')} read={view.buyIn} text={text} />
      <Section title={pt('pp.room.groups')}>
        <ul>{view.groups.map((g, i) => <li key={i} data-group={g.kind}>{pt(`pp.room.group.${g.kind}`)}: {g.memberIds.map(names).join(', ')}</li>)}</ul>
      </Section>
      <Section title={pt('pp.room.issues')}>
        {view.issues.length === 0 ? <p>{pt('pp.room.noIssues')}</p> : (
          <ul>
            {view.issues.map((i) => (
              <li key={i.issueId} data-issue={i.issueId}>
                {text(i.kindKey)}: {i.personIds.map(names).join(', ')} · {pt('pp.room.source', { source: text(i.sourceKey), name: names(i.sourcePersonId) })}{' '}
                {i.responseLinks.map((l) => <button key={l} type="button" onClick={() => onIntent({ kind: 'open', to: l })}>{pt('pp.room.respond')}</button>)}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// --- O4.5.1 owner and general manager -------------------------------------------------------------------

export function OwnerScreen({ view, text = idText, readOnly, onIntent }: { view: UiOwner | null; text?: TextOf; readOnly: boolean; onIntent(i: PeopleIntent): void }) {
  if (!view) return <Empty />;
  const o = view.owner;
  const g = view.gm;
  return (
    <div className="pp-owner" data-club={view.clubId}>
      <Section title={pt('pp.owner.title')}>
        {o.name ? <p>{o.name}</p> : null}
        <h3>{pt('pp.owner.goals')}</h3>
        <ul>{o.goalKeys.map((k) => <li key={k}>{text(k)}</li>)}</ul>
        {/* E4: job security is read from goals, comments and media, never shown as a number. */}
        <Read label={pt('pp.owner.confidence')} read={o.confidence} text={text} />
        {o.comments.length ? <><h3>{pt('pp.owner.comments')}</h3><ul>{o.comments.map((c) => <li key={c.eventId}>{dateText(c.date)}: {text(c.textKey)}</li>)}</ul></> : null}
        {o.nextMeeting ? <p>{pt('pp.owner.next', { date: dateText(o.nextMeeting) })}</p> : null}
        {!readOnly && o.personId !== null ? <button type="button" onClick={() => onIntent({ kind: 'meeting', personId: o.personId!, subjectKey: 'meeting.owner' })}>{pt('pp.owner.askMeeting')}</button> : null}
      </Section>
      <Section title={pt('pp.gm.title')}>
        {g.personId === null ? <p>{pt('pp.gm.none')}</p> : <p>{g.name}</p>}
        <Read label={pt('pp.gm.relationship')} read={g.relationship} text={text} />
        <h3>{pt('pp.gm.say')}</h3>
        <ul>{g.say.map((s) => <li key={s.moveKey} data-say={s.moveKey}>{text(s.moveKey)}: {pt(`pp.gm.holder.${s.holderKey}`)}</li>)}</ul>
        <h3>{pt('pp.gm.requests')}</h3>
        <ul>
          {g.requests.map((r) => (
            <li key={r.requestId} data-request={r.state}>{text(r.moveKey)} ({text(r.phaseKey)}): {pt(`pp.gm.request.${r.state}`)}
              {r.reasonKey ? ` · ${pt('pp.gm.reason', { reason: text(r.reasonKey) })}` : ''}</li>
          ))}
        </ul>
        {g.upcoming.length ? <><h3>{pt('pp.gm.upcoming')}</h3><ul>{g.upcoming.map((u) => <li key={u.decisionKey}>{text(u.decisionKey)}{u.toldKey ? ` · ${pt('pp.gm.told', { told: text(u.toldKey) })}` : ''}</li>)}</ul></> : null}
        {!readOnly && g.personId !== null ? <button type="button" onClick={() => onIntent({ kind: 'meeting', personId: g.personId!, subjectKey: 'meeting.gm' })}>{pt('pp.owner.askMeeting')}</button> : null}
      </Section>
    </div>
  );
}

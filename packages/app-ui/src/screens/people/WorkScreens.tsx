// Delegation settings (O4.3.2) and the meeting and conversation screen (O4.4.2), with the game-week staff
// one-on-one where staff show what they have learned about how the head coach likes things and bring their
// own suggestions (Marlon 2026-11-26). They hold no football logic and no hidden value: hours, records,
// reads and responses arrive in the read model, and every action is an intent the host turns into a command.
// Everything works by keyboard: selects, tabs and actions are native controls (Q1.5.2).
import { useState, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import { TermText } from '../glossary/TermText.tsx';
import {
  AUTONOMIES, MEETING_TABS, dayText, wt, type Autonomy, type DelegationIntent, type MeetingIntent, type MeetingTab, type UiAssignment, type UiDelegation,
  type UiDelegationRow, type UiMeeting, type UiPromiseRow, type UiStaffOneOnOne,
} from './work-view.ts';

type TextOf = (key: string) => string;
const idText: TextOf = (k) => k;
const box = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };
const h = (x: number): string => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0$/, ''));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section aria-label={title} style={box}><h2>{title}</h2>{children}</section>;
}

// --- delegation -----------------------------------------------------------------------------------------------

function RecordCell({ r }: { r: UiDelegationRow }) {
  if (r.holderId === null) return <td>-</td>;
  if (!r.record) return <td>{wt('dg.record.none')}</td>;
  return <td data-record>{wt('dg.record', { held: r.record.held, products: r.record.products, replaced: r.record.replaced })}</td>;
}

export interface DelegationScreenProps {
  view: UiDelegation | null;
  text?: TextOf;
  /** Recompute the table for unsaved settings (the read model with draft assignments), so hours update before saving. */
  preview?: (draft: Readonly<Record<string, UiAssignment>>) => UiDelegation | null;
  onIntent(i: DelegationIntent): void;
}

export function DelegationScreen({ view, text = idText, preview, onIntent }: DelegationScreenProps) {
  const [draft, setDraft] = useState<Record<string, UiAssignment>>({});
  if (!view) return <section aria-label={wt('dg.title')}><h1>{wt('dg.title')}</h1><p className="gm-line">{wt('dg.blocked.noStaff')}</p></section>;
  const edits = Object.keys(draft).length;
  const shown = (edits && preview ? preview(draft) : null) ?? view;
  const readOnly = shown.readOnly;
  const set = (taskId: string, a: UiAssignment) => setDraft({ ...draft, [taskId]: a.holderId === null ? { holderId: null, autonomy: 'keeps' } : a });
  const t = shown.totals;
  // O4.3.2: before saving, show what the assistants whose say changes have said about wanting more or less.
  const touched = new Set(Object.entries(draft).flatMap(([taskId, a]) => [a.holderId, view.rows.find((r) => r.taskId === taskId)?.holderId ?? null]).filter((x): x is number => x !== null));
  const said = edits ? shown.statements.filter((s) => touched.has(s.personId)) : shown.statements;
  return (
    <section aria-label={wt('dg.title')} data-screen="people.delegation">
      <h1>{wt('dg.title')}</h1>
      {readOnly ? <p className="gm-line" data-read-only>{wt('dg.readOnly')}</p> : (
        <p role="group" aria-label={wt('dg.presets')}>
          {wt('dg.presets')}:{' '}
          {shown.presets.map((p) => <button key={p} type="button" data-preset={p} onClick={() => { setDraft({}); onIntent({ kind: 'preset', preset: p }); }}>{wt(`dg.preset.${p}`)}</button>)}
        </p>
      )}
      <table data-delegation>
        <thead><tr><th scope="col">{wt('dg.col.task')}</th><th scope="col">{wt('dg.col.owner')}</th><th scope="col">{wt('dg.col.mode')}</th><th scope="col">{wt('dg.col.saved')}</th><th scope="col">{wt('dg.col.record')}</th></tr></thead>
        <tbody>
          {shown.rows.map((r) => (
            <tr key={r.taskId} data-task={r.taskId} data-autonomy={r.autonomy}>
              <th scope="row"><TermText text={text(r.taskId)} /></th>
              <td>
                {r.blockedKey ? <span data-blocked>{wt(r.blockedKey)}</span> : (
                  <select aria-label={wt('dg.col.owner')} disabled={readOnly} value={r.holderId === null ? '' : String(r.holderId)}
                    onChange={(e) => set(r.taskId, e.currentTarget.value ? { holderId: Number(e.currentTarget.value), autonomy: r.autonomy === 'keeps' ? 'decides' : r.autonomy } : { holderId: null, autonomy: 'keeps' })}>
                    <option value="">{wt('dg.owner.me')}</option>
                    {r.candidates.map((c) => <option key={c.personId} value={c.personId}>{c.name}{c.personId === r.defaultOwnerId ? ` ${wt('dg.owner.default')}` : ''}</option>)}
                  </select>
                )}
              </td>
              <td>
                {r.holderId === null ? wt('dg.mode.keeps') : (
                  <select aria-label={wt('dg.col.mode')} disabled={readOnly} value={r.autonomy} onChange={(e) => set(r.taskId, { holderId: r.holderId, autonomy: e.currentTarget.value as Autonomy })}>
                    {AUTONOMIES.filter((a) => a !== 'keeps').map((a) => <option key={a} value={a}>{wt(`dg.mode.${a}`)}</option>)}
                  </select>
                )}
                {r.autonomy === 'proposes' && !r.reviewStep ? <span className="gm-line"> ({wt('dg.noReview')})</span> : null}
              </td>
              <td data-saved>{h(r.hoursSaved)}</td>
              <RecordCell r={r} />
            </tr>
          ))}
        </tbody>
      </table>
      <p data-totals data-over={t.overBudget ? 'true' : 'false'}>
        {wt('dg.totals', { projected: h(t.projectedHours), budget: h(t.budgetHours), fixed: h(t.fixedHours), tasks: h(t.taskHours), saved: h(t.savedHours) })}
        {t.overBudget ? <strong> {wt('dg.over')}</strong> : null}
      </p>
      {said.length ? (
        <Section title={wt('dg.said')}>
          <ul>{said.map((s) => <li key={s.eventId} data-said={s.personId}>{shown.staff.find((m) => m.personId === s.personId)?.name ?? s.personId}: {text(s.textKey)} ({wt(`dg.said.${s.wants}`)})</li>)}</ul>
        </Section>
      ) : null}
      {!readOnly && edits ? (
        <p data-draft>
          {wt('dg.draft', { n: edits })}{' '}
          <button type="button" onClick={() => { onIntent({ kind: 'saveDelegation', assignments: draft }); setDraft({}); }}>{wt('dg.save')}</button>{' '}
          <button type="button" onClick={() => setDraft({})}>{wt('dg.discard')}</button>
        </p>
      ) : null}
      <Section title={wt('dg.staff')}>
        <ul>
          {shown.staff.map((m) => (
            <li key={m.personId} data-staff={m.personId} data-over={m.overloaded ? 'true' : 'false'}>
              {wt('dg.staff.row', { name: m.name, load: h(m.loadHours), delegated: h(m.delegatedHours), capacity: h(m.capacityHours) })}
              {!m.available ? ` · ${wt('dg.staff.away')}` : ''}{m.overloaded ? ` · ${wt('dg.staff.over')}` : ''}
            </li>
          ))}
        </ul>
      </Section>
    </section>
  );
}

// --- meetings -------------------------------------------------------------------------------------------------

function PromiseLine({ p, text }: { p: UiPromiseRow; text: TextOf }) {
  return (
    <li data-promise={p.promiseId} data-status={p.status}>
      {wt('mt.tracker.row', { type: text(`promise.${p.type}`), to: p.toName ?? String(p.toPersonId), made: dayText(p.madeOn), due: dayText(p.due), status: wt(`mt.status.${p.status}`) })}
      {p.overdue ? <strong> {wt('mt.tracker.overdue')}</strong> : null}
      {p.madeByAssistant ? ` · ${wt('mt.tracker.assistant')}` : ''}
      {p.beyondAuthority ? ` · ${wt('mt.beyond')}` : ''}
    </li>
  );
}

function PlayerTalk({ m, text, readOnly, onIntent }: { m: UiMeeting; text: TextOf; readOnly: boolean; onIntent(i: MeetingIntent): void }) {
  const s = m.subject;
  if (!s) return <p className="gm-line">{wt('mt.pick')}</p>;
  return (
    <div data-tab="player" data-person={s.personId}>
      <Section title={wt('mt.going')}>
        <h3>{s.name}</h3>
        <p>{wt('mt.role', { role: text(s.roleKey) })}</p>
        {/* D12.5: morale is the read the staff gives in words, with what it is based on; never a number. */}
        {s.mood ? (
          <div data-mood>
            <p>{wt('mt.mood', { mood: text(s.mood.textKey) })}</p>
            {s.mood.reasons.length ? <ul>{s.mood.reasons.map((r) => <li key={r.eventId} data-event={r.eventId}>{text(r.textKey)}</li>)}</ul> : null}
          </div>
        ) : <p>{wt('mt.mood.unknown')}</p>}
        <p>{s.lastTalk ? wt('mt.last', { subject: text(players(s.lastTalk.typeId)), date: dayText(s.lastTalk.date), band: text(s.lastTalk.bandKey) }) : wt('mt.last.none')}</p>
        {s.openPromises.length ? <><h4>{wt('mt.open')}</h4><ul>{s.openPromises.map((p) => <PromiseLine key={p.promiseId} p={p} text={text} />)}</ul></> : null}
        {s.imported ? <p className="gm-line" data-imported>{wt('mt.imported')}</p> : null}
        {!m.mayPromise ? <p className="gm-line">{wt('mt.noPromise')}</p> : null}
      </Section>
      {m.subjects.map((sub) => (
        <Section key={sub.typeId} title={`${text(sub.textKey)}${sub.major ? ` (${wt('mt.major')})` : ''}`}>
          <ul data-subject={sub.typeId}>
            {sub.responses.map((r) => (
              <li key={r.responseId} data-response={r.responseId} data-stance={r.stance}>
                {/* A term link is a control of its own, so it never sits inside the button (no nested controls). */}
                <TermText text={text(r.sayKey)} />{' '}
                <button type="button" disabled={readOnly} aria-label={text(r.sayKey)} onClick={() => onIntent({ kind: 'say', personId: s.personId, responseId: r.responseId })}>
                  {wt('mt.say')}
                </button>{' '}
                <span className="gm-line">({wt(`mt.stance.${r.stance}`)}{r.minutes ? `, ${wt('mt.minutes', { minutes: r.minutes })}` : ''})</span>
                {r.lieRisk ? <strong data-lie-risk> {wt('mt.lieRisk')}</strong> : null}
                {r.beyondAuthority ? <span data-beyond> {wt('mt.beyond')}</span> : null}
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}

/** Conversation type id to its content key (career players `players.talk.<id>`). */
const players = (typeId: string): string => `players.talk.${typeId}`;

function StaffTalk({ o, text, readOnly, onIntent }: { o: UiStaffOneOnOne | null; text: TextOf; readOnly: boolean; onIntent(i: MeetingIntent): void }) {
  if (!o) return <p className="gm-line">{wt('mt.staff.pick')}</p>;
  return (
    <div data-tab="staff" data-staff={o.staffId}>
      <p>{wt('mt.staff.cost', { name: o.name, title: text(o.titleKey), hours: h(o.hours) })}</p>
      <Section title={wt('mt.staff.learned')}>
        {o.learned.length === 0 ? <p className="gm-line">{wt('mt.staff.learned.none')}</p> : (
          <ul>{o.learned.map((l, i) => <li key={i} data-learned={i}><TermText text={wt('mt.staff.learned.row', { type: text(l.typeKey), bucket: text(l.bucketKey), chosen: text(l.chosenKey), times: l.times, of: l.of })} /></li>)}</ul>
        )}
      </Section>
      <Section title={wt('mt.staff.suggests')}>
        {o.suggestions.length === 0 && o.sheetSuggestions.length === 0 ? <p className="gm-line">{wt('mt.staff.suggest.none')}</p> : null}
        <ul>
          {o.suggestions.map((s) => (
            <li key={s.index} data-suggestion={s.index}>
              <TermText text={wt('mt.staff.suggest.row', { type: text(s.typeKey), bucket: text(s.bucketKey), habit: text(s.habitKey), times: s.times, of: s.of, pick: text(s.pickKey) })} />{' '}
              {(['accepted', 'overruled_with_reason', 'overruled_without_reason'] as const).map((a) => (
                <button key={a} type="button" disabled={readOnly} data-answer={a} onClick={() => onIntent({ kind: 'answerSuggestion', staffId: o.staffId, index: s.index, answer: a })}>
                  {wt(a === 'accepted' ? 'mt.staff.accept' : a === 'overruled_with_reason' ? 'mt.staff.overruleReason' : 'mt.staff.overrule')}
                </button>
              ))}
            </li>
          ))}
        </ul>
        {o.sheetSuggestions.length ? (
          <>
            <h3>{wt('mt.staff.sheet')}</h3>
            <ul>
              {o.sheetSuggestions.map((s) => (
                <li key={`${s.boxId}|${s.callKey}`} data-sheet-suggestion={s.boxId}>
                  {wt('mt.staff.sheet.row', { call: text(s.callKey), box: text(s.boxId), weeks: s.removedWeeks })}{' '}
                  <button type="button" disabled={readOnly} onClick={() => onIntent({ kind: 'answerSheetSuggestion', staffId: o.staffId, boxId: s.boxId, add: true })}>{wt('mt.staff.sheet.add')}</button>{' '}
                  <button type="button" disabled={readOnly} onClick={() => onIntent({ kind: 'answerSheetSuggestion', staffId: o.staffId, boxId: s.boxId, add: false })}>{wt('mt.staff.sheet.keep')}</button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Section>
    </div>
  );
}

export interface MeetingScreenProps {
  view: UiMeeting | null;
  staffTalk: UiStaffOneOnOne | null;
  /** Staff the user can meet one on one this week, for the picker. */
  staffList?: readonly { readonly personId: number; readonly name: string }[];
  tab: MeetingTab;
  readOnly: boolean;
  text?: TextOf;
  onTab(tab: MeetingTab): void;
  onIntent(i: MeetingIntent): void;
}

export function MeetingScreen({ view, staffTalk, staffList = [], tab, readOnly, text = idText, onTab, onIntent }: MeetingScreenProps) {
  return (
    <section aria-label={wt('mt.title')} data-screen="people.meeting">
      <h1>{wt('mt.title')}</h1>
      <div role="tablist">
        {MEETING_TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => onTab(t)}>{wt(`mt.tab.${t}`)}</button>)}
      </div>
      {tab === 'player' ? (view ? <PlayerTalk m={view} text={text} readOnly={readOnly} onIntent={onIntent} /> : <p className="gm-line">{wt('mt.pick')}</p>) : null}
      {tab === 'staff' ? (
        <>
          {staffList.length ? (
            <p role="group" aria-label={wt('mt.staff.pick')}>
              {staffList.map((m) => <button key={m.personId} type="button" aria-pressed={staffTalk?.staffId === m.personId} onClick={() => onIntent({ kind: 'pickStaff', staffId: m.personId })}>{m.name}</button>)}
            </p>
          ) : null}
          <StaffTalk o={staffTalk} text={text} readOnly={readOnly} onIntent={onIntent} />
        </>
      ) : null}
      {tab === 'promises' ? (
        <div data-tab="promises">
          <Section title={wt('mt.tracker')}>
            {view && view.tracker.length ? <ul>{view.tracker.map((p) => <PromiseLine key={p.promiseId} p={p} text={text} />)}</ul> : <p className="gm-line">{wt('mt.tracker.none')}</p>}
          </Section>
          {view ? (
            <Section title={wt('mt.honesty')}>
              <p data-honesty>{wt('mt.honesty.row', { kept: view.honesty.kept, broken: view.honesty.broken, caught: view.honesty.caughtOut, public: view.honesty.contradictedInPublic })}</p>
            </Section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

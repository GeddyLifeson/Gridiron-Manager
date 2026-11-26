// Office screens (G-72; O1.2.1 today view, O1.2.2 inbox and decision queue, O1.2.3 advancing time). Three
// columns on the Today screen: the day, the schedule, the inbox, with hours left and energy in the footer.
// No logic of its own: order, weights, blocks and blockers arrive in the read model.
import { v } from '../../tokens/index.ts';
import { dateText, minutesText, ot, type AdvanceTarget, type HomeIntent, type TextOf, type UiHome } from './view.ts';

const col = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px' };
const idText: TextOf = (k) => k;
const clock = (m: number) => `${String(Math.trunc(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export interface HomeProps { view: UiHome | null; readOnly: boolean; text?: TextOf; onIntent(i: HomeIntent): void }

export function InboxList({ view, readOnly, text = idText, onIntent }: HomeProps) {
  if (!view) return <p className="gm-line">{ot('of.none')}</p>;
  if (!view.inbox.length) return <p className="gm-line">{ot('of.inboxEmpty')}</p>;
  return (
    <ol aria-label={ot('of.inbox')} data-inbox>
      {view.inbox.map((i) => (
        <li key={i.itemId} data-item={i.itemId} data-weight={i.weight} style={{ fontWeight: i.unread ? 700 : 400 }}>
          <span data-weight-mark>[{ot(`of.weight.${i.weight}`)}]</span>{' '}
          {text(i.subjectKey)}{' · '}{i.senderName ? ot('of.from', { name: i.senderName }) : ot('of.fromOffice')}
          {i.deadline ? ` · ${ot('of.due', { date: dateText(i.deadline) })}` : ''}
          {i.weight === 'should' && i.defaultCommand ? ` · ${ot('of.default', { default: text(i.defaultCommand) })}` : ''}
          {i.answerMinutes !== null ? ` · ${ot('of.cost', { cost: minutesText(i.answerMinutes) })}` : ''}
          {i.conflictsWith.length ? <span role="alert"> · {ot('of.conflict', { ids: i.conflictsWith.join(', ') })}</span> : null}{' '}
          {!readOnly && i.answerCommand ? <button type="button" onClick={() => onIntent({ kind: 'answer', itemId: i.itemId })}>{ot('of.answer')}</button> : null}
          {!readOnly && !i.answerCommand && i.unread ? <button type="button" onClick={() => onIntent({ kind: 'read', itemId: i.itemId })}>{ot('of.markRead')}</button> : null}
          {i.links.map((l) => <button key={l} type="button" onClick={() => onIntent({ kind: 'open', screenId: l })}>{ot('of.open')}</button>)}
        </li>
      ))}
    </ol>
  );
}

export function AdvancePanel({ view, readOnly, text = idText, onIntent }: HomeProps) {
  if (!view) return <p className="gm-line">{ot('of.none')}</p>;
  return (
    <section aria-label={ot('of.advance')} data-advance>
      {view.advance.filter((o) => o.to !== null).map((o) => (
        <div key={o.target} data-target={o.target} style={col}>
          <button type="button" disabled={readOnly || o.blockedBy.length > 0} onClick={() => onIntent({ kind: 'advance', target: o.target as AdvanceTarget })}>
            {ot('of.advance')}: {ot(`of.target.${o.target}`)} ({dateText(o.to!.date)} {clock(o.to!.minute)})
          </button>
          {o.blockedBy.length ? <p role="alert" data-blocked>{ot('of.blocked', { ids: o.blockedBy.join(', ') })}</p> : null}
          <p>{ot('of.runsWithout')}:</p>
          {o.runsWithout.length ? (
            <ul>{o.runsWithout.map((r) => <li key={r.blockId}>{ot('of.runsBy', { block: text(r.labelKey), date: dateText(r.date), name: r.byName ?? '' })}</li>)}</ul>
          ) : <p className="gm-line">{ot('of.nothingRuns')}</p>}
        </div>
      ))}
    </section>
  );
}

export function TodayScreen({ view, readOnly, text = idText, onIntent }: HomeProps) {
  if (!view) return <p className="gm-line">{ot('of.none')}</p>;
  const t = view.today;
  return (
    <div className="of-today" data-mode={t.mode}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr', gap: '12px' }}>
        <section style={col} aria-label={dateText(t.date)}>
          <h1>{dateText(t.date)}</h1>
          <p>{text(t.phaseKey)}</p>
          {t.dayLabelKey ? <p>{text(t.dayLabelKey)}</p> : null}
          {t.opponent && t.mode === 'game_day' ? <p>{ot('of.gameToday', { opponent: t.opponent.name })}</p> : null}
          {t.opponent && t.mode !== 'game_day' && t.daysToGame !== null ? <p>{ot('of.daysToGame', { days: t.daysToGame, opponent: t.opponent.name })}</p> : null}
        </section>
        <section style={col} aria-label={ot('of.schedule')}>
          <h2>{ot('of.schedule')}</h2>
          {t.mode === 'empty' ? (
            <div data-empty>
              {t.nextEvent ? <p>{ot('of.nextEvent', { event: text(t.nextEvent.labelKey), date: dateText(t.nextEvent.date) })}</p> : <p>{ot('of.none')}</p>}
              {!readOnly ? <button type="button" onClick={() => onIntent({ kind: 'advance', target: 'next_block' })}>{ot('of.advanceTo')}</button> : null}
            </div>
          ) : (
            <ol data-blocks>
              {t.blocks.map((b) => (
                <li key={b.blockId} data-block={b.blockId} data-run-by={b.runBy}>
                  {clock(b.startMinute)} {text(b.labelKey)}{' · '}
                  {b.runBy === 'coach' ? `${ot('of.you')}, ${minutesText(b.coachMinutes ?? b.minutes)}` : `${ot('of.delegate', { name: b.delegateName ?? '' })}${b.delegateNoteKey ? `: ${text(b.delegateNoteKey)}` : ''}`}
                  {b.requiredByRule ? ` · ${ot('of.rule')}` : ''}{' '}
                  {b.screenId ? <button type="button" onClick={() => onIntent({ kind: 'open', screenId: b.screenId! })}>{ot('of.open')}</button> : null}
                </li>
              ))}
            </ol>
          )}
          {t.mode === 'game_day' ? <button type="button" onClick={() => onIntent({ kind: 'open', screenId: 'game.console' })}>{ot('of.toGameHub')}</button> : null}
        </section>
        <section style={col} aria-label={ot('of.inbox')}>
          <h2>{ot('of.inbox')}</h2>
          <InboxList view={view} readOnly={readOnly} text={text} onIntent={onIntent} />
        </section>
      </div>
      <footer role="status" data-footer>
        {ot('of.hoursLeft', { left: minutesText(t.minutesLeftThisWeek) })}{t.energyKey ? ` · ${ot('of.energy', { energy: text(t.energyKey) })}` : ''}
      </footer>
    </div>
  );
}

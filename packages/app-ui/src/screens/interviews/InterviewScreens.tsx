// The user's interview screens (career/interviews; S6.4.1, E2.4.3, O4, O7). Draws read-model data only.
// coach.interview: he answers the panel's view questions (no right answer) and does the graded work in the
// job's own tools. people.hiring: he reads each candidate's record, referees, answers and graded work, marks
// each answer for how it sits with him, and offers, passes or delegates. No fit score, belief or craft is shown.
import type { interviewRoom } from '@gm/app-services';
import { v } from '../../tokens/index.ts';
import { it } from './text.ts';

type SitView = interviewRoom.SitView;
type SitAction = interviewRoom.SitAction;
type HireView = interviewRoom.HireView;
type HireAction = interviewRoom.HireAction;
type UiTask = interviewRoom.UiTask;

const box = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };

export interface SitSource {
  view(): SitView | null;
  act(a: SitAction): void;
}
export interface HireSource {
  view(): HireView | null;
  act(a: HireAction): void;
}

function Tasks({ tasks, onOpen, readOnly }: { tasks: readonly UiTask[]; onOpen?: (tool: string, taskId: string) => void; readOnly: boolean }) {
  return (
    <ul>
      {tasks.map((t) => (
        <li key={t.id} data-task={t.id} data-tool={t.tool}>
          {t.text}{' · '}
          {t.grade === null ? it('iv.task.todo') : it('iv.task.done', { grade: it(`grade.${t.grade}`) })}
          {!readOnly && onOpen && t.grade === null ? <>{' '}<button type="button" onClick={() => onOpen(t.tool, t.id)}>{it('iv.task.open')}</button></> : null}
        </li>
      ))}
    </ul>
  );
}

export interface InterviewScreenProps { source: SitSource; readOnly?: boolean; onOpenTool?(tool: string, taskId: string): void }

export function InterviewScreen({ source, readOnly = false, onOpenTool }: InterviewScreenProps) {
  const view = source.view();
  if (!view) return null;
  const open = view.stage === 'open' && !readOnly;
  return (
    <section data-screen="coach.interview" data-stage={view.stage}>
      <h2>{it('iv.title', { title: view.opening.title, team: view.opening.team })}</h2>
      <p className="gm-line">{it('iv.date', { date: view.opening.date })} · {it(`iv.stage.${view.stage}`)}</p>
      <h3>{it('iv.panel')}</h3>
      <ul>{view.panel.map((p) => <li key={p.name}>{p.lead ? it('iv.lead', { name: p.name }) : p.name}</li>)}</ul>
      <h3>{it('iv.views')}</h3>
      <p className="gm-line">{it('iv.views.note')}</p>
      {view.questions.map((q) => (
        <fieldset key={q.id} data-question={q.id} style={box} disabled={!open}>
          <legend>{q.text}</legend>
          {q.options.map((o) => (
            <label key={o.key} style={{ display: 'block' }}>
              <input type="radio" name={q.id} value={o.key} checked={q.chosen === o.key} onChange={() => source.act({ kind: 'answer', questionId: q.id, option: o.key })} /> {o.text}
            </label>
          ))}
          {q.declined ? <p className="gm-line" data-declined>{it('iv.declined')}</p>
            : open ? <button type="button" onClick={() => source.act({ kind: 'decline', questionId: q.id })}>{it('iv.decline')}</button> : null}
        </fieldset>
      ))}
      <h3>{it('iv.work')}</h3>
      <p className="gm-line">{it('iv.work.note')}</p>
      <Tasks tasks={view.tasks} onOpen={onOpenTool} readOnly={!open} />
      <p className="gm-line">{it('iv.progress', { done: view.done, total: view.questions.length })}</p>
      {open ? <button type="button" disabled={!view.canSubmit} onClick={() => source.act({ kind: 'submit' })}>{it('iv.submit')}</button> : null}
    </section>
  );
}

export interface HiringScreenProps { source: HireSource; readOnly?: boolean }

export function HiringScreen({ source, readOnly = false }: HiringScreenProps) {
  const view = source.view();
  if (!view) return null;
  const open = view.stage === 'reviewing' && !readOnly;
  return (
    <section data-screen="people.hiring" data-stage={view.stage}>
      <h2>{it('hr.title', { title: view.opening.title, team: view.opening.team })}</h2>
      <p className="gm-line">{it(`hr.stage.${view.stage}`, { name: view.delegateTo ?? '' })}</p>
      {open && view.delegateTo !== null ? <button type="button" onClick={() => source.act({ kind: 'delegate' })}>{it('hr.delegate', { name: view.delegateTo })}</button> : null}
      {view.candidates.length === 0 ? <p>{it('hr.none')}</p> : null}
      {view.candidates.map((c) => (
        <article key={c.personId} data-candidate={c.personId} data-passed={c.passed ? '1' : undefined} style={box}>
          <h3>{c.name}</h3>
          <p className="gm-line">{it('hr.record', { record: c.record })}</p>
          <h4>{it('hr.refs')}</h4>
          {c.referrals.length === 0 ? <p className="gm-line">{it('hr.refs.none')}</p> : (
            <ul>{c.referrals.map((r) => <li key={r.name}>{it('hr.ref', { name: r.name, says: it(`ref.${r.says}`), toYou: it(`tie.${r.toYou}`) })}</li>)}</ul>
          )}
          <h4>{it('hr.answers')}</h4>
          <p className="gm-line">{it('hr.answers.note')}</p>
          <ul>
            {c.answers.map((a) => (
              <li key={a.questionId} data-question={a.questionId} data-mark={a.mark ?? undefined}>
                <em>{a.question}</em><br />{a.said ?? it('hr.said.none')}
                {open && !c.passed ? (
                  <span role="group">{' '}
                    <button type="button" aria-pressed={a.mark === 'with'} onClick={() => source.act({ kind: 'mark', personId: c.personId, questionId: a.questionId, mark: 'with' })}>{it('hr.with')}</button>{' '}
                    <button type="button" aria-pressed={a.mark === 'against'} onClick={() => source.act({ kind: 'mark', personId: c.personId, questionId: a.questionId, mark: 'against' })}>{it('hr.against')}</button>{' '}
                    {a.mark !== null ? <button type="button" onClick={() => source.act({ kind: 'mark', personId: c.personId, questionId: a.questionId, mark: null })}>{it('hr.clear')}</button> : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="gm-line">{it('hr.tally', { with: c.withYou, against: c.against })}</p>
          <h4>{it('hr.work')}</h4>
          <Tasks tasks={c.tasks} readOnly />
          {c.passed ? <p className="gm-line">{it('hr.passed')}</p> : c.offered ? <p className="gm-line">{it('hr.offered')}</p> : open ? (
            <div role="group">
              <button type="button" onClick={() => source.act({ kind: 'offer', personId: c.personId })}>{it('hr.offer')}</button>{' '}
              <button type="button" onClick={() => source.act({ kind: 'pass', personId: c.personId })}>{it('hr.pass')}</button>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}

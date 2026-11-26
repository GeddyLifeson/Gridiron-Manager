// The assignment list (O7.2.1): what a coach below head coach starts his day with. Each row names the task,
// who set it, the due time, the estimated hours and its state; opening goes to the work screen, submitting
// sends it to the boss. The submit control renders only when the seat holds the command (O7.1.1).
import type { ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import { ct } from './text.ts';
import type { AssignmentsView } from './types.ts';

export interface AssignmentListProps {
  view: AssignmentsView;
  onOpen?(screenId: string, dutyId: string): void;
  onCommand?(command: string, dutyId: string): void;
}

export function AssignmentList({ view, onOpen, onCommand }: AssignmentListProps): ReactNode {
  const held = new Set(view.rights);
  const from = view.rows.some((r) => r.assignedBy === 'boss') && view.bossName ? ct('asg.from.boss', { boss: view.bossName }) : ct('asg.from.self');
  return (
    <section className="gm-assignments" aria-label={ct('asg.title')}>
      <h2 style={{ fontSize: '1rem' }}>{ct('asg.title')}</h2>
      <p className="gm-line">{view.jobTitle} · {from} · {ct('asg.free', { hours: view.freeHours })}</p>
      {view.rows.length === 0 ? <p>{ct('asg.none')}</p> : (
        <ol>
          {view.rows.map((r) => (
            <li key={r.dutyId} data-duty={r.dutyId} data-state={r.state} style={{ borderLeft: `4px solid ${v(r.status === 'late' ? 'state.bad' : 'line.default')}`, paddingLeft: '6px', marginBottom: '4px' }}>
              <strong>{r.title}</strong> <span className="gm-perm">{ct(`state.${r.state}`)}</span>{' '}
              <span>{r.due ? ct('asg.due', { day: r.due.day, time: r.due.time }) : ct('asg.noDue')}</span> · <span>{ct('asg.hours', { hours: r.hoursEst })}</span> · <span>{ct(`status.${r.status}`)}</span>
              {r.grade ? <span> · {r.grade.mark}: {r.grade.feedback}</span> : null}{' '}
              <button type="button" onClick={() => onOpen?.(r.screenId, r.dutyId)}>{ct('asg.open')}</button>
              {r.command && held.has(r.command) && r.status !== 'graded' ? (
                <button type="button" data-command={r.command} onClick={() => onCommand?.(r.command!, r.dutyId)}>{ct(r.command.startsWith('suggest:') ? 'asg.suggest' : 'asg.submit')}</button>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

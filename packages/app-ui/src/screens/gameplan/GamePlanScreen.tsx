// Game plan builder screen (G-68 screens; O3.4.1 over G6). Three columns: the opponent's looks by situation
// with rate and sample size, the plan by situation with readiness and reps, and the book filtered to the
// selected situation. Holds no football logic: every count, warning and lock arrives in the read model. The
// screen shows cost and never suggests plays; a coordinator's draft shows as a proposal to accept or reject.
// Everything works by keyboard: adding is a button per book row (the drag of O3.4.1 has this as its keyboard
// path, Q1.5.2).
import { useState, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import { gt, lookText, PLAN_TABS, readinessText, type GameplanIntent, type GameplanLock, type GameplanView, type MatchupRuleKind, type PlanTab, type PlanView } from './view.ts';

export interface GamePlanScreenProps {
  view: GameplanView | null;
  tab: PlanTab;
  readOnly: boolean;
  onTab(tab: PlanTab): void;
  onSelectSituation(id: string | null): void;
  onIntent(intent: GameplanIntent): void;
}

export const panel = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };

export function Badge({ colour, children }: { colour: string; children: ReactNode }) {
  return <span className="gp-badge" style={{ borderLeft: `4px solid ${v(colour)}`, paddingLeft: '4px' }}>{children}</span>;
}

/** A control under a lock: allowed runs the action; held elsewhere names the holder. */
export function Action({ lock, readOnly, label, onClick, disabled }: { lock: GameplanLock; readOnly: boolean; label: string; onClick(): void; disabled?: boolean }) {
  if (readOnly) return null;
  if (lock.allowed) return <button type="button" disabled={disabled} onClick={onClick}>{label}</button>;
  return <span className="gm-line" data-locked="true">{gt('gp.lock.heldBy', { holder: gt(`gp.holder.${lock.heldBy ?? 'head_coach'}`) })}</span>;
}

export function Warnings({ list }: { list: readonly { leaf: string; code: string; subject: string; text: string; severity: string }[] }) {
  if (!list.length) return <p className="gm-line">{gt('gp.noWarnings')}</p>;
  return (
    <ul className="gp-warnings">
      {list.map((w, i) => <li key={`${w.code}-${w.subject}-${i}`} data-severity={w.severity}><Badge colour={w.severity === 'warning' ? 'state.caution' : 'state.neutral'}>{w.leaf}</Badge> {w.text}</li>)}
    </ul>
  );
}

function Looks({ plan }: { plan: PlanView }) {
  return (
    <section className="gp-looks" style={panel} aria-label={gt('gp.looks.title')}>
      <h3>{gt('gp.looks.title')}</h3>
      {plan.looksStale ? <p><Badge colour="state.caution">{gt('gp.looks.stale')}</Badge></p> : null}
      {plan.callerChanged ? <p><Badge colour="state.caution">{gt('gp.looks.callerChanged')}</Badge></p> : null}
      <table>
        <thead><tr><th scope="col">{gt('gp.looks.bucket')}</th><th scope="col">{gt('gp.looks.look')}</th><th scope="col">{gt('gp.looks.seen')}</th></tr></thead>
        <tbody>{plan.looks.map((l) => <tr key={`${l.bucket}/${l.look}`}><td>{l.bucket}</td><td>{l.look}</td><td>{lookText(l)}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function Plan({ view, readOnly, onSelect, onIntent }: { view: GameplanView; readOnly: boolean; onSelect(id: string | null): void; onIntent(i: GameplanIntent): void }) {
  const plan = view.plan;
  return (
    <section className="gp-plan" style={panel} aria-label={gt('gp.plan.title')}>
      <h3>{gt('gp.plan.title')}</h3>
      {plan.situations.length === 0 ? <p className="gm-line">{gt('gp.plan.empty')}</p> : null}
      {plan.situations.map((s) => (
        <div key={s.id} data-situation={s.id} data-selected={plan.selected === s.id ? 'true' : undefined}>
          <h4><button type="button" aria-pressed={plan.selected === s.id} onClick={() => onSelect(plan.selected === s.id ? null : s.id)}>{s.label}</button></h4>
          <table>
            <thead><tr><th scope="col">{gt('gp.col.call')}</th><th scope="col">{gt('gp.col.readiness')}</th><th scope="col">{gt('gp.col.reps')}</th><th scope="col" /></tr></thead>
            <tbody>
              {s.entries.map((e) => (
                <tr key={e.entryId} data-entry={e.entryId} data-broken={e.broken ? 'true' : undefined}>
                  <th scope="row">{e.call}{e.isNew ? <> <Badge colour="state.neutral">{gt('gp.new')}</Badge></> : null}{e.broken ? <> <Badge colour="state.bad">{gt('gp.broken')}</Badge></> : null}</th>
                  <td>{readinessText(e.readinessEstimate)}</td>
                  <td>{gt('gp.reps', { done: e.repsAssigned, target: e.targetReps })}</td>
                  <td><Action lock={view.locks.build} readOnly={readOnly} label={gt('gp.action.remove', { call: e.call })} onClick={() => onIntent({ kind: 'remove_from_plan', entryId: e.entryId })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

function Book({ view, readOnly, onIntent }: { view: GameplanView; readOnly: boolean; onIntent(i: GameplanIntent): void }) {
  const sel = view.plan.selected;
  return (
    <section className="gp-book" style={panel} aria-label={gt('gp.book.title')}>
      <h3>{sel ? gt('gp.book.fits', { situation: view.plan.situations.find((s) => s.id === sel)?.label ?? sel }) : gt('gp.book.title')}</h3>
      <table>
        <tbody>
          {view.plan.book.map((b) => (
            <tr key={b.playId} data-play={b.playId}>
              <th scope="row">{b.call}</th><td>{b.section}</td>
              <td>{b.inPlan ? gt('gp.book.inPlan') : null}</td>
              <td>{sel ? <Action lock={view.locks.build} readOnly={readOnly} label={gt('gp.action.add', { call: b.call })} onClick={() => onIntent({ kind: 'add_to_plan', playId: b.playId, situationId: sel })} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!sel ? <p className="gm-line">{gt('gp.book.pick')}</p> : null}
    </section>
  );
}

function Summary({ view }: { view: GameplanView }) {
  const s = view.plan.summary;
  return (
    <section className="gp-summary" style={panel} aria-label={gt('gp.summary.title')}>
      <span data-total={s.total}>{gt('gp.summary.total', { n: s.total })}</span>{' · '}
      <span>{gt('gp.summary.new', { n: s.newThisWeek })}</span>{' · '}
      <span data-over={s.unitsUsed > s.capacity ? 'true' : undefined}>{gt('gp.summary.units', { used: s.unitsUsed, capacity: s.capacity })}</span>{' · '}
      <span data-over={s.repsAssigned > s.repsAvailable ? 'true' : undefined}>{gt('gp.summary.reps', { used: s.repsAssigned, available: s.repsAvailable })}</span>{' · '}
      <span>{gt('gp.summary.runPass', { run: s.runPass.run, pass: s.runPass.pass, other: s.runPass.other })}</span>
    </section>
  );
}

function Proposal({ view, readOnly, onIntent }: { view: GameplanView; readOnly: boolean; onIntent(i: GameplanIntent): void }) {
  const p = view.plan.proposal;
  if (!p) return null;
  return (
    <section className="gp-proposal" style={panel} data-proposal={p.id} aria-label={gt('gp.proposal.title')}>
      <strong>{gt('gp.proposal.title')}</strong> {gt('gp.proposal.from', { from: p.from, n: p.entries })}
      <span className="gm-line"> {gt('gp.proposal.diff', { added: p.added.length, removed: p.removed.length })}</span>{' '}
      <Action lock={view.locks.build} readOnly={readOnly} label={gt('gp.proposal.accept')} onClick={() => onIntent({ kind: 'accept_proposal' })} />{' '}
      <Action lock={view.locks.build} readOnly={readOnly} label={gt('gp.proposal.reject')} onClick={() => onIntent({ kind: 'reject_proposal' })} />
    </section>
  );
}

const RULES: readonly MatchupRuleKind[] = ['target', 'avoid', 'double'];

function Matchups({ view, readOnly, onIntent }: { view: GameplanView; readOnly: boolean; onIntent(i: GameplanIntent): void }) {
  const [ours, setOurs] = useState('');
  const [theirs, setTheirs] = useState('');
  const [rule, setRule] = useState<MatchupRuleKind>('target');
  const editable = !readOnly && view.locks.build.allowed;
  return (
    <section className="gp-matchups" style={panel} aria-label={gt('gp.matchups.title')}>
      <h3>{gt('gp.matchups.title')}</h3>
      <table>
        <thead><tr><th scope="col">{gt('gp.matchups.ours')}</th><th scope="col">{gt('gp.matchups.theirs')}</th><th scope="col">{gt('gp.matchups.rule')}</th><th scope="col" /></tr></thead>
        <tbody>
          {view.plan.matchups.map((m) => (
            <tr key={m.id} data-matchup={m.id}>
              <td>{m.ours}</td><td>{m.theirs}</td>
              <td>{editable ? (
                <select aria-label={gt('gp.matchups.ruleFor', { ours: m.ours, theirs: m.theirs })} value={m.rule} onChange={(e) => onIntent({ kind: 'set_matchup', rule: { ...m, rule: e.target.value as MatchupRuleKind } })}>
                  {RULES.map((r) => <option key={r} value={r}>{gt(`gp.matchups.${r}`)}</option>)}
                </select>
              ) : gt(`gp.matchups.${m.rule}`)}</td>
              <td><Action lock={view.locks.build} readOnly={readOnly} label={gt('gp.action.removeMatchup', { ours: m.ours, theirs: m.theirs })} onClick={() => onIntent({ kind: 'remove_matchup', id: m.id })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {editable ? (
        <form onSubmit={(e) => { e.preventDefault(); if (ours && theirs) { onIntent({ kind: 'set_matchup', rule: { id: `${ours}>${theirs}`, ours, theirs, rule } }); setOurs(''); setTheirs(''); } }}>
          <label>{gt('gp.matchups.ours')} <input value={ours} onChange={(e) => setOurs(e.target.value)} /></label>{' '}
          <label>{gt('gp.matchups.theirs')} <input value={theirs} onChange={(e) => setTheirs(e.target.value)} /></label>{' '}
          <select aria-label={gt('gp.matchups.rule')} value={rule} onChange={(e) => setRule(e.target.value as MatchupRuleKind)}>{RULES.map((r) => <option key={r} value={r}>{gt(`gp.matchups.${r}`)}</option>)}</select>{' '}
          <button type="submit">{gt('gp.matchups.add')}</button>
        </form>
      ) : null}
    </section>
  );
}

function Review({ view, readOnly, onIntent }: { view: GameplanView; readOnly: boolean; onIntent(i: GameplanIntent): void }) {
  const a = view.plan.approval;
  const [notes, setNotes] = useState('');
  return (
    <section className="gp-plan-review" style={panel} aria-label={gt('gp.review.title')}>
      <h3>{gt('gp.review.title')}</h3>
      <p data-approval={a.state}>{gt(`gp.approval.${a.state}`, { by: a.by ?? '', notes: a.notes ?? '' })}</p>
      <Warnings list={view.plan.warnings} />
      <Action lock={view.locks.build} readOnly={readOnly} label={gt('gp.action.submit')} disabled={a.state === 'approved'} onClick={() => onIntent({ kind: 'submit_plan' })} />{' '}
      <Action lock={view.locks.approve} readOnly={readOnly} label={gt('gp.action.approve')} disabled={a.state === 'approved'} onClick={() => onIntent({ kind: 'approve_plan' })} />{' '}
      {!readOnly && view.locks.approve.allowed ? (
        <form style={{ display: 'inline' }} onSubmit={(e) => { e.preventDefault(); if (notes.trim()) { onIntent({ kind: 'send_back_plan', notes }); setNotes(''); } }}>
          <label>{gt('gp.review.notes')} <input value={notes} onChange={(e) => setNotes(e.target.value)} /></label> <button type="submit" disabled={a.state === 'approved'}>{gt('gp.action.sendBack')}</button>
        </form>
      ) : null}
    </section>
  );
}

export function GamePlanScreen({ view, tab, readOnly, onTab, onSelectSituation, onIntent }: GamePlanScreenProps) {
  if (!view) return <p className="gm-line">{gt('gp.none')}</p>;
  return (
    <div className="gp-screen" data-unit={view.unit}>
      <div role="tablist" aria-label={gt('gp.tabs')}>
        {PLAN_TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => onTab(t)}>{gt(`gp.tab.${t}`)}</button>)}
      </div>
      <Summary view={view} />
      <Proposal view={view} readOnly={readOnly} onIntent={onIntent} />
      {tab === 'plan' ? (
        <div className="gp-columns" style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr', gap: '8px' }}>
          <Looks plan={view.plan} />
          <Plan view={view} readOnly={readOnly} onSelect={onSelectSituation} onIntent={onIntent} />
          <Book view={view} readOnly={readOnly} onIntent={onIntent} />
        </div>
      ) : null}
      {tab === 'matchups' ? <Matchups view={view} readOnly={readOnly} onIntent={onIntent} /> : null}
      {tab === 'review' ? <Review view={view} readOnly={readOnly} onIntent={onIntent} /> : null}
    </div>
  );
}

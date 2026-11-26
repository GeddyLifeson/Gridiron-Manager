// Call sheet editor (G-68 screens; O3.4.2 over G7) with the scripts (G7.4), the wristband and audibles (G7.6),
// the head coach card (G7.5.3), the pre-lock review (G7.9.1) and print (O3.4.3). The layout is drawn on the
// sheet's own grid so the sheet shown in the game is the editor's layout (O3.4.2 acceptance 2). Holds no
// football logic: keys, coverage, expected snaps, review items and print boxes all arrive in the read model.
import { useState } from 'react';
import { v } from '../../tokens/index.ts';
import { Action, Badge, panel, Warnings } from './GamePlanScreen.tsx';
import { gt, PAPERS, readinessText, SHEET_TABS, type CardView, type GameplanIntent, type GameplanView, type SheetBoxRow, type SheetTab } from './view.ts';

export interface CallSheetScreenProps {
  view: GameplanView | null;
  tab: SheetTab;
  readOnly: boolean;
  onTab(tab: SheetTab): void;
  onIntent(intent: GameplanIntent): void;
}

const pct = (x: number, of: number) => `${(x / of) * 100}%`;

function BoxView({ b, view, readOnly, onIntent }: { b: SheetBoxRow; view: GameplanView; readOnly: boolean; onIntent(i: GameplanIntent): void }) {
  const page = view.sheet.page;
  const [pick, setPick] = useState('');
  const editable = !readOnly && view.locks.build.allowed && view.sheet.lockedAt === null;
  return (
    <section className="gp-box" data-box={b.id} aria-label={b.title}
      style={{ position: 'absolute', left: pct(b.col, page.cols), top: pct(b.row, page.rows), width: pct(b.w, page.cols), height: pct(b.h, page.rows), border: `1px solid ${v('line.default')}`, borderTop: `4px solid ${b.colour}`, background: v('surface.raised'), overflow: 'auto', fontSize: '11px' }}>
      <header><kbd>{b.key}</kbd> <strong>{b.title}</strong>
        {b.expectedSnaps !== null ? <span className="gm-line"> {gt('gp.box.expected', { snaps: b.expectedSnaps, source: gt(`gp.source.${b.expectedSource ?? 'league'}`), games: b.expectedGames ?? 0 })}</span> : null}
        {b.depthMark ? <> <Badge colour={b.depthMark === 'thin' ? 'state.caution' : 'state.neutral'}>{gt(`gp.box.${b.depthMark}`)}</Badge></> : null}
      </header>
      <ol>
        {b.entries.map((e, i) => (
          <li key={e.id} data-entry={e.id} data-broken={e.broken ? 'true' : undefined} data-off-plan={e.notInPlan ? 'true' : undefined}>
            <kbd>{e.key}</kbd> {e.call}
            {e.bandNumber ? <span className="gm-line"> #{e.bandNumber}</span> : null}
            <span className="gm-line"> {readinessText(e.readinessEstimate)} · {gt('gp.entry.called', { n: e.timesCalled })}</span>
            {e.note ? <span className="gm-line"> ({e.note})</span> : null}
            {e.notInPlan ? <> <Badge colour="state.caution">{gt('gp.entry.offPlan')}</Badge></> : null}
            {e.broken ? <> <Badge colour="state.bad">{gt('gp.broken')}</Badge></> : null}
            {e.overLimit ? <> <Badge colour="state.caution">{gt('gp.entry.overLimit')}</Badge></> : null}
            {editable ? (
              <>
                {' '}<button type="button" aria-label={gt('gp.action.up', { call: e.call })} disabled={i === 0} onClick={() => onIntent({ kind: 'move_entry', boxId: b.id, entryId: e.id, by: -1 })}>↑</button>
                <button type="button" aria-label={gt('gp.action.down', { call: e.call })} disabled={i === b.entries.length - 1} onClick={() => onIntent({ kind: 'move_entry', boxId: b.id, entryId: e.id, by: 1 })}>↓</button>
                <button type="button" aria-label={gt('gp.action.remove', { call: e.call })} onClick={() => onIntent({ kind: 'remove_entry', boxId: b.id, entryId: e.id })}>×</button>
              </>
            ) : null}
          </li>
        ))}
      </ol>
      {editable ? (
        <form onSubmit={(ev) => { ev.preventDefault(); if (pick) { onIntent({ kind: 'add_entry', boxId: b.id, playId: pick }); setPick(''); } }}>
          <select aria-label={gt('gp.box.addTo', { box: b.title })} value={pick} onChange={(ev) => setPick(ev.target.value)}>
            <option value="">{gt('gp.box.pick')}</option>
            {view.plan.situations.flatMap((s) => s.entries).filter((e, i, all) => all.findIndex((x) => x.playId === e.playId) === i).map((e) => <option key={e.playId} value={e.playId}>{e.call}</option>)}
          </select> <button type="submit">{gt('gp.box.add')}</button>
        </form>
      ) : null}
    </section>
  );
}

function Layout({ view, readOnly, onIntent }: { view: GameplanView; readOnly: boolean; onIntent(i: GameplanIntent): void }) {
  const s = view.sheet;
  const ratio = s.page.orientation === 'landscape' ? '11 / 8.5' : '8.5 / 11';
  return (
    <>
      <section style={panel} className="gp-meters" aria-label={gt('gp.meters')}>
        {gt('gp.density', { a: s.density.entriesBySide[0] ?? 0, b: s.density.entriesBySide[1] ?? 0, pt: s.density.smallestTextPt })}{' · '}
        {gt('gp.size', { unique: s.size.unique, reps: s.size.repsAvailable })}{s.size.overReps ? <> <Badge colour="state.caution">{gt('gp.size.over')}</Badge></> : null}
        {s.lockedAt !== null ? <> <Badge colour="state.neutral">{gt('gp.locked', { version: s.version })}</Badge></> : null}
        {s.layoutProblems.map((p, i) => <div key={i} data-problem={p.kind}><Badge colour="state.bad">{gt(`gp.layout.${p.kind}`, { boxes: p.boxes.join(', ') })}</Badge></div>)}
        {s.tooLongKeys.length ? <div><Badge colour="state.caution">{gt('gp.keys.tooLong', { list: s.tooLongKeys.join(', ') })}</Badge></div> : null}
        <Warnings list={s.warnings} />
      </section>
      {[0, 1].map((side) => (
        <div key={side} className="gp-side" data-side={side} aria-label={gt('gp.side', { n: side + 1 })} style={{ position: 'relative', width: '100%', aspectRatio: ratio, border: `2px solid ${v('line.default')}`, margin: '8px 0', background: v('surface.panel') }}>
          {s.boxes.filter((b) => b.side === side).map((b) => <BoxView key={b.id} b={b} view={view} readOnly={readOnly} onIntent={onIntent} />)}
        </div>
      ))}
    </>
  );
}

function Coverage({ view }: { view: GameplanView }) {
  const s = view.sheet;
  const zones = [...new Set(s.coverage.map((c) => c.zone))];
  const dists = [...new Set(s.coverage.map((c) => c.distance))];
  const title = new Map(s.boxes.map((b) => [b.id, `${b.key} ${b.title}`] as const));
  return (
    <section style={panel} className="gp-coverage" aria-label={gt('gp.coverage.title')}>
      <h3>{gt('gp.coverage.title')}</h3>
      <p className="gm-line">{gt('gp.coverage.grid', { unmatched: s.unmatchedStates, shadowed: s.shadowedStates })}</p>
      {[1, 2, 3, 4].map((down) => (
        <table key={down} data-down={down}>
          <caption>{gt('gp.coverage.down', { down })}</caption>
          <thead><tr><th scope="col" />{zones.map((z) => <th key={z} scope="col">{z}</th>)}</tr></thead>
          <tbody>{dists.map((d) => (
            <tr key={d}><th scope="row">{d}</th>{zones.map((z) => {
              const c = s.coverage.find((x) => x.down === down && x.distance === d && x.zone === z);
              return <td key={z} data-gap={c?.boxId ? undefined : 'true'}>{c?.boxId ? title.get(c.boxId) ?? c.boxId : <Badge colour="state.bad">{gt('gp.coverage.none')}</Badge>}</td>;
            })}</tr>
          ))}</tbody>
        </table>
      ))}
      <h4>{gt('gp.catalogue.title')}</h4>
      <table>
        <tbody>{s.catalogue.filter((c) => c.status === 'missing' || c.status === 'partly').map((c) => (
          <tr key={c.id} data-row={c.id} data-status={c.status}><th scope="row">{c.label}</th><td>{gt(`gp.catalogue.${c.status}`)}</td><td>{gt('gp.catalogue.tier', { tier: c.tier })}</td><td>{c.expectedSnaps === null ? '' : gt('gp.catalogue.snaps', { snaps: c.expectedSnaps })}</td></tr>
        ))}</tbody>
      </table>
    </section>
  );
}

function Script({ view }: { view: GameplanView }) {
  const s = view.script;
  const counts = (o: Readonly<Record<string, number>>) => Object.entries(o).map(([k, n]) => `${k} ${n}`).join(', ');
  const list = (rows: typeof s.opening) => (
    <ol>{rows.map((r) => <li key={r.id} data-script={r.id}>{r.call} <span className="gm-line">· {gt(`gp.purpose.${r.purpose}`)}{r.purposeText ? `: ${r.purposeText}` : ''}{r.watchingFor ? ` · ${gt('gp.script.watching', { what: r.watchingFor })}` : ''}</span></li>)}</ol>
  );
  return (
    <section style={panel} className="gp-script" aria-label={gt('gp.script.title')}>
      <h3>{gt('gp.script.title')} <span className="gm-line">({gt(`gp.scriptMode.${s.mode}`)})</span></h3>
      {list(s.opening)}
      <p className="gm-line">{gt('gp.script.variety', { personnel: counts(s.variety.personnel), formation: counts(s.variety.formation), runPass: counts(s.variety.runPass), direction: counts(s.variety.direction) })}</p>
      {s.reveals.length ? <p className="gm-line">{gt('gp.script.reveals', { list: s.reveals.join(', ') })}</p> : null}
      <h4>{gt('gp.script.secondHalf')}</h4>
      {list(s.secondHalf)}
      <h4>{gt('gp.mustCalls')}</h4>
      <ul>{s.mustCalls.map((m) => <li key={m.id}>{m.call} <span className="gm-line">· {m.target === 'by_half' ? gt('gp.must.byHalf') : gt('gp.must.atLeast', { n: m.target.split(':')[1] ?? '' })}</span></li>)}</ul>
      <h4>{gt('gp.notes')}</h4>
      <ul>{s.notes.map((n) => <li key={n.id} data-kind={n.kind}>{n.text}</li>)}</ul>
      <Warnings list={s.warnings} />
    </section>
  );
}

function Wristband({ view, readOnly, onIntent }: { view: GameplanView; readOnly: boolean; onIntent(i: GameplanIntent): void }) {
  const w = view.wristband;
  return (
    <section style={panel} className="gp-band" aria-label={gt('gp.band.title')}>
      <h3>{gt('gp.band.title')}</h3>
      <p className="gm-line">{gt('gp.band.relay', { relay: gt(`gp.relay.${w.relay}`), freedom: gt(`gp.freedom.${w.qbFreedom}`) })}</p>
      <table><tbody>{w.cells.map((c) => <tr key={c.label} data-cell={c.label}><th scope="row">{c.label}</th><td>{c.call}</td></tr>)}</tbody></table>
      {w.problems.map((p, i) => <div key={i}><Badge colour="state.bad">{p}</Badge></div>)}
      {view.sheet.lockedAt === null ? <Action lock={view.locks.build} readOnly={readOnly} label={gt('gp.band.fill')} onClick={() => onIntent({ kind: 'fill_band' })} /> : null}
      <h4>{gt('gp.audibles')}</h4>
      <ul>{w.audibles.map((a) => <li key={a.name}><strong>{a.name}</strong> {a.call}</li>)}</ul>
      <Warnings list={w.warnings} />
    </section>
  );
}

const FOURTH: readonly ('go' | 'field_goal' | 'punt')[] = ['go', 'field_goal', 'punt'];

function Card({ card, view, readOnly, onIntent }: { card: CardView | null; view: GameplanView; readOnly: boolean; onIntent(i: GameplanIntent): void }) {
  if (!card) return <p className="gm-line">{gt('gp.card.none')}</p>;
  const editable = !readOnly && view.locks.card.allowed;
  const dists = [...new Set(card.fourth.map((c) => c.distanceYd))].sort((a, b) => a - b);
  const ytgs = [...new Set(card.fourth.map((c) => c.yardsToGoalYd))].sort((a, b) => b - a);
  const stale = (block: string) => card.stale.includes(block) ? <> <Badge colour="state.caution">{gt('gp.card.stale')}</Badge>{editable ? <> <button type="button" onClick={() => onIntent({ kind: 'refresh_card_block', block })}>{gt('gp.card.refresh')}</button></> : null}</> : null;
  return (
    <section style={panel} className="gp-card" aria-label={gt('gp.card.title')}>
      <h3>{gt('gp.card.title')}</h3>
      <h4>{gt('gp.card.fourth')}{stale('fourth')}</h4>
      <table data-block="fourth">
        <thead><tr><th scope="col">{gt('gp.card.toGo')}</th>{ytgs.map((y) => <th key={y} scope="col">{gt('gp.card.ytg', { y })}</th>)}</tr></thead>
        <tbody>{dists.map((d) => (
          <tr key={d}><th scope="row">{d}</th>{ytgs.map((y) => {
            const c = card.fourth.find((x) => x.distanceYd === d && x.yardsToGoalYd === y);
            if (!c) return <td key={y} />;
            return (
              <td key={y} data-edited={c.edited ? 'true' : undefined}>
                {editable ? (
                  <select aria-label={gt('gp.card.cell', { d, y })} value={c.call} onChange={(e) => onIntent({ kind: 'edit_fourth', distanceYd: d, yardsToGoalYd: y, call: e.target.value as 'go' | 'field_goal' | 'punt' })}>
                    {FOURTH.map((f) => <option key={f} value={f}>{gt(`gp.fourth.${f}`)}</option>)}
                  </select>
                ) : gt(`gp.fourth.${c.call}`)}{c.edited ? '*' : ''}
              </td>
            );
          })}</tr>
        ))}</tbody>
      </table>
      <h4>{gt('gp.card.twoPoint')}{stale('two_point')}</h4>
      <table data-block="two_point"><tbody>{card.twoPoint.map((r) => (
        <tr key={r.scoreDiff} data-edited={r.edited ? 'true' : undefined}><th scope="row">{gt('gp.card.diff', { diff: r.scoreDiff > 0 ? `+${r.scoreDiff}` : r.scoreDiff })}</th>
          <td>{editable ? <label><input type="checkbox" checked={r.goForTwo} onChange={(e) => onIntent({ kind: 'edit_two_point', scoreDiff: r.scoreDiff, goForTwo: e.target.checked })} /> {gt('gp.card.goForTwo')}</label> : (r.goForTwo ? gt('gp.card.goForTwo') : gt('gp.card.kick'))}{r.edited ? '*' : ''}</td></tr>
      ))}</tbody></table>
      <h4>{gt('gp.card.kneel')}</h4>
      <table data-block="kneel"><tbody>{card.kneel.map((k) => <tr key={k.opponentTimeouts}><th scope="row">{gt('gp.card.theirTimeouts', { n: k.opponentTimeouts })}</th><td>{gt('gp.card.kneelRow', { kneels: k.kneels, s: k.secondsKilled })}</td></tr>)}</tbody></table>
      <p>{gt('gp.card.fgLine', { with: card.fieldGoalLine.withWind ?? '-', into: card.fieldGoalLine.intoWind ?? '-' })}{stale('field_goal')}</p>
      <p className="gm-line">{gt('gp.card.inBounds', { s: card.inBoundsPlayS })}</p>
      {([['timeoutRules', card.timeoutRules], ['crewTendencies', card.crewTendencies], ['trickHistory', card.trickHistory], ['depthCard', card.depthCard], ['standingInstructions', card.standingInstructions]] as const).map(([k, list]) => (
        list.length ? <div key={k}><h4>{gt(`gp.card.${k}`)}</h4><ul>{list.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null
      ))}
      {card.edits.length ? <><h4>{gt('gp.card.edits')}</h4><ul>{card.edits.map((e, i) => <li key={i}>{gt('gp.card.edit', { block: e.block, cell: e.cell, from: e.from, to: e.to })}</li>)}</ul></> : null}
    </section>
  );
}

function Review({ view, readOnly, onIntent }: { view: GameplanView; readOnly: boolean; onIntent(i: GameplanIntent): void }) {
  const r = view.review;
  return (
    <section style={panel} className="gp-sheet-review" aria-label={gt('gp.lockReview.title')}>
      <h3>{gt('gp.lockReview.title')}</h3>
      {r.items.length === 0 ? <p className="gm-line">{gt('gp.noWarnings')}</p> : null}
      <ul>{r.items.map((x, i) => <li key={`${x.code}-${x.subject}-${i}`} data-code={x.code} data-blocks={x.blocks ? 'true' : undefined}><Badge colour={x.blocks ? 'state.bad' : 'state.caution'}>{gt(`gp.item.${x.code}`)}</Badge> {x.text}</li>)}</ul>
      {r.locked ? <p><Badge colour="state.neutral">{gt('gp.locked', { version: view.sheet.version })}</Badge></p> : (
        <Action lock={view.locks.build} readOnly={readOnly} label={r.items.length ? gt('gp.action.lockWith', { n: r.items.length }) : gt('gp.action.lock')} disabled={!r.canLock} onClick={() => onIntent({ kind: 'lock_sheet' })} />
      )}
      {!r.canLock && !r.locked ? <p className="gm-line">{gt('gp.lockReview.blocked')}</p> : null}
    </section>
  );
}

function Print({ view, onIntent }: { view: GameplanView; onIntent(i: GameplanIntent): void }) {
  const p = view.print;
  return (
    <section style={panel} className="gp-print" aria-label={gt('gp.print.title')}>
      <h3>{gt('gp.print.title')}</h3>
      <label>{gt('gp.print.paper')}{' '}
        <select value={p.paper} onChange={(e) => onIntent({ kind: 'print', paper: e.target.value as typeof p.paper, keyHints: p.keyHints })}>
          {PAPERS.map((x) => <option key={x} value={x}>{gt(`gp.paper.${x}`)}</option>)}
        </select>
      </label>{' '}
      <label><input type="checkbox" checked={p.keyHints} onChange={(e) => onIntent({ kind: 'print', paper: p.paper, keyHints: e.target.checked })} /> {gt('gp.print.keys')}</label>{' '}
      <button type="button" onClick={() => onIntent({ kind: 'export_sheet' })}>{gt('gp.print.export')}</button>
      {p.overflow ? <p><Badge colour="state.caution">{gt('gp.print.overflow', { n: p.overflow })}</Badge></p> : null}
      {[0, 1].map((side) => (
        <div key={side} data-print-side={side} aria-label={gt('gp.side', { n: side + 1 })} style={{ position: 'relative', width: '100%', aspectRatio: `${p.widthIn} / ${p.heightIn}`, border: `1px solid ${v('line.default')}`, margin: '8px 0', background: v('surface.raised') }}>
          {p.boxes.filter((b) => b.side === side).map((b) => (
            <div key={b.id} data-print-box={b.id} data-overflow={b.overflow ? 'true' : undefined} style={{ position: 'absolute', left: pct(b.xIn, p.widthIn), top: pct(b.yIn, p.heightIn), width: pct(b.wIn, p.widthIn), height: pct(b.hIn, p.heightIn), border: `1px solid ${v('line.default')}`, overflow: 'hidden', fontSize: `${b.textPt}pt`, color: v('text.ink') }}>
              {b.lines.map((l, i) => <div key={i} style={i === 0 ? { fontWeight: 'bold' } : undefined}>{l}</div>)}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

export function CallSheetScreen({ view, tab, readOnly, onTab, onIntent }: CallSheetScreenProps) {
  if (!view) return <p className="gm-line">{gt('gp.none')}</p>;
  return (
    <div className="gp-sheet-screen" data-unit={view.unit}>
      <div role="tablist" aria-label={gt('gp.tabs')}>
        {SHEET_TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => onTab(t)}>{gt(`gp.tab.${t}`)}</button>)}
      </div>
      {tab === 'layout' ? <Layout view={view} readOnly={readOnly} onIntent={onIntent} /> : null}
      {tab === 'coverage' ? <Coverage view={view} /> : null}
      {tab === 'script' ? <Script view={view} /> : null}
      {tab === 'wristband' ? <Wristband view={view} readOnly={readOnly} onIntent={onIntent} /> : null}
      {tab === 'card' ? <Card card={view.card} view={view} readOnly={readOnly} onIntent={onIntent} /> : null}
      {tab === 'review' ? <Review view={view} readOnly={readOnly} onIntent={onIntent} /> : null}
      {tab === 'print' ? <Print view={view} onIntent={onIntent} /> : null}
    </div>
  );
}

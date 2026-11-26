// Print and export view (O3.4.3, G7.9.2). Pages at true paper size in the Classic look: the call sheet
// front and back laid out from the read model's print boxes (same grid as the editor and the console, so
// box positions and entry order match), the wristband card, the opening and second-half scripts with a
// result column to tick off on the sideline, the head coach card and the plan summary. The browser build
// prints through the browser's print dialog (O3.4.3 edge case); the data file export is the call sheet
// command's. The screen holds no football logic.
import { v } from '../../tokens/index.ts';
import { resolveEraColours } from '../../presentation/era/index.ts';
import { tokenValue } from '../../tokens/index.ts';
import { gt, PAPERS, UNITS, type GameplanView, type Unit } from '../gameplan/view.ts';
import { DOCS, PAPER_TOKENS, pr, type Doc, type PrintIntent, type PrintUi } from './view.ts';

export interface PrintScreenProps {
  view: PrintUi | null;
  unit: Unit;
  docs: readonly Doc[];
  onUnit(unit: Unit): void;
  onIntent(intent: PrintIntent): void;
}

const CLASSIC = resolveEraColours({ theme: 'classic' });
const C = Object.fromEntries(Object.entries(PAPER_TOKENS).map(([k, path]) => [k, tokenValue(CLASSIC, path)])) as Record<keyof typeof PAPER_TOKENS, string>;
const FACE = "'Courier New', Courier, monospace";
const BODY_PT = 9;

const pct = (x: number, of: number) => `${(x / of) * 100}%`;

/** The print stylesheet: only the pages reach paper, one page per sheet at the chosen size, no margins. */
function printCss(widthIn: number, heightIn: number): string {
  return [
    `@page { size: ${widthIn}in ${heightIn}in; margin: 0; }`,
    '@media print {',
    '  .gm-top, .gm-hubs, .gm-crumbs, .gm-status, .pr-controls, .gm-main > h1 { display: none !important; }',
    `  html, body, .gm-shell, .gm-main { background: ${C.paper} !important; margin: 0 !important; padding: 0 !important; }`,
    '  .gm-shell { display: block !important; height: auto !important; overflow: visible !important; }',
    '  .gm-main, .pr-screen, .pr-pages { margin: 0 !important; padding: 0 !important; overflow: visible !important; }',
    '  .pr-page { box-shadow: none !important; margin: 0 !important; break-after: page; page-break-after: always; }',
    '  .pr-page:last-child { break-after: auto; page-break-after: auto; }',
    '}',
  ].join('\n');
}

function Page({ p, title, n, of, unit, alt, children }: { p: GameplanView['print']; title: string; n: number; of: number; unit: Unit; alt?: boolean; children: React.ReactNode }) {
  return (
    <section className="pr-page" data-page={n} aria-label={title}
      style={{ width: `${p.widthIn}in`, height: `${p.heightIn}in`, background: C.paper, color: C.ink, fontFamily: FACE, fontSize: `${BODY_PT}pt`, position: 'relative', overflow: 'hidden', margin: '0 0 16px 0', boxShadow: `0 0 0 1px ${C.rule}`, boxSizing: 'border-box' }}>
      <header style={{ background: alt ? C.barAlt : C.bar, color: C.barInk, padding: '0.06in 0.15in', fontWeight: 'bold', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</header>
      <div style={{ position: 'absolute', top: '0.32in', left: '0.15in', right: '0.15in', bottom: '0.28in' }}>{children}</div>
      <footer style={{ position: 'absolute', bottom: '0.06in', left: '0.15in', right: '0.15in', borderTop: `1px solid ${C.rule}`, color: C.faint, fontSize: '7pt', textAlign: 'right' }}>
        {pr('pr.footer', { unit: pr(`pr.unit.${unit}`), n, of })}
      </footer>
    </section>
  );
}

const cell = { border: `1px solid ${C.rule}`, padding: '1px 4px', textAlign: 'left' as const, verticalAlign: 'top' as const };
const table = { borderCollapse: 'collapse' as const, width: '100%', margin: '0 0 6px 0' };
const h = { fontSize: `${BODY_PT + 1}pt`, margin: '4px 0 2px 0', color: C.ink, borderBottom: `2px solid ${C.mark}` };

/** One side of the sheet from the print boxes; the inner area is the page, boxes placed in inches. */
function SheetSide({ view, side }: { view: GameplanView; side: 0 | 1 }) {
  const p = view.print;
  return (
    <div data-print-side={side} style={{ position: 'absolute', inset: 0 }}>
      {p.boxes.filter((b) => b.side === side).map((b) => (
        <div key={b.id} data-print-box={b.id} data-overflow={b.overflow ? 'true' : undefined}
          style={{ position: 'absolute', left: pct(b.xIn, p.widthIn), top: pct(b.yIn, p.heightIn), width: pct(b.wIn, p.widthIn), height: pct(b.hIn, p.heightIn), border: `1px solid ${b.overflow ? C.barAlt : C.ink}`, overflow: 'hidden', fontSize: `${b.textPt}pt`, lineHeight: 1.15, boxSizing: 'border-box', padding: '1px 2px' }}>
          {b.lines.map((l, i) => <div key={i} style={i === 0 ? { fontWeight: 'bold', background: C.bar, color: C.barInk, padding: '0 2px', margin: '-1px -2px 1px -2px' } : undefined}>{l}</div>)}
        </div>
      ))}
    </div>
  );
}

function Band({ view }: { view: GameplanView }) {
  const w = view.wristband;
  return (
    <div data-doc="band">
      <p>{pr('pr.band.relay', { relay: gt(`gp.relay.${w.relay}`), freedom: gt(`gp.freedom.${w.qbFreedom}`) })}</p>
      {w.cells.length ? (
        <table style={{ ...table, width: 'auto', border: `2px solid ${C.ink}` }} data-band="card">
          <tbody>{w.cells.map((c) => <tr key={c.label} data-cell={c.label}><th scope="row" style={{ ...cell, fontWeight: 'bold', width: '4em' }}>{c.label}</th><td style={cell}>{c.call}</td></tr>)}</tbody>
        </table>
      ) : <p>{pr('pr.band.empty')}</p>}
      <p style={{ color: C.faint }}>{pr('pr.band.note')}</p>
      {w.problems.length ? <p role="alert">{pr('pr.band.problems', { list: w.problems.join('; ') })}</p> : null}
      {w.audibles.length ? <><h3 style={h}>{pr('pr.band.audibles')}</h3><ul>{w.audibles.map((a) => <li key={a.name}><strong>{a.name}</strong> {a.call}</li>)}</ul></> : null}
    </div>
  );
}

function ScriptTable({ rows, id }: { rows: GameplanView['script']['opening']; id: string }) {
  if (!rows.length) return <p>{pr('pr.script.empty')}</p>;
  return (
    <table style={table} data-script={id}>
      <thead><tr>{['n', 'call', 'purpose', 'watching', 'result'].map((c) => <th key={c} scope="col" style={{ ...cell, fontWeight: 'bold' }}>{pr(`pr.script.col.${c}`)}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={r.id} data-script-row={r.id}>
          <td style={cell}>{i + 1}</td><td style={{ ...cell, fontWeight: 'bold' }}>{r.call}</td>
          <td style={cell}>{gt(`gp.purpose.${r.purpose}`)}{r.purposeText ? `: ${r.purposeText}` : ''}</td>
          <td style={cell}>{r.watchingFor ?? ''}</td><td style={{ ...cell, width: '18%' }} />
        </tr>
      ))}</tbody>
    </table>
  );
}

function Script({ view }: { view: GameplanView }) {
  const s = view.script;
  return (
    <div data-doc="script">
      <h3 style={h}>{pr('pr.script.opening')}</h3>
      <ScriptTable rows={s.opening} id="opening" />
      <h3 style={h}>{pr('pr.script.secondHalf')}</h3>
      <ScriptTable rows={s.secondHalf} id="second_half" />
      {s.mustCalls.length ? <><h3 style={h}>{pr('pr.script.mustCalls')}</h3><ul>{s.mustCalls.map((m) => <li key={m.id}>{m.call} · {m.target === 'by_half' ? gt('gp.must.byHalf') : gt('gp.must.atLeast', { n: m.target.split(':')[1] ?? '' })}</li>)}</ul></> : null}
      {s.notes.length ? <><h3 style={h}>{pr('pr.script.notes')}</h3><ul>{s.notes.map((n) => <li key={n.id}>{n.text}</li>)}</ul></> : null}
    </div>
  );
}

function HeadCoachCard({ view }: { view: GameplanView }) {
  const card = view.card;
  if (!card) return <p>{gt('gp.card.none')}</p>;
  const dists = [...new Set(card.fourth.map((c) => c.distanceYd))].sort((a, b) => a - b);
  const ytgs = [...new Set(card.fourth.map((c) => c.yardsToGoalYd))].sort((a, b) => b - a);
  const lists = [['timeoutRules', card.timeoutRules], ['crewTendencies', card.crewTendencies], ['trickHistory', card.trickHistory], ['depthCard', card.depthCard], ['standingInstructions', card.standingInstructions]] as const;
  return (
    <div data-doc="card" style={{ columnCount: 2, columnGap: '0.2in' }}>
      <h3 style={h}>{gt('gp.card.fourth')}</h3>
      <table style={table} data-block="fourth">
        <thead><tr><th scope="col" style={cell}>{gt('gp.card.toGo')}</th>{ytgs.map((y) => <th key={y} scope="col" style={cell}>{gt('gp.card.ytg', { y })}</th>)}</tr></thead>
        <tbody>{dists.map((d) => (
          <tr key={d}><th scope="row" style={cell}>{d}</th>{ytgs.map((y) => {
            const c = card.fourth.find((x) => x.distanceYd === d && x.yardsToGoalYd === y);
            return <td key={y} style={{ ...cell, fontWeight: c?.call === 'go' ? 'bold' : 'normal' }}>{c ? gt(`gp.fourth.${c.call}`) : ''}</td>;
          })}</tr>
        ))}</tbody>
      </table>
      <h3 style={h}>{gt('gp.card.twoPoint')}</h3>
      <table style={table} data-block="two_point"><tbody>{card.twoPoint.map((r) => (
        <tr key={r.scoreDiff}><th scope="row" style={cell}>{gt('gp.card.diff', { diff: r.scoreDiff > 0 ? `+${r.scoreDiff}` : r.scoreDiff })}</th><td style={{ ...cell, fontWeight: r.goForTwo ? 'bold' : 'normal' }}>{gt(r.goForTwo ? 'gp.card.goForTwo' : 'gp.card.kick')}</td></tr>
      ))}</tbody></table>
      <h3 style={h}>{gt('gp.card.kneel')}</h3>
      <table style={table} data-block="kneel"><tbody>{card.kneel.map((k) => <tr key={k.opponentTimeouts}><th scope="row" style={cell}>{gt('gp.card.theirTimeouts', { n: k.opponentTimeouts })}</th><td style={cell}>{gt('gp.card.kneelRow', { kneels: k.kneels, s: k.secondsKilled })}</td></tr>)}</tbody></table>
      <p>{gt('gp.card.fgLine', { with: card.fieldGoalLine.withWind ?? '-', into: card.fieldGoalLine.intoWind ?? '-' })}</p>
      {lists.map(([k, list]) => list.length ? <div key={k}><h3 style={h}>{gt(`gp.card.${k}`)}</h3><ul>{list.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null)}
    </div>
  );
}

function Plan({ view }: { view: GameplanView }) {
  const pl = view.plan;
  return (
    <div data-doc="plan" style={{ columnCount: 3, columnGap: '0.2in' }}>
      <p style={{ fontWeight: 'bold' }}>{pr('pr.plan.summary', { total: pl.summary.total, new: pl.summary.newThisWeek })}</p>
      {pl.situations.map((s) => (
        <div key={s.id} data-plan-situation={s.id} style={{ breakInside: 'avoid' }}>
          <h3 style={h}>{pr('pr.plan.situation', { label: s.label, n: s.entries.length })}</h3>
          <ol>{s.entries.map((e) => <li key={e.entryId}>{e.call}{e.isNew ? ` (${pr('pr.plan.new')})` : ''}</li>)}</ol>
        </div>
      ))}
    </div>
  );
}

export function PrintScreen({ view, unit, docs, onUnit, onIntent }: PrintScreenProps) {
  if (!view) return <p className="gm-line">{pr('pr.empty')}</p>;
  const p = view.print;
  const settings = (patch: Partial<{ paper: typeof p.paper; keyHints: boolean; docs: readonly Doc[] }>) => onIntent({ kind: 'settings', paper: p.paper, keyHints: p.keyHints, docs, ...patch });
  const pages: { key: string; title: string; alt?: boolean; body: React.ReactNode }[] = [];
  if (docs.includes('sheet')) for (const side of [0, 1] as const) pages.push({ key: `sheet${side}`, title: pr('pr.page.sheet', { n: side + 1 }), body: <SheetSide view={view} side={side} /> });
  if (docs.includes('band')) pages.push({ key: 'band', title: pr('pr.page.band'), alt: true, body: <Band view={view} /> });
  if (docs.includes('script')) pages.push({ key: 'script', title: pr('pr.page.script'), body: <Script view={view} /> });
  if (docs.includes('card')) pages.push({ key: 'card', title: pr('pr.page.card'), alt: true, body: <HeadCoachCard view={view} /> });
  if (docs.includes('plan')) pages.push({ key: 'plan', title: pr('pr.page.plan'), body: <Plan view={view} /> });
  return (
    <div className="pr-screen" data-unit={unit} data-paper={p.paper}>
      <style>{printCss(p.widthIn, p.heightIn)}</style>
      <fieldset className="pr-controls" style={{ border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' }}>
        <legend>{pr('pr.controls')}</legend>
        <label>{pr('pr.unit')}{' '}
          <select value={unit} onChange={(e) => onUnit(e.target.value as Unit)}>{UNITS.map((u) => <option key={u} value={u}>{pr(`pr.unit.${u}`)}</option>)}</select>
        </label>{' '}
        <label>{pr('pr.paper')}{' '}
          <select value={p.paper} onChange={(e) => settings({ paper: e.target.value as typeof p.paper })}>{PAPERS.map((x) => <option key={x} value={x}>{pr(`pr.paper.${x}`)}</option>)}</select>
        </label>{' '}
        <label><input type="checkbox" checked={p.keyHints} onChange={(e) => settings({ keyHints: e.target.checked })} /> {pr('pr.keys')}</label>
        <div role="group" aria-label={pr('pr.docs')}>
          {DOCS.map((d) => (
            <label key={d} style={{ marginRight: '12px' }}><input type="checkbox" data-doc-toggle={d} checked={docs.includes(d)} onChange={(e) => settings({ docs: e.target.checked ? [...docs, d] : docs.filter((x) => x !== d) })} /> {pr(`pr.doc.${d}`)}</label>
          ))}
        </div>
        <button type="button" onClick={() => onIntent({ kind: 'print' })} disabled={!pages.length}>{pr('pr.print')}</button>{' '}
        <button type="button" onClick={() => onIntent({ kind: 'export_sheet' })}>{pr('pr.export')}</button>
        <p className="gm-line">{view.sheet.lockedAt === null ? pr('pr.draft') : pr('pr.locked', { version: view.sheet.version })}</p>
        {p.overflow ? <p role="alert">{pr('pr.overflow', { n: p.overflow })}</p> : null}
      </fieldset>
      <div className="pr-pages" data-pages={pages.length} style={{ overflowX: 'auto' }}>
        {pages.map((pg, i) => <Page key={pg.key} p={p} title={pg.title} n={i + 1} of={pages.length} unit={unit} alt={pg.alt}>{pg.body}</Page>)}
      </div>
    </div>
  );
}

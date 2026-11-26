// Defensive call designer screen (G-91; bible O3.2.1, O3.7.2). Centre: the field canvas with the defense
// drawn against the chosen offensive look, gap labels over the line (one name per gap; zero or two names
// flagged), zone windows for droppers; a formation switcher steps through the standard set. Left: the
// layers in order. Right: the selected defender's alignment, technique, key and responsibility by action
// (run to, run away, pass). Bottom: the checks table (one row per look) and the validator messages.
// Header: the hours strip. Draws the read model only; holds no football logic.
import TEXT from './text.json';
import { fieldPalette, type FieldPalette } from '../../field-view/index.ts';
import { RUN_FAMILY_IDS, type DefenderView, type DefenseDesignerView, type DutyView, type FindingView, type GapLabelView, type HoursStripView, type RunFamilyId, type Side } from './types.ts';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;

/** Designer text by id with `{slot}` filled; an unknown id shows itself so a gap is visible (O6.6.1). */
export function dt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}
export const designerTextIds = (): string[] => Object.keys(STRINGS);

const side = (s: Side | null): string => (s === null ? '' : dt(`dd.side.${s}`));

/** One responsibility in words (run fit or pass job). */
export function dutyText(d: DutyView | null): string {
  if (d === null) return dt('dd.duty.none');
  switch (d.kind) {
    case 'rush': return d.delayS !== null ? dt('dd.duty.rush_delay', { side: side(d.side), gap: d.gap ?? '', s: d.delayS.toFixed(1) }) : dt('dd.duty.rush', { side: side(d.side), gap: d.gap ?? '' });
    case 'man': return d.target === null ? dt('dd.duty.man_free') : dt('dd.duty.man', { target: d.target, technique: dt(`dd.technique.${d.technique ?? 'off'}`) });
    case 'bracket': return dt('dd.duty.bracket', { target: d.target ?? '', technique: dt(`dd.technique.${d.technique ?? 'outside'}`) });
    case 'zone': return d.side !== null ? dt('dd.duty.zone_side', { area: dt(`dd.area.${d.area ?? 'hook'}`), side: side(d.side) }) : dt('dd.duty.zone', { area: dt(`dd.area.${d.area ?? 'hook'}`) });
    case 'spy': return dt('dd.duty.spy');
    case 'gap': return dt('dd.duty.gap', { side: side(d.side), gap: d.gap ?? '' });
    default: {
      const base = dt(`dd.duty.${d.kind}`);
      return d.side !== null ? dt('dd.duty.side_suffix', { duty: base, side: side(d.side) }) : base;
    }
  }
}

// ---------- canvas geometry ----------

/** Depth shown above (defense) and below (offense) the line, in yards. */
export const CANVAS_DEFENSE_DEPTH_YD = 22;
export const CANVAS_OFFENSE_DEPTH_YD = 9;
/** Label band above the defense for the gap labels, yards. */
const GAP_BAND_YD = 0;

export interface CanvasMap { readonly width: number; readonly height: number; x(py: number): number; y(px: number): number }

/** Field yards to canvas units: lateral across, depth up; the line of scrimmage sits at the offense band. */
export function canvasMap(v: Pick<DefenseDesignerView, 'field'>): CanvasMap {
  const w = 2 * v.field.halfWidthYd;
  const h = CANVAS_DEFENSE_DEPTH_YD + CANVAS_OFFENSE_DEPTH_YD + GAP_BAND_YD;
  return { width: w, height: h, x: (py) => py + v.field.halfWidthYd, y: (px) => CANVAS_DEFENSE_DEPTH_YD - px };
}

function Canvas({ v, pal, onSelect }: { v: DefenseDesignerView; pal: FieldPalette; onSelect?: (slot: string) => void }) {
  const m = canvasMap(v);
  const los = m.y(0);
  const yards: number[] = [];
  for (let d = -5; d <= CANVAS_DEFENSE_DEPTH_YD; d += 5) yards.push(d);
  return (
    <svg className="gm-dd-canvas" data-view="canvas" viewBox={`0 0 ${m.width.toFixed(2)} ${m.height.toFixed(2)}`} role="img" aria-label={dt('dd.canvas', { look: v.look.name })}>
      <rect x={0} y={0} width={m.width} height={m.height} fill={pal.turf} />
      {yards.map((d) => <line key={`yl${d}`} x1={0} x2={m.width} y1={m.y(d)} y2={m.y(d)} stroke={pal.lines} strokeWidth={0.08} opacity={0.5} />)}
      {[-v.field.hashYd, v.field.hashYd].map((h) => <line key={`h${h}`} data-hash={h} x1={m.x(h)} x2={m.x(h)} y1={0} y2={m.height} stroke={pal.lines} strokeWidth={0.12} strokeDasharray="0.4 0.6" />)}
      <line data-los="" x1={0} x2={m.width} y1={los} y2={los} stroke={pal.scrimmage} strokeWidth={0.18} />
      {v.defenders.filter((d) => d.zone !== null).map((d) => (
        <rect key={`z${d.slot}`} data-zone={d.slot} x={m.x(Math.min(d.zone!.y0, d.zone!.y1))} y={m.y(Math.max(d.zone!.d0, d.zone!.d1))}
          width={Math.abs(d.zone!.y1 - d.zone!.y0)} height={Math.abs(d.zone!.d1 - d.zone!.d0)} fill={pal.cue} opacity={v.selected === d.slot ? 0.35 : 0.12} />
      ))}
      {v.motion !== null && (() => {
        const p = v.offense.find((o) => o.role === v.motion!.role);
        return p ? <line data-motion={p.role} x1={m.x(p.py)} x2={m.x(v.motion!.toPy)} y1={m.y(p.px)} y2={m.y(p.px)} stroke={pal.inkDark} strokeWidth={0.12} strokeDasharray="0.5 0.3" /> : null;
      })()}
      {v.offense.map((p) => (
        <g key={`o${p.role}`} data-off={p.role} data-eligible={p.eligible ? '1' : '0'}>
          <circle cx={m.x(p.py)} cy={m.y(p.px)} r={0.55} fill={p.eligible ? pal.safeLight : pal.inkLight} stroke={pal.inkDark} strokeWidth={0.08} />
          <text x={m.x(p.py)} y={m.y(p.px) + 0.25} fontSize={0.65} textAnchor="middle" fill={pal.inkDark}>{p.role}</text>
        </g>
      ))}
      {v.gaps.map((g) => <GapMark key={`g${g.side}${g.gap}`} g={g} m={m} pal={pal} los={los} />)}
      {v.defenders.map((d) => (
        <g key={`d${d.slot}`} data-def={d.slot} data-selected={v.selected === d.slot ? '1' : '0'} onClick={onSelect ? () => onSelect(d.slot) : undefined} style={onSelect ? { cursor: 'pointer' } : undefined}>
          <text x={m.x(d.py)} y={m.y(d.px) + 0.35} fontSize={v.selected === d.slot ? 1.25 : 1.0} fontWeight={700} textAnchor="middle" fill={d.conflict ? pal.flag : pal.safeDark}>{d.slot}</text>
        </g>
      ))}
    </svg>
  );
}

function GapMark({ g, m, pal, los }: { g: GapLabelView; m: CanvasMap; pal: FieldPalette; los: number }) {
  const label = g.owners.length > 0 ? g.owners.join('+') : '?';
  return (
    <g data-gap={`${g.side}:${g.gap}`} data-flag={g.flag}>
      <text x={m.x(g.y)} y={los - 0.35} fontSize={0.55} textAnchor="middle" fill={g.flag === 'ok' ? pal.lines : pal.flag}>{`${g.gap}:${label}`}</text>
    </g>
  );
}

function HoursStrip({ h, onHandTo }: { h: HoursStripView | null; onHandTo?: () => void }) {
  if (h === null) return <div className="gm-strip" data-view="hours"><span>{dt('dd.hours.none')}</span></div>;
  return (
    <div className="gm-strip" data-view="hours">
      <span>{dt('dd.hours.used', { h: h.usedH.toFixed(1) })}</span>
      <span>{dt('dd.hours.left', { h: h.leftH.toFixed(1) })}</span>
      <span>{h.owner === 'coach' ? dt('dd.hours.owner.coach') : dt('dd.hours.owner.assistant', { name: h.ownerName })}</span>
      {h.delegable && onHandTo && <button type="button" onClick={onHandTo}>{dt('dd.hours.hand_to')}</button>}
    </div>
  );
}

function Layers({ v }: { v: DefenseDesignerView }) {
  const L = v.layers;
  const none = dt('dd.layer.none');
  const rows: [string, string][] = [
    ['package', dt('dd.layer.package_value', { name: L.package, personnel: L.personnel })],
    ['front', dt('dd.layer.front_value', { name: L.front, convention: dt(`dd.convention.${L.convention}`) })],
    ['stunts', L.stunts.length > 0 ? L.stunts.join(', ') : none],
    ['pressure', L.pressure ? dt('dd.layer.pressure_value', { name: L.pressure.name, family: dt(`dd.pfam.${L.pressure.family}`) }) : none],
    ['coverage', dt('dd.layer.coverage_value', { name: L.coverage.name, shell: dt(`dd.shell.${L.coverage.shell}`) })],
    ['checks', dt('dd.layer.checks_value', { n: L.checks })],
    ['disguise', L.disguise ? dt('dd.layer.disguise_value', { shell: dt(`dd.shell.${L.disguise.shell}`), moment: dt(`dd.moment.${L.disguise.moment}`) }) : none],
  ];
  return (
    <nav className="gm-dd-layers" data-view="layers" aria-label={dt('dd.layers')}>
      <ol>
        {rows.map(([k, val]) => <li key={k} data-layer={k}><strong>{dt(`dd.layer.${k}`)}</strong> <span>{val}</span></li>)}
      </ol>
    </nav>
  );
}

function DefenderPanel({ v }: { v: DefenseDesignerView }) {
  const d: DefenderView | undefined = v.defenders.find((x) => x.slot === v.selected);
  if (d === undefined) return <aside className="gm-dd-defender" data-view="defender"><p className="gm-line">{dt('dd.defender.none')}</p></aside>;
  const rel = d.py - v.field.ballYd;
  const rows: [string, string][] = [
    ['align', dt('dd.defender.align_value', { d: d.px.toFixed(1), y: Math.abs(rel).toFixed(1), side: side(rel < 0 ? 'left' : 'right') })],
    ['technique', d.technique ?? dt('dd.layer.none')],
    ['key', d.key ?? dt('dd.defender.key_none')],
    ['run_to', dutyText(d.runTo)],
    ['run_away', dutyText(d.runAway)],
    ['pass', dutyText(d.pass)],
  ];
  if (d.gapControl !== null) rows.splice(2, 0, ['gap_control', dt(`dd.defender.gap_control.${d.gapControl}`)]);
  return (
    <aside className="gm-dd-defender" data-view="defender" data-slot={d.slot} aria-label={dt('dd.defender')}>
      <h3>{dt('dd.defender.head', { slot: d.slot, pos: d.pos })}</h3>
      <dl>
        {rows.map(([k, val]) => [<dt key={`k${k}`}>{dt(`dd.defender.${k}`)}</dt>, <dd key={`v${k}`} data-row={k}>{val}</dd>])}
      </dl>
      {d.inBox && <p className="gm-line" data-flag="in_box">{dt('dd.defender.in_box')}</p>}
      {d.conflict && <p className="gm-line" data-flag="conflict">{dt('dd.defender.conflict')}</p>}
    </aside>
  );
}

function ChecksTable({ v, onLook }: { v: DefenseDesignerView; onLook?: (id: string) => void }) {
  return (
    <table className="gm-table" data-view="checks">
      <caption>{dt('dd.checks')}</caption>
      <thead><tr>{['look', 'box', 'check', 'adjustment'].map((k) => <th key={k} scope="col">{dt(`dd.checks.${k}`)}</th>)}</tr></thead>
      <tbody>
        {v.checks.map((r) => (
          <tr key={r.lookId} data-look={r.lookId} data-current={r.lookId === v.look.id ? '1' : '0'}>
            <th scope="row">{onLook ? <button type="button" onClick={() => onLook(r.lookId)}>{r.lookName}</button> : r.lookName}</th>
            <td>{r.box}</td>
            <td>{r.checkId ?? dt('dd.checks.none')}</td>
            <td>{r.note ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Findings({ v }: { v: DefenseDesignerView }) {
  if (v.findings.length === 0) return <section data-view="findings"><h3>{dt('dd.findings')}</h3><p className="gm-line">{dt('dd.findings.none')}</p></section>;
  const lookName = new Map(v.looks.map((l) => [l.id, l.name]));
  const line = (f: FindingView): string => (f.lookId !== null && f.lookId !== v.look.id ? dt('dd.findings.other_look', { look: lookName.get(f.lookId) ?? f.lookId, message: f.message }) : f.message);
  return (
    <section data-view="findings" aria-label={dt('dd.findings')}>
      <h3>{dt('dd.findings')}</h3>
      <ul>
        {v.findings.map((f, i) => (
          <li key={i} data-severity={f.severity} data-code={f.code} data-look={f.lookId ?? ''}>
            <strong>{dt(`dd.severity.${f.severity}`)}</strong> <span>{line(f)}</span>{f.ruleKey !== null && <em> {dt('dd.findings.rule', { key: f.ruleKey })}</em>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface DefenseDesignerScreenProps {
  readonly view: DefenseDesignerView;
  readonly theme?: 'light' | 'dark' | 'high-contrast';
  onLook?(lookId: string): void;
  onSelect?(slot: string): void;
  onFamily?(family: RunFamilyId): void;
  onHandTo?(): void;
}

export function DefenseDesignerScreen({ view: v, theme = 'light', onLook, onSelect, onFamily, onHandTo }: DefenseDesignerScreenProps) {
  const pal = fieldPalette(theme);
  const i = v.looks.findIndex((l) => l.id === v.look.id);
  const step = (k: number) => v.looks[(i + k + v.looks.length) % v.looks.length]!.id;
  return (
    <div className="gm-screen gm-dd" data-screen="defense-designer" data-call={v.callId} data-status={v.status}>
      <header>
        <h2>{dt('dd.call', { name: v.callName })} <span data-status={v.status}>{dt(`dd.status.${v.status}`)}</span></h2>
        <HoursStrip h={v.hours} onHandTo={onHandTo} />
      </header>
      <div className="gm-dd-body">
        <Layers v={v} />
        <main className="gm-dd-centre">
          <div className="gm-dd-switcher" data-view="switcher">
            <button type="button" aria-label={dt('dd.look.prev')} onClick={onLook ? () => onLook(step(-1)) : undefined}>{'<'}</button>
            <select aria-label={dt('dd.looks')} value={v.look.id} onChange={onLook ? (e) => onLook(e.target.value) : undefined} disabled={!onLook}>
              {v.looks.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button type="button" aria-label={dt('dd.look.next')} onClick={onLook ? () => onLook(step(1)) : undefined}>{'>'}</button>
            <select aria-label={dt('dd.family')} value={v.family} onChange={onFamily ? (e) => onFamily(e.target.value as RunFamilyId) : undefined} disabled={!onFamily}>
              {RUN_FAMILY_IDS.map((f) => <option key={f} value={f}>{dt(`dd.family.${f}`)}</option>)}
            </select>
          </div>
          <Canvas v={v} pal={pal} onSelect={onSelect} />
          <ul className="gm-dd-summary" data-view="summary" aria-label={dt('dd.summary')}>
            <li>{dt('dd.look.personnel', { p: v.look.personnel })}</li>
            <li>{dt('dd.look.strength', { strong: side(v.strong), pass: side(v.passStrong) })}</li>
            <li data-check={v.checkApplied?.id ?? ''}>{v.checkApplied ? dt('dd.look.check', { id: v.checkApplied.id }) : dt('dd.look.no_check')}</li>
            <li>{dt('dd.summary.box', { n: v.box })}</li>
            <li>{dt('dd.summary.pressure', { n: v.pressure.rushers, family: dt(`dd.pfam.${v.pressure.family}`), deep: v.pressure.deep })}</li>
            <li>{dt('dd.summary.free', { l: v.pressure.freeLeft, r: v.pressure.freeRight })}</li>
            {v.uncovered.length > 0 && <li data-flag="uncovered">{dt('dd.summary.uncovered', { list: v.uncovered.join(', ') })}</li>}
          </ul>
          <ul className="gm-dd-gaps" data-view="gaps" aria-label={dt('dd.gaps')}>
            {v.gaps.map((g) => (
              <li key={`${g.side}${g.gap}`} data-gap={`${g.side}:${g.gap}`} data-flag={g.flag} title={g.flag === 'ok' ? undefined : dt(`dd.gap.flag.${g.flag}`)}>
                {dt('dd.gap.label', { side: side(g.side), gap: g.gap, owners: g.owners.length > 0 ? g.owners.join(', ') : dt('dd.gap.none') })}
              </li>
            ))}
          </ul>
        </main>
        <DefenderPanel v={v} />
      </div>
      <footer>
        <Findings v={v} />
        <ChecksTable v={v} onLook={onLook} />
      </footer>
    </div>
  );
}

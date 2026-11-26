// The play-layer calibration report (WP-26; Q1.7.2 play level, J15.4 to J15.8, J15.10.1). Three parts:
//   1. the play-layer target rows of the rule set's target file, through the WP-13 harness unchanged;
//   2. the cell suite against the real baseline, cell by cell (J15.1.2);
//   3. monotone-shape checks where the real cells are monotone (J15.1.2).
// A cell passes or fails, but a cell whose baseline is not Verified prints PROVISIONAL and never
// certifies (Q6.3.1). A level with no real baseline prints MISSING SOURCE for every cell: no college
// cell is filled from a pro value (Q2.1.1). The text is byte-identical for the same inputs.
import type { FactStatus } from '@gm/schema';
import { buildReport, formatReport, fmt, type CalibrationReport, type RunInfo } from '../calibration/report.ts';
import type { LoadedTargets } from '../calibration/targets.ts';
import type { CalibrationSample } from '../calibration/measures.ts';
import { measureCells } from './cells.ts';
import { baselineStatus, cellStatus, compareCell, shapeChecks, type CellResult, type RealBaseline, type ShapeResult, type Tolerances } from './baseline.ts';

export interface PlayReport {
  readonly ruleSetId: string;
  readonly targets: CalibrationReport;
  readonly baseline: { readonly seasons: string; readonly status: FactStatus; readonly games: number; readonly rows: number; readonly sources: readonly string[]; readonly groups: readonly { readonly name: string; readonly collections: readonly string[]; readonly status: FactStatus; readonly note: string }[]; readonly omitted: string | null } | null;
  readonly tolerances: Tolerances;
  readonly cells: readonly CellResult[];
  readonly shapes: readonly ShapeResult[];
  readonly counts: Readonly<Record<'cells' | 'measured' | 'passed' | 'failed' | 'thin' | 'noEvents' | 'missingSource' | 'shapes' | 'shapesHeld', number>>;
  /** True when every cell printed is provisional (baseline not Verified, or none). */
  readonly cellsProvisional: boolean;
  /** Things a reader must know about the run, printed first (for example games left out). */
  readonly runNotes: readonly string[];
}

/** Target rows the play level owns: layer `play`. */
export function playLayerTargets(loaded: LoadedTargets): LoadedTargets {
  return { ...loaded, file: { ...loaded.file, targets: loaded.file.targets.filter((t) => t.layer === 'play') } };
}

export function buildPlayReport(loaded: LoadedTargets, groups: readonly CalibrationSample[], run: RunInfo, baseline: RealBaseline | null, tolerances: Tolerances, runNotes: readonly string[] = []): PlayReport {
  if (baseline !== null && baseline.ruleSetId !== loaded.file.ruleSetId) throw new Error(`baseline of ${baseline.ruleSetId} offered to ${loaded.file.ruleSetId} (Q2.1.1: no level is judged against another level's numbers)`);
  const targets = buildReport(playLayerTargets(loaded), groups, run);
  const sim = measureCells(groups.flatMap((g) => g.plays));
  const realById = new Map((baseline?.cells ?? []).map((c) => [c.id, c]));
  const cells = sim.map((c) => compareCell(baseline === null ? null : (realById.get(c.id) ?? null), c, tolerances));
  const shapes = shapeChecks(cells);
  const n = (f: (c: CellResult) => boolean): number => cells.filter(f).length;
  const status = baseline === null ? null : baselineStatus(baseline);
  return {
    ruleSetId: loaded.file.ruleSetId, targets, tolerances, cells, shapes,
    baseline: baseline === null ? null : { seasons: baseline.seasons, status: status!, games: baseline.games, rows: baseline.rows, sources: baseline.sources.map((s) => s.citation),
      groups: (baseline.groups ?? []).map((g) => ({ name: g.name, collections: g.collections, status: cellStatus(baseline, { dim: g.dims[0] ?? '', metric: g.metrics[0] ?? '' }), note: g.note })),
      omitted: baseline.omitted ? `${baseline.omitted.dims.length} splits and ${baseline.omitted.metrics.length} measures have no source at this level (${baseline.omitted.reason})` : null },
    counts: {
      cells: cells.length, measured: n((c) => c.state === 'measured'), passed: n((c) => c.pass === true), failed: n((c) => c.pass === false),
      thin: n((c) => c.state === 'thin'), noEvents: n((c) => c.state === 'no_events'), missingSource: n((c) => c.state === 'missing_source'),
      shapes: shapes.length, shapesHeld: shapes.filter((s) => s.held).length,
    },
    cellsProvisional: status !== 'Verified', runNotes,
  };
}

function cellLabel(c: CellResult, provisional: boolean): string {
  const head = c.state === 'missing_source' ? 'MISSING SOURCE' : c.state === 'thin' ? 'THIN' : c.state === 'no_events' ? 'NO EVENTS' : c.pass ? 'PASS' : 'FAIL';
  return provisional && c.state !== 'missing_source' ? `${head} PROVISIONAL` : head;
}

/** Misses ranked by error over tolerance, largest first; ties by id. */
export function worstMisses(cells: readonly CellResult[], limit: number): CellResult[] {
  const ratio = (c: CellResult): number => (c.toleranceUsed !== null && c.toleranceUsed > 0 ? Math.abs(c.signedError ?? 0) / c.toleranceUsed : Number.POSITIVE_INFINITY);
  return cells.filter((c) => c.pass === false).sort((a, b) => ratio(b) - ratio(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, limit);
}

export function formatPlayReport(rep: PlayReport): string {
  const L: string[] = [];
  L.push(`Play-level calibration report: ${rep.ruleSetId}`);
  if (rep.runNotes.length) L.push('', 'RUN NOTES:', ...rep.runNotes);
  L.push('', '== Part 1. Play-layer target rows ==', formatReport(rep.targets).trimEnd(), '');
  L.push('== Part 2. Cells: play type, depth, down and distance, field zone ==');
  if (rep.baseline === null) L.push('Real baseline: none for this rule set. Every cell prints MISSING SOURCE; no cell is filled from another level (Q2.1.1).');
  else L.push(`Real baseline: ${rep.baseline.seasons}, ${rep.baseline.games} games, ${rep.baseline.rows} rows; collections: ${rep.baseline.sources.join('; ')}; status ${rep.baseline.status}.`);
  if (rep.baseline) {
    for (const g of rep.baseline.groups) L.push(`Charted cells, ${g.name}: ${g.collections.join('; ')}; status ${g.status}. ${g.note}`);
    if (rep.baseline.omitted) L.push(`Left out: ${rep.baseline.omitted}.`);
  }
  const t = rep.tolerances, c = rep.counts;
  L.push(`Tolerances (${t.status}; ${t.source}): core ${fmt(t.core.rel)} relative, rare ${fmt(t.rare.rel)} relative, or ${fmt(t.standardErrors)} real standard errors if larger; shapes ${fmt(t.shape.absYd)} yd through the ${fmt(t.shape.absThroughPct)}th percentile, ${fmt(t.shape.rel)} relative from the ${fmt(t.shape.relFromPct)}th; real cells under ${fmt(t.minRealEvents)} events are THIN.`);
  L.push(`Cells ${c.cells}: measured ${c.measured} (pass ${c.passed}, fail ${c.failed}), thin ${c.thin}, no events ${c.noEvents}, missing source ${c.missingSource}.${rep.cellsProvisional ? ' Every cell is PROVISIONAL: a pass is not a verified match and no cell certifies.' : ''}`);
  L.push('', 'cell | kind | class | real | real events | simulated | sim events | signed error | tolerance | result');
  for (const r of rep.cells) L.push([r.id, r.kind, r.cls, fmt(r.real), String(r.realN), fmt(r.simulated), String(r.simN), fmt(r.signedError), fmt(r.toleranceUsed), cellLabel(r, rep.cellsProvisional)].join(' | '));
  const worst = worstMisses(rep.cells, 25);
  if (worst.length) {
    L.push('', 'Largest misses (error over tolerance):');
    for (const r of worst) L.push(`  ${r.id}: real ${fmt(r.real)}, simulated ${fmt(r.simulated)}, error ${fmt(r.signedError)} against ${fmt(r.toleranceUsed)}`);
  }
  L.push('', '== Part 3. Monotone shapes ==', `Checks ${c.shapes}: held ${c.shapesHeld}, broken ${c.shapes - c.shapesHeld}.`, 'group | measure | real direction | real | simulated | result');
  for (const s of rep.shapes) L.push([s.group, s.metric, s.direction, fmt([...s.real]), fmt([...s.simulated]), s.held ? 'HELD' : 'BROKEN'].join(' | '));
  return L.join('\n') + '\n';
}

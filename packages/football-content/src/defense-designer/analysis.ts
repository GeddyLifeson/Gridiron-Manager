// What the designer computes about a resolved call (G2.2 to G2.4): gap owners and run fits, box count and
// run/pass conflict, stunt timing, the pressure count and its free rushers, coverage assignment and the
// coverage holes over time, and the match-rule consistency check.
import { other, sgn, type Reading } from './geometry.ts';
import type { FieldGeometry } from './keys.ts';
import { param } from './params.ts';
import { gapY, type Defender, type Resolution } from './resolve.ts';
import type { DefensiveCall, FitJob, Gap, MatchRule, PressureFamily, Release, RunFamily, Side, Stunt } from './types.ts';
import { sideOf } from './geometry.ts';

export const RUN_FAMILIES: readonly RunFamily[] = ['insideZone', 'wideZone', 'power', 'counter', 'toss', 'option'];
const DL = new Set(['DE', 'DT', 'NT']);

export interface GapRow { readonly side: Side; readonly gap: Gap; readonly owners: readonly string[] }

/** G2.2.2: the gap table. A lineman owns the gap his shade points to (two-gap: both sides of his blocker); a rusher owns his rush gap; an off-ball linebacker owns the gap he aligns over; the force player covers the outermost gap. */
export function gapTable(res: Resolution, fitsFor: readonly FitRow[] | null = null): GapRow[] {
  const r = res.reading;
  const rows: GapRow[] = [];
  const owners = new Map<string, Set<string>>();
  const add = (side: Side, gap: Gap, id: string): void => {
    const k = `${side}:${gap}`;
    if (!owners.has(k)) owners.set(k, new Set());
    owners.get(k)!.add(id);
  };
  const fits = fitsFor ?? baseFits(res);
  for (const row of fits) if (row.job.kind === 'gap') add(row.job.side, row.job.gap, row.slot);
  for (const side of ['left', 'right'] as const) {
    const gaps = r.line[side].gaps;
    for (const g of gaps) rows.push({ side, gap: g.gap, owners: [...(owners.get(`${side}:${g.gap}`) ?? [])].sort() });
    // The outermost gap may be owned by the force player (a named spill-and-force pair, G2.2.2).
    const outer = gaps[gaps.length - 1]!;
    const force = fits.find((x) => x.job.kind === 'force' && x.job.side === side);
    const row = rows.find((x) => x.side === side && x.gap === outer.gap)!;
    if (row.owners.length === 0 && force) rows[rows.indexOf(row)] = { ...row, owners: [force.slot] };
  }
  return rows;
}

export interface FitRow { readonly slot: string; readonly job: FitJob }

function nearestGap(r: Reading, side: Side, y: number): Gap {
  let best: Gap = 'A';
  let bd = Infinity;
  for (const g of r.line[side].gaps) { const dd = Math.abs(g.y - y); if (dd < bd) { bd = dd; best = g.gap; } }
  return best;
}

/** Fits derived from the front and coverage, before family adjustments (G2.2.3). */
export function baseFits(res: Resolution): FitRow[] {
  const r = res.reading;
  const out: FitRow[] = [];
  const box = boxDefenders(res);
  for (const d of res.defenders) {
    const id = d.slot.id;
    const side: Side = d.py < r.center.py ? 'left' : 'right';
    const j = d.job;
    if (j.kind === 'rush') { out.push({ slot: id, job: { kind: 'gap', gap: j.gap, side: j.side } }); continue; }
    if (d.slot.align.kind === 'tech' && DL.has(d.slot.pos)) {
      if (d.slot.gapControl === 'two') {
        out.push({ slot: id, job: { kind: 'gap', gap: nearestGap(r, side, d.py - sgn(side) * 0.6), side } });
        out.push({ slot: id, job: { kind: 'gap', gap: nearestGap(r, side, d.py + sgn(side) * 0.6), side } });
      } else out.push({ slot: id, job: { kind: 'gap', gap: nearestGap(r, side, d.py), side } });
      continue;
    }
    if (d.slot.align.kind === 'overhang') { out.push({ slot: id, job: { kind: 'force', side } }); continue; }
    if (box.includes(d) && j.kind !== 'man' && (d.slot.pos === 'ILB' || d.slot.pos === 'OLB' || d.slot.align.kind === 'lb')) {
      if (d.slot.align.kind === 'lb' && d.slot.align.gap === 'over') {
        // Over the center: fits the strong-side A gap by default (the user edits it).
        out.push({ slot: id, job: { kind: 'gap', gap: 'A', side: res.declared.strong } });
      } else out.push({ slot: id, job: { kind: 'gap', gap: nearestGap(r, side, d.py), side } });
      continue;
    }
    if (d.slot.pos === 'S' && d.px <= 10 && j.kind !== 'man') { out.push({ slot: id, job: { kind: 'alley', side } }); continue; }
    out.push({ slot: id, job: { kind: 'passFirst', side: null } });
  }
  // Force on each side with no overhang: a rotated safety in the box area, else the corner on a two-high shell (Cover 2 corners force), else the alley player.
  for (const side of ['left', 'right'] as const) {
    if (out.some((x) => x.job.kind === 'force' && x.job.side === side)) continue;
    const cands = res.defenders.filter((d) => (d.py - r.center.py) * sgn(side) > 0);
    const corner = cands.find((d) => d.slot.pos === 'CB' && d.job.kind === 'zone' && d.job.area === 'flat');
    const alley = cands.find((d) => out.find((x) => x.slot === d.slot.id)?.job.kind === 'alley');
    const pick = corner ?? alley ?? cands.find((d) => d.slot.pos === 'OLB' && d.slot.align.kind !== 'tech');
    if (pick) {
      const i = out.findIndex((x) => x.slot === pick.slot.id);
      out[i] = { slot: pick.slot.id, job: { kind: 'force', side } };
    }
  }
  return out;
}

export interface FitTable { readonly family: RunFamily; readonly playSide: Side; readonly rows: readonly FitRow[]; readonly unfilled: readonly { side: Side; gap: Gap }[]; readonly errors: readonly string[] }

/** G2.2.3 run fit table for one family and play side, with the puller answer and the user's overrides. */
export function fitTable(call: DefensiveCall, res: Resolution, family: RunFamily, playSide: Side): FitTable {
  let rows = baseFits(res);
  const errors: string[] = [];
  const strongWeak = playSide === res.declared.strong ? 'strong' : 'weak';
  if (family === 'power' || family === 'counter') {
    const answer = (family === 'counter' ? call.runFits.twoPuller : call.runFits.onePuller)[strongWeak];
    const r = res.reading;
    const s = sgn(playSide);
    const playEnd = res.defenders.filter((d) => DL.has(d.slot.pos) && (d.py - r.center.py) * s > 0).sort((a, b) => (b.py - a.py) * s)[0];
    if (playEnd && answer !== 'dent') {
      rows = rows.map((x) => (x.slot === playEnd.slot.id ? { slot: x.slot, job: { kind: answer, side: playSide } } : x));
      if (answer === 'spill') {
        const endMan = r.line[playSide].wing ?? r.line[playSide].men.at(-1) ?? r.center;
        const bounce = res.defenders.find((d) => d !== playEnd && (d.py - endMan.py) * s > 0 && d.px <= 10 && d.job.kind !== 'man');
        if (!bounce) errors.push(`spill to the ${playSide} with no defender outside the end man to bounce the run`);
        else rows = rows.map((x) => (x.slot === bounce.slot.id ? { slot: x.slot, job: { kind: 'bounce', side: playSide } } : x));
      } else {
        const need = family === 'counter' ? 2 : 1;
        const fitters = boxDefenders(res).filter((d) => !DL.has(d.slot.pos) && d.job.kind !== 'man' && d.job.kind !== 'rush');
        if (fitters.length < need) errors.push(`box to the ${playSide} needs ${need} inside fitter(s) for the puller(s); the call has ${fitters.length}`);
      }
    }
  }
  if (family === 'toss' || family === 'wideZone' || family === 'option') {
    if (!rows.some((x) => x.job.kind === 'force' && x.job.side === playSide)) errors.push(`no force player to the ${playSide} against ${family}`);
  }
  const over = call.runFits.overrides[family] ?? {};
  rows = rows.map((x) => (over[x.slot] ? { slot: x.slot, job: over[x.slot]! } : x));
  const table = gapTable(res, rows);
  const unfilled = table.filter((g) => g.owners.length === 0).map((g) => ({ side: g.side, gap: g.gap }));
  return { family, playSide, rows, unfilled, errors };
}

/** G2.2.3 box: defenders inside the end men plus a margin and within the box depth. */
export function boxDefenders(res: Resolution): Defender[] {
  const r = res.reading;
  const endL = (r.line.left.wing ?? r.line.left.men.at(-1) ?? r.center).py - param('fits.boxMarginYd');
  const endR = (r.line.right.wing ?? r.line.right.men.at(-1) ?? r.center).py + param('fits.boxMarginYd');
  return res.defenders.filter((d) => d.py >= endL && d.py <= endR && d.px <= param('fits.boxDepthYd'));
}

/** Defenders in run and pass conflict: a run fit and a pass job at once (what play action and RPOs attack, G2.2.3). */
export function conflicts(res: Resolution): string[] {
  const fits = baseFits(res);
  return res.defenders.filter((d) => (d.job.kind === 'zone' || d.job.kind === 'man') && fits.some((x) => x.slot === d.slot.id && (x.job.kind === 'gap' || x.job.kind === 'alley' || x.job.kind === 'force'))).map((d) => d.slot.id).sort();
}

// ---------- G2.3.1 stunts ----------

export interface StuntReport { readonly name: string; readonly looperArrivalS: number | null; readonly finalGaps: Readonly<Record<string, Gap>>; readonly warnings: readonly string[]; readonly errors: readonly string[] }

const LETTER: Record<string, string> = { DE: 'E', DT: 'T', NT: 'N', OLB: 'L', ILB: 'M', CB: 'C', NB: 'N', S: 'S' };

export function stuntName(call: DefensiveCall, s: Stunt): string {
  const pos = (id: string | null): string => (id === null ? '' : LETTER[call.slots.find((x) => x.id === id)?.pos ?? ''] ?? '?');
  if (s.kind === 'twist' || s.kind === 'loop') return `${pos(s.penetrator)}${pos(s.looper)}`;
  return s.kind === 'slant' ? 'Slant' : 'Pinch';
}

export function stuntReport(call: DefensiveCall, res: Resolution, s: Stunt): StuntReport {
  const warnings: string[] = [];
  const errors: string[] = [];
  const side = sideOf(s.side, res.declared);
  const finalGaps: Record<string, Gap> = { [s.penetrator]: s.penetratorGap };
  let arrival: number | null = null;
  if (s.looper !== null && s.looperGap !== null) {
    finalGaps[s.looper] = s.looperGap;
    const d = res.defenders.find((x) => x.slot.id === s.looper);
    if (d) {
      const gy = gapY(res.reading, side, s.looperGap);
      const path = Math.abs(gy - d.py) + d.px + 1; // across, plus back to the line and one yard past it (a drawn loop)
      arrival = s.delayS + path / param('speed.defaultYdS');
      if (arrival > param('stunt.gapOpenWindowS')) warnings.push(`${s.looperGap} gap to the ${side} is open until ${arrival.toFixed(2)} s against a run that way`);
    }
  }
  if (s.looper === s.penetrator) errors.push('penetrator and looper are the same player');
  for (const x of res.defenders) {
    if (x.job.kind !== 'rush' || x.slot.id === s.penetrator || x.slot.id === s.looper) continue;
    const g = finalGaps[s.penetrator] === x.job.gap && x.job.side === side ? s.penetratorGap : s.looperGap !== null && x.job.gap === s.looperGap && x.job.side === side ? s.looperGap : null;
    if (g !== null && !DL.has(x.slot.pos)) errors.push(`stunt and pressure both through the ${side} ${g} gap (${x.slot.id})`);
  }
  return { name: stuntName(call, s), looperArrivalS: arrival, finalGaps, warnings, errors };
}

// ---------- G2.3.2 pressure ----------

export interface PressureReport {
  readonly rushers: readonly string[];
  readonly droppers: readonly string[];
  readonly family: PressureFamily | 'four' | 'three';
  readonly deep: number;
  readonly freeRushers: Readonly<Record<Side, number>>;
  readonly hot: readonly { readonly receiver: string; readonly takenBy: string | null }[];
}

export function pressureReport(res: Resolution): PressureReport {
  const r = res.reading;
  const rushers = res.defenders.filter((d) => d.job.kind === 'rush');
  const droppers = res.defenders.filter((d) => d.job.kind !== 'rush');
  const deep = res.defenders.filter((d) => d.job.kind === 'zone' && d.job.rect.d0 >= 10).length + res.defenders.filter((d) => d.job.kind === 'man' && d.px >= 10 && d.slot.pos === 'S' && d.job.target === null).length;
  const man = res.defenders.some((d) => d.job.kind === 'man');
  const nonDlRush = rushers.some((d) => !DL.has(d.slot.pos));
  const dlDrop = droppers.some((d) => DL.has(d.slot.pos));
  let family: PressureReport['family'];
  if (rushers.length >= 5 && deep === 0) family = 'allOut';
  else if (rushers.length >= 5 && man) family = 'manFree';
  else if (rushers.length >= 5) family = 'zone';
  else if (nonDlRush && dlDrop) family = 'simulated';
  else family = rushers.length <= 3 ? 'three' : 'four';
  const rushSide = (s: Side): number => rushers.filter((d) => (d.job.kind === 'rush' ? d.job.side : 'left') === s).length;
  const blockSide = (s: Side): number => r.line[s].men.length + (r.line[s].wing ? 1 : 0);
  const free = { left: 0, right: 0 } as Record<Side, number>;
  // The center and the backs go to the heavier rush side (a design simplification of slide protection).
  let spare = 1 + r.backs.length;
  const heavy: Side = rushSide('left') > rushSide('right') ? 'left' : 'right';
  for (const s of [heavy, other(heavy)] as const) {
    const over = rushSide(s) - blockSide(s);
    const covered = Math.min(Math.max(0, over), spare);
    spare -= covered;
    free[s] = Math.max(0, over - covered);
  }
  const hot: { receiver: string; takenBy: string | null }[] = [];
  for (const s of ['left', 'right'] as const) {
    if (free[s] === 0) continue;
    const inside = r.receivers[s][r.receivers[s].length - 1] ?? r.backs[0];
    if (!inside) continue;
    const taker = res.defenders.find((d) => (d.job.kind === 'man' && d.job.target === inside.role) || (d.job.kind === 'zone' && d.job.rect.d0 < 10 && d.job.side === s));
    hot.push({ receiver: inside.role, takenBy: taker?.slot.id ?? null });
  }
  return { rushers: rushers.map((d) => d.slot.id), droppers: droppers.map((d) => d.slot.id), family, deep, freeRushers: free, hot };
}

// ---------- G2.4.1 coverage ----------

export interface CoverageReport {
  /** Eligible receivers with no man defender and outside any zone structure. */
  readonly uncovered: readonly string[];
  /** Receivers with two man defenders that no bracket rule explains. */
  readonly doubled: readonly string[];
  readonly manBy: Readonly<Record<string, readonly string[]>>;
  /** Pass defenders with no job (neither zone, man, bracket, rush nor spy). */
  readonly idle: readonly string[];
}

export function coverageReport(res: Resolution): CoverageReport {
  const r = res.reading;
  const manBy: Record<string, string[]> = {};
  for (const d of res.defenders) {
    const t = d.job.kind === 'man' ? d.job.target : d.job.kind === 'bracket' ? d.job.target : null;
    if (t !== null) (manBy[t] ??= []).push(d.slot.id);
  }
  const zones = res.defenders.filter((d) => d.job.kind === 'zone');
  const deepZones = zones.filter((d) => d.job.kind === 'zone' && d.job.rect.d0 >= 10);
  const underSide = (s: Side): boolean => zones.some((d) => d.job.kind === 'zone' && d.job.rect.d0 < 10 && (d.job.side === s || d.job.side === null));
  const uncovered: string[] = [];
  for (const p of r.eligible) {
    if ((manBy[p.role]?.length ?? 0) > 0) continue;
    const s: Side = p.py < r.center.py ? 'left' : 'right';
    if (deepZones.length > 0 && underSide(s)) continue;
    uncovered.push(p.role);
  }
  const doubled = Object.entries(manBy).filter(([, v]) => v.length > 1 && !res.defenders.some((d) => d.job.kind === 'bracket' && v.includes(d.slot.id))).map(([k]) => k).sort();
  const idle = res.defenders.filter((d) => d.job.kind === 'man' && d.job.target === null && d.slot.pos !== 'S').map((d) => d.slot.id);
  return { uncovered: uncovered.sort(), doubled, manBy, idle };
}

export interface HoleCell { readonly y: number; readonly d: number }
export interface HoleMap { readonly t: number; readonly cells: readonly HoleCell[]; readonly areas: readonly string[] }

/** Where a zone defender is t seconds after the snap: moving from his alignment to his zone's centre at backpedal speed. */
export function zonePos(d: Defender, t: number): { y: number; d: number } {
  if (d.job.kind !== 'zone') return { y: d.py, d: d.px };
  const cy = (d.job.rect.y0 + d.job.rect.y1) / 2;
  const cd = (d.job.rect.d0 + d.job.rect.d1) / 2;
  const dy = cy - d.py;
  const dd = cd - d.px;
  const dist = Math.sqrt(dy * dy + dd * dd);
  const go = Math.min(dist, param('speed.backpedalYdS') * t);
  return dist === 0 ? { y: cy, d: cd } : { y: d.py + (dy * go) / dist, d: d.px + (dd * go) / dist };
}

/** G2.4.1: areas no zone defender is responsible for at t seconds (the coverage's known holes). */
export function holes(res: Resolution, t: number, f: FieldGeometry): HoleMap {
  const cell = param('holes.cellYd');
  const reach = param('holes.reachYd');
  const zones = res.defenders.filter((d) => d.job.kind === 'zone');
  const pos = zones.map((d) => ({ d, p: zonePos(d, t) }));
  const cells: HoleCell[] = [];
  for (let y = -f.halfWidthYd + cell / 2; y < f.halfWidthYd; y += cell) {
    for (let dd = cell / 2; dd < param('holes.maxDepthYd'); dd += cell) {
      const covered = pos.some(({ d, p }) => {
        if (d.job.kind !== 'zone') return false;
        const rc = d.job.rect;
        const inside = y >= rc.y0 - reach && y <= rc.y1 + reach && dd >= rc.d0 - reach && dd <= rc.d1 + reach;
        const dy = y - p.y;
        const dz = dd - p.d;
        return inside && dy * dy + dz * dz <= reach * reach * 4;
      });
      if (!covered) cells.push({ y, d: dd });
    }
  }
  const W = f.halfWidthYd;
  const name = (c: HoleCell): string => `${c.d < 10 ? 'short' : 'deep'} ${c.y < res.reading.center.py - W / 3 ? 'left' : c.y > res.reading.center.py + W / 3 ? 'right' : 'middle'}`;
  return { t, cells, areas: [...new Set(cells.map(name))].sort() };
}

// ---------- G2.4.2 match rules ----------

export type Combo = Readonly<Record<string, Release>>;
/** The test set of route combinations: every pairing of number 1 and number 2 releases on a side. */
export const COMBOS: readonly [Release, Release][] = (['vertical', 'in', 'out', 'under'] as const).flatMap((a) => (['vertical', 'in', 'out', 'under'] as const).map((b) => [a, b] as [Release, Release]));

export interface MatchConflict { readonly side: Side; readonly combo: readonly [Release, Release]; readonly problem: string }

/** G2.4.2 consistency: for each route combination on each side, no vertical receiver is left by every rule while the deep zone is empty, and none is taken by two while a deep zone goes empty. */
export function matchConsistency(rules: readonly MatchRule[], res: Resolution): MatchConflict[] {
  const out: MatchConflict[] = [];
  for (const side of ['left', 'right'] as const) {
    const sideRules = rules.filter((m) => m.triggers.some((t) => sideOf(t.side, res.declared) === side));
    if (sideRules.length === 0) continue;
    for (const combo of COMBOS) {
      const takenBy: Record<number, string[]> = { 1: [], 2: [] };
      let deepLeft = 0;
      for (const m of sideRules) {
        const fired = m.triggers.find((t) => sideOf(t.side, res.declared) === side && combo[t.n - 1] === t.release);
        if (fired && fired.job === 'man') takenBy[fired.n]!.push(m.slot);
        else if (!fired && m.otherwise === 'deep') deepLeft++;
      }
      for (const n of [1, 2] as const) {
        if (combo[n - 1] === 'vertical' && takenBy[n]!.length === 0 && deepLeft === 0) out.push({ side, combo, problem: `number ${n} vertical is left by every defender with no deep player` });
        if (takenBy[n]!.length > 1 && deepLeft === 0) out.push({ side, combo, problem: `number ${n} taken by ${takenBy[n]!.join(' and ')} with the deep zone empty` });
      }
    }
  }
  return out;
}

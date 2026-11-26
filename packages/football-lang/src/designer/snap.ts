// Drawing helpers for O3.1.2: alignment snaps to football positions, not pixels; the readout states
// the alignment in coaching terms; route stems snap to whole-yard depths and standard break angles and
// are named when the shape matches the route tree (F6, which the caller supplies as templates).
import type { ParamTable, RuleSet } from '@gm/schema';
import type { DesignSlot, DrawnPoint, Yd2 } from './types.ts';

export type HashSpot = 'left' | 'middle' | 'right';

/** Field landmarks from the rule set (B2, Rule 1). Numbers are null until the rule data carries them. */
export interface Landmarks { readonly widthYd: number; readonly hashFromSidelineYd: number; readonly numbersFromSidelineYd: number | null }

const FT_PER_YD = 3;
export function landmarksOf(rules: RuleSet, widthYd: number): Landmarks {
  const numbers = rules.keys().includes('field.numbers_from_sideline_yd') ? rules.num('field.numbers_from_sideline_yd') : null;
  return { widthYd, hashFromSidelineYd: rules.num('field.hash_from_sideline_ft') / FT_PER_YD, numbersFromSidelineYd: numbers };
}

/** Sidelines relative to the ball for a hash spot, drawn axes (lateral right positive). */
export function sidelines(l: Landmarks, hash: HashSpot): { left: number; right: number } {
  const ballFromLeft = hash === 'left' ? l.hashFromSidelineYd : hash === 'right' ? l.widthYd - l.hashFromSidelineYd : l.widthYd / 2;
  return { left: -ballFromLeft, right: l.widthYd - ballFromLeft };
}

const clean = (x: number): number => (x === 0 ? 0 : x);
const roundTo = (x: number, step: number): number => clean(Math.round(x / step) * step);

/** Snap a dragged spot (O3.1.2). With `free` (Alt held) the spot is kept as dragged. */
export function snapAlignment(raw: Yd2, params: ParamTable, free = false): { at: Yd2; onLine: boolean } {
  const half = params.num('designer.snap.depthYd') / 2;
  const onLine = raw[0] > -half;
  if (free) return { at: raw, onLine };
  const depth = onLine ? 0 : roundTo(raw[0], params.num('designer.snap.depthYd'));
  return { at: [depth, roundTo(raw[1], params.num('designer.snap.lateralYd'))], onLine };
}

const fmt = (x: number): string => { const r = Math.round(x * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); };

/** "plus 2 outside the numbers, on the line" (O3.1.2 readout). Pure function of the stored values. */
export function alignmentReadout(at: Yd2, onLine: boolean, slots: readonly DesignSlot[], l: Landmarks, hash: HashSpot): string {
  const depthText = onLine ? 'on the line' : `${fmt(-at[0])} deep`;
  const lat = at[1];
  if (lat === 0) return `over the ball, ${depthText}`;
  const side = lat > 0 ? 'right' : 'left';
  const abs = Math.abs(lat);
  const tackle = slots.find((s) => s.role === (side === 'right' ? 'RT' : 'LT'));
  const t = tackle ? Math.abs(tackle.at[1]) : null;
  const sl = sidelines(l, hash);
  const sideline = Math.abs(side === 'right' ? sl.right : sl.left);
  let where: string;
  if (t !== null && abs <= t + 4) {
    where = abs <= t ? `${fmt(t - abs)} inside the ${side} tackle` : `${fmt(abs - t)} outside the ${side} tackle`;
  } else if (l.numbersFromSidelineYd !== null && Math.abs(abs - (sideline - l.numbersFromSidelineYd)) <= 4) {
    const d = abs - (sideline - l.numbersFromSidelineYd);
    where = d === 0 ? 'on the numbers' : d > 0 ? `plus ${fmt(d)} outside the numbers` : `${fmt(-d)} inside the numbers`;
  } else {
    const hashLat = sideline - l.hashFromSidelineYd;
    const d = abs - hashLat;
    where = Math.abs(d) <= 3 ? (d === 0 ? `on the ${side} hash` : `${fmt(Math.abs(d))} ${d > 0 ? 'outside' : 'inside'} the ${side} hash`)
      : `${fmt(sideline - abs)} from the ${side} sideline`;
  }
  return `${where}, ${depthText}`;
}

const R = Math.sqrt(0.5);
/** The eight standard break directions (every 45 degrees), drawn axes. */
const DIRS: readonly Yd2[] = [[1, 0], [R, R], [0, 1], [-R, R], [-1, 0], [-R, -R], [0, -1], [R, -R]];

/** Snap each leg to the nearest standard break angle and each point to a whole-yard depth (O3.1.2). */
export function snapPath(from: Yd2, path: readonly DrawnPoint[], params: ParamTable): DrawnPoint[] {
  const step = params.num('designer.snap.depthYd');
  const out: DrawnPoint[] = [];
  let x = from[0], y = from[1];
  for (const p of path) {
    const dx = p.at[0] - x, dy = p.at[1] - y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;
    let best = DIRS[0]!, bestDot = -2;
    for (const d of DIRS) { const dot = (dx * d[0] + dy * d[1]) / len; if (dot > bestDot) { bestDot = dot; best = d; } }
    const nx = roundTo(x + best[0] * len, step), ny = roundTo(y + best[1] * len, step);
    out.push({ ...p, at: [nx, ny] });
    x = nx; y = ny;
  }
  return out;
}

/** A route-tree shape (F6) for a receiver aligned to the RIGHT; points relative to his alignment. */
export interface RouteTemplate { readonly name: string; readonly points: readonly Yd2[] }

/** The route's name when the drawn shape matches a template within tolerance; outside is toward his sideline. */
export function recognizeRoute(from: Yd2, path: readonly DrawnPoint[], templates: readonly RouteTemplate[], params: ParamTable): string | null {
  const tol = params.num('designer.route.matchToleranceYd');
  const flip = from[1] < 0 ? -1 : 1;
  const rel = path.map((p) => [p.at[0] - from[0], clean((p.at[1] - from[1]) * flip)] as const);
  for (const t of templates) {
    if (t.points.length !== rel.length) continue;
    if (t.points.every((q, i) => Math.abs(q[0] - rel[i]![0]) <= tol && Math.abs(q[1] - rel[i]![1]) <= tol)) return t.name;
  }
  return null;
}

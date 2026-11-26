// Reading an offensive look: the line and its gaps (G2.2.2), receiver numbers (G2.4.1), the declarations
// (G2.1.2) and the formation categories the checks key on (G2.5.1). All pure geometry.
import type { FieldGeometry } from './keys.ts';
import { param } from './params.ts';
import type { BoardSituation, Declarations, Gap, Look, OffLook, OffPlayer, RelSide, Side } from './types.ts';

const OL = new Set(['LT', 'LG', 'C', 'RG', 'RT']);
/** Players this close laterally along the line are one blocking surface (design value). */
const ATTACHED_YD = 2.5;
/** A wing: off the line, within this lateral distance outside the end man and this depth (design value). */
const WING_LAT_YD = 2;
const WING_DEPTH_YD = 1.5;
/** A back: behind this depth inside the tackle box (design value). */
const BACK_DEPTH_YD = 2;
const GAPS: readonly Gap[] = ['A', 'B', 'C', 'D', 'E', 'F'];

export const sgn = (s: Side): number => (s === 'right' ? 1 : -1);
export const other = (s: Side): Side => (s === 'right' ? 'left' : 'right');

export interface LineSide {
  /** Blocking surface outward from the center, center excluded (G, T, then Y, W...). */
  readonly men: readonly OffPlayer[];
  /** A wing outside the end man, if any; it adds a gap (G2.2.2). */
  readonly wing: OffPlayer | null;
  /** Gaps on this side with their lateral centre, A first. */
  readonly gaps: readonly { readonly gap: Gap; readonly y: number }[];
  readonly tightEnds: number;
}

export interface Reading {
  readonly look: OffLook;
  readonly center: OffPlayer;
  readonly line: Readonly<Record<Side, LineSide>>;
  /** Eligible receivers by side, outside-in (number 1 widest), backs excluded. */
  readonly receivers: Readonly<Record<Side, readonly OffPlayer[]>>;
  readonly backs: readonly OffPlayer[];
  readonly eligible: readonly OffPlayer[];
  readonly looks: ReadonlySet<Look>;
}

function chain(onLine: OffPlayer[], center: OffPlayer, side: Side): OffPlayer[] {
  const s = sgn(side);
  const cands = onLine.filter((p) => p !== center && (p.py - center.py) * s > 0).sort((a, b) => (a.py - b.py) * s);
  const out: OffPlayer[] = [];
  let last = center.py;
  for (const p of cands) {
    if (Math.abs(p.py - last) > ATTACHED_YD) break;
    out.push(p);
    last = p.py;
  }
  return out;
}

export function readLook(look: OffLook): Reading {
  const center = look.players.find((p) => p.role === 'C');
  if (center === undefined) throw new Error(`defense-designer: look ${look.id} has no center`);
  const onLine = look.players.filter((p) => p.onLine);
  const line = {} as Record<Side, LineSide>;
  for (const side of ['left', 'right'] as const) {
    const men = chain(onLine, center, side);
    const s = sgn(side);
    const endY = men.length > 0 ? men[men.length - 1]!.py : center.py;
    const wing = look.players.find((p) => !p.onLine && p.role !== 'Q' && (p.py - endY) * s > 0 && (p.py - endY) * s <= WING_LAT_YD && p.px >= -WING_DEPTH_YD) ?? null;
    const ys = [center.py, ...men.map((m) => m.py)];
    const gaps: { gap: Gap; y: number }[] = [];
    for (let i = 1; i < ys.length; i++) gaps.push({ gap: GAPS[i - 1]!, y: (ys[i - 1]! + ys[i]!) / 2 });
    const outer = wing === null ? endY + s : (endY + wing.py) / 2;
    gaps.push({ gap: GAPS[gaps.length]!, y: outer });
    if (wing !== null) gaps.push({ gap: GAPS[gaps.length]!, y: wing.py + s });
    line[side] = { men, wing, gaps, tightEnds: men.filter((m) => !OL.has(m.role)).length };
  }
  const ends = new Set([line.left.men.at(-1), line.right.men.at(-1)].filter((p): p is OffPlayer => p !== undefined));
  // Eligible: not an interior lineman by number, and either off the line or an end of the line (B2, B4 eligibility).
  const lineEnds = (() => {
    const sorted = [...onLine].sort((a, b) => a.py - b.py);
    return new Set([sorted[0], sorted[sorted.length - 1]]);
  })();
  const eligible = look.players.filter((p) => !OL.has(p.role) && p.role !== 'Q' && (!p.onLine || lineEnds.has(p)));
  const tackleY = Math.max(...line.left.men.slice(0, 2).map((m) => Math.abs(m.py)), ...line.right.men.slice(0, 2).map((m) => Math.abs(m.py)), 2);
  const backs = eligible.filter((p) => !p.onLine && p.px <= -BACK_DEPTH_YD && Math.abs(p.py) <= tackleY + 1);
  const receivers = { left: [] as OffPlayer[], right: [] as OffPlayer[] };
  for (const p of eligible) {
    if (backs.includes(p)) continue;
    receivers[p.py < center.py ? 'left' : 'right'].push(p);
  }
  receivers.left.sort((a, b) => a.py - b.py);
  receivers.right.sort((a, b) => b.py - a.py);
  void ends;
  return { look, center, line, receivers, backs, eligible, looks: classify(look, line, receivers, backs) };
}

function classify(look: OffLook, line: Record<Side, LineSide>, rcv: Record<Side, OffPlayer[]>, backs: OffPlayer[]): Set<Look> {
  const out = new Set<Look>();
  if (backs.length === 0) out.add('empty');
  const nl = rcv.left.length;
  const nr = rcv.right.length;
  if (nl >= 3 || nr >= 3) out.add('trips');
  if ((nl === 3 && nr === 1) || (nr === 3 && nl === 1)) out.add('threeByOne');
  if (nl === 2 && nr === 2) out.add('twoByTwo');
  for (const side of ['left', 'right'] as const) {
    const r = rcv[side];
    for (let i = 0; i + 2 < r.length; i++) if (Math.abs(r[i]!.py - r[i + 2]!.py) <= 4) out.add('bunch');
    for (let i = 0; i + 1 < r.length; i++) if (Math.abs(r[i]!.py - r[i + 1]!.py) <= 1.5) out.add('stack');
    const olOnSide = line[side].men.filter((m) => OL.has(m.role)).length;
    if (olOnSide >= 3) out.add('unbalanced');
    if (line[side].tightEnds > 0 && line[side].wing !== null) out.add('teWing');
  }
  const digits = look.personnel.split('').map(Number);
  if ((digits[0] ?? 0) + (digits[1] ?? 0) >= 3) out.add('heavy');
  if (look.motion !== null) out.add('motion');
  return out;
}

export interface Declared {
  readonly strong: Side;
  readonly passStrong: Side;
  readonly field: Side;
  /** True when the ball was in the middle band and field fell back to the formation strength (G2.1.2). */
  readonly fieldFromFormation: boolean;
}

/** G2.1.2 declarations: one run strength, one passing strength, field and boundary. */
export function declare(r: Reading, d: Declarations, sit: BoardSituation): Declared {
  const middle = Math.abs(sit.ballYd) <= param('declare.middleBandYd');
  const fieldByBall: Side | null = middle ? null : sit.ballYd < 0 ? 'right' : 'left';
  const tieSide = (): Side => (d.tie === 'arm' ? sit.qbArm : d.tie === 'field' && fieldByBall !== null ? fieldByBall : 'left');
  const pick = (l: number, rgt: number): Side | null => (l > rgt ? 'left' : rgt > l ? 'right' : null);
  const blockers = (s: Side): number => r.line[s].men.length + (r.line[s].wing ? 1 : 0);
  let strong: Side | null;
  switch (d.runStrength) {
    case 'tightEnd': strong = pick(r.line.left.tightEnds + (r.line.left.wing ? 1 : 0), r.line.right.tightEnds + (r.line.right.wing ? 1 : 0)) ?? pick(blockers('left'), blockers('right')); break;
    case 'moreBlockers': strong = pick(blockers('left'), blockers('right')); break;
    case 'back': {
      const off = r.backs.filter((b) => Math.abs(b.py - r.center.py) > 0.5);
      strong = off.length > 0 ? (off[0]!.py < r.center.py ? 'left' : 'right') : null;
      break;
    }
    case 'field': strong = fieldByBall; break;
  }
  const s: Side = strong ?? tieSide();
  const passStrong = pick(r.receivers.left.length, r.receivers.right.length) ?? tieSide();
  return { strong: s, passStrong, field: fieldByBall ?? s, fieldFromFormation: fieldByBall === null };
}

export function sideOf(rel: RelSide, dec: Declared): Side {
  switch (rel) {
    case 'left': case 'right': return rel;
    case 'strong': return dec.strong;
    case 'weak': return other(dec.strong);
    case 'passStrong': return dec.passStrong;
    case 'passWeak': return other(dec.passStrong);
    case 'field': return dec.field;
    case 'boundary': return other(dec.field);
  }
}

/** G2.4.2 divider: a field line deciding whether an outside receiver has safety help, as a function of ball position. Null when the rule set has no numbers keys. */
export function dividerYd(f: FieldGeometry, sit: BoardSituation, side: Side): number | null {
  if (f.numbersTopYd === null || f.numbersBottomYd === null) return null;
  const s = sgn(side);
  const sideline = s * f.halfWidthYd;
  const top = sideline - s * f.numbersTopYd;
  const bottom = sideline - s * f.numbersBottomYd;
  const pos = sit.ballYd * s; // positive: ball on the near hash for this side
  const onHash = f.hashYd - param('declare.middleBandYd');
  if (pos >= onHash) return bottom - s * param('divider.nearHashInsideBottomYd');
  if (pos <= -onHash) return top - s * param('divider.farHashInsideTopYd');
  return top - s * param('divider.middleInsideNumbersYd');
}

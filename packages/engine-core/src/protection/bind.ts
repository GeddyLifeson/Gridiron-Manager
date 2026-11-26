// Pass protection binding (F5.1.1, F5.2 to F5.5, J5.4.2 step 3): a called protection resolved against the
// picture the identifier believes, giving every blocker a man, a gap or a scan list, and naming the rushers
// nobody has. Pure: no draw, no clock. The recognition draw (J5.4.2 step 5) is the planner's; it decides which
// picture comes in here. A wrong picture binds blockers to men who drop and leaves a real rusher to nobody.
//
// Frame: play frame, yards. `py` grows to the offense's left. Slots: blockers are offensive team slots 0 to 10,
// defenders are world slots 11 to 21.
//
// Not built here: stunt pass-offs (F5.8), play-action and sprint-out bindings (F5.7), the chip (F5.5.2), a
// scan across the formation, and redeclaring the Mike by a quarterback at the line as its own timed act.

/** F5.1.1 `type`. `man` is big on big (F5.3.1); the five, six and seven-man versions differ only in who is kept in. */
export type ProtectionType = 'man' | 'half_slide' | 'full_slide';
/** Where a slide goes: a fixed side, toward the heavier believed side, or away from the back (F5.4.2). */
export type SlideRule = 'left' | 'right' | 'threat' | 'away_from_back';
/** A back's or tight end's job (F5.5): `scan` reads second-level defenders inside to outside, `edge` takes the end man on his side. */
export type ExtraJob = 'scan' | 'edge';

export interface ProtectionExtra { readonly teamSlot: number; readonly job: ExtraJob }

/** The protection a pass play calls (F5.1.1), bound to team slots by the content port. */
export interface ProtectionCall {
  readonly id: string;
  readonly type: ProtectionType;
  readonly slide: SlideRule | null;
  /** The linemen in the protection, offensive team slots. */
  readonly line: readonly number[];
  /** Backs and tight ends kept in, in the order they take what is left. */
  readonly extras: readonly ProtectionExtra[];
}

export interface BlockerSpot { readonly teamSlot: number; readonly px: number; readonly py: number }
/** One defender of the believed picture. `line`: down or walked up on the line. `comes`: the identifier believes he rushes. */
export interface Threat { readonly slot: number; readonly px: number; readonly py: number; readonly line: boolean; readonly comes: boolean }

export interface BindSettings {
  /** How far outside the end man of a slide his gap reaches. */
  readonly edgeGapYd: number;
  /** A second-level defender farther than this from the ball laterally is outside the box: no back scans him. */
  readonly boxHalfWidthYd: number;
  /** A second-level defender deeper than this is no linebacker threat: nobody declares or scans him. */
  readonly boxDepthYd: number;
}

export const NOT_IN_PROTECTION = -3;
export const NO_MAN = -1;

export interface ProtectionBinding {
  readonly callId: string;
  /** World slot of the declared Mike, or -1. */
  readonly mike: number;
  /** +1 left, -1 right, 0 no slide. */
  readonly slideDir: 1 | -1 | 0;
  /** Per offensive team slot: world slot of his man, NO_MAN, or NOT_IN_PROTECTION. */
  readonly man: readonly number[];
  /** Per offensive team slot: his gap as a lateral band [lo, hi], or null for a man blocker. */
  readonly zone: readonly (readonly [number, number] | null)[];
  /** Per offensive team slot: the defenders he scans, first to last, or null. */
  readonly scan: readonly (readonly number[] | null)[];
  /** Believed rushers nobody has: the quarterback's (F5.2.2 hot defender), outermost first. */
  readonly hot: readonly number[];
  /** Every defender the binding expected might come: the believed rushers and the scan lists. Anyone else who rushes is a surprise (J6.2.4). */
  readonly expected: readonly number[];
}

const sideOf = (py: number): 1 | -1 => (py >= 0 ? 1 : -1);

/**
 * Order-preserving match of line threats to man linemen with the least total lateral distance (F5.3.1: each
 * lineman has the down lineman over or nearest him, and assignments never cross). Returns the lineman index per threat, -1 unmatched.
 */
function matchInOrder(threatPy: readonly number[], linePy: readonly number[]): number[] {
  const n = threatPy.length, m = linePy.length, INF = 1e9;
  // cost[i][j]: best cost using the first i threats and first j linemen; leaving a threat unmatched costs a large constant.
  const SKIP = 1e3;
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(INF));
  const from: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let j = 0; j <= m; j++) cost[0]![j] = 0;
  for (let i = 1; i <= n; i++) {
    cost[i]![0] = i * SKIP; from[i]![0] = 2;
    for (let j = 1; j <= m; j++) {
      const d = threatPy[i - 1]! - linePy[j - 1]!;
      // A tie goes to the lineman farther from the ball, so the centre stays free for the Mike.
      const lp = linePy[j - 1]!, take = cost[i - 1]![j - 1]! + (d < 0 ? -d : d) + 0.001 / (1 + (lp < 0 ? -lp : lp)), passLine = cost[i]![j - 1]!, skip = cost[i - 1]![j]! + SKIP;
      if (take <= passLine && take <= skip) { cost[i]![j] = take; from[i]![j] = 1; }
      else if (passLine <= skip) { cost[i]![j] = passLine; from[i]![j] = 0; }
      else { cost[i]![j] = skip; from[i]![j] = 2; }
    }
  }
  const out = new Array<number>(n).fill(-1);
  let i = n, j = m;
  while (i > 0) {
    const f = from[i]![j]!;
    if (f === 1) { out[i - 1] = j - 1; i--; j--; } else if (f === 0) j--; else i--;
  }
  return out;
}

/**
 * The default Mike (F5.2.1 rule 1): the middle second-level defender of the box. With a recognized pressure the
 * identifier redeclares him to the second-level rusher nearest the ball (rule 2), which is what `comes` carries.
 */
export function declareMike(threats: readonly Threat[], s: BindSettings): number {
  let best = -1, bestKey = Infinity;
  for (const t of threats) {
    if (t.line) continue;
    const a = t.py < 0 ? -t.py : t.py;
    if (a > s.boxHalfWidthYd || t.px > s.boxDepthYd) continue;
    // A second-level defender believed to come is declared ahead of one who is not; then the most central.
    const key = (t.comes ? 0 : 100) + a;
    if (key < bestKey) { bestKey = key; best = t.slot; }
  }
  return best;
}

export function bindProtection(call: ProtectionCall, blockers: readonly BlockerSpot[], threats: readonly Threat[], s: BindSettings): ProtectionBinding {
  const man = new Array<number>(11).fill(NOT_IN_PROTECTION);
  const zone: ([number, number] | null)[] = new Array<[number, number] | null>(11).fill(null);
  const scan: (number[] | null)[] = new Array<number[] | null>(11).fill(null);
  const spotOf = new Map<number, BlockerSpot>();
  for (const b of blockers) spotOf.set(b.teamSlot, b);
  const line = call.line.filter((t) => spotOf.has(t)).map((t) => spotOf.get(t)!).sort((a, b) => a.py - b.py);
  const extras = call.extras.filter((e) => spotOf.has(e.teamSlot));
  const taken = new Set<number>();
  const coming = threats.filter((t) => t.comes);
  const lineThreats = coming.filter((t) => t.line).sort((a, b) => a.py - b.py);
  const mike = declareMike(threats, s);

  // Slide direction (F5.4.2: toward the more dangerous side, or away from the back).
  let slideDir: 1 | -1 | 0 = 0;
  if (call.type !== 'man') {
    // The back is the first man kept in who is off the line.
    const back = extras.find((e) => spotOf.get(e.teamSlot)!.px < -1) ?? extras[0];
    const backSide = back === undefined ? 0 : spotOf.get(back.teamSlot)!.py === 0 ? 0 : sideOf(spotOf.get(back.teamSlot)!.py);
    let l = 0, r = 0;
    for (const t of coming) { if (t.py > 0) l++; else if (t.py < 0) r++; }
    const rule = call.slide ?? 'away_from_back';
    if (rule === 'left') slideDir = 1;
    else if (rule === 'right') slideDir = -1;
    else if (rule === 'threat' && l !== r) slideDir = l > r ? 1 : -1;
    else slideDir = backSide !== 0 ? (-backSide as 1 | -1) : l >= r ? 1 : -1;
  }

  // Which linemen play man and which slide (F5.4.2 split point; F5.4.1 everyone; F5.3.1 nobody).
  // A lineman is covered when the big-on-big match gives him a down lineman: each rusher covers one blocker, the
  // nearest in order, so a shade between two linemen covers the outer one and the edge rusher covers the tackle.
  const whole = matchInOrder(lineThreats.map((t) => t.py), line.map((b) => b.py));
  const coveredSet = new Set<number>(whole.filter((j) => j >= 0).map((j) => line[j]!.teamSlot));
  const covered = (b: BlockerSpot): boolean => coveredSet.has(b.teamSlot);
  const slides = new Set<number>();
  if (call.type === 'full_slide') for (const b of line) slides.add(b.teamSlot);
  else if (call.type === 'half_slide') {
    // Walk from the man-side edge toward the slide: the first uncovered lineman and everyone beyond him slide.
    const walk = slideDir === 1 ? line : [...line].reverse();
    let sliding = false;
    for (const b of walk) { if (!sliding && !covered(b)) sliding = true; if (sliding) slides.add(b.teamSlot); }
  }

  // Slide men: the gap to the slide side, and whoever is believed to come through it.
  const sliders = line.filter((b) => slides.has(b.teamSlot));
  const inOrder = slideDir === 1 ? sliders : [...sliders].reverse();
  for (let i = 0; i < inOrder.length; i++) {
    const b = inOrder[i]!, next = inOrder[i + 1];
    const far = next === undefined ? b.py + slideDir * s.edgeGapYd : next.py;
    const lo = Math.min(b.py, far), hi = Math.max(b.py, far);
    zone[b.teamSlot] = [lo, hi];
    man[b.teamSlot] = NO_MAN;
  }
  // The slide takes the believed rushers in its span, those nearest the line first when more come than it has
  // men, and passes them along in order: no two slide men end up on one rusher while another gap's man comes free.
  if (inOrder.length > 0) {
    const first = inOrder[0]!, last = zone[inOrder[inOrder.length - 1]!.teamSlot]!;
    const lo = slideDir === 1 ? first.py : last[0], hi = slideDir === 1 ? last[1] : first.py;
    const inSpan = coming.filter((t) => t.py >= lo && t.py <= hi)
      .sort((a, b) => a.px - b.px || a.py - b.py).slice(0, inOrder.length).sort((a, b) => a.py - b.py);
    const byPy = [...inOrder].sort((a, b) => a.py - b.py);
    const m = matchInOrder(inSpan.map((t) => t.py), byPy.map((b) => b.py));
    for (let k = 0; k < inSpan.length; k++) {
      const jx = m[k]!;
      if (jx >= 0) { man[byPy[jx]!.teamSlot] = inSpan[k]!.slot; taken.add(inSpan[k]!.slot); }
    }
  }

  // Man linemen: big on big, in order, nearest. Then the nearest uncovered one has the Mike (F5.3.1).
  const manLine = line.filter((b) => !slides.has(b.teamSlot));
  const open = lineThreats.filter((t) => !taken.has(t.slot));
  const match = matchInOrder(open.map((t) => t.py), manLine.map((b) => b.py));
  for (const b of manLine) man[b.teamSlot] = NO_MAN;
  for (let i = 0; i < open.length; i++) {
    const j = match[i]!;
    if (j >= 0) { man[manLine[j]!.teamSlot] = open[i]!.slot; taken.add(open[i]!.slot); }
  }
  const mikeThreat = threats.find((t) => t.slot === mike);
  if (mikeThreat !== undefined && !taken.has(mike)) {
    let best: BlockerSpot | null = null, bd = Infinity;
    for (const b of manLine) {
      if (man[b.teamSlot] !== NO_MAN) continue;
      const d = mikeThreat.py - b.py, a = d < 0 ? -d : d;
      if (a < bd) { bd = a; best = b; }
    }
    if (best !== null) { man[best.teamSlot] = mike; taken.add(mike); }
  }

  // Backs and tight ends, in call order.
  for (const e of extras) {
    const b = spotOf.get(e.teamSlot)!;
    if (e.job === 'edge') {
      // The end man on his side nobody has (F5.4.1: the back or tight end blocks the edge the line slid away from).
      const side = b.py === 0 ? (slideDir === 0 ? 1 : (-slideDir as 1 | -1)) : sideOf(b.py);
      let best: Threat | null = null;
      for (const t of coming) {
        if (taken.has(t.slot) || sideOf(t.py) !== side) continue;
        if (best === null || t.py * side > best.py * side) best = t;
      }
      man[e.teamSlot] = best === null ? NO_MAN : best.slot;
      if (best !== null) taken.add(best.slot);
      continue;
    }
    // Scan (F5.5.1): every believed rusher nobody has, then the second-level box defenders who may come,
    // inside to outside. He works with the man side: away from the slide when there is one.
    const side = slideDir !== 0 ? -slideDir : 0;
    const list = threats
      .filter((t) => !taken.has(t.slot) && (t.comes || (!t.line && (t.py < 0 ? -t.py : t.py) <= s.boxHalfWidthYd && t.px <= s.boxDepthYd)))
      .filter((t) => side === 0 || t.comes || sideOf(t.py) === side || t.py === 0)
      .sort((x, y) => (x.comes === y.comes ? 0 : x.comes ? -1 : 1) || ((x.py < 0 ? -x.py : x.py) - (y.py < 0 ? -y.py : y.py)) || x.slot - y.slot)
      .map((t) => t.slot);
    scan[e.teamSlot] = list;
    man[e.teamSlot] = NO_MAN;
    // One man is all he can take: the first believed rusher on his list is accounted for.
    const first = coming.find((t) => list[0] === t.slot);
    if (first !== undefined) taken.add(first.slot);
  }

  const hot = coming.filter((t) => !taken.has(t.slot)).sort((a, b) => (b.py < 0 ? -b.py : b.py) - (a.py < 0 ? -a.py : a.py)).map((t) => t.slot);
  const expected = new Set<number>(coming.map((t) => t.slot));
  if (mike >= 0) expected.add(mike);
  for (const list of scan) if (list !== null) for (const d of list) expected.add(d);
  return { callId: call.id, mike, slideDir, man, zone, scan, hot, expected: [...expected] };
}

/** True rushers the binding leaves to nobody: no man has them, no gap holds their start, no back scans them. */
export function unaccounted(binding: ProtectionBinding, rushers: readonly { readonly slot: number; readonly py: number }[]): number[] {
  const out: number[] = [];
  const scanFirst = new Set<number>();
  // A back takes one: the first true rusher on his list.
  for (const list of binding.scan) {
    if (list === null) continue;
    const hit = list.find((d) => rushers.some((r) => r.slot === d) && !scanFirst.has(d) && !binding.man.includes(d));
    if (hit !== undefined) scanFirst.add(hit);
  }
  const zoneUsed = new Set<number>();
  for (const r of rushers) {
    if (binding.man.includes(r.slot) || scanFirst.has(r.slot)) continue;
    let held = false;
    for (let t = 0; t < binding.zone.length; t++) {
      const z = binding.zone[t];
      if (z === null || z === undefined || zoneUsed.has(t) || binding.man[t]! >= 0) continue;
      if (r.py >= z[0] && r.py <= z[1]) { zoneUsed.add(t); held = true; break; }
    }
    if (!held) out.push(r.slot);
  }
  return out;
}

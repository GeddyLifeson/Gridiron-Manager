// Resolve a defensive call against one offensive look (G2.1.1 acceptance: exactly eleven aligned defenders
// with one job each against every formation). Order: read the look, declare (G2.1.2), apply the first check
// whose looks all hold (G2.5.1), align each slot by its rule, then apply the week's matchup rules (G2.4.3).
import { declare, other, readLook, sgn, sideOf, type Declared, type Reading } from './geometry.ts';
import type { FieldGeometry } from './keys.ts';
import { param } from './params.ts';
import type { Align, BoardSituation, CallSlot, Check, Coverage, DefensiveCall, Gap, Job, MatchupRule, OffLook, OffPlayer, Side, TechConvention, ZoneArea } from './types.ts';

export type ResolvedJob =
  | { readonly kind: 'rush'; readonly gap: Gap; readonly side: Side; readonly delayS: number }
  | { readonly kind: 'man'; readonly target: string | null; readonly technique: 'press' | 'off' | 'bail' }
  | { readonly kind: 'bracket'; readonly target: string; readonly part: 'outside' | 'inside' | 'under' | 'over' }
  | { readonly kind: 'zone'; readonly area: ZoneArea; readonly side: Side | null; readonly rect: Rect }
  | { readonly kind: 'spy' };

/** A zone window: lateral range (right-positive, from the midline) and depth range past the line. */
export interface Rect { readonly y0: number; readonly y1: number; readonly d0: number; readonly d1: number }

export interface Defender {
  readonly slot: CallSlot;
  /** Alignment: depth past the line, lateral right-positive from the midline. */
  readonly px: number;
  readonly py: number;
  readonly job: ResolvedJob;
  /** Technique label under the front's convention, for linemen. */
  readonly label: string | null;
  readonly onLine: boolean;
}

export interface Resolution {
  readonly look: OffLook;
  readonly reading: Reading;
  readonly declared: Declared;
  readonly checkApplied: Check | null;
  readonly coverage: Coverage;
  readonly pressureCancelled: boolean;
  readonly defenders: readonly Defender[];
  readonly matchupNotes: readonly string[];
}

/** The looks line up on the ball: lateral offset of every offensive player is relative to the ball spot. */
function shift(look: OffLook, ballYd: number): OffLook {
  return { ...look, players: look.players.map((p) => ({ ...p, py: p.py + ballYd })), motion: look.motion ? { ...look.motion, toPy: look.motion.toPy + ballYd } : null };
}

export function firstCheck(call: DefensiveCall, r: Reading): Check | null {
  return call.checks.find((c) => c.when.length > 0 && c.when.every((l) => r.looks.has(l))) ?? null;
}

export function resolve(call: DefensiveCall, rawLook: OffLook, sit: BoardSituation, f: FieldGeometry): Resolution {
  const look = shift(rawLook, sit.ballYd);
  const reading = readLook(look);
  const declared = declare(reading, call.declarations, sit);
  const check = firstCheck(call, reading);
  const coverage = check?.patch.coverage ?? call.coverage;
  const pressureCancelled = check?.patch.cancelPressure === true;
  const slots = call.slots.map((s) => {
    const p = check?.patch.slots?.[s.id];
    let job = p?.job ?? s.job;
    if (pressureCancelled && job.kind === 'rush' && s.pos !== 'DE' && s.pos !== 'DT' && s.pos !== 'NT') job = cancelRush(s, coverage);
    return { ...s, align: p?.align ?? s.align, job };
  });
  const ctx: Ctx = { reading, declared, sit, f, convention: call.front.convention, labels: call.front.labels ?? {} };
  let defenders = slots.map((s) => place(s, ctx));
  const notes: string[] = [];
  defenders = applyMatchups(defenders, call.matchups, reading, notes);
  return { look, reading, declared, checkApplied: check, coverage, pressureCancelled, defenders, matchupNotes: notes };
}

/** A cancelled pressure (G2.5.1) puts a second-level rusher back in coverage: a hook zone on his side. */
function cancelRush(s: CallSlot, _c: Coverage): Job {
  return { kind: 'zone', area: s.pos === 'S' || s.pos === 'CB' ? 'curlFlat' : 'hook', side: s.job.kind === 'rush' ? s.job.side : 'strong' };
}

interface Ctx { reading: Reading; declared: Declared; sit: BoardSituation; f: FieldGeometry; convention: TechConvention; labels: Readonly<Record<string, string>> }

const BLOCKER_INDEX: Record<string, number> = { C: 0, G: 1, T: 2, Y: 3, W: 4 };

/** Lateral of the k-th blocker outward on a side (0 = center); past the end man, one gap width further out. */
function blockerY(r: Reading, side: Side, k: number): number {
  if (k === 0) return r.center.py;
  const men = r.line[side].men;
  const s = sgn(side);
  if (k <= men.length) return men[k - 1]!.py;
  if (k === men.length + 1 && r.line[side].wing) return r.line[side].wing!.py;
  const end = men.length > 0 ? men[men.length - 1]!.py : r.center.py;
  return end + s * (k - men.length);
}

export function gapY(r: Reading, side: Side, gap: Gap): number {
  const g = r.line[side].gaps.find((x) => x.gap === gap);
  if (g) return g.y;
  const last = r.line[side].gaps[r.line[side].gaps.length - 1]!;
  return last.y + sgn(side) * 1.5 * ('ABCDEF'.indexOf(gap) - 'ABCDEF'.indexOf(last.gap));
}

/** G2.2.2 technique labels. oddOutside: 0 head on the center, i for inside shades, even head-up, odd outside. The fiveHeadUp variant (Conflict in the bible) puts the 5 head-up on the tackle. */
export function techLabel(conv: TechConvention, blocker: string, shade: string): string {
  const odd: Record<string, Record<string, string>> = {
    C: { inside: '0', head: '0', outside: '1' },
    G: { inside: '2i', head: '2', outside: '3' },
    T: { inside: '4i', head: '4', outside: '5' },
    Y: { inside: '6i', head: '6', outside: '7' },
    W: { inside: '8i', head: '8', outside: '9' },
  };
  const five: Record<string, Record<string, string>> = { ...odd, T: { inside: '4', head: '5', outside: '5o' } };
  return (conv === 'fiveHeadUp' ? five : odd)[blocker]?.[shade] ?? '?';
}

function place(s: CallSlot, c: Ctx): Defender {
  const { reading: r, declared: d } = c;
  const a: Align = s.align;
  let px = 0;
  let py = 0;
  let onLine = false;
  let label: string | null = null;
  switch (a.kind) {
    case 'tech': {
      const side = sideOf(a.side, d);
      const k = BLOCKER_INDEX[a.blocker]!;
      const y = blockerY(r, side, k);
      const sh = param('front.shadeYd') * (a.shade === 'head' ? 0 : a.shade === 'outside' ? 1 : -1) * sgn(side);
      px = param('front.linemanDepthYd');
      py = y + sh;
      onLine = true;
      label = c.convention === 'free' ? (c.labels[s.id] ?? '') : techLabel(c.convention, a.blocker, a.shade);
      break;
    }
    case 'lb': {
      const side = sideOf(a.side, d);
      px = a.depthYd ?? param('front.offBallLbDepthYd');
      py = a.gap === 'over' ? r.center.py : gapY(r, side, a.gap);
      break;
    }
    case 'overhang': {
      const side = sideOf(a.side, d);
      const end = r.line[side].wing ?? r.line[side].men.at(-1) ?? r.center;
      px = param('front.overhangDepthYd');
      py = end.py + sgn(side) * param('front.overhangWidthYd');
      onLine = false;
      // Walk out toward the slot when a detached receiver is inside the numbers (a design default).
      const slot = r.receivers[side][r.receivers[side].length - 1];
      if (slot && !slot.onLine && Math.abs(slot.py - end.py) > 3) py = (end.py + slot.py) / 2;
      break;
    }
    case 'rcv': {
      const side = sideOf(a.side, d);
      const list = r.receivers[side];
      const target = list[a.n - 1] ?? null;
      const s2 = sgn(side);
      if (target === null) {
        // Fewer receivers than the rule names: align inside the last one, or off the end man.
        const base = list[list.length - 1]?.py ?? (r.line[side].men.at(-1)?.py ?? r.center.py) + s2 * 4;
        py = base - s2 * 3;
      } else {
        py = target.py + (a.leverage === 'outside' ? s2 : a.leverage === 'inside' ? -s2 : 0);
      }
      px = a.depthYd;
      break;
    }
    case 'deep': {
      px = a.depthYd;
      if (a.side === 'middle') py = c.sit.ballYd;
      else {
        const side = sideOf(a.side, d);
        py = sgn(side) * (c.f.hashYd + a.outsideHashYd);
      }
      break;
    }
    case 'spot': px = a.px; py = a.py + c.sit.ballYd; break;
  }
  return { slot: s, px, py, onLine, label, job: resolveJob(s, c, py) };
}

function resolveJob(s: CallSlot, c: Ctx, py: number): ResolvedJob {
  const j = s.job;
  switch (j.kind) {
    case 'rush': return { kind: 'rush', gap: j.gap, side: sideOf(j.side, c.declared), delayS: j.delayS ?? 0 };
    case 'spy': return { kind: 'spy' };
    case 'man': {
      let target: OffPlayer | null = null;
      if (j.target === 'back') target = c.reading.backs[0] ?? null;
      else if (j.target === 'tightEnd') target = [...c.reading.line.left.men, ...c.reading.line.right.men].find((m) => c.reading.eligible.includes(m)) ?? null;
      else target = c.reading.receivers[sideOf(j.target.side, c.declared)][j.target.n - 1] ?? null;
      return { kind: 'man', target: target?.role ?? null, technique: j.technique ?? 'off' };
    }
    case 'zone': {
      const side = j.side === undefined ? (py < c.sit.ballYd ? 'left' : 'right') : sideOf(j.side, c.declared);
      const centred = j.area === 'deepMiddle' || j.area === 'hole';
      return { kind: 'zone', area: j.area, side: centred ? null : side, rect: zoneRect(j.area, centred ? null : side, c.sit.ballYd, c.f) };
    }
  }
}

/** Zone windows (G2.4.1). Landmarks are design values (Assumption): thirds and quarters split the field width, halves split at the ball, underneath zones are measured from the ball. */
export function zoneRect(area: ZoneArea, side: Side | null, ball: number, f: FieldGeometry): Rect {
  const W = f.halfWidthYd;
  const clamp = (y: number): number => Math.max(-W, Math.min(W, y));
  const s = side === null ? 1 : sgn(side);
  const span = (a: number, b: number, d0: number, d1: number): Rect => ({ y0: clamp(Math.min(a, b)), y1: clamp(Math.max(a, b)), d0, d1 });
  switch (area) {
    case 'deepMiddle': return span(-W / 3, W / 3, 10, 35);
    case 'deepThird': return span(s * W / 3, s * W, 10, 35);
    case 'deepHalf': return span(ball, s * W, 10, 35);
    case 'deepQuarter': return span(s * W, s * (W + ball * s) / 2, 10, 35);
    case 'insideQuarter': return span(ball, s * (W + ball * s) / 2, 10, 35);
    case 'flat': return span(ball + s * 12, s * W, 0, 7);
    case 'curlFlat': return span(ball + s * 8, ball + s * 18, 5, 13);
    case 'hook': return span(ball + s * 2, ball + s * 10, 5, 13);
    case 'hole': return span(ball - 4, ball + 4, 4, 12);
  }
}

function applyMatchups(defs: Defender[], rules: readonly MatchupRule[], r: Reading, notes: string[]): Defender[] {
  const byRole = new Map(r.eligible.map((p) => [p.role, p]));
  const helpersUsed = new Map<string, number>();
  const sorted = rules.filter((m): m is Exclude<MatchupRule, { kind: 'sides' }> => m.kind !== 'sides').sort((a, b) => b.priority - a.priority);
  let out = defs;
  for (const m of sorted) {
    const target = byRole.get(m.target);
    if (target === undefined) { notes.push(`${m.kind} on ${m.target}: off the field, rule idle (base coverage)`); continue; }
    if (m.kind === 'travel' || m.kind === 'noHelp') {
      out = out.map((d) => (d.slot.id === m.corner ? { ...d, py: target.py, job: { kind: 'man', target: target.role, technique: 'press' } } : d));
    } else {
      for (const [slotId, part] of [[m.outside, m.dir === 'inOut' ? 'outside' : 'under'], [m.inside, m.dir === 'inOut' ? 'inside' : 'over']] as const) {
        if (helpersUsed.has(slotId)) { notes.push(`bracket on ${m.target}: ${slotId} already used by a higher-priority rule`); continue; }
        helpersUsed.set(slotId, m.priority);
        out = out.map((d) => (d.slot.id === slotId ? { ...d, job: { kind: 'bracket', target: target.role, part } } : d));
      }
    }
  }
  return out;
}

/** G2.4.3: time for a travel corner to reach his man from his base side: the base time plus his path. */
export function travelTimeS(fromPy: number, toPy: number, speedYdS: number = param('speed.defaultYdS')): number {
  return param('matchup.travelBaseS') + Math.abs(toPy - fromPy) / speedYdS;
}

export { other };

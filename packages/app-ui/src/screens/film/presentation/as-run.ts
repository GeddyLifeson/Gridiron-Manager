// As run against as drawn (PV-12, plan 3.5; O2.6.2 "routes as drawn against routes as run"): for each
// line of our own call, where the player's actual path went furthest from the drawn line, and by how
// many yards. Film positions only; the call lines exist only on our own film after the game (the film
// filter sends none for the opponent), so an opponent play gives nothing here.
import type { FilmFrames } from '../../../field-view/index.ts';
import type { FilmEventLike, OverlayLineLike, PointLike } from '../types.ts';

/** Yards off the drawn line before it is marked (Assumption, design: about one marker width). */
export const AS_RUN_MIN_YD = 1;

export interface AsRunMiss {
  readonly slot: number;
  readonly words: string;
  /** Largest distance from the drawn line between snap and whistle, yards. */
  readonly offYd: number;
  readonly tick: number;
  /** The actual spot and the nearest drawn spot at that tick. */
  readonly ran: PointLike;
  readonly drawn: PointLike;
}

function nearestOnSegment(p: PointLike, a: PointLike, b: PointLike): PointLike {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export function nearestOnLine(p: PointLike, line: readonly PointLike[]): PointLike {
  if (line.length === 1) return line[0]!;
  let best = line[0]!, bd = Infinity;
  for (let i = 1; i < line.length; i++) {
    const q = nearestOnSegment(p, line[i - 1]!, line[i]!);
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

/** Misses at or above AS_RUN_MIN_YD, biggest first. Only `author: 'call'` lines count. */
export function asRunMisses(f: FilmFrames, events: readonly FilmEventLike[], assignments: readonly OverlayLineLike[]): AsRunMiss[] {
  const snap = events.find((e) => e.kind === 'snap')?.tick ?? f.firstTick;
  const whistle = [...events].reverse().find((e) => e.kind === 'whistle')?.tick ?? f.firstTick + f.tickCount - 1;
  const i0 = Math.max(0, snap - f.firstTick), i1 = Math.min(f.tickCount - 1, whistle - f.firstTick);
  const out: AsRunMiss[] = [];
  for (const a of assignments) {
    if (a.author !== 'call' || a.points.length === 0 || a.slot < 0 || a.slot >= f.slotCount) continue;
    let worst: AsRunMiss | null = null;
    for (let i = i0; i <= i1; i++) {
      const ran = { x: f.x[i * f.slotCount + a.slot]!, y: f.y[i * f.slotCount + a.slot]! };
      const drawn = nearestOnLine(ran, a.points);
      const d = Math.hypot(ran.x - drawn.x, ran.y - drawn.y);
      if (!worst || d > worst.offYd) worst = { slot: a.slot, words: a.words, offYd: d, tick: f.firstTick + i, ran, drawn };
    }
    if (worst && worst.offYd >= AS_RUN_MIN_YD) out.push(worst);
  }
  return out.sort((x, y) => y.offYd - x.offYd);
}

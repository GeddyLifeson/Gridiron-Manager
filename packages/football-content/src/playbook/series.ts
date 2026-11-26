// G3.2.2 series and looks-alike groups. Similarity between two plays is the share of the eleven slots whose
// alignment and first-second movement match within tolerance; a series scores its lowest pair. No bonus is
// applied here: defenders read what they see (J3), so looking alike matters by mechanism only.
import { param } from './params.ts';
import type { LookSlot, PlayEntry, Playbook } from './types.ts';

const DEG_PER_RAD = 57.29577951308232;

/** atan2 without platform transcendental math (P1.1.1): a deterministic polynomial, error under 0.01 degree. */
function atanUnit(z: number): number {
  // atan on [0, 1] by an odd minimax polynomial (absolute error about 1e-5 rad).
  const z2 = z * z;
  return z * (0.9998660 + z2 * (-0.3302995 + z2 * (0.1801410 + z2 * (-0.0851330 + z2 * 0.0208351))));
}
export function angleDeg(dy: number, dx: number): number {
  if (dx === 0 && dy === 0) return 0;
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  let a = ax >= ay ? atanUnit(ay / ax) : 1.5707963267948966 - atanUnit(ax / ay);
  if (dx < 0) a = 3.141592653589793 - a;
  if (dy < 0) a = -a;
  return a * DEG_PER_RAD;
}

function slotMatches(a: LookSlot, b: LookSlot, alignTol: number, moveTol: number): boolean {
  const dd = a.at[0] - b.at[0];
  const dl = a.at[1] - b.at[1];
  if (dd * dd + dl * dl > alignTol * alignTol) return false;
  const aStill = a.move[0] === 0 && a.move[1] === 0;
  const bStill = b.move[0] === 0 && b.move[1] === 0;
  if (aStill || bStill) return aStill === bStill;
  let diff = angleDeg(a.move[1], a.move[0]) - angleDeg(b.move[1], b.move[0]);
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return (diff < 0 ? -diff : diff) <= moveTol;
}

/** Pair similarity 0 to 1 (G3.2.2). Slots pair by role; a role missing on either side is a mismatch. */
export function similarity(a: readonly LookSlot[], b: readonly LookSlot[]): number {
  const n = param('series.slots');
  const alignTol = param('series.alignToleranceYd');
  const moveTol = param('series.moveToleranceDeg');
  const byRole = new Map(b.map((s) => [s.role, s] as const));
  let match = 0;
  for (const s of a) {
    const o = byRole.get(s.role);
    if (o && slotMatches(s, o, alignTol, moveTol)) match++;
  }
  return match / n;
}

export interface Series { readonly id: string; readonly name: string; readonly plays: readonly string[] }

export interface SeriesReport {
  readonly score: number;
  readonly pairs: readonly { readonly a: string; readonly b: string; readonly score: number }[];
  /** Plays with no drawing (no look), which cannot be scored. */
  readonly unscored: readonly string[];
}

/** Series score is the lowest pair score (G3.2.2). */
export function scoreSeries(book: Playbook, series: Series): SeriesReport {
  const plays = series.plays.map((id) => book.plays.get(id)).filter((p): p is PlayEntry => !!p);
  const scored = plays.filter((p) => p.look && p.look.length);
  const unscored = plays.filter((p) => !p.look || !p.look.length).map((p) => p.id);
  const pairs: { a: string; b: string; score: number }[] = [];
  for (let i = 0; i < scored.length; i++) for (let j = i + 1; j < scored.length; j++) {
    pairs.push({ a: scored[i]!.id, b: scored[j]!.id, score: similarity(scored[i]!.look!, scored[j]!.look!) });
  }
  const score = pairs.length ? Math.min(...pairs.map((p) => p.score)) : scored.length === 1 ? 1 : 0;
  return { score, pairs, unscored };
}

/**
 * Tells (G3.2.2 report, read by G8.3): formations or motions that only one kind of play uses. `kindOf`
 * maps a play to its kind (run, pass, screen ...); a part used by two or more plays of one kind only is a tell.
 */
export function tells(book: Playbook, kindOf: (p: PlayEntry) => string): { readonly partId: string; readonly kind: string; readonly plays: number }[] {
  const byPart = new Map<string, Map<string, number>>();
  for (const p of book.plays.values()) {
    if (p.status === 'retired' || p.book !== 'offense') continue;
    for (const id of [p.parts.formation, p.parts.motion, p.parts.shift]) {
      if (!id) continue;
      const m = byPart.get(id) ?? new Map<string, number>();
      const k = kindOf(p);
      m.set(k, (m.get(k) ?? 0) + 1);
      byPart.set(id, m);
    }
  }
  const out: { partId: string; kind: string; plays: number }[] = [];
  for (const [partId, kinds] of [...byPart.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (kinds.size !== 1) continue;
    const [kind, plays] = [...kinds.entries()][0]!;
    if (plays >= 2) out.push({ partId, kind, plays });
  }
  return out;
}

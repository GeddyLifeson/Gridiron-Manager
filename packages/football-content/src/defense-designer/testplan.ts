// G2.7.2 board testing: the automatic test plan for a call and the chalk-mode walk-through per pair. It
// reports assignments met or missed, never a win rate. Offensive plays are the staff's scouted
// reconstructions (authored PlayDef), so a wrongly charted play teaches the wrong picture.
import { coverageReport, gapTable, holes, stuntReport, zonePos } from './analysis.ts';
import type { FieldGeometry } from './keys.ts';
import { LOOK_BY_ID } from './looks.ts';
import { param } from './params.ts';
import { resolve } from './resolve.ts';
import type { PlayDef } from '../starter/types.ts';
import type { BoardSituation, DefensiveCall, OffLook } from './types.ts';

export interface TestPair { readonly lookId: string; readonly playId: string | null; readonly why: 'scouted_formation' | 'weak_concept' | 'motion' }

export interface PlanInput {
  /** The opponent's scouted top formations (H2), look ids. */
  readonly scoutedTop: readonly string[];
  /** Scouted plays the opponent runs (staff reconstructions), to find the concepts the call's intent says it is weak to. */
  readonly scoutedPlays: readonly PlayDef[];
  /** Motions the opponent used in the last four games, as look ids that carry the motion. */
  readonly recentMotions: readonly string[];
}

export function proposePlan(call: DefensiveCall, i: PlanInput): TestPair[] {
  const out: TestPair[] = [];
  for (const id of i.scoutedTop) out.push({ lookId: id, playId: null, why: 'scouted_formation' });
  const weak = call.intent.weakTo.map((w) => w.toLowerCase());
  const concepts = i.scoutedPlays.filter((p) => weak.some((w) => p.kind.toLowerCase().includes(w) || p.name.toLowerCase().includes(w))).slice(0, 3);
  for (const p of concepts) out.push({ lookId: p.formationId, playId: p.id, why: 'weak_concept' });
  for (const id of i.recentMotions) out.push({ lookId: id, playId: null, why: 'motion' });
  return out;
}

export interface PairResult {
  readonly pair: TestPair;
  readonly unownedGapsAt05: readonly string[];
  /** Receivers with no defender at 1, 2 and 3 s (role names). */
  readonly openAt: Readonly<Record<'1' | '2' | '3', readonly string[]>>;
  readonly holeAreas: readonly string[];
  readonly checkFired: string | null;
}

/** Position of a receiver t seconds into a scouted play: along his drawn path at the default speed; standing still with no path. */
function receiverAt(play: PlayDef | null, look: OffLook, role: string, t: number, ballYd: number): { y: number; d: number } {
  const p = look.players.find((x) => x.role === role)!;
  const slot = play?.slots.find((s) => s.role === role);
  const pts = [{ px: p.px, py: p.py }, ...(slot?.path ?? []).map((q) => ({ px: q.px, py: q.py }))];
  let left = t * param('speed.defaultYdS');
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!; const b = pts[i]!;
    const seg = Math.sqrt((b.px - a.px) * (b.px - a.px) + (b.py - a.py) * (b.py - a.py));
    if (left <= seg && seg > 0) return { y: a.py + ((b.py - a.py) * left) / seg + ballYd, d: a.px + ((b.px - a.px) * left) / seg };
    left -= seg;
  }
  const last = pts[pts.length - 1]!;
  return { y: last.py + ballYd, d: last.px };
}

export function runPair(call: DefensiveCall, pair: TestPair, plays: readonly PlayDef[], sit: BoardSituation, f: FieldGeometry): PairResult {
  const look = LOOK_BY_ID.get(pair.lookId);
  if (look === undefined) throw new Error(`defense-designer: unknown look ${pair.lookId}`);
  const play = pair.playId === null ? null : plays.find((p) => p.id === pair.playId) ?? null;
  const res = resolve(call, look, sit, f);
  // Gaps unowned at 0.5 s: no owner, or owned only by a looper who has not arrived yet.
  const late = new Set<string>();
  for (const s of call.movement.stunts) {
    const rep = stuntReport(call, res, s);
    if (s.looper !== null && rep.looperArrivalS !== null && rep.looperArrivalS > 0.5) late.add(s.looper);
  }
  const unowned = gapTable(res).filter((g) => g.owners.length === 0 || g.owners.every((o) => late.has(o))).map((g) => `${g.side} ${g.gap}`);
  const cov = coverageReport(res);
  const openAt = { '1': [] as string[], '2': [] as string[], '3': [] as string[] };
  for (const t of [1, 2, 3] as const) {
    const hm = holes(res, t, f);
    for (const r of res.reading.eligible) {
      if ((cov.manBy[r.role]?.length ?? 0) > 0) continue;
      const at = receiverAt(play, look, r.role, t, sit.ballYd);
      const cell = param('holes.cellYd');
      const inHole = hm.cells.some((c) => Math.abs(c.y - at.y) <= cell / 2 && Math.abs(c.d - at.d) <= cell / 2);
      const nearZone = res.defenders.some((d) => { if (d.job.kind !== 'zone') return false; const p = zonePos(d, t); const dy = p.y - at.y; const dd = p.d - at.d; return dy * dy + dd * dd <= param('holes.reachYd') * param('holes.reachYd'); });
      if (inHole || (!nearZone && cov.uncovered.includes(r.role))) openAt[String(t) as '1' | '2' | '3'].push(r.role);
    }
  }
  return { pair, unownedGapsAt05: unowned, openAt, holeAreas: holes(res, 2, f).areas, checkFired: res.checkApplied?.id ?? null };
}

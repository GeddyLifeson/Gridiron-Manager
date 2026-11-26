// Implementations of the conditions vocabulary (J4.1.2). One factory per name in vocabulary.json.
// A factory turns the clause's arguments into a closure over the player's perceived view. Every
// reading goes through `PerceivedView`; a condition whose entity is not perceived is "unknown".
import { SLOTS_PER_TEAM, type Assignment, type DeterministicMath, type PerceivedEntity } from '@gm/schema';
import { F, T, U, dist, eachOf, nearestOf, sideSign, speed, tri, type Ctx, type Sel, type Tri } from './runtime.ts';

export type Args = Readonly<Record<string, string | number | boolean>>;
export type CondFn = (c: Ctx) => Tri;

/** What a factory may ask of the compiler. */
export interface CompileEnv {
  /** Reserves `n` cells of per-play memory and returns the index of the first. */
  alloc(n: number): number;
  sel(text: string): Sel;
  readonly a: Assignment;
  /** Deterministic math when the host supplied it (the only source of sin and cos, J13.3.1). */
  readonly math: DeterministicMath | null;
}

const str = (a: Args, k: string): string => String(a[k]);
const num = (a: Args, k: string): number => Number(a[k]);

function compare(op: string, left: number, right: number): boolean {
  switch (op) {
    case 'lt': return left < right;
    case 'le': return left <= right;
    case 'eq': return left === right;
    case 'ge': return left >= right;
    default: return left > right;
  }
}

function count(c: Ctx, start: number, keep: (e: PerceivedEntity) => boolean, includeSelf = false): number {
  let n = 0;
  eachOf(c, start, (e) => { if (keep(e)) n++; });
  if (includeSelf && c.slot >= start && c.slot < start + SLOTS_PER_TEAM && keep(c.self)) n++;
  return n;
}

/** Receivers on each side of the ball as the player sees them: [left, right]. */
function receiversBySide(c: Ctx, out: [number, number]): void {
  out[0] = 0; out[1] = 0;
  for (let s = 0; s < SLOTS_PER_TEAM; s++) {
    if (c.view.receiverNumber(s) === 0) continue;
    const e = s === c.slot ? c.self : c.view.entity(s);
    if (e === null) continue;
    if (e.py >= 0) out[0]++; else out[1]++;
  }
}

/** The zone a behavior describes: `zonePx`/`zonePy` parameters, else the end of the path, else where he lined up. */
export function zoneOf(a: Assignment): { px: number | null; py: number | null; halfWidth: number | null; halfDepth: number | null } {
  const p = a.behavior.params;
  const last = a.behavior.path[a.behavior.path.length - 1];
  const n = (k: string): number | null => (typeof p[k] === 'number' ? (p[k] as number) : null);
  return { px: n('zonePx') ?? last?.px ?? null, py: n('zonePy') ?? last?.py ?? null, halfWidth: n('zoneHalfWidth'), halfDepth: n('zoneHalfDepth') };
}

function inZone(c: Ctx, z: ReturnType<typeof zoneOf>, e: PerceivedEntity): boolean {
  const zx = z.px ?? c.startPx, zy = z.py ?? c.startPy;
  return Math.abs(e.px - zx) <= (z.halfDepth ?? c.k.zoneHalfDepth) && Math.abs(e.py - zy) <= (z.halfWidth ?? c.k.zoneHalfWidth);
}

/** What the nearest blocker is doing to a defender (J4.1.2 "block type on me"). Null when he is doing nothing readable. */
function blockType(c: Ctx): string | null {
  const b = nearestOf(c, c.oppStart);
  if (b === null || dist(b.px, b.py, c.self.px, c.self.py) > 2 * c.k.engageRange + c.k.gap) return null;
  const ms = c.k.moveSpeed;
  const lateral = Math.abs(b.velPy) > ms;
  if (!lateral && b.velPx < -ms / 2) return 'passSet';
  const outside = c.self.py >= 0 ? 1 : -1;
  if (lateral) {
    const closing = (b.py - c.self.py) * b.velPy < 0;
    if (!closing) return b.velPx <= ms ? 'pullAway' : null;
    return b.velPy * outside > 0 ? 'reach' : 'down';
  }
  return b.velPx > ms ? 'base' : null;
}

function fact(c: Ctx, name: string): boolean {
  return c.view.fact !== undefined ? c.view.fact(name) : c.view.heard(`fact.${name}`);
}

export const CONDITIONS: Readonly<Record<string, (a: Args, env: CompileEnv) => CondFn>> = {
  read: (a) => {
    const kind = str(a, 'kind'), dir = str(a, 'dir');
    return (c) => {
      const r = c.view.playRead();
      if (r.read === 'unknown') return U;
      if (r.read !== kind) return F;
      if (dir === 'any') return T;
      if (dir === 'toMe' || dir === 'away') {
        if (r.side === 'none') return U;
        const toMe = (r.side === 'left') === (c.side === 1);
        return tri(dir === 'toMe' ? toMe : !toMe);
      }
      const s = c.view.believedCarrierSlot();
      const e = s === -1 ? null : c.view.entity(s);
      if (e === null) return U;
      const inside = e.py * c.self.py <= 0 || Math.abs(e.py) < Math.abs(c.self.py);
      return tri(dir === 'inside' ? inside : !inside);
    };
  },
  release: (a, env) => {
    const target = env.sel(str(a, 'target')), is = str(a, 'is');
    return (c) => {
      const e = target(c);
      if (e === null) return U;
      const outward = e.velPy * (e.py >= 0 ? 1 : -1);
      const k = c.k;
      switch (is) {
        case 'vertical': return tri(e.px >= k.verticalDepth && Math.abs(e.velPy) < k.lateralSpeed);
        case 'flat': return tri(e.px < k.flatDepth && outward > k.lateralSpeed);
        case 'out': return tri(e.px >= k.flatDepth && outward > k.lateralSpeed);
        case 'in': return tri(e.px >= k.flatDepth && -outward > k.lateralSpeed);
        case 'under': return tri(e.px < k.flatDepth && -outward > k.lateralSpeed);
        default: return tri(c.view.tSinceSnapS >= k.releaseDecideS && e.px <= k.onLineDepth && speed(e) < k.blockSpeed);
      }
    };
  },
  leverage: (a, env) => {
    const target = env.sel(str(a, 'target')), is = str(a, 'is');
    return (c) => {
      const e = target(c);
      if (e === null) return U;
      const m = c.k.leverageMargin;
      switch (is) {
        case 'inside': return tri(Math.abs(c.self.py) < Math.abs(e.py) - m || (c.self.py * e.py < 0 && Math.abs(e.py) > m));
        case 'outside': return tri(c.self.py * e.py >= 0 && Math.abs(c.self.py) > Math.abs(e.py) + m);
        case 'over': return tri(c.self.px > e.px + m);
        default: return tri(c.self.px < e.px - m);
      }
    };
  },
  cushion: (a, env) => {
    const target = env.sel(str(a, 'target')), lt = num(a, 'lt');
    return (c) => { const e = target(c); return e === null ? U : tri(Math.abs(c.self.px - e.px) < lt); };
  },
  crossesFace: (a, env) => {
    const target = env.sel(str(a, 'target')), m = env.alloc(1);
    return (c) => {
      const e = target(c);
      if (e === null) return U;
      const now = e.py >= c.self.py ? 1 : -1;
      if (c.mem[m] === 0) { c.mem[m] = now; return F; }
      return tri(c.mem[m] !== now);
    };
  },
  inZone: (a, env) => {
    const target = env.sel(str(a, 'target')), z = zoneOf(env.a);
    return (c) => { const e = target(c); return e === null ? U : tri(inZone(c, z, e)); };
  },
  threatInZone: (_a, env) => {
    const z = zoneOf(env.a);
    return (c) => tri(count(c, 0, (e) => c.view.receiverNumber(e.slot) > 0 && inZone(c, z, e)) > 0);
  },
  boxCount: (a) => {
    const cmp = str(a, 'cmp'), n = num(a, 'n');
    return (c) => tri(compare(cmp, count(c, SLOTS_PER_TEAM, (e) => Math.abs(e.py) <= c.k.boxHalfWidth && e.px <= c.k.boxDepth, true), n));
  },
  rushersVsBlockers: (a) => {
    const side = str(a, 'side');
    return (c) => {
      const s = sideSign(c, side), k = c.k;
      const rushers = count(c, SLOTS_PER_TEAM, (e) => e.py * s > 0 && Math.abs(e.py) <= k.boxHalfWidth && e.px <= k.walkedUpDepth, true);
      const blockers = count(c, 0, (e) => e.py * s > k.headUp && Math.abs(e.py) <= k.boxHalfWidth && e.px >= -k.boxDepth, true);
      return tri(rushers > blockers);
    };
  },
  receiversToSide: (a) => {
    const side = str(a, 'side'), cmp = str(a, 'cmp'), n = num(a, 'n');
    const lr: [number, number] = [0, 0];
    return (c) => { receiversBySide(c, lr); return tri(compare(cmp, sideSign(c, side) === 1 ? lr[0] : lr[1], n)); };
  },
  safetiesDeep: (a) => {
    const cmp = str(a, 'cmp'), n = num(a, 'n');
    return (c) => tri(compare(cmp, count(c, SLOTS_PER_TEAM, (e) => e.px >= c.k.deepDepth, true), n));
  },
  defenderOn: (a) => {
    const where = str(a, 'where');
    return (c) => {
      const k = c.k, inside = c.self.py > 0 ? -1 : 1;
      return tri(count(c, SLOTS_PER_TEAM, (e) => {
        if (e.px > k.onLineDepth) return false;
        const d = (e.py - c.self.py) * inside;
        switch (where) {
          case 'me': return Math.abs(d) < k.headUp;
          case 'shadeInside': return d >= k.headUp && d <= k.shade;
          case 'shadeOutside': return -d >= k.headUp && -d <= k.shade;
          case 'gapInside': return d > k.shade && d <= k.gap;
          default: return -d > k.shade && -d <= k.gap;
        }
      }) > 0);
    };
  },
  firstDownLineman: (a) => {
    const side = str(a, 'side'), where = str(a, 'where');
    return (c) => {
      const s = sideSign(c, side), k = c.k, inside = c.self.py > 0 ? -1 : 1;
      let best: PerceivedEntity | null = null;
      eachOf(c, SLOTS_PER_TEAM, (e) => {
        if (e.px > k.onLineDepth || (e.py - c.self.py) * s < -k.headUp) return;
        if (best === null || (e.py - best.py) * s < 0) best = e;
      });
      if (best === null) return F;
      const d = ((best as PerceivedEntity).py - c.self.py) * inside;
      return tri(where === 'on' ? Math.abs(d) < k.headUp : where === 'inside' ? d >= k.headUp : -d >= k.headUp);
    };
  },
  linebackerWalkedUp: () => (c) => tri(count(c, SLOTS_PER_TEAM, (e) => e.px > c.k.onLineDepth && e.px <= c.k.walkedUpDepth && Math.abs(e.py) <= c.k.boxHalfWidth) > 0),
  myManDrops: (_a, env) => {
    const man = env.sel('man');
    return (c) => { const e = man(c); return e === null ? U : tri(e.velPx > c.k.moveSpeed); };
  },
  myManStunts: (a, env) => {
    const man = env.sel('man'), dir = str(a, 'dir');
    return (c) => {
      const e = man(c);
      if (e === null) return U;
      const toward = -e.velPy * (e.py >= 0 ? 1 : -1);
      return tri(dir === 'in' ? toward > c.k.moveSpeed : -toward > c.k.moveSpeed);
    };
  },
  doubleTeamOnMe: () => (c) => tri(count(c, c.oppStart, (e) => dist(e.px, e.py, c.self.px, c.self.py) <= c.k.engageRange) >= 2),
  blockTypeOnMe: (a) => {
    const is = str(a, 'is');
    return (c) => tri(blockType(c) === is);
  },
  ballThrown: () => (c) => { const kind = c.view.ballKind(); return kind === 'unknown' ? U : tri(kind === 'passInFlight'); },
  ballThrownToMyArea: () => (c) => {
    const kind = c.view.ballKind();
    if (kind === 'unknown') return U;
    if (kind !== 'passInFlight') return F;
    const lp = c.view.landingPoint?.();
    if (lp !== undefined && lp !== null) return tri(dist(lp.px, lp.py, c.self.px, c.self.py) <= c.k.ballArea);
    const b = c.view.ball();
    if (b === null) return U;
    // Closest approach of the ball's line to the player.
    const v2 = b.velPx * b.velPx + b.velPy * b.velPy;
    if (v2 === 0) return tri(dist(b.px, b.py, c.self.px, c.self.py) <= c.k.ballArea);
    const along = ((c.self.px - b.px) * b.velPx + (c.self.py - b.py) * b.velPy) / v2;
    if (along < 0) return F;
    return tri(dist(b.px + b.velPx * along, b.py + b.velPy * along, c.self.px, c.self.py) <= c.k.ballArea);
  },
  qbEyes: (a, env) => {
    const qb = env.sel('qb'), dir = str(a, 'dir'), math = env.math;
    return (c) => {
      const e = qb(c);
      if (e === null || math === null || c.view.gazeOf === undefined || e.slot === -1) return U;
      const g = c.view.gazeOf(e.slot);
      if (g === null) return U;
      const d = dist(e.px, e.py, c.self.px, c.self.py);
      if (d === 0) return U;
      const toMe = (math.cos(g) * (c.self.px - e.px) + math.sin(g) * (c.self.py - e.py)) / d >= c.k.eyesConeCos;
      return tri(dir === 'toMe' ? toMe : !toMe);
    };
  },
  qbScrambles: (_a, env) => {
    const qb = env.sel('qb');
    return (c) => {
      const e = qb(c);
      if (e === null) return U;
      return tri(c.view.believedCarrierSlot() === e.slot && speed(e) > c.k.scrambleSpeed && (Math.abs(e.py) > c.k.pocketHalfWidth || e.px > 0));
    };
  },
  qbOutOfPocket: (_a, env) => {
    const qb = env.sel('qb');
    return (c) => { const e = qb(c); return e === null ? U : tri(Math.abs(e.py) > c.k.pocketHalfWidth); };
  },
  ballOut: () => (c) => { const kind = c.view.ballKind(); return kind === 'unknown' ? U : tri(kind === 'loose'); },
  ballCarrierDeclared: () => (c) => {
    const s = c.view.believedCarrierSlot();
    if (s === -1 || c.view.ballKind() !== 'held') return F;
    const e = s === c.slot ? c.self : c.view.entity(s);
    if (e === null) return U;
    return tri(c.view.playRead().read === 'run' || e.px > 0);
  },
  timeGt: (a) => { const s = num(a, 's'); return (c) => tri(c.view.tSinceSnapS > s); },
  stemComplete: () => (c) => tri(c.stemDone),
  atLandmark: () => (c) => tri(c.atTarget),
  formationIs: (a) => {
    const is = str(a, 'is');
    const lr: [number, number] = [0, 0];
    return (c) => {
      receiversBySide(c, lr);
      const [l, r] = lr;
      switch (is) {
        case 'twoByTwo': return tri(l === 2 && r === 2);
        case 'threeByOne': return tri((l === 3 && r === 1) || (l === 1 && r === 3));
        case 'trips': return tri(l >= 3 || r >= 3);
        case 'empty': return tri(count(c, 0, (e) => e.px <= -c.k.backfieldDepth && Math.abs(e.py) <= c.k.boxHalfWidth, true) <= 1);
        default: {
          // Bunch: three receivers on one side within the bunch width of each other.
          for (const s of [1, -1] as const) {
            let n = 0, lo = Infinity, hi = -Infinity;
            for (let i = 0; i < SLOTS_PER_TEAM; i++) {
              if (c.view.receiverNumber(i) === 0) continue;
              const e = i === c.slot ? c.self : c.view.entity(i);
              if (e === null || (e.py >= 0 ? 1 : -1) !== s) continue;
              n++; lo = Math.min(lo, e.py); hi = Math.max(hi, e.py);
            }
            if (n >= 3 && hi - lo <= c.k.bunchWidth) return T;
          }
          return F;
        }
      }
    };
  },
  motion: (a, env) => {
    const dir = str(a, 'dir'), m = env.alloc(SLOTS_PER_TEAM);
    return (c) => {
      let hit = false;
      for (let s = 0; s < SLOTS_PER_TEAM; s++) {
        const e = s === c.slot ? null : c.view.entity(s);
        if (e === null) continue;
        const now = e.py >= 0 ? 1 : -1;
        if (c.mem[m + s] === 0) c.mem[m + s] = now;
        if (dir === 'across') { if (c.mem[m + s] !== now) hit = true; continue; }
        if (speed(e) <= c.k.moveSpeed) continue;
        const toward = (c.self.py - e.py) * e.velPy > 0;
        if (dir === 'toward' ? toward : !toward) hit = true;
      }
      return tri(hit);
    };
  },
  shell: (a) => {
    const is = str(a, 'is');
    return (c) => {
      const deep = count(c, SLOTS_PER_TEAM, (e) => e.px >= c.k.deepDepth, true);
      return tri(is === 'zeroHigh' ? deep === 0 : is === 'oneHigh' ? deep === 1 : deep === 2);
    };
  },
  strengthChanged: (_a, env) => {
    const m = env.alloc(2);
    const lr: [number, number] = [0, 0];
    return (c) => {
      receiversBySide(c, lr);
      const now = lr[0] > lr[1] ? 1 : lr[0] < lr[1] ? -1 : 0;
      if (c.mem[m] === 0) { c.mem[m] = 1; c.mem[m + 1] = now; return F; }
      return tri(c.mem[m + 1] !== now);
    };
  },
  heard: (a) => { const call = str(a, 'call'); return (c) => tri(c.view.heard(call)); },
  ballKicked: () => (c) => { const kind = c.view.ballKind(); return kind === 'unknown' ? U : tri(kind === 'kickInFlight'); },
  kickType: (a) => {
    const is = str(a, 'is');
    return (c) => { const kind = c.view.kickKind?.(); return kind === undefined || kind === null ? U : tri(kind === is); };
  },
  landingPointInside: (a) => {
    const yd = num(a, 'yd');
    return (c) => { const lp = c.view.landingPoint?.(); return lp === undefined || lp === null ? U : tri(dist(lp.px, lp.py, c.self.px, c.self.py) <= yd); };
  },
  fairCatchSignal: () => (c) => tri(fact(c, 'fairCatchSignal')),
  ballTouchedByReceivers: () => (c) => tri(fact(c, 'kickTouchedByReceivers')),
  kickState: (a) => { const name = str(a, 'is') === 'rolling' ? 'kickRolling' : 'kickDeadByRule'; return (c) => tri(fact(c, name)); },
  blockPointReached: (_a, env) => {
    const p = env.a.behavior.params, last = env.a.behavior.path[env.a.behavior.path.length - 1];
    const bx = typeof p['blockPx'] === 'number' ? p['blockPx'] : last?.px, by = typeof p['blockPy'] === 'number' ? p['blockPy'] : last?.py;
    return (c) => (bx === undefined || by === undefined ? U : tri(dist(bx, by, c.self.px, c.self.py) <= c.k.arriveRadius));
  },
  unknown: (a, env) => { const target = env.sel(str(a, 'target')); return (c) => tri(target(c) === null); },
};

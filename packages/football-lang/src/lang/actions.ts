// Implementations of the actions vocabulary (J4.1.3). One factory per name in vocabulary.json:
// "each maps to exactly one implementation in the engine". An action turns the matched rule into a
// movement intent for J2 (target, facing, effort, move mode), a technique choice for J6, and calls
// (J3.6). It reads the perceived view only. A fired action persists tick after tick until another
// rule fires or it reports that it is complete (J4.4.1 rule 3).
import { SLOTS_PER_TEAM, type PerceivedEntity } from '@gm/schema';
import { aim, dist, eachOf, face, faceBall, nearestOf, seenCarrier, speed, type ActivePoint, type Ctx, type Sel } from './runtime.ts';
import type { Args, CompileEnv } from './conditions.ts';
import { isBehavior } from './vocabulary.ts';

/** Runs one tick of the action. `first` is true on the tick the rule fired. Returns true when the action is complete. */
export type ActFn = (c: Ctx, first: boolean) => boolean;

const str = (a: Args, k: string): string => String(a[k]);
const num = (a: Args, k: string): number => Number(a[k]);
const sgn = (v: number): 1 | -1 => (v >= 0 ? 1 : -1);

/** Selectors for a slot found at run time (peel to back). Built once, so setting a man allocates nothing. */
const SLOT_SELS: readonly Sel[] = Array.from({ length: 2 * SLOTS_PER_TEAM }, (_, s): Sel => (c) => (s === c.slot ? c.self : c.view.entity(s)));

function hold(c: Ctx): void { aim(c, c.self.px, c.self.py); c.intent.arrival = 'arrive'; }

/** Path following by waypoint kind (J2.5.1). Returns true once a `settle` point is reached. */
function followPath(c: Ctx): boolean {
  const path = c.path, n = path.length, k = c.k;
  if (n === 0) {
    c.stemDone = true; c.atTarget = true;
    // A man with the ball and no drawn path runs for the goal line he attacks; the carrier's reads belong to K1.
    if (c.behavior === 'ballCarrier') { aim(c, c.self.px + (c.offense ? 1 : -1) * k.extend, c.self.py); c.intent.arrival = 'through'; c.intent.moveMode = 'sprint'; return false; }
    hold(c);
    return true;
  }
  while (c.pathIndex < n) {
    const w = path[c.pathIndex]!;
    const d = dist(w.px, w.py, c.self.px, c.self.py);
    if (w.kind === 'settle') { if (d <= k.arriveRadius) { c.atTarget = true; c.stemDone = true; } break; }
    if (d > k.passRadius) break;
    if (w.kind === 'cut') c.stemDone = true;
    c.pathIndex++;
  }
  c.intent.moveMode = 'sprint';
  if (c.pathIndex < n) {
    const w = path[c.pathIndex]!;
    aim(c, w.px, w.py);
    c.intent.arrival = w.kind === 'settle' ? 'arrive' : 'through';
    return w.kind === 'settle' && c.atTarget;
  }
  // Past the last point: keep running along the last leg.
  c.stemDone = true; c.atTarget = true;
  const last = path[n - 1]!;
  const fromX = n > 1 ? path[n - 2]!.px : c.startPx, fromY = n > 1 ? path[n - 2]!.py : c.startPy;
  const len = dist(last.px, last.py, fromX, fromY);
  if (len === 0) { aim(c, last.px, last.py); c.intent.arrival = 'arrive'; return true; }
  aim(c, last.px + ((last.px - fromX) / len) * k.extend, last.py + ((last.py - fromY) / len) * k.extend);
  c.intent.arrival = 'through';
  return false;
}

function carrierOrBall(c: Ctx): PerceivedEntity | null {
  return seenCarrier(c) ?? c.view.ball();
}

/** The playside sign from the behavior's `playside` parameter: +1 left, -1 right, 0 when the play names none. */
function playside(env: CompileEnv): number {
  const p = env.a.behavior.params['playside'];
  return p === 'left' ? 1 : p === 'right' ? -1 : 0;
}

function rushAt(c: Ctx, e: PerceivedEntity | null, track: string): void {
  c.intent.moveMode = 'sprint'; c.intent.arrival = 'through';
  if (e === null) { aim(c, c.self.px - c.k.extend, c.self.py); return; }
  const d = dist(e.px, e.py, c.self.px, c.self.py);
  let py = e.py;
  if (track !== 'straight' && d > 2 * c.k.rushTrackOffset) py += sgn(c.self.py - e.py) * c.k.rushTrackOffset * (track === 'outside' ? 1 : -1);
  aim(c, e.px, py);
  face(c, e.px, e.py);
}

function toBall(c: Ctx): void {
  c.intent.moveMode = 'sprint'; c.intent.arrival = 'through';
  const lp = c.view.landingPoint?.();
  if (lp !== undefined && lp !== null) { aim(c, lp.px, lp.py); return; }
  const b = c.view.ball();
  if (b === null) { hold(c); return; }
  const inAir = c.view.ballKind() === 'passInFlight' || c.view.ballKind() === 'kickInFlight';
  const lead = inAir ? c.k.pursueLeadS : 0;
  aim(c, b.px + b.velPx * lead, b.py + b.velPy * lead);
  face(c, b.px, b.py);
}

/** Stores the player's spot on the first tick of an action that works from where it started. */
function anchor(c: Ctx, first: boolean, m: number): void {
  if (first || c.mem[m + 2] === 0) { c.mem[m] = c.self.px; c.mem[m + 1] = c.self.py; c.mem[m + 2] = 1; }
}

/** Actions that finish on the tick they fire. They can run before the snap; the others start at the snap. */
export const INSTANT_ACTIONS: ReadonlySet<string> = new Set(['call', 'continue', 'switchBehavior', 'handOffMan', 'takeMan']);

export const ACTIONS: Readonly<Record<string, (a: Args, env: CompileEnv) => ActFn>> = {
  // Movement
  runPath: () => (c) => { followPath(c); return false; },
  continue: () => () => true,
  settleInWindow: (_a, env) => {
    const m = env.alloc(3);
    return (c, first) => { anchor(c, first, m); aim(c, c.mem[m]!, c.mem[m + 1]!); c.intent.arrival = 'arrive'; faceBall(c); c.atTarget = true; return false; };
  },
  convertRoute: (a) => {
    const to = str(a, 'to'), px = num(a, 'px'), py = num(a, 'py'), relative = a['relative'] === true;
    const point: ActivePoint = { px, py, kind: str(a, 'kind') as ActivePoint['kind'] };
    const alt: readonly ActivePoint[] = [point];
    return (c, first) => {
      if (first) {
        point.px = relative ? c.self.px + px : px; point.py = relative ? c.self.py + py : py;
        c.path = alt; c.pathIndex = 0; c.atTarget = false; c.technique['conversion'] = to;
      }
      followPath(c);
      return false;
    };
  },
  scrambleDrill: (a, env) => {
    const rule = str(a, 'rule'), qb = env.sel('qb'), m = env.alloc(3);
    return (c, first) => {
      anchor(c, first, m);
      const e = qb(c) ?? carrierOrBall(c);
      c.intent.moveMode = 'sprint'; c.intent.arrival = 'through';
      if (rule === 'deep') aim(c, c.self.px + c.k.extend, c.self.py);
      else if (e === null) hold(c);
      else if (rule === 'comeBack') { aim(c, (c.self.px + e.px) / 2, (c.self.py + e.py) / 2); c.intent.arrival = 'arrive'; } else if (Math.abs(e.velPy) > c.k.moveSpeed) aim(c, c.mem[m]!, c.self.py + sgn(e.velPy) * c.k.extend);
      else hold(c);
      if (e !== null) face(c, e.px, e.py);
      return false;
    };
  },
  dropTo: (a) => {
    const px = num(a, 'px'), py = num(a, 'py');
    return (c) => {
      aim(c, px, py); c.intent.arrival = 'arrive'; c.intent.moveMode = 'backpedal'; faceBall(c);
      c.atTarget = dist(px, py, c.self.px, c.self.py) <= c.k.arriveRadius;
      return false;
    };
  },
  widen: (a, env) => {
    const yd = num(a, 'yd'), m = env.alloc(3);
    return (c, first) => { anchor(c, first, m); aim(c, c.mem[m]!, c.mem[m + 1]! + c.side * yd); c.intent.moveMode = 'shuffle'; faceBall(c); return false; };
  },
  squeeze: (a, env) => {
    const yd = num(a, 'yd'), m = env.alloc(3);
    return (c, first) => {
      anchor(c, first, m);
      const y = c.mem[m + 1]!;
      aim(c, c.mem[m]!, y - sgn(y) * Math.min(yd, Math.abs(y))); c.intent.moveMode = 'shuffle'; faceBall(c);
      return false;
    };
  },
  sink: (a, env) => {
    const yd = num(a, 'yd'), m = env.alloc(3);
    return (c, first) => { anchor(c, first, m); aim(c, c.mem[m]! + (c.offense ? -yd : yd), c.mem[m + 1]!); c.intent.moveMode = 'backpedal'; faceBall(c); return false; };
  },
  carry: (a, env) => {
    const target = env.sel(str(a, 'target')), toDepth = num(a, 'toDepth');
    return (c) => {
      const e = target(c);
      if (e === null || e.px >= toDepth) return true;
      aim(c, e.px + c.k.shoulderOffset, e.py); c.intent.arrival = 'through'; c.intent.moveMode = 'sprint';
      return false;
    };
  },
  wall: (a, env) => {
    const target = env.sel(str(a, 'target'));
    return (c) => {
      const e = target(c);
      if (e === null) return true;
      aim(c, e.px, e.py - sgn(e.py) * c.k.trailOffset); c.intent.arrival = 'through'; face(c, e.px, e.py);
      return false;
    };
  },
  trail: (a, env) => {
    const target = env.sel(str(a, 'target'));
    return (c) => {
      const e = target(c);
      if (e === null) { hold(c); return false; }
      aim(c, e.px - (c.offense ? -1 : 1) * c.k.trailOffset, e.py); c.intent.arrival = 'through'; c.intent.moveMode = 'sprint'; face(c, e.px, e.py);
      return false;
    };
  },
  pursue: (a) => {
    const angle = str(a, 'angle');
    return (c) => {
      const e = carrierOrBall(c);
      if (e === null) { hold(c); return false; }
      const k = c.k, lead = angle === 'direct' ? 0 : k.pursueLeadS;
      const px = e.px + e.velPx * lead;
      let py = e.py + e.velPy * lead;
      if (angle === 'cutback') py -= sgn(e.velPy) * k.pursueCutback;
      else if (angle === 'insideOut') py -= sgn(py) * k.shoulderOffset;
      else if (angle === 'contain') py = c.side * Math.max(c.side * py + k.containWidth, c.side * c.startPy);
      aim(c, px, py); c.intent.arrival = 'breakdown'; c.intent.moveMode = 'sprint'; face(c, e.px, e.py);
      return false;
    };
  },
  fit: (a) => {
    const gap = str(a, 'gap'), side = str(a, 'side'), shoulder = str(a, 'shoulder') === 'outside' ? 1 : -1;
    const line = new Float64Array(SLOTS_PER_TEAM);
    return (c) => {
      const k = c.k, s = side === 'left' ? 1 : side === 'right' ? -1 : side === 'away' ? -c.side : c.side;
      // The offensive line as he sees it: players near the line of scrimmage, the centre nearest the ball.
      let centre = 0, centreD = Infinity, n = 0;
      eachOf(c, 0, (e) => {
        if (Math.abs(e.px) > k.onLineDepth || Math.abs(e.py) > k.boxHalfWidth) return;
        if (Math.abs(e.py) < centreD) { centreD = Math.abs(e.py); centre = e.py; }
        line[n++] = e.py;
      });
      // The linemen on the called side, nearest the centre first.
      let l1 = NaN, l2 = NaN, l3 = NaN;
      for (let i = 0; i < n; i++) {
        const d = (line[i]! - centre) * s;
        if (d <= 0) continue;
        if (!(d >= (l1 - centre) * s)) { l3 = l2; l2 = l1; l1 = line[i]!; } else if (!(d >= (l2 - centre) * s)) { l3 = l2; l2 = line[i]!; } else if (!(d >= (l3 - centre) * s)) l3 = line[i]!;
      }
      const or = (v: number, from: number): number => (v === v ? v : from + s * k.gap);
      const a1 = or(l1, centre), a2 = or(l2, a1), a3 = or(l3, a2);
      let py: number;
      switch (gap) {
        case 'A': py = (centre + a1) / 2; break;
        case 'B': py = (a1 + a2) / 2; break;
        case 'C': py = (a2 + a3) / 2; break;
        case 'D': py = a3 + s * k.gap; break;
        default: py = (l3 === l3 ? l3 : l2 === l2 ? l2 : l1 === l1 ? l1 : centre) + s * k.containWidth; break;
      }
      aim(c, 0, py + s * shoulder * k.shoulderOffset); c.intent.arrival = 'breakdown'; faceBall(c);
      c.atTarget = dist(c.tp.px, c.tp.py, c.self.px, c.self.py) <= k.arriveRadius;
      return false;
    };
  },
  spill: () => (c) => meetBlocker(c, -1, 'spill'),
  box: () => (c) => meetBlocker(c, 1, 'box'),
  contain: () => (c) => {
    const e = carrierOrBall(c);
    if (e === null) { hold(c); return false; }
    aim(c, e.px, c.side * Math.max(c.side * e.py + c.k.containWidth, c.side * c.startPy)); c.intent.arrival = 'breakdown'; face(c, e.px, e.py);
    return false;
  },
  rush: (a, env) => {
    const track = str(a, 'track'), plan = str(a, 'plan'), qb = env.sel('qb');
    return (c, first) => {
      if (first && plan !== '') c.technique['rushMove'] = plan;
      rushAt(c, qb(c) ?? carrierOrBall(c), track);
      return false;
    };
  },
  stuntPath: (_a, env) => {
    const qb = env.sel('qb');
    return (c) => {
      if (c.pathIndex < c.path.length) { followPath(c); if (c.pathIndex < c.path.length) return false; }
      rushAt(c, qb(c) ?? carrierOrBall(c), 'straight');
      return false;
    };
  },
  peelToBack: () => (c, first) => {
    if (first) {
      const carrier = c.view.believedCarrierSlot(), k = c.k;
      const back = nearestOf(c, 0, (e) => e.slot !== carrier && e.px <= k.flatDepth && Math.abs(e.py) <= 2 * k.boxHalfWidth && speed(e) > k.blockSpeed);
      if (back === null || back.slot === -1) return true;
      c.man = SLOT_SELS[back.slot]!;
    }
    const e = c.man === null ? null : c.man(c);
    if (e === null) return true;
    aim(c, e.px, e.py); c.intent.arrival = 'through'; c.intent.moveMode = 'sprint'; face(c, e.px, e.py);
    return false;
  },
  greenDog: (_a, env) => {
    const qb = env.sel('qb');
    return (c) => {
      const e = c.man === null ? null : c.man(c);
      if (e === null) { hold(c); return false; }
      const k = c.k;
      if (c.view.tSinceSnapS >= k.releaseDecideS && e.px <= k.onLineDepth && speed(e) < k.blockSpeed) { rushAt(c, qb(c) ?? carrierOrBall(c), 'straight'); return false; }
      aim(c, e.px + k.trailOffset, e.py); c.intent.arrival = 'through'; face(c, e.px, e.py);
      return false;
    };
  },
  spy: (a, env) => {
    const depth = num(a, 'depth'), qb = env.sel('qb');
    return (c) => {
      const e = qb(c) ?? carrierOrBall(c);
      if (e === null) { hold(c); return false; }
      aim(c, depth > 0 ? depth : c.k.spyDepth, e.py); c.intent.arrival = 'arrive'; c.intent.moveMode = 'shuffle'; face(c, e.px, e.py);
      return false;
    };
  },

  // Blocking
  block: (a, env) => {
    const target = env.sel(str(a, 'target')), type = str(a, 'type'), ps = playside(env);
    return (c, first) => {
      if (first) c.technique['runBlock'] = type;
      const e = target(c);
      if (e === null) { hold(c); return false; }
      const off = c.k.shoulderOffset;
      let py = e.py;
      if (type === 'reach' || type === 'cutOff') py += (ps !== 0 ? ps : sgn(e.py - c.self.py)) * off;
      else if (type === 'kickOut') py -= (ps !== 0 ? ps : sgn(e.py - c.self.py)) * off;
      aim(c, e.px, py); c.intent.arrival = 'through'; face(c, e.px, e.py);
      return false;
    };
  },
  comboTo: (a, env) => {
    const target = env.sel(str(a, 'target')), m = env.alloc(1);
    return (c, first) => {
      if (first) { c.mem[m] = c.view.tSinceSnapS; c.technique['runBlock'] = 'combo'; }
      const k = c.k;
      const down = c.view.tSinceSnapS - c.mem[m]! < k.comboHoldS ? nearestOf(c, c.oppStart, (e) => e.px <= k.onLineDepth) : null;
      const e = down ?? target(c);
      if (e === null) { hold(c); return false; }
      aim(c, e.px, e.py); c.intent.arrival = 'through'; face(c, e.px, e.py);
      return false;
    };
  },
  pull: (a) => {
    const type = str(a, 'type');
    return (c, first) => {
      if (first) c.technique['runBlock'] = type === 'kick' ? 'kickOut' : 'lead';
      const k = c.k;
      const near = nearestOf(c, c.oppStart, (e) => type === 'kick' || e.px > k.onLineDepth);
      const shows = near !== null && dist(near.px, near.py, c.self.px, c.self.py) <= 2 * k.engageRange;
      if (c.pathIndex < c.path.length && !shows) { followPath(c); if (c.pathIndex < c.path.length) return false; }
      if (near === null) { followPath(c); return false; }
      aim(c, near.px, near.py); c.intent.arrival = 'through'; c.intent.moveMode = 'sprint'; face(c, near.px, near.py);
      return false;
    };
  },
  passSet: (a, env) => {
    const type = str(a, 'type'), rusher = env.sel('nearestRusher');
    return (c, first) => {
      if (first && type !== '') c.technique['passSet'] = type;
      const k = c.k, e = (c.man === null ? null : c.man(c)) ?? rusher(c);
      const px = c.startPx - k.passSetDepth;
      if (e === null) aim(c, px, c.startPy);
      else { aim(c, px, Math.max(c.startPy - k.gap, Math.min(c.startPy + k.gap, e.py))); face(c, e.px, e.py); }
      c.intent.arrival = 'arrive'; c.intent.moveMode = 'shuffle';
      return false;
    };
  },
  slide: (a) => {
    const d = str(a, 'dir') === 'left' ? 1 : -1;
    return (c) => {
      const k = c.k, px = c.startPx - k.passSetDepth;
      const e = nearestOf(c, c.oppStart, (x) => (x.py - c.startPy) * d >= -k.headUp && x.px <= k.walkedUpDepth && dist(x.px, x.py, c.self.px, c.self.py) <= k.scanRange);
      if (e === null) aim(c, px, c.startPy + d * k.gap);
      else { aim(c, px, c.startPy + d * Math.max(0, Math.min(2 * k.gap, (e.py - c.startPy) * d))); face(c, e.px, e.py); }
      c.intent.arrival = 'arrive'; c.intent.moveMode = 'shuffle';
      return false;
    };
  },
  chipThenRelease: (_a, env) => {
    const m = env.alloc(1), rusher = env.sel('nearestRusher');
    return (c, first) => {
      if (first) c.mem[m] = c.view.tSinceSnapS;
      const e = c.view.tSinceSnapS - c.mem[m]! < c.k.chipHoldS ? rusher(c) : null;
      if (e !== null && dist(e.px, e.py, c.self.px, c.self.py) <= 2 * c.k.engageRange) { aim(c, e.px, e.py); c.intent.arrival = 'through'; return false; }
      followPath(c);
      return false;
    };
  },
  scan: () => (c) => {
    const k = c.k;
    let best: PerceivedEntity | null = null;
    eachOf(c, c.oppStart, (e) => {
      if (e.velPx >= 0 || dist(e.px, e.py, c.self.px, c.self.py) > k.scanRange) return;
      if (best === null || Math.abs(e.py) < Math.abs(best.py)) best = e;
    });
    c.intent.moveMode = 'shuffle';
    if (best === null) { aim(c, c.startPx - k.passSetDepth, c.startPy); return false; }
    const e = best as PerceivedEntity;
    aim(c, e.px, e.py); c.intent.arrival = 'through'; face(c, e.px, e.py);
    return false;
  },
  cutOff: (a, env) => {
    const target = env.sel(str(a, 'target')), ps = playside(env);
    return (c, first) => {
      if (first) c.technique['runBlock'] = 'cutOff';
      const e = target(c);
      if (e === null) { hold(c); return false; }
      aim(c, e.px, e.py + (ps !== 0 ? ps : -sgn(e.py)) * c.k.shoulderOffset); c.intent.arrival = 'through'; face(c, e.px, e.py);
      return false;
    };
  },
  climb: () => (c) => {
    const e = nearestOf(c, c.oppStart, (x) => x.px >= c.k.climbMinDepth);
    c.intent.arrival = 'through';
    if (e === null) aim(c, c.self.px + c.k.extend, c.self.py);
    else { aim(c, e.px, e.py); face(c, e.px, e.py); }
    return false;
  },

  // Ball
  breakOnBall: () => (c) => { toBall(c); return false; },
  playHands: () => (c, first) => {
    if (first) c.technique['ballPlay'] = 'playHands';
    const e = c.man === null ? null : c.man(c);
    if (e === null) { toBall(c); return false; }
    aim(c, e.px, e.py); c.intent.arrival = 'through'; c.intent.moveMode = 'sprint'; faceBall(c);
    return false;
  },
  strip: () => (c, first) => {
    if (first) c.technique['ballPlay'] = 'strip';
    const e = carrierOrBall(c);
    if (e === null) { hold(c); return false; }
    aim(c, e.px, e.py); c.intent.arrival = 'breakdown'; face(c, e.px, e.py);
    return false;
  },
  secure: () => (c, first) => { if (first) c.technique['ballPlay'] = 'secure'; c.intent.effort = c.k.secureEffort; return false; },
  getDown: () => (c, first) => { if (first) c.technique['ballPlay'] = 'getDown'; hold(c); c.intent.moveMode = 'down'; return false; },
  getOutOfBounds: () => (c) => {
    aim(c, c.self.px + (c.offense ? 1 : -1) * c.k.arriveRadius, c.self.py + sgn(c.self.py) * c.k.sidelineRun);
    c.intent.arrival = 'through'; c.intent.moveMode = 'sprint';
    return false;
  },
  stayInBounds: () => (c) => {
    aim(c, c.self.px + (c.offense ? 1 : -1) * c.k.extend, c.self.py - sgn(c.self.py) * c.k.containWidth);
    c.intent.arrival = 'through'; c.intent.moveMode = 'sprint';
    return false;
  },
  signalFairCatch: () => (c, first) => { if (first) c.calls.push('signal.fairCatch'); toBall(c); c.intent.arrival = 'arrive'; return false; },
  fieldTheKick: () => (c) => { toBall(c); c.intent.arrival = 'arrive'; return false; },
  letTheKickGo: () => (c) => {
    const b = c.view.landingPoint?.() ?? c.view.ball();
    if (b === null || b === undefined) { hold(c); return false; }
    const d = dist(b.px, b.py, c.self.px, c.self.py);
    if (d >= c.k.kickClearance) { hold(c); return false; }
    if (d === 0) aim(c, c.self.px, c.self.py + c.side * c.k.kickClearance);
    else aim(c, c.self.px + ((c.self.px - b.px) / d) * c.k.kickClearance, c.self.py + ((c.self.py - b.py) / d) * c.k.kickClearance);
    c.intent.arrival = 'through';
    return false;
  },
  downThePunt: () => (c) => {
    const b = c.view.ball();
    if (b === null) { hold(c); return false; }
    aim(c, b.px, b.py); c.intent.arrival = 'breakdown'; c.intent.moveMode = 'sprint';
    return false;
  },
  slideDown: () => (c, first) => { if (first) c.technique['ballPlay'] = 'slide'; hold(c); c.intent.moveMode = 'down'; return false; },

  // Communication
  call: (a) => { const name = str(a, 'name'); return (c, first) => { if (first) c.calls.push(name); return true; }; },

  // Control
  switchBehavior: (a) => {
    const to = str(a, 'to');
    return (c, first) => { if (first && isBehavior(to)) { c.behavior = to; c.stateIndex = 0; } return true; };
  },
  handOffMan: (a) => { const to = str(a, 'to'); return (c, first) => { if (first) { c.calls.push(`passOff.${to}`); c.man = null; } return true; }; },
  takeMan: (a, env) => { const target = env.sel(str(a, 'target')); return (c, first) => { if (first) c.man = target; return true; }; },
  stop: () => (c) => { hold(c); c.intent.effort = 0; c.intent.moveMode = 'stance'; return false; },
};

/** Spill and box (J6: the defender's technique against a lead or pulling block). `shoulder` is -1 inside, +1 outside. */
function meetBlocker(c: Ctx, shoulder: 1 | -1, name: string): boolean {
  c.technique['blockDefeat'] = name;
  const k = c.k;
  // The blocker coming at him: the nearest opponent whose movement closes on him.
  const b = nearestOf(c, c.oppStart, (e) => (c.self.px - e.px) * e.velPx + (c.self.py - e.py) * e.velPy > 0 && dist(e.px, e.py, c.self.px, c.self.py) <= k.scanRange);
  if (b === null) { hold(c); return false; }
  aim(c, b.px, b.py + sgn(b.py) * shoulder * k.shoulderOffset); c.intent.arrival = 'through'; face(c, b.px, b.py);
  return false;
}

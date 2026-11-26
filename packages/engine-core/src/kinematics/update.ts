// J2.1.1 movement update, J2.3 move modes, J2.4.1 in-play fatigue and J2.5.3 traffic, as the Move
// stage of the tick. Runs once per sub-step for all 22 slots in slot order. No player's update reads
// another player's new position from the same sub-step: new states go to scratch arrays and are
// committed together. Nothing is allocated after `begin` (P6.3.1).
import {
  MOVE_MODES, SLOT_COUNT, TICK_S, issToZ,
  type Intent, type TickWorld,
} from '@gm/schema';
import { dAtan2, dCos, dSin, PI, TWO_PI } from '../dmath.ts';
import type { PlayStage } from '../tick/loop.ts';
import { kinParams, type KinParams } from './params.ts';
import { codZOf } from './movement-params.ts';

const M_STANCE = MOVE_MODES.indexOf('stance'), M_SPRINT = MOVE_MODES.indexOf('sprint'), M_RUN = MOVE_MODES.indexOf('run');
const M_BACKPEDAL = MOVE_MODES.indexOf('backpedal'), M_SHUFFLE = MOVE_MODES.indexOf('shuffle');
const M_ENGAGED = MOVE_MODES.indexOf('engaged'), M_DOWN = MOVE_MODES.indexOf('down');
// Imported values read inside the sub-step are copied to module constants once: a plain constant is
// cheaper to read in a loop than an imported binding under some module loaders (G-97). Same values.
const N = SLOT_COUNT, TICK = TICK_S, PI_ = PI, TWO_PI_ = TWO_PI;
const DEG = PI / 180;
const TINY_SPEED = 1e-9;
/** The code of a move mode name. The same answer as `MOVE_MODES.indexOf`, without the search. */
const MODE_CODE: Readonly<Record<string, number>> = Object.fromEntries(MOVE_MODES.map((m, i) => [m, i]));
const modeCode = (m: string): number => { const c = MODE_CODE[m]; return c === undefined ? -1 : c; };
/** Pushes land a hair outside the floor so rounding cannot leave them a hair inside it. Not a football number. */
const SPACING_SLACK = 1 + 1e-9;

/**
 * J2.1.1 step 6: what a contest allows the player this sub-step. J6 supplies it. Writes
 * [maxSpeedYps, axisX, axisY] (field frame, unit axis, or 0 0 for any direction) and returns true,
 * or returns false for no limit.
 */
export type EngagementLimit = (world: TickWorld, slot: number, out: Float64Array) => boolean;

export interface MovementOptions {
  readonly engagementLimit?: EngagementLimit | null;
  /** J2.4.1 `env`: the heat and altitude factor of J12 and D10.5.1. 1 until J12 supplies it. */
  readonly fatigueEnv?: ((world: TickWorld) => number) | null;
}

export interface Movement {
  readonly stage: PlayStage;
  /** J2.1.3 planted cut: on his next sub-step the player redirects to his desired direction at no more than `vCutYps`. */
  requestCut(slot: number, vCutYps: number): void;
  /**
   * Names the player this slot is trying to reach (a tackler's carrier, a defender's man), or -1 for
   * none. He does not steer around that player (J2.5.3 avoidance is for bodies in the way, not the
   * body he is going to). The wash still applies. Cleared at the start of each play.
   */
  setChase(slot: number, targetSlot: number): void;
  /**
   * J2.1.3 planted cut, planned ahead: the player brakes so that he reaches his intent's target point
   * at no more than `vCutYps`, plants there inside the sub-step he reaches it, and leaves toward the
   * next point (play frame) at no more than `vCutYps`. Until `takeCutDone` or `cancelCut` is called he
   * keeps running to the next point. This gives the break sub-step timing, which a once-a-tick
   * decision cannot.
   */
  planCut(slot: number, vCutYps: number, nextPx: number, nextPy: number): void;
  /** True once, after a planned cut has been made. Clears the plan. */
  takeCutDone(slot: number): boolean;
  cancelCut(slot: number): void;
  /** Seconds left of a backpedal or crossover transition (J2.3.2), 0 when none. */
  transitionLeftS(slot: number): number;
  /** In-play energy cost so far (J2.4.1), returned to D10 at the end of the play. */
  energyCost(slot: number): number;
  /** Top speed the player can reach right now in a mode, with fatigue (J2.3, J2.4.1). */
  modeTopSpeed(world: TickWorld, slot: number, mode: number): number;
}

export function createMovement(options: MovementOptions = {}): Movement {
  const f = () => new Float64Array(N);
  const nx = f(), ny = f(), nvx = f(), nvy = f();
  const zCod = f(), zBackpedal = f(), costScale = f(), baseFatigue = f(), cost = f(), radius = f();
  const transLeft = f(), cutCap = f(), fracBackpedal = f(), fracShuffle = f();
  const cutFlag = new Uint8Array(N), lastMode = new Uint8Array(N), reverted = new Uint8Array(N);
  const chase = new Int8Array(N).fill(-1);
  const planFlag = new Uint8Array(N), planDone = new Uint8Array(N), planRun = new Uint8Array(N);
  const planV = f(), planPx = f(), planPy = f();
  const limit = new Float64Array(3);
  /** Per sub-step scratch for the pair sweeps: body radius as it counts now (smaller on the ground), and who is down. */
  const rEff = f(), isDown = new Uint8Array(N);
  const engagementLimit = options.engagementLimit ?? null, fatigueEnv = options.fatigueEnv ?? null;
  let P: KinParams | null = null, cosFree = 0;

  const begin = (w: TickWorld): void => {
    const p = P = kinParams(w.params);
    cosFree = dCos(p.gazeFreeDeg! * DEG);
    for (let s = 0; s < N; s++) {
      const info = w.slots[s]!, a = info.player.attributes;
      zCod[s] = codZOf(info.movement, p);
      zBackpedal[s] = issToZ(a['backpedal_and_transition']!);
      const stamina = 1 - p.fatigueStaminaPerZ! * issToZ(a['stamina']!);
      const sClip = stamina < p.fatigueStaminaMin! ? p.fatigueStaminaMin! : stamina > p.fatigueStaminaMax! ? p.fatigueStaminaMax! : stamina;
      costScale[s] = (info.player.weightLb / p.fatigueRefWeightLb!) * sClip;
      baseFatigue[s] = w.players.fatigueNow[s]!;
      cost[s] = 0; transLeft[s] = 0; cutFlag[s] = 0; cutCap[s] = 0; chase[s] = -1; planFlag[s] = 0; planDone[s] = 0; planRun[s] = 0;
      radius[s] = info.movement.bodyRadiusYd;
      lastMode[s] = w.players.moveMode[s]!;
      const bp = p.backpedalBase! + p.backpedalPerZ! * zBackpedal[s]!, sh = p.shuffleBase! + p.shufflePerZ! * zCod[s]!;
      fracBackpedal[s] = bp > p.backpedalCap! ? p.backpedalCap! : bp;
      fracShuffle[s] = sh > p.shuffleCap! ? p.shuffleCap! : sh;
    }
  };

  /** J2.3 top-speed fraction of a mode. Called outside the tick only; the tick has the same switch written out. */
  const modeFrac = (p: KinParams, s: number, mode: number): number => (
    mode === M_SPRINT ? 1 : mode === M_RUN ? p.runSpeedFrac! : mode === M_BACKPEDAL ? fracBackpedal[s]!
      : mode === M_SHUFFLE || mode === M_ENGAGED ? fracShuffle[s]! : 0);

  const modeTopSpeed = (w: TickWorld, s: number, mode: number): number => {
    const p = P ?? (P = kinParams(w.params));
    let fat = w.players.fatigueNow[s]!;
    fat = fat < 0 ? 0 : fat > 1 ? 1 : fat;
    return w.slots[s]!.movement.vMaxYps * (1 - p.fatigueVMaxLoss! * fat * fat) * modeFrac(p, s, mode);
  };

  const run = (w: TickWorld, dt: number): void => {
    const p = P ?? (P = kinParams(w.params));
    const pl = w.players, frame = w.frame, dir = frame.attackDir;
    const footing = w.environment.derived.footing, footFwd = 1 - (1 - footing) / 2;
    const env = fatigueEnv ? fatigueEnv(w) : 1;
    const dtShare = dt / TICK, cosGazeFree = cosFree;

    for (let s = 0; s < N; s++) {
      const x = pl.posX[s]!, y = pl.posY[s]!;
      let vx = pl.velX[s]!, vy = pl.velY[s]!;
      if (pl.moveMode[s] === M_DOWN || w.tick < pl.onGroundUntilTick[s]!) {
        nx[s] = x; ny[s] = y; nvx[s] = 0; nvy[s] = 0;
        continue;
      }
      const intent: Intent = w.intents[s]!;
      const mode = pl.engagement[s]! >= 0 ? M_ENGAGED : modeCode(intent.moveMode);
      const from = lastMode[s]!;
      if ((from === M_BACKPEDAL || from === M_SHUFFLE) && (mode === M_SPRINT || mode === M_RUN)) {
        const z = from === M_BACKPEDAL ? zBackpedal[s]! : zCod[s]!;
        const t = p.transitionBaseS! - p.transitionPerZS! * z;
        transLeft[s] = t < p.transitionFloorS! ? p.transitionFloorS! : t;
      }
      lastMode[s] = mode; pl.moveMode[s] = mode;

      const m = w.slots[s]!.movement;
      let fat = pl.fatigueNow[s]!;
      fat = fat < 0 ? 0 : fat > 1 ? 1 : fat;
      const fat2 = fat * fat;
      const speed = Math.sqrt(vx * vx + vy * vy);
      const frac = mode === M_SPRINT ? 1 : mode === M_RUN ? p.runSpeedFrac! : mode === M_BACKPEDAL ? fracBackpedal[s]!
        : mode === M_SHUFFLE || mode === M_ENGAGED ? fracShuffle[s]! : 0;
      let vTop = m.vMaxYps * (1 - p.fatigueVMaxLoss! * fat2) * frac;
      // J2.3.1: looking more than 90 degrees away from the direction of travel costs speed.
      if ((mode === M_SPRINT || mode === M_RUN) && speed > TINY_SPEED) {
        const g = pl.gazeRad[s]!;
        // Hips and eyes agree most of the time: then there is no cost and no trigonometry.
        if (g !== pl.headingRad[s] && cosGazeFree * speed > vx * dCos(g) + vy * dSin(g)) vTop *= 1 - p.gazeSpeedCost!;
      }
      const effort = intent.effort < 0 ? 0 : intent.effort > 1 ? 1 : intent.effort;
      const aBrake = m.aBrakeYps2 * footing;
      const want = vTop * effort;

      // 1. Desired velocity.
      let dvx = 0, dvy = 0, ux = 0, uy = 0, desired = 0;
      const tgt = intent.target, after = planRun[s] === 1;
      let tgtX = 0, tgtY = 0, dCut = -1;
      if (tgt !== null || after) {
        // After a planned cut he runs to the point the plan named until his next decision replaces it.
        if (after) { tgtX = frame.originX + planPx[s]! * dir; tgtY = frame.originY + planPy[s]! * dir; }
        else { tgtX = frame.originX + tgt!.px * dir; tgtY = frame.originY + tgt!.py * dir; }
        const arrival = after ? 'through' : intent.arrival;
        const dx = tgtX - x, dy = tgtY - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (planFlag[s] === 1 && !after) dCut = d;
        if (d < p.reachedRadiusYd!) {
          if (arrival !== 'arrive' && speed > TINY_SPEED) { ux = vx / speed; uy = vy / speed; desired = want; }
        } else {
          ux = dx / d; uy = dy / d; desired = want;
          if (arrival !== 'through') {
            let cap = Math.sqrt(2 * aBrake * d);
            if (arrival === 'breakdown') { const floor = p.breakdownFloor! * vTop; if (cap < floor) cap = floor; }
            if (desired > cap) desired = cap;
          }
          if (dCut >= 0) {
            // Brake to the cut speed at the break point: the most he can carry at distance d is sqrt(vCut^2 + 2 * aBrake * d).
            const cap = Math.sqrt(planV[s]! * planV[s]! + 2 * aBrake * d);
            if (desired > cap) desired = cap;
          }
          // J2.5.3: steer around players close along the path who are not his contest opponent.
          let side = 0;
          const eng = pl.engagement[s]!, chased = chase[s]!;
          for (let o = 0; o < N; o++) {
            if (o === s || o === chased) continue;
            if (eng >= 0 && pl.engagement[o] === eng) continue;
            const rx = pl.posX[o]! - x, ry = pl.posY[o]! - y;
            const ahead = rx * ux + ry * uy;
            if (ahead <= 0 || ahead > p.trafficLookaheadYd! || ahead >= d) continue;
            const lat = ry * ux - rx * uy;
            const reach = radius[s]! + radius[o]! * (pl.moveMode[o] === M_DOWN ? p.downRadiusFrac! : 1);
            const overlap = reach - (lat < 0 ? -lat : lat);
            if (overlap > 0) side += (lat > 0 || (lat === 0 && o < s) ? -1 : 1) * overlap;
          }
          if (side !== 0) {
            const ox = ux - uy * side * p.trafficAvoidGain!, oy = uy + ux * side * p.trafficAvoidGain!;
            const on = Math.sqrt(ox * ox + oy * oy);
            ux = ox / on; uy = oy / on;
          }
        }
      } else {
        const tvx = intent.targetVelPx * dir, tvy = intent.targetVelPy * dir;
        const tv = Math.sqrt(tvx * tvx + tvy * tvy);
        if (tv > TINY_SPEED) { ux = tvx / tv; uy = tvy / tv; desired = tv > want ? want : tv; }
      }
      dvx = ux * desired; dvy = uy * desired;

      // J2.1.3 planted cut: redirect at no more than the cut speed, then re-accelerate.
      let cur = speed;
      if (cutFlag[s] === 1) {
        cutFlag[s] = 0;
        if (cur > cutCap[s]!) cur = cutCap[s]!;
        if (desired > 0) { vx = ux * cur; vy = uy * cur; }
        else if (speed > TINY_SPEED) { vx *= cur / speed; vy *= cur / speed; }
      }

      const accelUp = ((want - cur) / m.tauS) * (1 - p.fatigueAccelLoss! * fat2) * footFwd * dt;
      const brake = aBrake * dt;
      if (transLeft[s]! > 0) {
        // J2.3.2: during a transition he keeps his velocity and cannot accelerate.
        transLeft[s] = transLeft[s]! - dt;
      } else if (cur < p.pivotSpeedYps! || desired === 0) {
        // 2 to 4 at low speed: the turn limit is lifted, so the whole change is along the desired direction.
        let along = desired - cur;
        if (along > 0) { const up = accelUp > 0 ? accelUp : 0; if (along > up) along = up; } else if (along < -brake) along = -brake;
        const ns = cur + along;
        if (desired > 0) { vx = ux * ns; vy = uy * ns; }
        else if (cur > TINY_SPEED) { vx = (vx / cur) * ns; vy = (vy / cur) * ns; }
        else { vx = 0; vy = 0; }
      } else {
        // 2. Split the change into a part along the velocity and a part across it. 3, 4, 5. Limit each.
        const hx = vx / cur, hy = vy / cur;
        const cx = dvx - vx, cy = dvy - vy;
        let along = cx * hx + cy * hy, across = cy * hx - cx * hy;
        if (along > 0) { const up = accelUp > 0 ? accelUp : 0; if (along > up) along = up; } else if (along < -brake) along = -brake;
        const lat = m.aLatYps2 * (mode === M_RUN ? p.runALatMult! : 1) * footing * dt;
        if (across > lat) across = lat; else if (across < -lat) across = -lat;
        vx += along * hx - across * hy; vy += along * hy + across * hx;
        // Turning must not add speed: hold the magnitude to the larger of the mode's top speed and what he had.
        const cap = cur > want ? cur : want, ns = Math.sqrt(vx * vx + vy * vy);
        if (ns > cap && ns > 0) { vx *= cap / ns; vy *= cap / ns; }
      }
      // 6. Engagement: clamp to what the contest allows.
      if (engagementLimit !== null && pl.engagement[s]! >= 0 && engagementLimit(w, s, limit)) {
        const ax = limit[1]!, ay = limit[2]!;
        if (ax !== 0 || ay !== 0) { const along = vx * ax + vy * ay; vx = ax * along; vy = ay * along; }
        const ns = Math.sqrt(vx * vx + vy * vy);
        if (ns > limit[0]! && ns > 0) { vx *= limit[0]! / ns; vy *= limit[0]! / ns; }
      }
      // Hard ceiling (J2.1.1 acceptance 2): nobody exceeds his fresh top speed.
      let ns = Math.sqrt(vx * vx + vy * vy);
      if (ns > m.vMaxYps) { vx *= m.vMaxYps / ns; vy *= m.vMaxYps / ns; ns = m.vMaxYps; }

      // 7. Integrate (semi-implicit Euler).
      let px2 = x + vx * dt, py2 = y + vy * dt;
      if (dCut >= 0 && (dCut <= ns * dt || dCut < p.reachedRadiusYd!)) {
        // The planned cut happens inside this sub-step: run to the break point, plant, and spend what
        // is left of the sub-step leaving it toward the next point at no more than the cut speed.
        const step = ns * dt, rest = step > dCut ? dt * (1 - dCut / step) : 0;
        const ex = frame.originX + planPx[s]! * dir - tgtX, ey = frame.originY + planPy[s]! * dir - tgtY;
        const en = Math.sqrt(ex * ex + ey * ey), c = ns > planV[s]! ? planV[s]! : ns;
        if (en > 0) { vx = (ex / en) * c; vy = (ey / en) * c; } else { vx = 0; vy = 0; }
        ns = en > 0 ? c : 0;
        px2 = tgtX + vx * rest; py2 = tgtY + vy * rest;
        planFlag[s] = 0; planRun[s] = 1; planDone[s] = 1;
      }
      nvx[s] = vx; nvy[s] = vy; nx[s] = px2; ny[s] = py2;

      // 8. Hips turn toward the face target, or follow the velocity when running forward.
      let face = pl.headingRad[s]!;
      const nsp = ns;
      const ft = intent.faceTarget;
      if (mode === M_SPRINT || mode === M_RUN) { if (nsp > TINY_SPEED) face = dAtan2(vy, vx); }
      else if (ft !== null) { const fx = frame.originX + ft.px * dir - x, fy = frame.originY + ft.py * dir - y; if (fx !== 0 || fy !== 0) face = dAtan2(fy, fx); }
      else if (mode === M_BACKPEDAL && nsp > TINY_SPEED) face = dAtan2(-vy, -vx);
      let turn = face - pl.headingRad[s]!;
      while (turn > PI_) turn -= TWO_PI_;
      while (turn <= -PI_) turn += TWO_PI_;
      const maxTurn = p.hipTurnRateRadPs! * dt;
      if (turn > maxTurn) turn = maxTurn; else if (turn < -maxTurn) turn = -maxTurn;
      if (turn !== 0) {
        let h = pl.headingRad[s]! + turn;
        while (h > PI_) h -= TWO_PI_;
        while (h <= -PI_) h += TWO_PI_;
        pl.headingRad[s] = h;
      }

      // J2.4.1 in-play energy.
      const rel = nsp / m.vMaxYps;
      let c = cost[s]! + (p.fatigueMoveCost! * rel * rel + (pl.engagement[s]! >= 0 ? p.fatigueEngagedCost! : 0)) * costScale[s]! * env * dtShare;
      if (c > p.fatiguePlayCap!) c = p.fatiguePlayCap!;
      cost[s] = c;
      pl.fatigueNow[s] = baseFatigue[s]! + c;
    }

    // J2.5.3 "the wash": if two body circles would overlap after the move, the lower-priority player
    // (not the ball carrier, then the higher slot) is held and loses speed. Pairs in fixed slot order.
    // Values fixed for the whole pair sweep are read once (G-97); the arithmetic and its order are unchanged.
    // The move mode does not change during the sweeps, so each player's radius-as-it-counts and down flag
    // are worked out once per sub-step instead of once per pair. The products are the same products.
    const downFrac = p.downRadiusFrac!, spacingFrac = p.minSpacingFrac!;
    const engagement = pl.engagement, posX = pl.posX, posY = pl.posY;
    for (let s = 0; s < N; s++) { const down = pl.moveMode[s] === M_DOWN; isDown[s] = down ? 1 : 0; rEff[s] = radius[s]! * (down ? downFrac : 1); }
    for (let a = 0; a < N; a++) {
      const ea = engagement[a]!, aDown = isDown[a] === 1, ra = rEff[a]!;
      for (let b = a + 1; b < N; b++) {
        if (ea >= 0 && ea === engagement[b]) continue;
        const bDown = isDown[b] === 1;
        if (aDown && bDown) continue;
        const reach = ra + rEff[b]!;
        const dx = nx[b]! - nx[a]!, dy = ny[b]! - ny[a]!;
        const d2 = dx * dx + dy * dy;
        if (d2 >= reach * reach) continue;
        const ox = posX[b]! - posX[a]!, oy = posY[b]! - posY[a]!;
        if (d2 >= ox * ox + oy * oy) continue;
        // Who gives way: a player on the ground never moves; otherwise the carrier wins, then the lower slot.
        let loser = b;
        if (bDown || (!aDown && pl.hasBall[b] === 1 && pl.hasBall[a] !== 1)) loser = a;
        const other = loser === a ? b : a;
        // Remove the part of his move that closes on the other player, then apply the speed loss.
        let lx = nx[other]! - pl.posX[loser]!, ly = ny[other]! - pl.posY[loser]!;
        const ln = Math.sqrt(lx * lx + ly * ly);
        if (ln > 0) {
          lx /= ln; ly /= ln;
          const mx = nx[loser]! - pl.posX[loser]!, my = ny[loser]! - pl.posY[loser]!;
          const toward = mx * lx + my * ly;
          if (toward > 0) { nx[loser] = nx[loser]! - toward * lx; ny[loser] = ny[loser]! - toward * ly; }
        }
        nvx[loser] = nvx[loser]! * (1 - p.washSpeedLoss!); nvy[loser] = nvy[loser]! * (1 - p.washSpeedLoss!);
        // Never closer than the spacing floor: push him straight out to it.
        const fx = nx[loser]! - nx[other]!, fy = ny[loser]! - ny[other]!;
        const fd = Math.sqrt(fx * fx + fy * fy), floor = reach * spacingFrac;
        if (fd < floor) {
          if (fd > 0) { nx[loser] = nx[other]! + (fx / fd) * floor; ny[loser] = ny[other]! + (fy / fd) * floor; }
          else { nx[loser] = nx[other]! + (loser > other ? floor : -floor); }
        }
      }
    }
    // Spacing floor: no two players who are not in a contest end a sub-step closer than the floor.
    // Two passes push the lower-priority player out. If bodies are packed so tightly that pushing one
    // out pushes him into another, the players still too close stay where they were, one at a time,
    // lower priority first. Every player staying put is the state before the move, so this ends.
    reverted.fill(0);
    for (let pass = 0; pass < N + 2; pass++) {
      let changed = false;
      for (let a = 0; a < N; a++) {
        const ea = engagement[a]!, aDown = isDown[a] === 1, ra = rEff[a]!;
        for (let b = a + 1; b < N; b++) {
          if (ea >= 0 && ea === engagement[b]) continue;
          const bDown = isDown[b] === 1;
          if (aDown && bDown) continue;
          const floor = (ra + rEff[b]!) * spacingFrac;
          const dx = nx[b]! - nx[a]!, dy = ny[b]! - ny[a]!;
          const d2 = dx * dx + dy * dy;
          if (d2 >= floor * floor) continue;
          let loser = b;
          if (bDown || (!aDown && pl.hasBall[b] === 1 && pl.hasBall[a] !== 1)) loser = a;
          let other = loser === a ? b : a;
          if (pass < 2) {
            const d = Math.sqrt(d2), sign = loser === b ? 1 : -1, out = floor * SPACING_SLACK;
            if (d > 0) { nx[loser] = nx[other]! + (sign * dx / d) * out; ny[loser] = ny[other]! + (sign * dy / d) * out; }
            else nx[loser] = nx[other]! + (loser > other ? out : -out);
            changed = true;
            continue;
          }
          const otherDown = other === a ? aDown : bDown;
          if (reverted[loser] === 1) { if (reverted[other] === 1 || otherDown) continue; const t = loser; loser = other; other = t; }
          nx[loser] = pl.posX[loser]!; ny[loser] = pl.posY[loser]!; nvx[loser] = 0; nvy[loser] = 0; reverted[loser] = 1;
          changed = true;
        }
      }
      if (!changed) break;
    }
    for (let s = 0; s < N; s++) { pl.posX[s] = nx[s]!; pl.posY[s] = ny[s]!; pl.velX[s] = nvx[s]!; pl.velY[s] = nvy[s]!; }
  };

  return {
    stage: { name: 'move', begin, run },
    requestCut(slot: number, vCutYps: number): void { cutFlag[slot] = 1; cutCap[slot] = vCutYps; },
    setChase(slot: number, targetSlot: number): void { chase[slot] = targetSlot; },
    planCut(slot: number, vCutYps: number, nextPx: number, nextPy: number): void {
      planFlag[slot] = 1; planRun[slot] = 0; planDone[slot] = 0; planV[slot] = vCutYps; planPx[slot] = nextPx; planPy[slot] = nextPy;
    },
    takeCutDone(slot: number): boolean {
      if (planDone[slot] !== 1) return false;
      planDone[slot] = 0; planRun[slot] = 0; planFlag[slot] = 0;
      return true;
    },
    cancelCut(slot: number): void { planDone[slot] = 0; planRun[slot] = 0; planFlag[slot] = 0; },
    transitionLeftS: (slot) => (transLeft[slot]! > 0 ? transLeft[slot]! : 0),
    energyCost: (slot) => cost[slot]!,
    modeTopSpeed,
  };
}

/** The mode code of 'stance', for callers that park a player. */
export const STANCE_MODE = M_STANCE;

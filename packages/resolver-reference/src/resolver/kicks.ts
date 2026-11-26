// Kicking plays of the reference resolver: punt, place kicks, free kicks and the onside kick (J1.6.3).
// The kicking team attacks +px; the receiving team returns toward -px. Each result is a draw from the
// league rates in params.ts. Which result is legal, where the next snap is and who scores are for
// officiating to rule from the events (contract D-04).
import { roundSimS, roundYd, type KickCall } from '@gm/schema';
import type { Ctx } from './context.ts';
import { FG_BAND_UPPER } from './params.ts';

const KICKER_ROLES = ['K', 'PK'];
const PUNTER_ROLES = ['P'];
const SNAPPER_ROLES = ['LS', 'C'];
const HOLDER_ROLES = ['H', 'HOLDER'];
const RETURNER_ROLES = ['PR', 'KR', 'R'];
/** Smallest distance written to a truth record (J1.2.2). */
const RES_YD = 0.01;

export function resolveKick(c: Ctx, call: KickCall): void {
  switch (call.kickKind) {
    case 'punt': c.facts.phase = 'scrimmage_kick'; return punt(c, call);
    case 'field_goal': c.facts.phase = 'scrimmage_kick'; return placeKick(c, call, true);
    case 'try_kick': c.facts.phase = 'try'; return placeKick(c, call, true);
    case 'fair_catch_kick': c.facts.phase = 'free_kick'; return placeKick(c, call, false);
    case 'onside_kick': c.facts.phase = 'free_kick'; return onside(c, call);
    case 'kickoff':
    case 'safety_kick': c.facts.phase = 'free_kick'; return freeKick(c, call);
  }
}

function lateral(c: Ctx, call: KickCall): number {
  const aim = call.direction === 'left' ? 1 : call.direction === 'right' ? -1 : 0;
  return c.inBoundsPy((aim === 0 ? c.rng.uniform() - 0.5 : aim * c.rng.uniform()) * c.cfg.geom.passLateral);
}

function returner(c: Ctx): number { return c.byRole('opposing', RETURNER_ROLES) ?? c.pickId('opposing'); }

/** A caught kick run back toward -px. A returner in the field of play is never carried back into his own end zone. */
function runBack(c: Ctx, id: number, fromPx: number, py: number, yards: number, t0: number): void {
  let toPx = fromPx - yards;
  if (fromPx < c.goalAhead && toPx >= c.goalAhead) toPx = c.goalAhead - RES_YD;
  c.facts.kickReturn = true;
  c.carry({ team: 'opposing', carrierId: id, fromPx, toPx, py, t0, oobShare: 0, fumbleShare: 0, ownEndZoneImpetus: c.sideSnap });
}

function punt(c: Ctx, call: KickCall): void {
  const K = c.cfg.punt;
  const punter = c.byRole('snapping', PUNTER_ROLES) ?? c.byRole('snapping', KICKER_ROLES) ?? c.snapIds[c.snapIds.length - 1]!;
  c.facts.hadSnap = true;
  c.push({ type: 'snap', t: 0, snapperId: c.byRole('snapping', SNAPPER_ROLES), toPlayerId: punter, quality: 'clean' });
  c.push({ type: 'possession', t: 0, side: c.sideSnap, playerId: punter, spot: c.spot(-K.kickDepth, 0), how: 'snap' });
  const tKick = K.operation;
  const kickSpot = c.spot(-K.kickDepth, 0);

  if (c.rng.chance(K.blocked)) {
    // Blocked: the ball stays behind the line and the receiving team falls on it there.
    const blocker = c.pickId('opposing');
    const px = Math.max(-K.kickDepth / 2, c.goalBehind + RES_YD);
    c.push({ type: 'kick', t: roundSimS(tKick), kickKind: 'punt', kickerId: punter, kickSpot, landingSpot: c.spot(px, 0), hangTimeS: 0, crossedLine: false, blockedById: blocker });
    const tr = tKick + c.cfg.time.carryBase;
    c.push({ type: 'possession', t: roundSimS(tr), side: c.sideOpp, playerId: blocker, spot: c.spot(px, 0), how: 'kick_recovery' });
    c.dead(tr, 'down_by_contact', px, 0, 'opposing', blocker);
    return;
  }

  const gross = Math.max(1, K.grossMean + K.grossSd * c.rng.normal() + c.edge * K.grossSd);
  const py = lateral(c, call);
  let land = gross;
  let touchback = false;
  if (land >= c.goalAhead - K.pinZone) {
    // The kick would reach the goal line area: a touchback, or a kick placed short of it.
    if (c.rng.chance(K.touchbackWhenReached)) { touchback = true; land = c.goalAhead + c.ezAhead / 2; }
    else land = Math.max(1, c.goalAhead - (K.pinMin + (K.pinMax - K.pinMin) * c.rng.uniform()));
  }
  const tLand = tKick + K.hang;
  c.facts.focusPx = land; c.facts.focusPy = py;
  c.push({ type: 'kick', t: roundSimS(tKick), kickKind: 'punt', kickerId: punter, kickSpot, landingSpot: c.spot(land, py), hangTimeS: roundSimS(K.hang), crossedLine: true, blockedById: null });
  if (touchback) {
    c.push({ type: 'kick_touch', t: roundSimS(tLand), marginYd: null, marginS: null, visibility: 'open', kind: 'landed', playerId: null, side: null, spot: c.spot(land, py) });
    c.endZoneImpetus = c.sideSnap;
    c.dead(tLand, 'ball_dead_in_end_zone', land, py, null, null);
    return;
  }
  const result = c.rng.pick(K.outcome);
  if (result === 2) {
    const edgePy = c.sidelinePy(py === 0 ? 1 : py);
    c.push({ type: 'boundary', t: roundSimS(tLand), marginYd: null, marginS: null, visibility: 'open', kind: 'ball_out_of_bounds', playerId: null, spot: c.spot(land, edgePy) });
    c.dead(tLand, 'ball_out_of_bounds', land, edgePy, null, null);
    return;
  }
  if (result === 3) {
    const cover = c.pickId('snapping');
    c.push({ type: 'kick_touch', t: roundSimS(tLand), marginYd: null, marginS: null, visibility: 'open', kind: 'landed', playerId: null, side: null, spot: c.spot(land, py) });
    c.push({ type: 'kick_touch', t: roundSimS(tLand), marginYd: null, marginS: null, visibility: 'open', kind: 'touched_by_kickers', playerId: cover, side: c.sideSnap, spot: c.spot(land, py) });
    c.dead(tLand, 'kick_recovered_by_kickers', land, py, 'snapping', cover);
    return;
  }
  const ret = returner(c);
  if (result === 1) {
    c.push({ type: 'kick_touch', t: roundSimS(tKick + K.hang / 2), marginYd: null, marginS: null, visibility: 'open', kind: 'fair_catch_signal', playerId: ret, side: c.sideOpp, spot: c.spot(land, py) });
    c.push({ type: 'possession', t: roundSimS(tLand), side: c.sideOpp, playerId: ret, spot: c.spot(land, py), how: 'kick_catch' });
    c.dead(tLand, 'fair_catch', land, py, 'opposing', ret);
    return;
  }
  c.push({ type: 'possession', t: roundSimS(tLand), side: c.sideOpp, playerId: ret, spot: c.spot(land, py), how: 'kick_catch' });
  const yards = K.returnFloor + c.expo(K.returnMean - K.returnFloor) - c.edge * K.returnMean;
  runBack(c, ret, land, py, yards, tLand);
}

function placeKick(c: Ctx, call: KickCall, snapped: boolean): void {
  const F = c.cfg.fg;
  const g = c.input.geometry;
  const kicker = c.byRole('snapping', KICKER_ROLES) ?? c.snapIds[c.snapIds.length - 1]!;
  const depth = snapped ? F.holdDepth : 0;
  let tKick = 0;
  if (snapped) {
    const holder = c.byRole('snapping', HOLDER_ROLES) ?? c.byRole('snapping', PUNTER_ROLES) ?? c.snapIds[0]!;
    c.facts.hadSnap = true;
    c.push({ type: 'snap', t: 0, snapperId: c.byRole('snapping', SNAPPER_ROLES), toPlayerId: holder, quality: 'clean' });
    c.push({ type: 'possession', t: 0, side: c.sideSnap, playerId: holder, spot: c.spot(-depth, 0), how: 'snap' });
    tKick = F.operation;
  }
  // Kick length: from the spot of the kick to the goal posts, which stand on the end line (J1.1.1).
  const endLinePx = c.goalAhead + c.ezAhead;
  const distance = endLinePx + depth;
  let p = F.tryMake;
  if (call.kickKind !== 'try_kick') {
    let band = 0;
    while (band < FG_BAND_UPPER.length && distance >= FG_BAND_UPPER[band]!) band++;
    p = F.make[band]!;
  }
  const good = c.rng.chance(c.shifted(p, c.edge));
  const half = (g.uprightNorthY - g.uprightSouthY) / 2;
  const centre = (g.uprightNorthY + g.uprightSouthY) / 2;
  const sign = c.rng.chance(0.5) ? 1 : -1;
  const off = c.rng.uniform();
  // Good: between the uprights. Failed: outside one of them by up to `missWideMax`.
  const y = good ? centre + sign * off * half : centre + sign * (half + RES_YD + off * F.missWideMax);
  const margin = roundYd(good ? half - off * half : RES_YD + off * F.missWideMax);
  const py = (y - c.originY) * c.dir;
  const flight = c.cfg.time.flightBase + c.cfg.time.flightPerYard * distance;
  const landing = c.spot(endLinePx, py);
  c.push({ type: 'kick', t: roundSimS(tKick), kickKind: call.kickKind, kickerId: kicker, kickSpot: c.spot(-depth, 0), landingSpot: landing, hangTimeS: roundSimS(flight), crossedLine: true, blockedById: null });
  c.dead(tKick + flight, good ? 'kick_through_uprights' : 'kick_failed', endLinePx, py, null, null, margin);
}

function freeKick(c: Ctx, call: KickCall): void {
  const K = c.cfg.kickoff;
  const kicker = c.byRole('snapping', KICKER_ROLES) ?? c.snapIds[c.snapIds.length - 1]!;
  const py = lateral(c, call);
  const u = c.rng.uniform();
  const tLand = K.hang;
  const kind = call.kickKind;
  if (u < K.touchback) {
    const land = c.goalAhead + c.ezAhead * c.rng.uniform();
    c.push({ type: 'kick', t: 0, kickKind: kind, kickerId: kicker, kickSpot: c.spot(0, 0), landingSpot: c.spot(land, py), hangTimeS: roundSimS(K.hang), crossedLine: true, blockedById: null });
    c.push({ type: 'kick_touch', t: roundSimS(tLand), marginYd: null, marginS: null, visibility: 'open', kind: 'landed', playerId: null, side: null, spot: c.spot(land, py) });
    c.endZoneImpetus = c.sideSnap;
    c.dead(tLand, 'ball_dead_in_end_zone', Math.max(land, c.goalAhead + RES_YD), py, null, null);
    return;
  }
  if (u < K.touchback + K.oob) {
    const land = Math.min(K.oobYd, c.goalAhead - RES_YD);
    const edgePy = c.sidelinePy(py === 0 ? 1 : py);
    c.push({ type: 'kick', t: 0, kickKind: kind, kickerId: kicker, kickSpot: c.spot(0, 0), landingSpot: c.spot(land, edgePy), hangTimeS: roundSimS(K.hang), crossedLine: true, blockedById: null });
    c.push({ type: 'boundary', t: roundSimS(tLand), marginYd: null, marginS: null, visibility: 'open', kind: 'ball_out_of_bounds', playerId: null, spot: c.spot(land, edgePy) });
    c.dead(tLand, 'ball_out_of_bounds', land, edgePy, null, null);
    return;
  }
  const land = c.goalAhead - K.catchMax * c.rng.uniform();
  const ret = returner(c);
  c.facts.focusPx = land; c.facts.focusPy = py;
  c.push({ type: 'kick', t: 0, kickKind: kind, kickerId: kicker, kickSpot: c.spot(0, 0), landingSpot: c.spot(land, py), hangTimeS: roundSimS(K.hang), crossedLine: true, blockedById: null });
  c.push({ type: 'possession', t: roundSimS(tLand), side: c.sideOpp, playerId: ret, spot: c.spot(land, py), how: 'kick_catch' });
  const yards = Math.max(0, K.returnMin + c.expo(K.returnTailMean) - c.edge * K.returnTailMean);
  runBack(c, ret, land, py, yards, tLand);
}

function onside(c: Ctx, call: KickCall): void {
  const O = c.cfg.onside;
  const kicker = c.byRole('snapping', KICKER_ROLES) ?? c.snapIds[c.snapIds.length - 1]!;
  const py = lateral(c, call);
  const land = Math.min(O.travel, c.goalAhead - RES_YD);
  const t = c.cfg.time.flightBase + c.cfg.time.carryPerYard * O.travel;
  c.push({ type: 'kick', t: 0, kickKind: 'onside_kick', kickerId: kicker, kickSpot: c.spot(0, 0), landingSpot: c.spot(land, py), hangTimeS: 0, crossedLine: true, blockedById: null });
  c.push({ type: 'kick_touch', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'crowded', kind: 'landed', playerId: null, side: null, spot: c.spot(land, py) });
  if (c.rng.chance(c.shifted(O.recovery, c.edge))) {
    const id = c.pickId('snapping');
    c.push({ type: 'kick_touch', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'crowded', kind: 'touched_by_kickers', playerId: id, side: c.sideSnap, spot: c.spot(land, py) });
    c.dead(t, 'kick_recovered_by_kickers', land, py, 'snapping', id);
    return;
  }
  const id = c.pickId('opposing');
  c.push({ type: 'kick_touch', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'crowded', kind: 'touched_by_receivers', playerId: id, side: c.sideOpp, spot: c.spot(land, py) });
  c.push({ type: 'possession', t: roundSimS(t), side: c.sideOpp, playerId: id, spot: c.spot(land, py), how: 'kick_recovery' });
  c.dead(t, 'down_by_contact', land, py, 'opposing', id);
}

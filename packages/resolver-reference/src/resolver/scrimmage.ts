// Scrimmage plays of the reference resolver: runs, dropbacks, kneel and spike (J1.6.3).
// The two calls are classified into families: the offense by its play kind, the defense by its number
// of rushers and its box count. Coverage family has no outcome row in J15, so it changes nothing here.
import { roundSimS, roundYd, type DefenseCall, type OffenseCall } from '@gm/schema';
import type { Ctx } from './context.ts';
import { runQuantile } from './config.ts';
import { DEPTH_BAND_LOW, DEPTH_BAND_WIDTH } from './params.ts';

const QB_ROLES = ['QB'];
const RUNNER_ROLES = ['RB', 'HB', 'TB', 'FB', 'F', 'H'];
const CENTER_ROLES = ['C'];
const TARGET_ROLES = ['X', 'Z', 'Y', 'H', 'F', 'U', 'A', 'B', 'WR', 'TE', 'SLOT', 'RB', 'HB', 'TB', 'FB'];

/** Play kinds resolved as a dropback. An RPO is split by `rpo.passShare`; a trick play is treated as a pass. */
const DROPBACK_KINDS = new Set<string>(['dropback_pass', 'quick_pass', 'play_action', 'movement_pass', 'screen', 'trick']);

function quarterback(c: Ctx): number { return c.byRole('snapping', QB_ROLES) ?? c.snapIds[0]!; }

function snap(c: Ctx, qb: number, depth: number): void {
  c.facts.hadSnap = true;
  c.push({ type: 'snap', t: 0, snapperId: c.byRole('snapping', CENTER_ROLES), toPlayerId: qb, quality: 'clean' });
  c.push({ type: 'possession', t: 0, side: c.sideSnap, playerId: qb, spot: c.spot(-depth, 0), how: 'snap' });
}

export function resolveScrimmage(c: Ctx, call: OffenseCall): void {
  const opp = c.input.calls.opposing;
  const defense: DefenseCall | null = opp.unit === 'defense' ? opp : null;
  const qb = quarterback(c);
  if (call.kind === 'kneel') return kneel(c, qb);
  if (call.kind === 'spike') return spike(c, qb);
  const pass = DROPBACK_KINDS.has(call.kind) || (call.kind === 'rpo' && c.rng.chance(c.cfg.rpoPassShare));
  if (pass) dropback(c, call, defense, qb); else run(c, call, defense, qb);
}

function kneel(c: Ctx, qb: number): void {
  snap(c, qb, 0);
  const px = -c.cfg.kneelLoss;
  // A kneel inside the snapping team's own end zone is a ball dead there by its own impetus.
  if (px <= c.goalBehind) {
    c.endZoneImpetus = c.sideSnap;
    c.dead(c.cfg.time.kneel, 'ball_dead_in_end_zone', Math.max(px, c.goalBehind - c.ezBehind / 2), 0, 'snapping', qb);
    return;
  }
  c.dead(c.cfg.time.kneel, 'kneel', px, 0, 'snapping', qb);
}

function spike(c: Ctx, qb: number): void {
  snap(c, qb, 0);
  c.facts.phase = c.facts.phase === 'try' ? 'try' : 'pass_play';
  const t = c.cfg.time.spike;
  const at = c.spot(0, 0);
  c.push({ type: 'pass_release', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'open', passerId: qb, targetId: null, forward: true,
    releaseSpot: at, aimSpot: at, landingSpot: at, airYd: 0, throwaway: false, spike: true, underPressure: false, passerOutsidePocket: false, ballBeyondLine: false });
  c.push({ type: 'catch_point', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'open', outcome: 'grounded', spot: at, intendedId: null, catcherId: null, defenderIds: [], feetInBounds: 0, contested: false });
  c.dead(t, 'incomplete_pass', 0, 0, null, null);
}

function run(c: Ctx, call: OffenseCall, defense: DefenseCall | null, qb: number): void {
  const cfg = c.cfg;
  const depth = cfg.geom.dropbackDepth / 2;
  snap(c, qb, depth);
  let carrier = qb;
  let t0 = 0;
  if (call.kind !== 'qb_run') {
    carrier = c.byRole('snapping', RUNNER_ROLES) ?? c.snapIds[Math.min(1, c.snapIds.length - 1)]!;
    t0 = cfg.time.snapToHandoff;
    c.push({ type: 'exchange', t: roundSimS(t0), kind: 'handoff', fromId: qb, toId: carrier, spot: c.spot(-depth, 0) });
    c.push({ type: 'possession', t: roundSimS(t0), side: c.sideSnap, playerId: carrier, spot: c.spot(-depth, 0), how: 'exchange' });
  }
  // Box count moves the mean by the J15.5.1 by-box row minus the all-carries row.
  let boxShift = 0;
  if (defense) {
    const box = defense.boxCount;
    const idx = box <= 6 ? 0 : box >= 9 ? 3 : box - 6;
    boxShift = cfg.run.ypcBox[idx]! - cfg.run.ypcAll;
  }
  const gain = runQuantile(cfg.run, c.rng.uniform(), c.math) + cfg.run.shift + boxShift + c.edge * cfg.run.sd;
  const lane = call.runDirection ?? (['left', 'middle', 'right'] as const)[c.rng.int(0, 2)]!;
  const py = (lane === 'left' ? 1 : lane === 'right' ? -1 : 0) * cfg.geom.runLateral * c.rng.uniform();
  c.carry({ team: 'snapping', carrierId: carrier, fromPx: -depth, toPx: gain, py, t0, oobShare: cfg.run.oob, fumbleShare: cfg.run.fumbleLost, ownEndZoneImpetus: c.sideSnap });
}

function dropback(c: Ctx, call: OffenseCall, defense: DefenseCall | null, qb: number): void {
  const cfg = c.cfg;
  const P = cfg.pass;
  const depth = cfg.geom.dropbackDepth;
  snap(c, qb, depth);
  c.facts.dropback = true;
  c.facts.phase = c.facts.phase === 'try' ? 'try' : 'pass_play';
  // Rusher index: three or fewer, four, five, six, seven or more. A non-defensive unit counts as four.
  const rushers = defense ? defense.rushers : 4;
  const r = rushers <= 3 ? 0 : rushers >= 7 ? 4 : rushers - 3;
  const pPressure = c.shifted(P.pressure[r]!, -c.edge);
  const pSack = Math.min(c.shifted(P.sack[r]!, -c.edge), pPressure);
  const pressured = c.rng.chance(pPressure);
  const rusher = c.pickId('opposing');
  if (pressured) {
    c.push({ type: 'pressure', t: roundSimS(P.timeToThrow), kind: 'pressure', rusherId: rusher, passerId: qb, spot: c.spot(-depth, 0) });
    if (pPressure > 0 && c.rng.chance(pSack / pPressure)) return sack(c, qb, rusher);
  }
  // The scramble share is of all dropbacks; sacks are already out, so the chance here is scaled up.
  if (c.rng.chance(Math.min(1, P.scramble / (1 - pSack)))) {
    c.facts.phase = c.facts.phase === 'try' ? 'try' : 'running_play';
    c.push({ type: 'detail', t: roundSimS(P.timeToThrow), code: 'scramble', playerIds: [qb], spot: c.spot(-depth, 0), value: null });
    const gain = Math.max(0, c.expo(P.scrambleMean) + c.edge * P.scrambleMean);
    const py = (c.rng.uniform() - 0.5) * 2 * cfg.geom.passLateral;
    c.carry({ team: 'snapping', carrierId: qb, fromPx: -depth, toPx: gain, py, t0: P.timeToThrow, oobShare: P.oob, fumbleShare: 0, ownEndZoneImpetus: c.sideSnap });
    return;
  }

  // A forward pass. Depth band, then the result at that depth.
  c.facts.passAttempt = true;
  const band = c.rng.pick(P.depthShare);
  const back = c.goalAhead + c.ezAhead / 2;
  let air = band < DEPTH_BAND_LOW.length - 1 ? DEPTH_BAND_LOW[band]! + DEPTH_BAND_WIDTH[band]! * c.rng.uniform() : DEPTH_BAND_LOW[band]! + c.expo(P.deepTailMean);
  if (air > back) air = back;
  const py = c.inBoundsPy((c.rng.uniform() - 0.5) * 2 * cfg.geom.passLateral);
  const targets = c.snapPlayers.filter((p) => p.playerId !== qb && TARGET_ROLES.includes(p.role.toUpperCase()));
  const pool = targets.length > 0 ? targets : c.snapPlayers.filter((p) => p.playerId !== qb);
  const target = pool.length > 0 ? pool[c.rng.int(0, pool.length - 1)]!.playerId : qb;
  const defender = c.pickId('opposing');
  const pInt = c.shifted(P.interception[band]!, -c.edge);
  const factor = pressured ? P.pressuredFactor : P.cleanFactor[r]!;
  const pComplete = Math.min(c.shifted(Math.min(1, P.completion[band]! * factor), c.edge), 1 - pInt);
  const u = c.rng.uniform();
  const tRelease = P.timeToThrow;
  const tArrive = tRelease + cfg.time.flightBase + cfg.time.flightPerYard * Math.abs(air + depth);
  const release = c.spot(-depth, 0);
  const arrive = c.spot(air, py);
  c.facts.focusPx = air; c.facts.focusPy = py;
  const outcome = u < pInt ? 'interception' : u < pInt + pComplete ? 'catch' : 'incomplete';
  let throwaway = false;
  let incompleteKind: 'drop' | 'breakup' | 'uncatchable' = 'uncatchable';
  if (outcome === 'incomplete') {
    const v = c.rng.uniform();
    if (v < P.throwawayGivenIncomplete) throwaway = true;
    else if (v < P.throwawayGivenIncomplete + P.dropGivenIncomplete) incompleteKind = 'drop';
    else if (c.rng.chance(P.breakup)) incompleteKind = 'breakup';
  }
  c.facts.throwaway = throwaway;
  c.push({ type: 'pass_release', t: roundSimS(tRelease), marginYd: null, marginS: null, visibility: 'open', passerId: qb, targetId: throwaway ? null : target, forward: true,
    releaseSpot: release, aimSpot: arrive, landingSpot: arrive, airYd: roundYd(air), throwaway, spike: false, underPressure: pressured,
    passerOutsidePocket: call.kind === 'movement_pass', ballBeyondLine: false });

  if (outcome === 'catch') {
    c.push({ type: 'catch_point', t: roundSimS(tArrive), marginYd: null, marginS: null, visibility: 'open', outcome: 'catch', spot: arrive, intendedId: target, catcherId: target, defenderIds: [defender], feetInBounds: 2, contested: false });
    c.push({ type: 'possession', t: roundSimS(tArrive), side: c.sideSnap, playerId: target, spot: arrive, how: 'catch' });
    const yac = Math.max(0, c.expo(P.yacMean) + c.edge * P.yacMean);
    c.carry({ team: 'snapping', carrierId: target, fromPx: air, toPx: air + yac, py, t0: tArrive, oobShare: P.oob, fumbleShare: 0, ownEndZoneImpetus: c.sideSnap });
    return;
  }
  if (outcome === 'interception') {
    c.push({ type: 'catch_point', t: roundSimS(tArrive), marginYd: null, marginS: null, visibility: 'open', outcome: 'interception', spot: arrive, intendedId: target, catcherId: defender, defenderIds: [defender], feetInBounds: 2, contested: false });
    c.push({ type: 'possession', t: roundSimS(tArrive), side: c.sideOpp, playerId: defender, spot: arrive, how: 'interception' });
    // Caught in the end zone: he stays there, and the pass put the ball there (B7.7.1 impetus).
    const ret = air >= c.goalAhead ? 0 : Math.max(0, c.expo(P.intReturnMean) - c.edge * P.intReturnMean);
    c.carry({ team: 'opposing', carrierId: defender, fromPx: air, toPx: air - ret, py, t0: tArrive, oobShare: 0, fumbleShare: 0, ownEndZoneImpetus: c.sideSnap });
    return;
  }
  c.push({ type: 'catch_point', t: roundSimS(tArrive), marginYd: null, marginS: null, visibility: 'open', outcome: throwaway ? 'grounded' : incompleteKind,
    spot: arrive, intendedId: throwaway ? null : target, catcherId: null, defenderIds: incompleteKind === 'breakup' ? [defender] : [], feetInBounds: 0, contested: incompleteKind === 'breakup' });
  c.dead(tArrive, 'incomplete_pass', air, py, null, null);
}

function sack(c: Ctx, qb: number, rusher: number): void {
  const P = c.cfg.pass;
  const t = c.cfg.time.sack;
  const loss = Math.max(0, P.sackLossMean + P.sackLossSd * c.rng.normal());
  const px = -loss;
  c.push({ type: 'pressure', t: roundSimS(t), kind: 'sack', rusherId: rusher, passerId: qb, spot: c.spot(px, 0) });
  if (px <= c.goalBehind) {
    c.push({ type: 'tackle_attempt', t: roundSimS(t), outcome: 'made', carrierId: qb, tacklerIds: [rusher], spot: c.spot(px, 0) });
    c.endZoneImpetus = c.sideSnap;
    c.dead(t, 'ball_dead_in_end_zone', Math.max(px, c.goalBehind - c.ezBehind / 2), 0, 'snapping', qb);
    return;
  }
  c.push({ type: 'tackle_attempt', t: roundSimS(t), outcome: 'made', carrierId: qb, tacklerIds: [rusher], spot: c.spot(px, 0) });
  if (c.rng.chance(P.fumbleGivenSack)) {
    const recoverer = c.pickId('opposing');
    c.push({ type: 'fumble', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'open', kind: 'fumble', playerId: qb, side: c.sideSnap, forcedById: rusher, spot: c.spot(px, 0) });
    const tr = t + c.cfg.time.carryBase;
    c.push({ type: 'possession', t: roundSimS(tr), side: c.sideOpp, playerId: recoverer, spot: c.spot(px, 0), how: 'fumble_recovery' });
    c.dead(tr, 'down_by_contact', px, 0, 'opposing', recoverer);
    return;
  }
  const margin = c.ltgPx !== null ? roundYd(Math.abs(px - c.ltgPx)) : null;
  c.dead(t, 'down_by_contact', px, 0, 'snapping', qb, margin);
}

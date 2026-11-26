// Per-play working state of the reference resolver: frame numbers, the players on the field, the one
// random stream, and helpers that append truth events (contract D-03, D-04). Play-frame values (px along
// the direction the snapping team attacks, py to its left) are converted to field-frame spots on write.
import {
  roundYd, roundSimS, otherSide, issToZ,
  type DeterministicMath, type FieldedPlayer, type PlayInput, type RandomStream, type Side, type SimPlayer,
  type SimTeam, type Spot, type TruthEvent,
} from '@gm/schema';
import type { Config } from './config.ts';

/** Smallest distance written to a truth record (J1.2.2): used to put a ball clearly across a line. */
const RES_YD = 0.01;
/** Standard deviation of the standard logistic distribution, pi / sqrt(3): turns SD units into log-odds. */
const LOGISTIC_SD = 1.8137993642342178;

export type Team = 'snapping' | 'opposing';

/** What the foul step needs to know about the play that just ran. */
export interface PlayFacts {
  hadSnap: boolean;
  scrimmage: boolean;
  dropback: boolean;
  passAttempt: boolean;
  throwaway: boolean;
  kickReturn: boolean;
  phase: 'pass_play' | 'running_play' | 'scrimmage_kick' | 'free_kick' | 'try';
  /** Play-frame point of the pass arrival or the kick catch, for fouls that happen there. */
  focusPx: number;
  focusPy: number;
}

export class Ctx {
  readonly rng: RandomStream;
  readonly math: DeterministicMath;
  readonly cfg: Config;
  readonly dir: 1 | -1;
  readonly originX: number;
  readonly originY: number;
  /** Side that snaps or kicks, and the other side. */
  readonly sideSnap: Side;
  readonly sideOpp: Side;
  /** px of the goal line the snapping team attacks, and of its own goal line (negative). */
  readonly goalAhead: number;
  readonly goalBehind: number;
  /** Depth of the end zone beyond each of those goal lines. */
  readonly ezAhead: number;
  readonly ezBehind: number;
  readonly widthYd: number;
  /** px of the line to gain, or null on kicks and tries. */
  readonly ltgPx: number | null;
  readonly snapPlayers: readonly FieldedPlayer[];
  readonly oppPlayers: readonly FieldedPlayer[];
  readonly snapIds: readonly number[];
  readonly oppIds: readonly number[];
  /** Rating edge of the snapping team in SD units of an outcome (J1.6.3): positive favours it. */
  readonly edge: number;
  readonly events: TruthEvent[] = [];
  endZoneImpetus: Side | null = null;
  /** Time and play-frame point of the dead ball, set by `dead`. */
  deadT = 0;
  deadPx = 0;
  deadPy = 0;
  live = true;
  readonly facts: PlayFacts;

  constructor(readonly input: PlayInput, cfg: Config) {
    const s = input.situation;
    const g = input.geometry;
    this.cfg = cfg;
    this.math = input.math;
    this.rng = input.streams('resolver', [s.gameId, s.playNumber]);
    this.dir = s.attackDir;
    this.originX = s.ballX;
    this.originY = s.ballY;
    this.sideSnap = s.offense;
    this.sideOpp = otherSide(s.offense);
    const westEz = g.goalLineWestX;
    const eastEz = g.lengthYd - g.goalLineEastX;
    if (this.dir === 1) {
      this.goalAhead = g.goalLineEastX - s.ballX; this.goalBehind = g.goalLineWestX - s.ballX;
      this.ezAhead = eastEz; this.ezBehind = westEz;
    } else {
      this.goalAhead = s.ballX - g.goalLineWestX; this.goalBehind = s.ballX - g.goalLineEastX;
      this.ezAhead = westEz; this.ezBehind = eastEz;
    }
    this.widthYd = g.widthYd;
    this.ltgPx = s.lineToGainX === null ? null : (s.lineToGainX - s.ballX) * this.dir;
    this.snapPlayers = fielded(input.calls.snapping.players, input.teams[this.sideSnap]);
    this.oppPlayers = fielded(input.calls.opposing.players, input.teams[this.sideOpp]);
    this.snapIds = this.snapPlayers.map((p) => p.playerId);
    this.oppIds = this.oppPlayers.map((p) => p.playerId);
    this.edge = cfg.shiftSdPerZ * (unitZ(this.snapIds, input.teams[this.sideSnap]) - unitZ(this.oppIds, input.teams[this.sideOpp]));
    const c = input.calls.snapping;
    this.facts = {
      hadSnap: false, scrimmage: c.unit === 'offense', dropback: false, passAttempt: false, throwaway: false, kickReturn: false,
      phase: s.playKind === 'try' ? 'try' : 'running_play', focusPx: 0, focusPy: 0,
    };
  }

  // --- random helpers ---
  /** Exponential draw with the given mean. One uniform. */
  expo(mean: number): number {
    const u = this.rng.uniform();
    return mean > 0 ? -mean * this.math.log(1 - u) : 0;
  }

  /** Moves a probability by `sd` standard deviations of a latent logistic outcome. No change at 0. */
  shifted(p: number, sd: number): number {
    if (sd === 0 || p <= 0 || p >= 1) return p < 0 ? 0 : p > 1 ? 1 : p;
    return this.math.logistic(this.math.log(p / (1 - p)) + sd * LOGISTIC_SD);
  }

  pickId(team: Team): number {
    const ids = team === 'snapping' ? this.snapIds : this.oppIds;
    return ids[this.rng.int(0, ids.length - 1)]!;
  }

  /** First player whose role label is one of `roles`, else null. */
  byRole(team: Team, roles: readonly string[]): number | null {
    const list = team === 'snapping' ? this.snapPlayers : this.oppPlayers;
    for (const p of list) if (roles.includes(p.role.toUpperCase())) return p.playerId;
    return null;
  }

  side(team: Team): Side { return team === 'snapping' ? this.sideSnap : this.sideOpp; }

  // --- spots ---
  /** Field-frame spot of a play-frame point, kept on the playing surface including the end zones. */
  spot(px: number, py: number): Spot {
    const lo = this.goalBehind - this.ezBehind;
    const hi = this.goalAhead + this.ezAhead;
    const cx = px < lo ? lo : px > hi ? hi : px;
    const y = this.originY + py * this.dir;
    return { x: roundYd(this.originX + cx * this.dir), y: roundYd(y < 0 ? 0 : y > this.widthYd ? this.widthYd : y) };
  }

  /** py of the sideline on the side of `py` (the nearer one when py is 0 picks the left). */
  sidelinePy(py: number): number {
    const left = (this.dir === 1 ? this.widthYd - this.originY : this.originY);
    const right = -(this.dir === 1 ? this.originY : this.widthYd - this.originY);
    return py >= 0 ? left : right;
  }

  /** Keeps a lateral value inside the sidelines. */
  inBoundsPy(py: number): number {
    const left = this.sidelinePy(1) - RES_YD;
    const right = this.sidelinePy(-1) + RES_YD;
    return py > left ? left : py < right ? right : py;
  }

  push(e: TruthEvent): void { this.events.push(e); }

  /** Appends the single dead-ball event. */
  dead(t: number, reason: Extract<TruthEvent, { type: 'dead_ball' }>['reason'], px: number, py: number, team: Team | null, carrierId: number | null, marginYd: number | null = null): void {
    this.deadT = t; this.deadPx = px; this.deadPy = py;
    this.push({ type: 'dead_ball', t: roundSimS(t), marginYd, marginS: null, visibility: 'open', reason, spot: this.spot(px, py), side: team === null ? null : this.side(team), carrierId });
  }

  /**
   * A ball carrier runs from one play-frame point to another and the ball becomes dead there: a score,
   * a ball dead in his own end zone, out of bounds, or a tackle. The snapping team advances toward +px,
   * the opposing team toward -px. Returns nothing; the dead-ball event is appended.
   */
  carry(o: { team: Team; carrierId: number; fromPx: number; toPx: number; py: number; t0: number; oobShare: number; fumbleShare: number; ownEndZoneImpetus: Side }): void {
    const c = this.cfg;
    const forward = o.team === 'snapping' ? 1 : -1;
    // Goal line this carrier attacks and his own, as signed distances along his direction of advance.
    const attackGoal = o.team === 'snapping' ? this.goalAhead : this.goalBehind;
    const ownGoal = o.team === 'snapping' ? this.goalBehind : this.goalAhead;
    const attackDepth = o.team === 'snapping' ? this.ezAhead : this.ezBehind;
    const ownDepth = o.team === 'snapping' ? this.ezBehind : this.ezAhead;
    const adv = (px: number) => (px - attackGoal) * forward; // >= 0 means on or past the goal line attacked
    const behind = (px: number) => (ownGoal - px) * forward;  // >= 0 means on or behind his own goal line
    const t = o.t0 + c.time.carryBase + c.time.carryPerYard * Math.abs(o.toPx - o.fromPx);
    const py = this.inBoundsPy(o.py);

    if (adv(o.toPx) >= 0) {
      const depth = Math.min(Math.max(adv(o.toPx), RES_YD), attackDepth / 2);
      const px = attackGoal + depth * forward;
      if (adv(o.fromPx) < 0) this.push({ type: 'boundary', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'open', kind: 'ball_crosses_goal_line', playerId: o.carrierId, spot: this.spot(attackGoal, py) });
      this.reachLineToGain(o, t, py);
      this.dead(t, 'ball_across_goal_line_in_possession', px, py, o.team, o.carrierId);
      return;
    }
    if (behind(o.toPx) >= 0) {
      const depth = Math.min(Math.max(behind(o.toPx), RES_YD), ownDepth / 2);
      const px = ownGoal - depth * forward;
      // A carrier who never left his end zone downed the ball there; one driven back into it was tackled.
      if (behind(o.fromPx) < 0) {
        const tackler = this.pickId(o.team === 'snapping' ? 'opposing' : 'snapping');
        this.push({ type: 'tackle_attempt', t: roundSimS(t), outcome: 'made', carrierId: o.carrierId, tacklerIds: [tackler], spot: this.spot(px, py) });
      }
      this.endZoneImpetus = o.ownEndZoneImpetus;
      this.dead(t, 'ball_dead_in_end_zone', px, py, o.team, o.carrierId);
      return;
    }
    this.reachLineToGain(o, t, py);
    const margin = o.team === 'snapping' && this.ltgPx !== null ? roundYd(Math.abs(o.toPx - this.ltgPx)) : null;
    const other: Team = o.team === 'snapping' ? 'opposing' : 'snapping';
    if (o.fumbleShare > 0 && this.rng.chance(o.fumbleShare)) {
      const forcedBy = this.pickId(other);
      const recoverer = this.pickId(other);
      this.push({ type: 'tackle_attempt', t: roundSimS(t), outcome: 'made', carrierId: o.carrierId, tacklerIds: [forcedBy], spot: this.spot(o.toPx, py) });
      this.push({ type: 'fumble', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'open', kind: 'fumble', playerId: o.carrierId, side: this.side(o.team), forcedById: forcedBy, spot: this.spot(o.toPx, py) });
      const tr = t + c.time.carryBase;
      this.push({ type: 'possession', t: roundSimS(tr), side: this.side(other), playerId: recoverer, spot: this.spot(o.toPx, py), how: 'fumble_recovery' });
      this.dead(tr, 'down_by_contact', o.toPx, py, other, recoverer);
      return;
    }
    if (o.oobShare > 0 && this.rng.chance(o.oobShare)) {
      const edgePy = this.sidelinePy(py);
      this.push({ type: 'boundary', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'open', kind: 'player_out_of_bounds', playerId: o.carrierId, spot: this.spot(o.toPx, edgePy) });
      this.dead(t, 'runner_out_of_bounds', o.toPx, edgePy, o.team, o.carrierId, margin);
      return;
    }
    const tackler = this.pickId(other);
    this.push({ type: 'tackle_attempt', t: roundSimS(t), outcome: 'made', carrierId: o.carrierId, tacklerIds: [tackler], spot: this.spot(o.toPx, py) });
    this.dead(t, 'down_by_contact', o.toPx, py, o.team, o.carrierId, margin);
  }

  private reachLineToGain(o: { team: Team; carrierId: number; fromPx: number; toPx: number }, t: number, py: number): void {
    if (o.team !== 'snapping' || this.ltgPx === null) return;
    if (o.fromPx < this.ltgPx && o.toPx >= this.ltgPx) {
      this.push({ type: 'boundary', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'open', kind: 'ball_reaches_line_to_gain', playerId: o.carrierId, spot: this.spot(this.ltgPx, py) });
    }
  }
}

/**
 * The players a call sent out. The call may name more or fewer than eleven (J4.6.1); the resolver plays
 * with whoever is there. A call that names nobody falls back to the first eleven dressed players, so a
 * truth record can still name a ball carrier.
 */
function fielded(called: readonly FieldedPlayer[], team: SimTeam): readonly FieldedPlayer[] {
  if (called.length > 0) return called;
  const out: FieldedPlayer[] = [];
  for (const p of team.players) {
    if (out.length >= 11) break;
    out.push({ playerId: p.playerId, role: p.position });
  }
  if (out.length === 0) throw new Error(`reference resolver: team ${team.teamId} has no dressed players`);
  return out;
}

const meanZ = new WeakMap<object, number>();

/** Mean of a player's attributes as a z score. Memoised on the attribute record, which is read-only input. */
function playerZ(p: SimPlayer): number {
  const hit = meanZ.get(p.attributes);
  if (hit !== undefined) return hit;
  let sum = 0;
  let count = 0;
  for (const k of Object.keys(p.attributes).sort()) { sum += p.attributes[k]!; count++; }
  const z = count > 0 ? issToZ(sum / count) : 0;
  meanZ.set(p.attributes, z);
  return z;
}

/** Average attribute z of the named players of a team (J1.6.3 "average starter attribute"). Unknown ids are skipped. */
function unitZ(ids: readonly number[], team: SimTeam): number {
  const players = team.players;
  let sum = 0;
  let count = 0;
  for (const id of ids) {
    // `players` is in ascending id order (contract), so a binary search finds each one.
    let lo = 0;
    let hi = players.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const pid = players[mid]!.playerId;
      if (pid === id) { sum += playerZ(players[mid]!); count++; break; }
      if (pid < id) lo = mid + 1; else hi = mid - 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

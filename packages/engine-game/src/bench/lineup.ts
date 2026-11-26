// J11.5.1 step 4 and D10.6.1: who goes out for the next play. The substitution assistant (K6) follows the
// plan (target shares, snap caps) and deviates when his own read of a player's freshness falls below the
// floor the user chose in words. He never sees true freshness: he works from `StaffRead`, an estimate with
// error (D10.6.1, K9). Required absences, ejections and players out for the game always come off.
import type { Contract } from '@gm/engine-core';
import { byNumericId } from './between-plays.ts';

type GameDayState = Contract.GameDayState;
type Bench = Readonly<Record<string, GameDayState>>;
type SubstitutionEvent = Extract<Contract.GameEvent, { type: 'substitution' }>;

/** The words the user picks for how hard to ride a player (D10.6.1). */
export type FloorWord = 'fresh_legs' | 'normal' | 'ride_him';

const FLOOR_PARAM: Record<FloorWord, string> = { fresh_legs: 'bench.floor.freshLegs', normal: 'bench.floor.normal', ride_him: 'bench.floor.rideHim' };

export function floorOf(word: FloorWord, p: Contract.ParamTable): number {
  return p.num(FLOOR_PARAM[word]);
}

export interface PlayerPlan {
  readonly floor?: FloorWord;
  /** Planned share of this unit's snaps, 0 to 1 ("DT1 65 percent"). */
  readonly targetShare?: number;
  /** Most snaps this game, for players coming back from injury (D11.6.1). */
  readonly snapCap?: number;
}

export interface RotationPlan {
  /** Floor for every player without his own. */
  readonly floor: FloorWord;
  readonly players: Readonly<Record<string, PlayerPlan>>;
}

export const DEFAULT_PLAN: RotationPlan = { floor: 'normal', players: {} };

/**
 * What the substitution assistant holds about each player: his read of freshness, 0 to 1. Class est.
 * Built by `staffReads`; a coach decider never receives the truth it was drawn from.
 */
export type StaffRead = Readonly<Record<string, number>>;

/**
 * The position coach's read (D10.6.1 "with error"). Normal error whose spread shrinks with staff quality
 * (0 = poor, 1 = best). Stream `coachAI`, scope [game, play, side, 'bench_read'], one normal per dressed
 * player in ascending id order, so the draws do not depend on who is on the field.
 */
export function staffReads(bench: Bench, side: Contract.Side, staffQuality: number, at: { gameId: number; playNumber: number },
  streams: Contract.StreamSource, params: Contract.ParamTable): StaffRead {
  const q = staffQuality < 0 ? 0 : staffQuality > 1 ? 1 : staffQuality;
  const poor = params.num('bench.read.errorSdPoorStaff'), best = params.num('bench.read.errorSdBestStaff');
  const sd = poor + (best - poor) * q;
  const s = streams('coachAI', [at.gameId, at.playNumber, side, 'bench_read']);
  const out: Record<string, number> = {};
  for (const id of Object.keys(bench).sort(byNumericId)) {
    const v = bench[id]!.freshness + sd * s.normal();
    out[id] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return out;
}

/** Usage this game, kept beside the game state and rebuilt from the play records on replay. */
export interface BenchLedger {
  /** Snaps each unit has taken (counted plays only). */
  readonly unitSnaps: Readonly<Record<string, number>>;
  /** Snaps by player id, then unit. */
  readonly playerUnitSnaps: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** Snaps in a row on the field, by player id (a cue the sideline sees, D10.1.1). */
  readonly consecutive: Readonly<Record<string, number>>;
}

export const EMPTY_LEDGER: BenchLedger = { unitSnaps: {}, playerUnitSnaps: {}, consecutive: {} };

/** Record one counted play for one side: `unit` is the unit that took the snap, `onField` its players. */
export function ledgerAfterPlay(ledger: BenchLedger, unit: string, onField: readonly number[], dressed: readonly number[]): BenchLedger {
  const on = new Set(onField.map(String));
  const playerUnitSnaps: Record<string, Readonly<Record<string, number>>> = { ...ledger.playerUnitSnaps };
  for (const id of on) {
    const mine = playerUnitSnaps[id] ?? {};
    playerUnitSnaps[id] = { ...mine, [unit]: (mine[unit] ?? 0) + 1 };
  }
  const consecutive: Record<string, number> = {};
  for (const n of dressed) {
    const id = String(n);
    consecutive[id] = on.has(id) ? (ledger.consecutive[id] ?? 0) + 1 : 0;
  }
  return { unitSnaps: { ...ledger.unitSnaps, [unit]: (ledger.unitSnaps[unit] ?? 0) + 1 }, playerUnitSnaps, consecutive };
}

export function shareOf(ledger: BenchLedger, playerId: number | string, unit: string): number {
  const total = ledger.unitSnaps[unit] ?? 0;
  if (total === 0) return 0;
  return (ledger.playerUnitSnaps[String(playerId)]?.[unit] ?? 0) / total;
}

export interface LineupRequest {
  readonly side: Contract.Side;
  /** Ledger key for the unit, for example `offense`, `defense`, `punt`. */
  readonly unit: string;
  /** Role labels to fill, in order (the package for the next call). */
  readonly roles: readonly string[];
  readonly team: Contract.SimTeam;
  readonly bench: Bench;
  /** Who this unit had on the field last time, or null when the unit is coming on. */
  readonly previous: readonly Contract.FieldedPlayer[] | null;
  readonly read: StaffRead;
  readonly plan: RotationPlan;
  readonly ledger: BenchLedger;
  /**
   * False when tempo stops this side from changing players (D10.1.1 edge case, B2): the defense against a
   * no-huddle offense that did not substitute. Use `defenseMaySubstitute` to compute it.
   */
  readonly mayChange: boolean;
}

export interface Lineup {
  readonly players: Contract.FieldedPlayer[];
  readonly substitutions: SubstitutionEvent[];
  /** Roles filled by a player not on that role's depth chart (I6 emergency depth chart). */
  readonly emergencyRoles: string[];
  /** Roles left unfilled: the request named more than `substitution.max_players` roles, or nobody was available. */
  readonly unfilledRoles: string[];
}

/** Ready to play by rule: not out, not ejected, not owing a down after an injury stoppage. */
export function available(day: GameDayState | undefined): boolean {
  return day !== undefined && !day.unavailable && !day.ejected && day.requiredAbsenceDowns === 0;
}

/**
 * B2 and B13.13.1: against an offense that snaps fast without substituting, the defense keeps its players.
 * When the offense does substitute and the rule set has the match window, the defense may match.
 */
export function defenseMaySubstitute(offenseFastTempo: boolean, offenseSubstituted: boolean, rules: Contract.RuleSet): boolean {
  if (!offenseFastTempo) return true;
  return offenseSubstituted && rules.bool('substitution.match_window');
}

type Reason = SubstitutionEvent['reason'];

/** The lineup for the next play (J11.5.1 step 4). Never fields more than `substitution.max_players`. */
export function chooseLineup(req: LineupRequest, rules: Contract.RuleSet, params: Contract.ParamTable): Lineup {
  const max = rules.num('substitution.max_players');
  const roles = req.roles.slice(0, max);
  const unfilledRoles = req.roles.slice(max);
  const used = new Set<number>();
  const players: Contract.FieldedPlayer[] = [];
  const emergencyRoles: string[] = [];
  const reasons = new Map<string, Reason>();
  const prevByRole = new Map((req.previous ?? []).map((f) => [f.role, f.playerId]));
  const plan = (id: number): PlayerPlan => req.plan.players[String(id)] ?? {};
  const floor = (id: number) => floorOf(plan(id).floor ?? req.plan.floor, params);
  const ready = (id: number) => !used.has(id) && available(req.bench[String(id)]);
  const capped = (id: number) => { const c = plan(id).snapCap; return c !== undefined && (req.bench[String(id)]?.snapsThisGame ?? 0) >= c; };
  const overShare = (id: number) => { const t = plan(id).targetShare; return t !== undefined && (req.ledger.unitSnaps[req.unit] ?? 0) > 0 && shareOf(req.ledger, id, req.unit) >= t; };
  const read = (id: number) => req.read[String(id)] ?? 0;

  for (const role of roles) {
    const prev = prevByRole.get(role);
    // Tempo: keep last play's man if he may still play.
    if (!req.mayChange && prev !== undefined && ready(prev)) { take(role, prev); continue; }
    const depth = (req.team.depth[role] ?? []).filter(ready);
    let pick: number | undefined;
    for (const id of depth) {
      if (capped(id)) continue;
      if (read(id) < floor(id)) continue;
      if (overShare(id) && depth.some((o) => o !== id && !capped(o) && read(o) >= floor(o) && !overShare(o))) continue;
      pick = id;
      break;
    }
    // Everyone below his floor or capped: the freshest by the read, starter first on ties.
    if (pick === undefined && depth.length > 0) {
      pick = depth.filter((id) => !capped(id)).reduce<number | undefined>((best, id) => (best === undefined || read(id) > read(best) ? id : best), undefined) ?? depth[0];
    }
    if (pick === undefined) {
      pick = emergency(role);
      if (pick === undefined) { unfilledRoles.push(role); continue; }
      emergencyRoles.push(role);
    }
    if (prev !== undefined && prev !== pick) reasons.set(role, forcedReason(prev) ?? (!(req.team.depth[role] ?? []).includes(prev) ? 'package' : read(prev) < floor(prev) ? 'fatigue' : 'rotation'));
    take(role, pick);
  }

  function take(role: string, id: number): void { used.add(id); players.push({ playerId: id, role }); }

  function forcedReason(id: number): Reason | null {
    const d = req.bench[String(id)];
    if (d === undefined) return null;
    if (d.ejected) return 'ejection';
    if (d.unavailable || d.requiredAbsenceDowns > 0) return 'injury';
    return null;
  }

  /** I6 emergency depth chart: an available player of the role's listed position, else any available player. */
  function emergency(role: string): number | undefined {
    const listed = (req.team.depth[role] ?? [])[0];
    const position = req.team.players.find((p) => p.playerId === listed)?.position;
    const free = req.team.players.filter((p) => ready(p.playerId));
    return (free.find((p) => p.position === position) ?? free[0])?.playerId;
  }

  // Substitution events: pair each changed role's outgoing man with the incoming one; players of the
  // previous lineup who are no longer used at all pair with newcomers in roles the previous lineup lacked.
  const substitutions: SubstitutionEvent[] = [];
  if (req.previous !== null) {
    const now = new Set(players.map((f) => f.playerId));
    const before = new Set(req.previous.map((f) => f.playerId));
    const leaving = req.previous.filter((f) => !now.has(f.playerId));
    const entering = players.filter((f) => !before.has(f.playerId));
    const outFor = new Map<number, Reason>();
    for (const f of leaving) outFor.set(f.playerId, forcedReason(f.playerId) ?? reasons.get(f.role) ?? 'package');
    const pending = [...leaving];
    for (const f of entering) {
      const i = pending.findIndex((l) => l.role === f.role);
      const out = i >= 0 ? pending.splice(i, 1)[0]! : pending.shift();
      if (out === undefined) break;
      substitutions.push({ type: 'substitution', side: req.side, inId: f.playerId, outId: out.playerId, reason: outFor.get(out.playerId)! });
    }
  }
  return { players, substitutions, emergencyRoles, unfilledRoles };
}

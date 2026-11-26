// The locker-room graph (L2.1): player-to-player ties, position rooms and cliques, and influence.
// Ties are the room-level reading L2 uses to decide who is touched by a benching or a cut. They sit beside
// the X7 edges, not instead of them: X7 edges are the career record between people; these are this
// season's closeness inside one team. All values are hidden truth (L2.1.2, K9).
import { rp } from './params.ts';

export interface LockerPlayer {
  readonly id: number;
  /** Position room key (L2.1.2). One-man rooms (kicker, punter, long snapper) are passed as `specialists`. */
  readonly room: string;
  /** Draft or recruiting class year, or null. */
  readonly classYear: number | null;
  /** Teams and schools he has been on before this one (ids). */
  readonly pastTeams: readonly number[];
  readonly agentId: number | null;
  readonly homeRegion: string | null;
}

export interface TieInput {
  readonly x: LockerPlayer;
  readonly y: LockerPlayer;
  /** X7.2.1 fit of the pair, -1 to +1 (0 for imported or protected people). */
  readonly fit: number;
  /** True when the pair shared a past team at the same time (X7 `teammate` edge exists). */
  readonly formerTeammates: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Initial tie (L2.1.1): 20 + 15 same room + 10 same class + 15 former teammates + 5 same agent + 5 same region + fit (-15 to +15), 0 to 90. */
export function initialTie(i: TieInput): number {
  let t = rp('tie.base');
  if (i.x.room === i.y.room) t += rp('tie.sameRoom');
  if (i.x.classYear !== null && i.x.classYear === i.y.classYear) t += rp('tie.sameClass');
  if (i.formerTeammates) t += rp('tie.formerTeammates');
  if (i.x.agentId !== null && i.x.agentId === i.y.agentId) t += rp('tie.sameAgent');
  if (i.x.homeRegion !== null && i.x.homeRegion === i.y.homeRegion) t += rp('tie.sameRegion');
  t += rp('tie.fitSwing') * clamp(i.fit, -1, 1);
  return clamp(t, 0, rp('tie.cap'));
}

/** The ceiling weekly drift moves a tie toward (Assumption: 50 plus 40 times fit). */
export function tieCeiling(fit: number): number {
  return clamp(rp('tie.ceiling.middle') + rp('tie.ceiling.swing') * clamp(fit, -1, 1), 0, rp('tie.cap'));
}

/** What happened to a pair this week. */
export interface TieWeek {
  readonly sameRoom: boolean;
  readonly fight: boolean;
  /** Both in one open position battle (M2). */
  readonly sameJobBattle: boolean;
}

/**
 * Weekly drift (L2.1.1): +1 for the same room, +0.5 otherwise, toward the fit ceiling, never past it.
 * A practice fight is -25. An open battle for one job is -1 a week for low-fit pairs (fit below 0) and 0
 * for high-fit pairs.
 */
export function stepTie(tie: number, fit: number, w: TieWeek): number {
  let t = tie;
  const ceiling = tieCeiling(fit);
  if (t < ceiling) t = Math.min(ceiling, t + (w.sameRoom ? rp('tie.weekly.sameRoom') : rp('tie.weekly.other')));
  if (w.fight) t -= rp('tie.fight');
  if (w.sameJobBattle && fit < 0) t -= rp('tie.battle.lowFit');
  return clamp(t, 0, rp('scale.max'));
}

/** After players part, the tie decays 10 a season (L2.1.1). */
export function partedSeason(tie: number): number {
  return Math.max(0, tie - rp('tie.partedDecayPerSeason'));
}

/** Words for a tie (L2.1.1): close above 60; friction below 20 after eight weeks together. */
export function tieLabel(tie: number, weeksTogether: number): 'close' | 'friction' | null {
  if (tie > rp('tie.closeAbove')) return 'close';
  if (tie < rp('tie.frictionBelow') && weeksTogether >= rp('tie.frictionWeeks')) return 'friction';
  return null;
}

/**
 * The team's tie graph, stored sparse (L2.1.1 edge case): only ties above 30 or below 20; every other pair
 * reads the default 25.
 */
export class TieGraph {
  private readonly ties = new Map<string, number>();
  private static key(x: number, y: number): string { return x < y ? `${x}:${y}` : `${y}:${x}`; }

  get(x: number, y: number): number {
    return this.ties.get(TieGraph.key(x, y)) ?? rp('tie.default');
  }

  set(x: number, y: number, v: number): void {
    const k = TieGraph.key(x, y);
    if (v > rp('tie.store.above') || v < rp('tie.store.below')) this.ties.set(k, v);
    else this.ties.delete(k);
  }

  get storedCount(): number { return this.ties.size; }

  /** Stored pairs, sorted, for hashing and saves. */
  entries(): [number, number, number][] {
    return [...this.ties.entries()].map(([k, v]): [number, number, number] => {
      const [a, b] = k.split(':').map(Number) as [number, number];
      return [a, b, v];
    }).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  }

  /** Mean tie of one player to the given others (stored or default). */
  meanTie(id: number, others: readonly number[]): number {
    const rest = others.filter((o) => o !== id);
    if (rest.length === 0) return rp('tie.default');
    let s = 0;
    for (const o of rest) s += this.get(id, o);
    return s / rest.length;
  }
}

/** Build a roster's graph from scratch (L2.1.1). `fitOf` and `formerTeammates` are supplied by the caller. */
export function buildGraph(players: readonly LockerPlayer[], fitOf: (x: number, y: number) => number, formerTeammates: (x: number, y: number) => boolean): TieGraph {
  const g = new TieGraph();
  const ps = [...players].sort((a, b) => a.id - b.id);
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const x = ps[i]!; const y = ps[j]!;
      g.set(x.id, y.id, initialTie({ x, y, fit: fitOf(x.id, y.id), formerTeammates: formerTeammates(x.id, y.id) }));
    }
  }
  return g;
}

/** Per-player inputs to a room's state. */
export interface RoomMember {
  readonly id: number;
  /** D12 morale, 0 to 100. */
  readonly morale: number;
  /** L2.1.3 influence, 0 to 100. */
  readonly influence: number;
  /** L1.6.1 buy-in toward his position coach, 0 to 100. */
  readonly buyInToPositionCoach: number;
}

export interface RoomState {
  readonly room: string;
  readonly cohesion: number;
  readonly mood: number;
  readonly coachBond: number;
}

/** L2.1.2: cohesion = mean tie inside the room; mood = influence-weighted mean morale; coach bond = mean buy-in. */
export function roomState(room: string, members: readonly RoomMember[], g: TieGraph): RoomState {
  const ids = members.map((m) => m.id).sort((a, b) => a - b);
  let tieSum = 0; let pairs = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { tieSum += g.get(ids[i]!, ids[j]!); pairs += 1; }
  const wSum = members.reduce((s, m) => s + m.influence, 0);
  const mood = members.length === 0 ? 0 : wSum > 0 ? members.reduce((s, m) => s + m.morale * m.influence, 0) / wSum : members.reduce((s, m) => s + m.morale, 0) / members.length;
  const coachBond = members.length === 0 ? 0 : members.reduce((s, m) => s + m.buyInToPositionCoach, 0) / members.length;
  return { room, cohesion: pairs === 0 ? rp('tie.default') : tieSum / pairs, mood, coachBond };
}

/** Whether a room has stopped listening to its coach: coach bond under 30 for four weeks (L2.1.2, raises L4.3.2). */
export function roomAlarm(weeklyBond: readonly number[]): boolean {
  const n = rp('room.bondAlarmWeeks');
  if (weeklyBond.length < n) return false;
  return weeklyBond.slice(-n).every((b) => b < rp('room.bondAlarmBelow'));
}

export interface Clique {
  readonly members: readonly number[];
  readonly meanTie: number;
  readonly rooms: readonly string[];
}

/**
 * Cliques (L2.1.2): connected sets of four or more players with mean tie above 65 that cross rooms.
 * Built from the components of the graph of pairs above 65, then kept if the component's mean tie is
 * above 65 and it spans two or more rooms. Deterministic for a given graph.
 */
export function findCliques(players: readonly LockerPlayer[], g: TieGraph): Clique[] {
  const line = rp('clique.minTie');
  const ps = [...players].sort((a, b) => a.id - b.id);
  const roomOf = new Map(ps.map((p) => [p.id, p.room]));
  const adj = new Map<number, number[]>(ps.map((p) => [p.id, []]));
  for (const [a, b, v] of g.entries()) {
    if (v > line && adj.has(a) && adj.has(b)) { adj.get(a)!.push(b); adj.get(b)!.push(a); }
  }
  const seen = new Set<number>();
  const out: Clique[] = [];
  for (const p of ps) {
    if (seen.has(p.id) || adj.get(p.id)!.length === 0) continue;
    const comp: number[] = [];
    const stack = [p.id];
    seen.add(p.id);
    while (stack.length > 0) {
      const v = stack.pop()!;
      comp.push(v);
      for (const w of adj.get(v)!) if (!seen.has(w)) { seen.add(w); stack.push(w); }
    }
    comp.sort((a, b) => a - b);
    if (comp.length < rp('clique.minSize')) continue;
    let s = 0; let n = 0;
    for (let i = 0; i < comp.length; i++) for (let j = i + 1; j < comp.length; j++) { s += g.get(comp[i]!, comp[j]!); n += 1; }
    const meanTie = s / n;
    const rooms = [...new Set(comp.map((id) => roomOf.get(id)!))].sort();
    if (meanTie > line && rooms.length >= 2) out.push({ members: comp, meanTie, rooms });
  }
  return out;
}

/** A clique becomes a problem when its mean trust in the head coach is under 35 (L2.1.2). */
export function cliqueIsProblem(trustInHeadCoach: readonly number[]): boolean {
  if (trustInHeadCoach.length === 0) return false;
  return trustInHeadCoach.reduce((s, t) => s + t, 0) / trustInHeadCoach.length < rp('clique.problemTrustBelow');
}

export interface InfluenceInput {
  /** D5 leadership, 0 to 100. */
  readonly leadership: number;
  /** Performance percentile at his position, 0 to 100 (D14, N1). */
  readonly performancePercentile: number;
  readonly seasonsWithTeam: number;
  readonly role: 'starter' | 'rotation' | 'reserve';
  /** Mean tie to teammates, 0 to 100. */
  readonly meanTie: number;
  readonly captain: boolean;
  readonly quarterback: boolean;
  /** A long-term injured starter still around the team keeps 80 percent (L2.1.3 rules). */
  readonly injuredLongTermStarter: boolean;
}

/**
 * Influence 0 to 100 (L2.1.3): 0.30 leadership + 0.20 performance + 0.15 tenure (capped at 6 seasons) +
 * 0.15 role + 0.10 mean tie + 0.10 captain, quarterbacks +10, a long-term injured starter keeps 80 percent.
 */
export function influence(i: InfluenceInput): number {
  const max = rp('scale.max');
  const tenure = (Math.min(i.seasonsWithTeam, rp('influence.tenureCapSeasons')) / rp('influence.tenureCapSeasons')) * max;
  const role = i.role === 'starter' ? rp('influence.role.starter') : i.role === 'rotation' ? rp('influence.role.rotation') : rp('influence.role.reserve');
  let v = rp('influence.w.leadership') * i.leadership
    + rp('influence.w.performance') * i.performancePercentile
    + rp('influence.w.tenure') * tenure
    + rp('influence.w.role') * role
    + rp('influence.w.tie') * i.meanTie
    + rp('influence.w.captain') * (i.captain ? max : 0);
  if (i.quarterback) v += rp('influence.quarterbackBonus');
  if (i.injuredLongTermStarter) v *= rp('influence.injuredKeep');
  return clamp(v, 0, max);
}

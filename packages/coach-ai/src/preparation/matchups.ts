// K3.2.1 the AI staff's player grades and the matchup table. The staff plans from what it thinks players
// are. Grades arrive as D6 estimate records (mean and SD) built by the same estimate machinery the
// user's staff uses (G-19, D6.1.1). This file has no input that carries a true attribute (rule 4,
// K9.1.1): the only player data it can read is `StaffGrade`.
import { param } from './params.ts';

/** A staff's estimate of one player in one role, in ISS units (D6.1.1). */
export interface StaffGrade {
  readonly playerId: number;
  readonly role: string;
  readonly mean: number;
  /** Standard deviation of the belief: wide for an opponent seen on two games of film, narrow for one's own player. */
  readonly sd: number;
}

/** A published injury designation (H5, C11). `out` and `doubtful` players are not expected to play. */
export interface InjuryListing { readonly playerId: number; readonly status: 'out' | 'doubtful' | 'questionable' }

/** Who lined up where on the charted film, or on one's own depth chart. */
export interface DepthSighting { readonly slot: string; readonly playerId: number; readonly snaps: number }

export interface LineupSlot {
  readonly slot: string;
  readonly playerId: number;
  /** Listed questionable: the staff expects him but is not sure. */
  readonly uncertain: boolean;
}

/**
 * K3.2.1 rule 5: the expected lineup is the most-seen player at each slot who is not listed out or
 * doubtful. A surprise inactive is not known here, so it is a surprise to the AI too.
 */
export function expectedLineup(sightings: readonly DepthSighting[], report: readonly InjuryListing[]): LineupSlot[] {
  const status = new Map(report.map((r) => [r.playerId, r.status]));
  const bySlot = new Map<string, DepthSighting[]>();
  for (const s of sightings) {
    const g = bySlot.get(s.slot) ?? [];
    g.push(s);
    bySlot.set(s.slot, g);
  }
  const out: LineupSlot[] = [];
  for (const slot of [...bySlot.keys()].sort()) {
    const ranked = bySlot.get(slot)!.slice().sort((a, b) => b.snaps - a.snaps || a.playerId - b.playerId);
    const pick = ranked.find((s) => { const st = status.get(s.playerId); return st !== 'out' && st !== 'doubtful'; });
    if (pick) out.push({ slot, playerId: pick.playerId, uncertain: status.get(pick.playerId) === 'questionable' });
  }
  return out;
}

/** A pairing the game is likely to produce (content: which offensive slot meets which defensive slot, and the contest). */
export interface PairingDef {
  readonly id: string;
  readonly offenseSlot: string;
  readonly offenseRole: string;
  readonly defenseSlot: string;
  readonly defenseRole: string;
  /** J6 contest kind, for the expected-outcome mapping. */
  readonly contest: string;
}

export interface MatchupRow {
  readonly id: string;
  readonly contest: string;
  readonly offensePlayerId: number;
  readonly defensePlayerId: number;
  /** Estimated offensive grade minus estimated defensive grade, ISS. */
  readonly gradeDiff: number;
  /** SD of the difference, ISS: wide when either player is thinly scouted. */
  readonly diffSd: number;
  /** The difference mapped through the contest's expected outcome with average help (rule 3). Positive favours the offense. */
  readonly edge: number;
  /** SD of the edge. */
  readonly band: number;
  /** No estimate existed for a player: the row is a guess at average. */
  readonly unknown: boolean;
}

export interface MatchupInput {
  readonly offenseLineup: readonly LineupSlot[];
  readonly defenseLineup: readonly LineupSlot[];
  /** The staff's estimates for both teams (its own players well known, the opponent's from charted film). */
  readonly grades: readonly StaffGrade[];
  readonly pairings: readonly PairingDef[];
  /**
   * J6: expected outcome of a contest of this kind at a grade difference, with average help, in the
   * units payoffs use. Supplied by the engine side; must be the same curve the game plays with.
   */
  readonly contestExpectation: (contest: string, gradeDiff: number) => number;
}

/** K3.2.1 outputs: one row per likely pairing with an estimated edge and its band. */
export function matchupTable(inp: MatchupInput): MatchupRow[] {
  const grade = new Map(inp.grades.map((g) => [`${g.playerId}|${g.role}`, g]));
  const off = new Map(inp.offenseLineup.map((s) => [s.slot, s]));
  const def = new Map(inp.defenseLineup.map((s) => [s.slot, s]));
  const rows: MatchupRow[] = [];
  for (const p of inp.pairings) {
    const o = off.get(p.offenseSlot);
    const d = def.get(p.defenseSlot);
    if (!o || !d) continue;
    const og = grade.get(`${o.playerId}|${p.offenseRole}`);
    const dg = grade.get(`${d.playerId}|${p.defenseRole}`);
    const unknownSd = param('matchup.unknownBandIss');
    // A player with no estimate at all is taken as equal to the man across from him, with the widest band.
    const om = og?.mean ?? dg?.mean ?? 0;
    const dm = dg?.mean ?? og?.mean ?? 0;
    const osd = og?.sd ?? unknownSd;
    const dsd = dg?.sd ?? unknownSd;
    const gradeDiff = om - dm;
    const diffSd = Math.sqrt(osd * osd + dsd * dsd);
    const edge = inp.contestExpectation(p.contest, gradeDiff);
    // Band of the edge: half the spread of the mapped outcome one SD either side (the curve need not be linear).
    const band = Math.abs(inp.contestExpectation(p.contest, gradeDiff + diffSd) - inp.contestExpectation(p.contest, gradeDiff - diffSd)) / 2;
    rows.push({ id: p.id, contest: p.contest, offensePlayerId: o.playerId, defensePlayerId: d.playerId, gradeDiff, diffSd, edge, band, unknown: !og || !dg });
  }
  return rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * K3.4.1 rule 5: the opponent's best player, if the staff's grades flag one. A player is flagged when
 * his estimate stands at least the flag distance above the mean of his own expected lineup.
 */
export function flaggedStar(lineup: readonly LineupSlot[], grades: readonly StaffGrade[]): StaffGrade | null {
  const ids = new Set(lineup.map((s) => s.playerId));
  const best = new Map<number, StaffGrade>();
  for (const g of grades) {
    if (!ids.has(g.playerId)) continue;
    const cur = best.get(g.playerId);
    if (!cur || g.mean > cur.mean) best.set(g.playerId, g);
  }
  const list = [...best.values()].sort((a, b) => b.mean - a.mean || a.playerId - b.playerId);
  if (list.length < 2) return null;
  const mean = list.reduce((s, g) => s + g.mean, 0) / list.length;
  const top = list[0]!;
  return top.mean - mean >= param('matchup.starFlagIss') ? top : null;
}

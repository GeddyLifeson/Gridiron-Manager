// C2.1.1 The 17 opponents. Fourteen games come from the rotation (division, one same-conference
// division on a 3-year cycle, one other-conference division on a 4-year cycle), three from last
// season's division rank. Home sides come from fixed parity tables, so over two meetings of the same
// two divisions each club hosts and visits every club it plays (rule 6).
import type { Pairing, PairingKind, ProLeague, ScheduleConfig, TeamId } from './types.ts';
import { DEFAULT_CONFIG } from './types.ts';
import { floorDiv, isEven, mod } from './util.ts';

export interface RotationYear {
  readonly yearIndex: number;
  /** Same-conference division pairs, as division indexes, for this year. */
  readonly intraPairs: readonly (readonly [number, number])[];
  /** Other-conference offset: conference-0 division d plays conference-1 division (d + offset) mod 4. */
  readonly interOffset: number;
  readonly extraOffset: number;
  /** Conference index that hosts the 17th game this year (it has nine home games). */
  readonly extraHostConference: number;
  readonly intraCycleCount: number;
  readonly interCycleCount: number;
}

export function rotationYear(season: number, cfg: ScheduleConfig = DEFAULT_CONFIG): RotationYear {
  const r = cfg.pro.rotation;
  const yi = season - r.baseYear;
  const intraPairs = r.intraMatchings[mod(yi, r.intraCycle)]!.map((p) => [p[0]!, p[1]!] as const);
  const divs = cfg.pro.structure.divisionsPerConference;
  const interOffset = r.interOffsets[mod(yi, r.interCycle)]!;
  const extraOffset = mod(interOffset + r.extraOffsetFromInter, divs);
  if (extraOffset === interOffset) throw new Error('C2.1.1 rule 5: the 17th-game division must differ from the rotation division');
  return {
    yearIndex: yi,
    intraPairs,
    interOffset,
    extraOffset,
    extraHostConference: isEven(season) ? r.extraHostConferenceIndexByYearParity.even : r.extraHostConferenceIndexByYearParity.odd,
    intraCycleCount: floorDiv(yi, r.intraCycle),
    interCycleCount: floorDiv(yi, r.interCycle),
  };
}

/** Throws unless the league has the C1.1.1 shape the formula needs. */
export function checkLeagueShape(league: ProLeague, cfg: ScheduleConfig = DEFAULT_CONFIG): void {
  const s = cfg.pro.structure;
  if (league.conferences.length !== s.conferences) throw new Error(`C2.1.1 needs ${s.conferences} conferences`);
  const seen = new Set<TeamId>();
  for (const c of league.conferences) {
    if (c.divisions.length !== s.divisionsPerConference) throw new Error(`conference ${c.id}: wrong division count`);
    for (const d of c.divisions) {
      if (d.clubIds.length !== s.clubsPerDivision) throw new Error(`division ${d.id}: wrong club count`);
      for (const id of d.clubIds) {
        if (seen.has(id)) throw new Error(`club ${id} is in two divisions`);
        seen.add(id);
      }
    }
  }
}

function clubByRank(clubs: readonly TeamId[], priorRank: Readonly<Record<TeamId, number>>, rank: number, divId: string): TeamId {
  const hit = clubs.filter((c) => priorRank[c] === rank);
  if (hit.length !== 1) throw new Error(`division ${divId}: prior ranks must be 1 to ${clubs.length} once each (C3 breaks ties first)`);
  return hit[0]!;
}

/**
 * Home for a game between slot a of the first division and slot b of the second, in meeting number
 * `cycle` of those two divisions. Fixed a gives two homes and two aways over b; the next meeting flips.
 */
function firstHosts(a: number, b: number, cycle: number): boolean {
  return isEven(a + b + cycle);
}

function addBlock(out: Pairing[], d1: readonly TeamId[], d2: readonly TeamId[], cycle: number, kind: PairingKind): void {
  d1.forEach((x, a) => d2.forEach((y, b) => {
    out.push(firstHosts(a, b, cycle) ? { home: x, away: y, kind } : { home: y, away: x, kind });
  }));
}

/** The season's 272 pairings (C2.1.1 rules 1 to 6). */
export function proPairings(
  league: ProLeague,
  season: number,
  priorRank: Readonly<Record<TeamId, number>>,
  cfg: ScheduleConfig = DEFAULT_CONFIG,
): Pairing[] {
  checkLeagueShape(league, cfg);
  const ry = rotationYear(season, cfg);
  const out: Pairing[] = [];
  const confs = league.conferences;
  const ranks = confs[0]!.divisions[0]!.clubIds.map((_, i) => i + 1);

  // Rule 1: division, home and away.
  for (const c of confs) for (const d of c.divisions) {
    d.clubIds.forEach((x, i) => d.clubIds.forEach((y, j) => {
      if (i !== j) out.push({ home: x, away: y, kind: 'division' });
    }));
  }

  confs.forEach((c, ci) => {
    // Rule 2: one other division of the same conference, 2 home and 2 away.
    for (const [p, q] of ry.intraPairs) addBlock(out, c.divisions[p]!.clubIds, c.divisions[q]!.clubIds, ry.intraCycleCount + ci, 'intra_rotation');
    // Rule 4: same-place games against the two divisions not played under rule 2. The four
    // cross pairs form a cycle A-C-B-D-A; each division hosts the next one round it, so every club
    // has one home and one away. The direction flips every year.
    const [ab, cd] = ry.intraPairs;
    const [A, B] = ab!;
    const [C, D] = cd!;
    let ring: [number, number][] = [[A, C], [C, B], [B, D], [D, A]];
    if (!isEven(ry.yearIndex)) ring = ring.map(([h, v]) => [v, h]);
    for (const [h, v] of ring) for (const r of ranks) {
      const dh = c.divisions[h]!;
      const dv = c.divisions[v]!;
      out.push({ home: clubByRank(dh.clubIds, priorRank, r, dh.id), away: clubByRank(dv.clubIds, priorRank, r, dv.id), kind: 'intra_place' });
    }
  });

  // Rule 3: one division of the other conference, 2 home and 2 away.
  const [c0, c1] = confs;
  const nDiv = c0!.divisions.length;
  c0!.divisions.forEach((d, i) => {
    const other = c1!.divisions[mod(i + ry.interOffset, nDiv)]!;
    addBlock(out, d.clubIds, other.clubIds, ry.interCycleCount, 'inter_rotation');
  });

  // Rule 5: the 17th game, same rank, a division not played under rule 3; one conference hosts all.
  c0!.divisions.forEach((d, i) => {
    const other = c1!.divisions[mod(i + ry.extraOffset, nDiv)]!;
    for (const r of ranks) {
      const x = clubByRank(d.clubIds, priorRank, r, d.id);
      const y = clubByRank(other.clubIds, priorRank, r, other.id);
      out.push(ry.extraHostConference === 0 ? { home: x, away: y, kind: 'extra' } : { home: y, away: x, kind: 'extra' });
    }
  });

  verifyPairings(league, out, season, cfg);
  return out;
}

/** The C2.1.1 loader checks: 17 per club, 6 division, 8 or 9 home by conference, no duplicates. */
export function verifyPairings(league: ProLeague, pairings: readonly Pairing[], season: number, cfg: ScheduleConfig = DEFAULT_CONFIG): void {
  const s = cfg.pro.structure;
  if (pairings.length !== s.leagueGames) throw new Error(`C2.1.1: ${pairings.length} games, expected ${s.leagueGames}`);
  const ry = rotationYear(season, cfg);
  const games = new Map<TeamId, number>();
  const homes = new Map<TeamId, number>();
  const div = new Map<TeamId, number>();
  for (const p of pairings) {
    if (p.home === p.away) throw new Error('C2.1.1: a club cannot play itself');
    games.set(p.home, (games.get(p.home) ?? 0) + 1);
    games.set(p.away, (games.get(p.away) ?? 0) + 1);
    homes.set(p.home, (homes.get(p.home) ?? 0) + 1);
    if (p.kind === 'division') {
      div.set(p.home, (div.get(p.home) ?? 0) + 1);
      div.set(p.away, (div.get(p.away) ?? 0) + 1);
    }
  }
  const baseHome = (s.gamesPerClub - s.extraGames) / (1 + 1);
  league.conferences.forEach((c, ci) => {
    const wantHome = baseHome + (ci === ry.extraHostConference ? s.extraGames : 0);
    for (const d of c.divisions) for (const id of d.clubIds) {
      if (games.get(id) !== s.gamesPerClub) throw new Error(`C2.1.1: ${id} has ${games.get(id)} games`);
      if (div.get(id) !== s.divisionGames) throw new Error(`C2.1.1: ${id} has ${div.get(id)} division games`);
      if (homes.get(id) !== wantHome) throw new Error(`C2.1.1: ${id} has ${homes.get(id)} home games, expected ${wantHome}`);
    }
  });
  // Each non-division pair meets at most once a season.
  const seen = new Set<string>();
  for (const p of pairings) {
    if (p.kind === 'division') continue;
    const k = p.home < p.away ? `${p.home}|${p.away}` : `${p.away}|${p.home}`;
    if (seen.has(k)) throw new Error(`C2.1.1: ${k} meets twice outside the division`);
    seen.add(k);
  }
}

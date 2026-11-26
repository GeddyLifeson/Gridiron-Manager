// C2.5.1 Preseason games: three a club, opponents by short travel, never the Week 1 or Week 2
// opponent, no repeat. Clubs in the conference with nine regular-season home games host one
// preseason game, the others two. Pairs within the joint-practice radius are marked as candidates.
import type { RandomStream } from '@gm/schema';
import type { Pairing, ProClubInfo, ProLeague, ScheduleConfig, ScheduledGame, TeamId } from './types.ts';
import { DEFAULT_CONFIG } from './types.ts';
import { rotationYear } from './pro-opponents.ts';
import { distanceKm, half, pairKey, shuffle } from './util.ts';

export interface PreseasonResult {
  readonly games: ScheduledGame[];
  readonly jointPracticeCandidates: (readonly [TeamId, TeamId])[];
}

export function proPreseason(
  season: number,
  league: ProLeague,
  clubs: readonly ProClubInfo[],
  pairings: readonly Pairing[],
  weekOf: readonly number[],
  rng: RandomStream,
  cfg: ScheduleConfig = DEFAULT_CONFIG,
): PreseasonResult {
  const P = cfg.preseason;
  const ids = clubs.map((c) => c.id);
  const N = ids.length;
  const dist: number[][] = clubs.map((a) => clubs.map((b) => distanceKm(a.latitude, a.longitude, b.latitude, b.longitude, cfg)));
  const banned = new Set<string>();
  pairings.forEach((p, i) => { if (weekOf[i]! <= P.avoidRegularWeeks) banned.add(pairKey(p.home, p.away)); });
  const hostConf = league.conferences[rotationYear(season, cfg).extraHostConference]!;
  const inHost = new Set(hostConf.divisions.flatMap((d) => d.clubIds));
  const target = ids.map((id) => (inHost.has(id) ? P.homeGamesHostConference : P.homeGamesOtherConference));

  for (let attempt = 0; attempt < cfg.pro.solver.restarts; attempt++) {
    const used = new Set<string>();
    const rounds: [number, number][][] = [];
    let ok = true;
    for (let r = 0; r < P.games && ok; r++) {
      // Each failed attempt raises the cost of a same-conference pairing, which the home split needs
      // to stay feasible (host-conference clubs host once, so they cannot mostly play each other).
      const pen = attempt * P.sameConferenceStepKm;
      const d2 = dist.map((row, a) => row.map((x, b) => x + (inHost.has(ids[a]!) === inHost.has(ids[b]!) ? pen : 0)));
      const m = bestMatching(N, d2, (a, b) => banned.has(pairKey(ids[a]!, ids[b]!)) || used.has(pairKey(ids[a]!, ids[b]!)), rng, P.matchIterations);
      if (!m) { ok = false; break; }
      for (const [a, b] of m) used.add(pairKey(ids[a]!, ids[b]!));
      rounds.push(m);
    }
    if (!ok) continue;
    const edges = rounds.flat();
    const home = orient(N, edges, target, rng);
    if (!home) continue;
    const games: ScheduledGame[] = [];
    const joint: (readonly [TeamId, TeamId])[] = [];
    rounds.forEach((m, r) => m.forEach(([a, b]) => {
      const k = edges.findIndex(([x, y]) => x === a && y === b);
      const h = home[k] === a ? a : b;
      const v = h === a ? b : a;
      const hc = clubs[h]!;
      games.push({
        id: `p.${season}.${r + 1}.${ids[h]}.${ids[v]}`, season, phase: 'preseason', week: r + 1,
        home: ids[h]!, away: ids[v]!, venueId: hc.venueId, neutral: false, international: false, region: null,
        kind: 'preseason', conferenceGame: false, day: 'sat', dayOffset: cfg.slots.days.sat, dayIndex: null,
        slot: 'preseason', kickoffEtMinutes: null, venueZone: hc.zone, national: false, flexEligible: false, status: 'scheduled',
      });
      if (dist[a]![b]! <= P.jointPracticeKm) joint.push([ids[h]!, ids[v]!]);
    }));
    return { games, jointPracticeCandidates: joint };
  }
  throw new Error('C2.5.1: no preseason schedule found');
}

/** Low-travel perfect matching by random start and 2-opt partner swaps. */
function bestMatching(N: number, dist: number[][], banned: (a: number, b: number) => boolean, rng: RandomStream, iters: number): [number, number][] | null {
  const order = shuffle(Array.from({ length: N }, (_, i) => i), rng);
  const m: [number, number][] = [];
  for (let i = 0; i < N; i += 1 + 1) m.push([order[i]!, order[i + 1]!]);
  const cost = (a: number, b: number) => dist[a]![b]! + (banned(a, b) ? Number.MAX_SAFE_INTEGER / N : 0);
  const pairs = half(N);
  for (let it = 0; it < iters; it++) {
    const i = rng.int(0, pairs - 1);
    let j = rng.int(0, pairs - 1 - 1);
    if (j >= i) j++;
    const [a, b] = m[i]!;
    const [c, d] = m[j]!;
    const now = cost(a, b) + cost(c, d);
    const x = cost(a, c) + cost(b, d);
    const y = cost(a, d) + cost(b, c);
    if (x < now && x <= y) { m[i] = [a, c]; m[j] = [b, d]; }
    else if (y < now) { m[i] = [a, d]; m[j] = [b, c]; }
  }
  return m.some(([a, b]) => banned(a, b)) ? null : m;
}

/**
 * Orient edges so club i hosts exactly target[i] games. Start random, then flip directed paths from a
 * club with too many homes to one with too few (each flip keeps every other club's count).
 */
export function orient(N: number, edges: readonly (readonly [number, number])[], target: readonly number[], rng: RandomStream): number[] | null {
  const host = edges.map(([a, b]) => (rng.chance(half(1)) ? a : b));
  const homes = new Array<number>(N).fill(0);
  host.forEach((h) => { homes[h]!++; });
  const guard = edges.length * N;
  for (let step = 0; step < guard; step++) {
    const over = homes.findIndex((h, i) => h > target[i]!);
    if (over < 0) return homes.every((h, i) => h === target[i]) ? host : null;
    // BFS over "u hosts v" edges from `over` to any club under target.
    const prev = new Array<number>(N).fill(-1);
    const via = new Array<number>(N).fill(-1);
    prev[over] = over;
    const queue = [over];
    let found = -1;
    while (queue.length && found < 0) {
      const u = queue.shift()!;
      edges.forEach(([a, b], k) => {
        if (found >= 0 || host[k] !== u) return;
        const v = a === u ? b : a;
        if (prev[v] !== -1) return;
        prev[v] = u;
        via[v] = k;
        if (homes[v]! < target[v]!) found = v;
        else queue.push(v);
      });
    }
    if (found < 0) return null;
    homes[over]!--;
    homes[found]!++;
    for (let v = found; v !== over; v = prev[v]!) host[via[v]!] = v;
  }
  return null;
}

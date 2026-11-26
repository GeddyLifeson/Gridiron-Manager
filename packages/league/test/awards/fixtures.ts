// Test helpers: a seeded uniform source, deterministic exp for the hall, event rows and generated leagues.
// Every number here is a test input, not a fact.
import type { WorldEvent } from '@gm/schema';
import type { Candidate, GameLine, Uniform } from '../../src/awards/index.ts';

export function rng(seed: number): Uniform {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export const MATH = { exp: (x: number) => Math.exp(x) };

let nextId = 1;
export function ev(type: string, person: number, year: number, notability: number | null, payload: WorldEvent['payload'] = {}, day = 100, extra: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id: nextId++, type, when: { date: { seasonYear: year, dayIndex: day }, period: null, clockTenths: null },
    competitionId: 1, where: { teamId: 1, venueId: null }, actors: [{ personId: person, role: 'x' }],
    subjects: [{ kind: 'person', id: person }], payload, witnesses: { kind: 'public' }, causeId: null,
    notability, tier: 1, source: 'sim', ...extra,
  };
}

const POS = ['QB', 'RB', 'WR', 'WR', 'TE', 'OT', 'OG', 'C', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P'];

/**
 * A league of `teams` teams in `groups` honour groups, `weeks` weeks. Each team has one player per POS
 * entry; lines are generated with plausible counting statistics for the position.
 */
export function season(seed: number, year: number, teams = 16, groups = 2, weeks = 17): GameLine[] {
  const r = rng(seed);
  const out: GameLine[] = [];
  let game = year * 1000;
  for (let w = 1; w <= weeks; w++) {
    for (let t = 1; t <= teams; t += 2) {
      game += 1;
      const homeWins = r.next() < 0.5;
      for (const team of [t, t + 1]) {
        POS.forEach((pos, i) => {
          const personId = team * 100 + i;
          const won = team === t ? homeWins : !homeWins;
          const n = () => r.next();
          const totals: Record<string, number> =
            pos === 'QB' ? { pass_yards: Math.round(150 + n() * 250), pass_touchdowns: Math.floor(n() * 4), pass_interceptions: Math.floor(n() * 2), pass_attempts: 30, pass_completions: Math.round(18 + n() * 8) }
            : pos === 'RB' ? { rush_yards: Math.round(30 + n() * 120), rush_touchdowns: Math.floor(n() * 2), receptions: Math.floor(n() * 4), receiving_yards: Math.round(n() * 40) }
            : pos === 'WR' || pos === 'TE' ? { receptions: Math.floor(n() * 9), receiving_yards: Math.round(n() * 130), receiving_touchdowns: Math.floor(n() * 1.6) }
            : pos === 'EDGE' || pos === 'DT' || pos === 'LB' ? { tackles_solo: Math.floor(n() * 7), sacks: Math.floor(n() * 1.8), tackles_for_loss: Math.floor(n() * 2), forced_fumbles: Math.floor(n() * 1.15) }
            : pos === 'CB' || pos === 'S' ? { tackles_solo: Math.floor(n() * 6), interceptions: Math.floor(n() * 1.25), passes_defended: Math.floor(n() * 3) }
            : pos === 'K' ? { field_goals_made: Math.floor(n() * 4), extra_points_made: Math.floor(n() * 4), field_goal_longest: Math.round(30 + n() * 25) }
            : pos === 'P' ? { punt_net_yards: Math.round(n() * 200) }
            : { snaps_offense: 60 };
          out.push({ gameId: game, season: year, week: w, competitionId: 1, groupId: team <= teams / groups ? 1 : 2, teamId: team, personId, position: pos, postseason: false, won, gameNotability: Math.round(n() * 70), totals });
        });
      }
    }
  }
  return out;
}

/** Season candidates from lines: stats = season counting score scaled to about 0..10. */
export function candidates(lines: readonly GameLine[], wins: Map<number, number>): Candidate[] {
  const by = new Map<number, { l: GameLine; yards: number; td: number; def: number }>();
  for (const l of lines) {
    const c = by.get(l.personId) ?? { l, yards: 0, td: 0, def: 0 };
    const t = l.totals;
    c.yards += (t['pass_yards'] ?? 0) * 0.5 + (t['rush_yards'] ?? 0) + (t['receiving_yards'] ?? 0);
    c.td += (t['pass_touchdowns'] ?? 0) + (t['rush_touchdowns'] ?? 0) + (t['receiving_touchdowns'] ?? 0);
    c.def += (t['sacks'] ?? 0) * 2 + (t['interceptions'] ?? 0) * 2 + (t['tackles_solo'] ?? 0) * 0.2 + (t['field_goals_made'] ?? 0) * 0.3;
    by.set(l.personId, c);
  }
  return [...by.values()].map(({ l, yards, td, def }) => {
    const offense = ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C'].includes(l.position);
    const stats = offense ? yards / 400 + td / 4 : def / 4;
    return {
      personId: l.personId, teamId: l.teamId, position: l.position, side: offense ? 'offense' as const : 'defense' as const,
      features: { stats, teamSuccess: (wins.get(l.teamId) ?? 0) / 4, narrative: 0, reputation: stats },
    };
  });
}

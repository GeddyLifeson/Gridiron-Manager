// Test event types and a seeded history generator that writes through the log's one emit path. Volumes
// and rates are test inputs (assumptions for the size measurement), not facts.
import type { EventTypeDef, PersonOrigin } from '@gm/schema';
import { EventLog, typeRegistry, type EventLogOptions } from '../../src/history/index.ts';

export const TYPES: EventTypeDef[] = [
  { id: 'game_result', family: 'game', payloadSchema: { home_points: 'number', away_points: 'number', home_team: 'id', away_team: 'id' }, witnessRule: 'public', lineTemplate: 'event.game_result', harmClass: 'none', importedAllowed: true, minTier: 3, consumers: ['league.standings'], compactable: false },
  { id: 'fourth_down_decision', family: 'game', payloadSchema: { went: 'boolean', yards_to_go: 'number' }, witnessRule: 'public', lineTemplate: 'event.fourth_down', harmClass: 'none', importedAllowed: true, minTier: 2, consumers: ['models.labels'], compactable: true },
  { id: 'timeout_used', family: 'game', payloadSchema: { period: 'number' }, witnessRule: 'public', lineTemplate: 'event.timeout', harmClass: 'none', importedAllowed: true, minTier: 1, consumers: ['models.labels'], compactable: true },
  { id: 'hired', family: 'career', payloadSchema: { job: 'string' }, witnessRule: 'public', lineTemplate: 'event.hired', harmClass: 'none', importedAllowed: true, minTier: 3, consumers: ['career.reputation'], compactable: false },
  { id: 'fired', family: 'career', payloadSchema: { job: 'string' }, witnessRule: 'public', lineTemplate: 'event.fired', harmClass: 'professional_negative', importedAllowed: true, minTier: 3, consumers: ['career.reputation'], compactable: false },
  { id: 'promise_broken', family: 'relationship', payloadSchema: {}, witnessRule: 'people', lineTemplate: 'event.promise_broken', harmClass: 'professional_negative', importedAllowed: true, minTier: 2, consumers: ['models.labels'], compactable: false },
  { id: 'arrested', family: 'personal', payloadSchema: {}, witnessRule: 'public', lineTemplate: 'event.arrested', harmClass: 'harmful', importedAllowed: false, minTier: 2, consumers: ['league.news'], compactable: false },
  { id: 'result_vacated', family: 'world', payloadSchema: {}, witnessRule: 'public', lineTemplate: 'event.result_vacated', harmClass: 'none', importedAllowed: true, minTier: 3, consumers: ['league.standings'], compactable: false },
];

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newLog(extra: Partial<EventLogOptions> = {}): EventLog {
  return new EventLog({ registry: typeRegistry(TYPES), ...extra });
}

export interface GenSpec { seed: number; firstYear: number; seasons: number; teams: number; games: number; fourthPerGame: number; timeoutsPerGame: number }

/**
 * One coach per team (person id = team id). Each week, teams pair off; each team-game logs its fourth-down
 * decisions and timeouts, then the game result. Each season ends with a hire and a fire. `onSeasonEnd`
 * lets a test compact at the season roll-over, as the world loop will.
 */
export function generate(log: EventLog, g: GenSpec, onSeasonEnd?: (year: number) => EventLog | void): EventLog {
  const r = rng(g.seed);
  let cur = log;
  for (let s = 0; s < g.seasons; s++) {
    const year = g.firstYear + s;
    for (let wk = 0; wk < g.games; wk++) {
      const day = 240 + wk * 7;
      for (let t = 1; t + 1 <= g.teams; t += 2) {
        const comp = t <= g.teams / 5 ? 1 : 2;
        for (const team of [t, t + 1]) {
          for (let k = 0; k < g.fourthPerGame; k++) must(cur.emit({ type: 'fourth_down_decision', date: { seasonYear: year, dayIndex: day }, period: 1 + Math.floor(r() * 4), clockTenths: Math.floor(r() * 9000), competitionId: comp, teamId: team, actors: [{ personId: team, role: 'caller' }], payload: { went: r() < 0.3, yards_to_go: 1 + Math.floor(r() * 10) }, witnesses: { kind: 'public' }, tier: 1, source: 'sim' }));
          for (let k = 0; k < g.timeoutsPerGame; k++) must(cur.emit({ type: 'timeout_used', date: { seasonYear: year, dayIndex: day }, period: 1 + Math.floor(r() * 4), clockTenths: Math.floor(r() * 9000), competitionId: comp, teamId: team, actors: [{ personId: team, role: 'caller' }], payload: { period: 1 + Math.floor(r() * 4) }, witnesses: { kind: 'public' }, tier: 1, source: 'sim' }));
        }
        must(cur.emit({ type: 'game_result', date: { seasonYear: year, dayIndex: day }, competitionId: comp, teamId: t, subjects: [{ kind: 'team', id: t }, { kind: 'team', id: t + 1 }], payload: { home_points: Math.floor(r() * 40), away_points: Math.floor(r() * 40), home_team: t, away_team: t + 1 }, witnesses: { kind: 'public' }, tier: 2, source: 'sim' }));
      }
    }
    const fired = 1 + Math.floor(r() * g.teams);
    must(cur.emit({ type: 'fired', date: { seasonYear: year, dayIndex: 340 }, teamId: fired, actors: [{ personId: fired, role: 'fired' }], payload: { job: 'head_coach' }, witnesses: { kind: 'public' }, tier: 2, source: 'sim' }));
    must(cur.emit({ type: 'hired', date: { seasonYear: year, dayIndex: 350 }, teamId: fired, actors: [{ personId: fired, role: 'hired' }], payload: { job: 'head_coach' }, witnesses: { kind: 'public' }, tier: 2, source: 'sim' }));
    const next = onSeasonEnd?.(year);
    if (next) cur = next;
  }
  return cur;
}

export function must<T extends { ok: boolean }>(r: T): T {
  if (!r.ok) throw new Error(`emit refused: ${JSON.stringify(r)}`);
  return r;
}

export const origins = (m: Record<number, PersonOrigin>) => (id: number) => m[id];

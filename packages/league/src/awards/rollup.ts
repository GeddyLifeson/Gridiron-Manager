// X4.2.2 season and career rollups: indexes of IDs and counts rebuilt from the log, never judgments.
// Written at season end after awards are decided, so selections are events in the rollup.
import { NotabilityRollup, type WorldEvent } from '@gm/schema';
import { HONOUR } from './events.ts';
import { BANDS, bandOf, byScore } from './notability.ts';
import { param } from './params.ts';

/** Event types outside this module that count as honours. Titles come from the postseason module (G-14). */
export interface RollupTypes {
  readonly title: string;
  /** Reversal types whose `causeId` names a vacated result or record (X3.4.1). */
  readonly vacated: readonly string[];
  /** Award ids that count as major awards (C9.1.2). */
  readonly majorAwards: readonly string[];
}

export const DEFAULT_ROLLUP_TYPES: RollupTypes = {
  title: 'title_won',
  vacated: ['result_vacated'],
  majorAwards: ['mvp', 'offensive_player', 'defensive_player', 'coach_of_year', 'player_of_year'],
};

export const COUNTER = {
  allLeagueFirst: 'all_league_first', allLeagueSecond: 'all_league_second', allStar: 'all_star',
  majorAward: 'major_award', title: 'title', record: 'record', vacated: 'vacated',
} as const;

function personsOf(e: WorldEvent): number[] {
  const s = new Set<number>(e.actors.map((a) => a.personId));
  for (const x of e.subjects) if (x.kind === 'person') s.add(x.id);
  return [...s];
}

/** Ids of rows a reversal names. */
export function vacatedIds(rows: readonly WorldEvent[], types: RollupTypes = DEFAULT_ROLLUP_TYPES): Set<number> {
  const out = new Set<number>();
  for (const e of rows) if (types.vacated.includes(e.type) && e.causeId !== null) out.add(e.causeId);
  return out;
}

function honourKey(e: WorldEvent, types: RollupTypes): string | null {
  if (e.type === HONOUR.allLeague) return e.payload['team'] === 1 ? COUNTER.allLeagueFirst : COUNTER.allLeagueSecond;
  if (e.type === HONOUR.allStar) return COUNTER.allStar;
  if (e.type === HONOUR.award) return e.payload['place'] === 1 && types.majorAwards.includes(String(e.payload['award'])) ? COUNTER.majorAward : null;
  if (e.type === HONOUR.record) return COUNTER.record;
  if (e.type === types.title) return COUNTER.title;
  return null;
}

/** One row per person per season from scored rows. Ordering of `topEventIds` is X4.2.2 field 1. */
export function seasonRollups(rows: readonly WorldEvent[], types: RollupTypes = DEFAULT_ROLLUP_TYPES): NotabilityRollup[] {
  const vac = vacatedIds(rows, types);
  const groups = new Map<string, { person: number; year: number; events: WorldEvent[] }>();
  for (const e of rows) {
    if (e.notability === null) continue;
    for (const p of personsOf(e)) {
      const k = `${p}:${e.when.date.seasonYear}`;
      const g = groups.get(k) ?? { person: p, year: e.when.date.seasonYear, events: [] };
      g.events.push(e);
      groups.set(k, g);
    }
  }
  const out: NotabilityRollup[] = [];
  for (const g of groups.values()) {
    const sorted = [...g.events].sort(byScore);
    const countsByBand: Record<string, number> = Object.fromEntries(BANDS.map((b) => [b, 0]));
    const honourCounters: Record<string, number> = {};
    for (const e of g.events) {
      countsByBand[bandOf(e.notability ?? 0)]! += 1;
      const key = honourKey(e, types);
      if (!key) continue;
      honourCounters[key] = (honourCounters[key] ?? 0) + 1;
      if (vac.has(e.id)) honourCounters[COUNTER.vacated] = (honourCounters[COUNTER.vacated] ?? 0) + 1;
    }
    out.push(NotabilityRollup.parse({
      subjectKind: 'person', subjectId: g.person, seasonYear: g.year,
      topEventIds: sorted.slice(0, param('rollup.topSeason')).map((e) => e.id), countsByBand, honourCounters,
    }));
  }
  return out.sort((a, b) => a.subjectId - b.subjectId || a.seasonYear - b.seasonYear);
}

export interface CareerRollup {
  readonly personId: number;
  readonly seasons: number;
  readonly countsByBand: Readonly<Record<string, number>>;
  /** Sum of season counters; vacated honours are left out (X4.2.2 edge case). */
  readonly honourCounters: Readonly<Record<string, number>>;
  readonly topEventIds: readonly number[];
}

/** Career rollup: sum of season counters plus the top events across the career. */
export function careerRollup(personId: number, rows: readonly WorldEvent[], types: RollupTypes = DEFAULT_ROLLUP_TYPES): CareerRollup {
  const mine = rows.filter((e) => e.notability !== null && personsOf(e).includes(personId));
  const seasons = seasonRollups(mine, types).filter((r) => r.subjectId === personId);
  const countsByBand: Record<string, number> = Object.fromEntries(BANDS.map((b) => [b, 0]));
  const honourCounters: Record<string, number> = {};
  for (const s of seasons) {
    for (const [k, v] of Object.entries(s.countsByBand)) countsByBand[k] = (countsByBand[k] ?? 0) + v;
    for (const [k, v] of Object.entries(s.honourCounters)) honourCounters[k] = (honourCounters[k] ?? 0) + v;
  }
  // Vacated honours stay counted in their season but not in the career (X4.2.2 edge case).
  const vac = vacatedIds(rows, types);
  for (const e of mine) {
    if (!vac.has(e.id)) continue;
    const key = honourKey(e, types);
    if (key) honourCounters[key] = (honourCounters[key] ?? 0) - 1;
  }
  delete honourCounters[COUNTER.vacated];
  return {
    personId, seasons: seasons.length, countsByBand, honourCounters,
    topEventIds: [...mine].sort(byScore).slice(0, param('rollup.topCareer')).map((e) => e.id),
  };
}

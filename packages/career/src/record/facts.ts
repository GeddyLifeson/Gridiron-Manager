// History facts (E9.1.2 rule 3, E9.4.2, S8.2.1): true statements about the past, read by people in the
// world as a résumé is read. Seasons are counts. There is no fluency value and no familiarity value
// (E9.4.2 rules 1 and 2): a fact feeds only other people's preferences (E2.3.2).
import type { WorldEvent } from '@gm/schema';
import { RECORD_EVENT, COACH_ROLE } from './events.ts';
import { param } from './params.ts';

export const FACT_TYPES = [
  'played', 'worked_under', 'worked_in_system', 'coached_at_level', 'attended_clinic', 'gave_clinic_talk',
  'visited_staff', 'studied_film_of', 'completed_school_unit',
] as const;
export type FactType = (typeof FACT_TYPES)[number];

export type Side = 'offense' | 'defense' | 'special_teams' | 'whole_team' | 'support';

/** One job stint (JobHistoryRow subset). `lastSeason` null: still in the seat. */
export interface Stint {
  readonly teamId: number;
  readonly firstSeason: number;
  readonly lastSeason: number | null;
  readonly rung: number;
  /** Seat title key (S1 catalogue), for the role in `worked_in_system`. */
  readonly roleKey: string;
  readonly side: Side;
  /** The head coach he worked under, or null when he was the head coach. */
  readonly bossId: number | null;
  /** Level key of the team's competition (P3.1.2), e.g. `college_fbs`, `pro`. */
  readonly levelKey: string;
}

/** A playing season block from creation (E1.2.1). A fact, never a skill (E9.1.2 rule 3). */
export interface PlayingSpan { readonly levelKey: string; readonly positionKey: string; readonly firstSeason: number; readonly seasons: number }

export interface FactInputs {
  readonly personId: number;
  readonly currentSeason: number;
  readonly stints: readonly Stint[];
  /**
   * The system families the team actually ran that season on that side (G3 playbook family tags). A family
   * is credited only for seasons the team ran it (E9.4.2 rule 3). `whole_team` asks for both sides.
   */
  teamSystems(teamId: number, season: number, side: Side): readonly string[];
  /** Games the team played that season, for `coached_at_level`; omit to count seasons only. */
  games?(teamId: number, season: number): number;
  readonly playing?: readonly PlayingSpan[];
  /** Log rows; `record_history_fact` rows with this person as actor are read. */
  readonly events?: readonly WorldEvent[];
}

/**
 * One fact. Numbers are counts and years only. `refId` is the boss, team, host, or event id; `subjectKey`
 * the system family, level key, position, or film subject; `roleKey` the seat title.
 */
export interface RecordFact {
  readonly type: FactType;
  readonly firstSeason: number;
  readonly lastSeason: number;
  readonly seasons: number;
  readonly games: number | null;
  readonly refId: number | null;
  readonly subjectKey: string | null;
  readonly roleKey: string | null;
  readonly sourceEventIds: readonly number[];
  /** E9.3.5: school units are visible only to the user and read by no career system. */
  readonly userOnly: boolean;
}

function seasonsOf(s: Stint, now: number): number[] {
  const last = s.lastSeason ?? now;
  const out: number[] = [];
  for (let y = s.firstSeason; y <= last; y++) out.push(y);
  return out;
}

function spanFact(type: FactType, years: ReadonlySet<number>, refId: number | null, subjectKey: string | null, roleKey: string | null, games: number | null = null): RecordFact {
  const ys = [...years].sort((a, b) => a - b);
  return { type, firstSeason: ys[0]!, lastSeason: ys[ys.length - 1]!, seasons: ys.length, games, refId, subjectKey, roleKey, sourceEventIds: [], userOnly: false };
}

function addYear(m: Map<string, Set<number>>, k: string, y: number): void {
  const s = m.get(k) ?? new Set<number>();
  s.add(y);
  m.set(k, s);
}

const EVENT_FACTS: readonly FactType[] = ['attended_clinic', 'gave_clinic_talk', 'visited_staff', 'completed_school_unit'];

/** All facts for one person, in a fixed order (type order, then first season, then keys). */
export function historyFacts(inp: FactInputs): RecordFact[] {
  const out: RecordFact[] = [];
  for (const p of inp.playing ?? []) {
    if (p.seasons <= 0) continue;
    out.push({ type: 'played', firstSeason: p.firstSeason, lastSeason: p.firstSeason + p.seasons - 1, seasons: p.seasons, games: null, refId: null, subjectKey: p.levelKey, roleKey: p.positionKey, sourceEventIds: [], userOnly: false });
  }
  const bosses = new Map<string, Set<number>>();
  const systems = new Map<string, Set<number>>();
  const levels = new Map<string, Set<number>>();
  const levelGames = new Map<string, number>();
  const seenTeamSeason = new Set<string>();
  for (const s of inp.stints) {
    for (const y of seasonsOf(s, inp.currentSeason)) {
      if (s.bossId !== null && s.bossId !== inp.personId) addYear(bosses, String(s.bossId), y);
      for (const fam of inp.teamSystems(s.teamId, y, s.side)) addYear(systems, `${fam}|${s.roleKey}`, y);
      addYear(levels, s.levelKey, y);
      const ts = `${s.teamId}|${y}`;
      if (inp.games && !seenTeamSeason.has(ts)) {
        seenTeamSeason.add(ts);
        levelGames.set(s.levelKey, (levelGames.get(s.levelKey) ?? 0) + inp.games(s.teamId, y));
      }
    }
  }
  for (const [k, ys] of [...bosses].sort(([a], [b]) => Number(a) - Number(b))) out.push(spanFact('worked_under', ys, Number(k), null, null));
  for (const [k, ys] of [...systems].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const [fam, role] = k.split('|') as [string, string];
    out.push(spanFact('worked_in_system', ys, null, fam, role));
  }
  for (const [k, ys] of [...levels].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) out.push(spanFact('coached_at_level', ys, null, k, null, inp.games ? (levelGames.get(k) ?? 0) : null));

  const rows = (inp.events ?? [])
    .filter((e) => e.type === RECORD_EVENT.fact && e.actors.some((a) => a.personId === inp.personId && a.role === COACH_ROLE))
    .sort((a, b) => a.when.date.seasonYear - b.when.date.seasonYear || a.when.date.dayIndex - b.when.date.dayIndex || a.id - b.id);
  const film = new Map<string, { hours: number; ids: number[]; season: number; subject: string }>();
  for (const e of rows) {
    const t = e.payload['factType'];
    const y = e.when.date.seasonYear;
    const ref = typeof e.payload['refId'] === 'number' ? (e.payload['refId'] as number) : null;
    const subj = typeof e.payload['systemFamily'] === 'string' && e.payload['systemFamily'] !== '' ? (e.payload['systemFamily'] as string) : null;
    if (t === 'studied_film_of') {
      // E9.3.4: written only after the threshold of hours on one subject in a season, so the study was real.
      const subject = subj ?? `team:${ref ?? 0}`;
      const k = `${y}|${subject}`;
      const acc = film.get(k) ?? { hours: 0, ids: [], season: y, subject };
      acc.hours += typeof e.payload['hours'] === 'number' ? (e.payload['hours'] as number) : 0;
      acc.ids.push(e.id);
      film.set(k, acc);
    } else if (typeof t === 'string' && (EVENT_FACTS as readonly string[]).includes(t)) {
      out.push({ type: t as FactType, firstSeason: y, lastSeason: y, seasons: 1, games: null, refId: ref, subjectKey: subj, roleKey: null, sourceEventIds: [e.id], userOnly: t === 'completed_school_unit' });
    }
  }
  for (const f of film.values()) {
    if (f.hours >= param('studiedFilmHours')) out.push({ type: 'studied_film_of', firstSeason: f.season, lastSeason: f.season, seasons: 1, games: null, refId: null, subjectKey: f.subject, roleKey: null, sourceEventIds: f.ids, userOnly: false });
  }
  const order = (t: FactType) => FACT_TYPES.indexOf(t);
  return out.sort((a, b) => order(a.type) - order(b.type) || a.firstSeason - b.firstSeason || (a.subjectKey ?? '').localeCompare(b.subjectKey ?? '') || (a.refId ?? 0) - (b.refId ?? 0) || (a.roleKey ?? '').localeCompare(b.roleKey ?? ''));
}

/** Facts other people may read: everything but the coaching school (E9.3.5 rule 1). */
export function factsForOthers(facts: readonly RecordFact[]): RecordFact[] { return facts.filter((f) => !f.userOnly); }

/** S8.2.1 "Systems" panel: each family with total seasons and the roles held in it. No bars, no percentages. */
export interface SystemLine { readonly family: string; readonly seasons: number; readonly roles: readonly { roleKey: string; seasons: number }[] }

export function systemsPanel(facts: readonly RecordFact[]): SystemLine[] {
  const m = new Map<string, { years: Set<number>; roles: Map<string, number> }>();
  for (const f of facts) {
    if (f.type !== 'worked_in_system' || f.subjectKey === null) continue;
    const e = m.get(f.subjectKey) ?? { years: new Set<number>(), roles: new Map<string, number>() };
    for (let y = f.firstSeason; y <= f.lastSeason; y++) e.years.add(y);
    if (f.roleKey !== null) e.roles.set(f.roleKey, (e.roles.get(f.roleKey) ?? 0) + f.seasons);
    m.set(f.subjectKey, e);
  }
  return [...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([family, e]) => ({
    family,
    seasons: e.years.size,
    roles: [...e.roles].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([roleKey, seasons]) => ({ roleKey, seasons })),
  }));
}

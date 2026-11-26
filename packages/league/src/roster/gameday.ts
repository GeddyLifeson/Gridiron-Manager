// The game-day active list (C5.2.1, C5.2.2, H6.2.1 rule 1, H6.2.3 rules 1 and 2). The coverage board,
// staff recommendation and warm-up tags of H6.2 are screens and AI over this check (I1, M2, K3).
import type { RosterRules } from './keys.ts';
import { LIST, type LeagueRosters, type Refusal } from './types.ts';

export interface GameDayList {
  readonly clubId: number;
  readonly actives: readonly number[];
  readonly emergencyQb: number | null;
}

export interface GameDayVerdict {
  readonly ok: true;
  readonly activeLimit: number;
  readonly linemenActive: number;
  readonly inactives: readonly number[];
}

function refuse(rule: string, message: string, fix: string): Refusal {
  return { ok: false, rule, code: 'limit', message, fix };
}

/** Active limit for a list with `linemen` offensive linemen active (C5.2.1 rule 1). */
export function activeLimitFor(linemen: number, rules: RosterRules): number {
  const g = rules.gameDay;
  if (!g) return rules.seasonLimit;
  return linemen >= g.minLinemen ? g.activeLimit : g.activeLimitShortLine;
}

/** The players who may dress: the roster plus this game's elevations (C5.2.1 inputs). */
export function gameDayCandidates(state: LeagueRosters, clubId: number): number[] {
  const club = state.clubs.find((c) => c.clubId === clubId);
  if (!club) return [];
  return club.entries
    .filter((e) => e.list === LIST.active || (e.list === LIST.practiceSquad && e.elevatedForGame === club.gamesPlayed))
    .map((e) => e.personId);
}

/**
 * Checks a proposed list. Refuses 49 active, 48 with seven linemen, fewer than the floor when enough
 * players are available, a player not on the roster or elevated, and an emergency quarterback who does
 * not meet C5.2.2.
 */
export function validateGameDayList(state: LeagueRosters, list: GameDayList, rules: RosterRules): GameDayVerdict | Refusal {
  const g = rules.gameDay;
  if (!g) return refuse('C5.2.1', 'this league has no game-day active list limit', 'dress the roster');
  const club = state.clubs.find((c) => c.clubId === list.clubId);
  if (!club) return refuse('C5.7.1', `no club ${list.clubId}`, 'none');
  const candidates = new Set(gameDayCandidates(state, list.clubId));
  const actives = new Set(list.actives);
  if (actives.size !== list.actives.length) return refuse('C5.2.1', 'a player is listed twice', 'list each player once');
  for (const id of actives) if (!candidates.has(id)) return refuse('C5.2.1', `player ${id} is not on the roster or elevated for this game`, 'elevate or sign him first');
  const fact = (id: number) => state.players[String(id)];
  const linemen = [...actives].filter((id) => fact(id)?.offensiveLineman).length;
  const limit = activeLimitFor(linemen, rules);
  if (actives.size > limit) {
    return refuse('C5.2.1', `${actives.size} active with ${linemen} offensive linemen; the limit is ${limit}`, linemen < g.minLinemen ? `dress ${g.minLinemen} offensive linemen or make more players inactive` : 'make more players inactive');
  }
  if (actives.size < g.floor && candidates.size >= g.floor) return refuse('C5.2.1', `${actives.size} active; no fewer than ${g.floor}`, 'dress more players');
  if (list.emergencyQb !== null) {
    const id = list.emergencyQb;
    const entry = club.entries.find((e) => e.personId === id);
    if (actives.has(id)) return refuse('C5.2.2', 'the emergency quarterback is not on the active list', 'take him off the active list');
    if (!fact(id)?.quarterback) return refuse('C5.2.2', 'the emergency quarterback must be a bona fide quarterback', 'pick a quarterback');
    const onRoster = entry?.list === LIST.active;
    const elevatedAsQb = entry?.list === LIST.practiceSquad && entry.elevatedForGame === club.gamesPlayed && entry.elevatedAsEmergencyQb && g.emergencyQbFromPracticeSquad;
    if (!onRoster && !elevatedAsQb) return refuse('C5.2.2', 'the emergency quarterback must be on the roster or elevated as the emergency quarterback', 'designate a roster quarterback');
    const qbsActive = [...actives].filter((a) => fact(a)?.quarterback).length;
    if (qbsActive !== g.emergencyQbActiveQbs) return refuse('C5.2.2', `the club must have exactly ${g.emergencyQbActiveQbs} quarterbacks active; it has ${qbsActive}`, `dress exactly ${g.emergencyQbActiveQbs} quarterbacks`);
  }
  const inactives = [...candidates].filter((id) => !actives.has(id) && id !== list.emergencyQb).sort((a, b) => a - b);
  return { ok: true, activeLimit: limit, linemenActive: linemen, inactives };
}

/** C5.2.2 rule 3 and 4: he may be in the game only while both active quarterbacks are out through injury or disqualification. */
export function emergencyQbMayPlay(activeQbsUnavailable: number, activeQbs: number): boolean {
  return activeQbs > 0 && activeQbsUnavailable >= activeQbs;
}

/** H6.2.3 rule 1: the list locks the key's minutes before kickoff and takes no change after. */
export function gameDayListLocked(minutesToKickoff: number, rules: RosterRules): boolean {
  if (!rules.gameDay) return false;
  return minutesToKickoff <= rules.gameDay.lockMinutes;
}

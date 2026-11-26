// Leaders (L2.2): captains by vote, appointment or vote with veto (L2.2.1); the leadership council and
// player policing (L2.2.2); position-room leaders with hysteresis (L2.2.3). Ties, influence and culture are
// read from the G-24 records (people/relationships, people/culture) through the structural `TieLookup`.
import { possible } from '@gm/schema';
import { clamp, lp, type Draw } from './params.ts';

/** Any tie store with a symmetric `get` (G-24 `TieGraph` satisfies it). */
export interface TieLookup { get(x: number, y: number): number }

export type Unit = 'offense' | 'defense' | 'special_teams';
export type CaptainMethod = 'vote' | 'appoint' | 'vote_with_veto';

export interface CaptainCandidate {
  readonly id: number;
  readonly unit: Unit;
  readonly influence: number;
  /** Trust in the head coach, 0 to 100. */
  readonly trustInCoach: number;
}

export type UnitSeats = Readonly<Record<Unit, number>>;

/** Default seats summing to the default count (starting split; the bible names the units, not the split). */
export function defaultSeats(): UnitSeats {
  const total = lp('captains.countDefault');
  const st = total >= 6 ? 2 : 1;
  const rest = total - st;
  return { offense: Math.ceil(rest / 2), defense: Math.floor(rest / 2), special_teams: st };
}

/**
 * Player vote (L2.2.1): each player votes for the highest `tie + influence` teammates on his unit, as many as
 * the unit has seats. Ties in score break by lower id; result ties break by higher influence, then lower id.
 * Reproducible for a given roster and tie graph.
 */
export function captainVote(players: readonly CaptainCandidate[], ties: TieLookup, seats: UnitSeats): { readonly winners: readonly number[]; readonly votes: ReadonlyMap<number, number> } {
  const votes = new Map<number, number>();
  const sorted = [...players].sort((a, b) => a.id - b.id);
  for (const voter of sorted) {
    const mates = sorted.filter((p) => p.unit === voter.unit && p.id !== voter.id);
    const ranked = mates.map((m) => ({ id: m.id, s: ties.get(voter.id, m.id) + m.influence })).sort((a, b) => b.s - a.s || a.id - b.id);
    for (const r of ranked.slice(0, seats[voter.unit])) votes.set(r.id, (votes.get(r.id) ?? 0) + 1);
  }
  const winners: number[] = [];
  for (const unit of ['offense', 'defense', 'special_teams'] as const) {
    const pool = sorted.filter((p) => p.unit === unit).sort((a, b) => (votes.get(b.id) ?? 0) - (votes.get(a.id) ?? 0) || b.influence - a.influence || a.id - b.id);
    winners.push(...pool.slice(0, seats[unit]).map((p) => p.id));
  }
  return { winners, votes };
}

export interface CaptainResult {
  readonly captains: readonly number[];
  /** Team-wide trust change, applied once (L2.2.1 acceptance). */
  readonly teamTrust: number;
  /** Extra trust change for each passed-over player. */
  readonly passedOver: ReadonlyMap<number, number>;
  /** Voted captains with trust under 40: legitimate leaders who may resist messages (L2.4.2). */
  readonly resisters: readonly number[];
}

/**
 * Settle the captains (L2.2.1). `appointed` is the coach's list for `appoint`; `veto` replaces one voted
 * captain with another for `vote_with_veto`. Each appointee the vote would not have chosen costs -3 team-wide
 * and -8 for the passed-over player; a veto costs -6 team-wide.
 */
export function settleCaptains(method: CaptainMethod, voted: readonly number[], players: readonly CaptainCandidate[], appointed: readonly number[] = [], veto: { readonly out: number; readonly in: number } | null = null): CaptainResult {
  const byId = new Map(players.map((p) => [p.id, p]));
  let captains: number[] = [...voted];
  let teamTrust = 0;
  const passedOver = new Map<number, number>();
  if (method === 'appoint') {
    captains = [...appointed];
    const outsiders = appointed.filter((id) => !voted.includes(id));
    const dropped = voted.filter((id) => !appointed.includes(id));
    teamTrust += outsiders.length * lp('captains.appointTeamTrust');
    for (let i = 0; i < outsiders.length && i < dropped.length; i++) passedOver.set(dropped[i]!, lp('captains.appointPassedOverTrust'));
  } else if (method === 'vote_with_veto' && veto && voted.includes(veto.out)) {
    captains = voted.map((id) => (id === veto.out ? veto.in : id));
    teamTrust += lp('captains.vetoTeamTrust');
  }
  const resisters = method === 'appoint' ? [] : captains.filter((id) => voted.includes(id) && (byId.get(id)?.trustInCoach ?? lp('scale.max')) < lp('captains.legitimateResistTrustBelow'));
  return { captains, teamTrust, passedOver, resisters };
}

// ---- L2.2.2 leadership council ----

export interface CouncilIssue {
  readonly id: number;
  /** Players involved in the issue (a morale cluster under 35, a consistency drop, a brewing L9 event). */
  readonly involved: readonly number[];
  readonly kind: 'morale_cluster' | 'consistency_drop' | 'crisis_brewing' | 'schedule' | 'other';
}

export interface CouncilMember { readonly id: number; readonly trustInCoach: number }

/** Surfacing probability per meeting (L2.2.2): 0.2 + 0.6 * mean member trust/100, or 0 if no member has a tie above 50 to someone involved. */
export function surfacingProbability(members: readonly CouncilMember[], issue: CouncilIssue, ties: TieLookup): number {
  if (members.length === 0) return possible(0);
  const line = lp('council.surface.minTie');
  const seen = members.some((m) => issue.involved.some((p) => p === m.id || ties.get(m.id, p) > line));
  if (!seen) return possible(0);
  const meanTrust = members.reduce((s, m) => s + clamp(m.trustInCoach, 0, lp('scale.max')), 0) / members.length;
  return possible(lp('council.surface.base') + lp('council.surface.trustSlope') * meanTrust / lp('scale.max'));
}

export type CouncilResponse = 'act' | 'explain' | 'defer';

export interface AgendaItem {
  readonly issueId: number;
  readonly deferrals: number;
  /** Closed: no longer raised (deferred twice) or acted on. */
  readonly closed: boolean;
}

export interface CouncilResponseEffect {
  readonly item: AgendaItem;
  readonly memberTrust: number;
  readonly groupTrust: number;
}

/**
 * Respond to an agenda item (L2.2.2): act +4 members, +2 affected group; explain with coach_word above 60
 * gives 0 to +1 (scaled by how far coach_word is above 60); defer twice is -5 and the item stops being raised.
 */
export function respond(item: AgendaItem, r: CouncilResponse, coachWord: number): CouncilResponseEffect {
  if (item.closed) return { item, memberTrust: 0, groupTrust: 0 };
  if (r === 'act') return { item: { ...item, closed: true }, memberTrust: lp('council.act.memberTrust'), groupTrust: lp('council.act.groupTrust') };
  if (r === 'explain') {
    const above = lp('council.explain.coachWordAbove');
    const t = coachWord > above ? lp('council.explain.trustMax') * clamp((coachWord - above) / (lp('scale.max') - above), 0, 1) : 0;
    return { item, memberTrust: t, groupTrust: 0 };
  }
  const deferrals = item.deferrals + 1;
  if (deferrals >= lp('council.defer.limit')) return { item: { ...item, deferrals, closed: true }, memberTrust: lp('council.defer.trust'), groupTrust: 0 };
  return { item: { ...item, deferrals }, memberTrust: 0, groupTrust: 0 };
}

/** Draw which issues surface at one meeting, at most four, in issue id order (L2.2.2). Deterministic for a seeded draw. */
export function meetingAgenda(members: readonly CouncilMember[], issues: readonly CouncilIssue[], ties: TieLookup, closed: ReadonlySet<number>, draw: Draw): number[] {
  const out: number[] = [];
  for (const i of [...issues].sort((a, b) => a.id - b.id)) {
    if (closed.has(i.id)) continue;
    if (draw() < surfacingProbability(members, i, ties)) out.push(i.id);
    if (out.length >= lp('council.agendaMax')) break;
  }
  return out;
}

/** Council size check (6 to 12, or captains plus one per room). */
export function councilSizeOk(n: number): boolean {
  return n >= lp('council.minMembers') && n <= lp('council.maxMembers');
}

/**
 * Player policing (L2.2.2): works when culture is above 60; under 40 turning it on does nothing and members
 * lose standing with teammates (a tie change per member per teammate tie, Assumption size).
 */
export function policingEffect(on: boolean, culture: number): { readonly works: boolean; readonly memberStanding: number } {
  if (!on) return { works: false, memberStanding: 0 };
  if (culture > lp('council.policing.cultureAbove')) return { works: true, memberStanding: 0 };
  if (culture < lp('council.policing.cultureBelow')) return { works: false, memberStanding: lp('council.policing.lostStanding') };
  return { works: false, memberStanding: 0 };
}

// ---- L2.2.3 position-room leaders ----

export interface RoomLeaderState {
  readonly room: string;
  readonly leaderId: number | null;
  /** League-year week of the last recompute and of the last change. */
  readonly lastRecomputeWeek: number;
  readonly lastChangeWeek: number;
}

/**
 * Recompute the leader monthly (L2.2.3): the highest in-room influence, but a challenger must beat the
 * sitting leader by more than 10 points. A roster move (the leader left) forces a new leader at once.
 */
export function stepRoomLeader(s: RoomLeaderState, week: number, influences: ReadonlyMap<number, number>): RoomLeaderState {
  const sittingGone = s.leaderId !== null && !influences.has(s.leaderId);
  if (!sittingGone && s.leaderId !== null && week - s.lastRecomputeWeek < lp('roomLeader.recomputeWeeks')) return s;
  const ranked = [...influences.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const top = ranked[0];
  if (!top) return { ...s, leaderId: null, lastRecomputeWeek: week };
  if (s.leaderId === null || sittingGone) return { room: s.room, leaderId: top[0], lastRecomputeWeek: week, lastChangeWeek: week };
  const sitting = influences.get(s.leaderId)!;
  if (top[0] !== s.leaderId && top[1] > sitting + lp('roomLeader.hysteresis')) return { room: s.room, leaderId: top[0], lastRecomputeWeek: week, lastChangeWeek: week };
  return { ...s, lastRecomputeWeek: week };
}

/**
 * Room study and practice modifiers from the leader (L2.2.3): work ethic above 70 raises weekly knowledge
 * gain by 3 percent (doubled where class load limits meeting time, L2.6.1); under 40 lowers practice effort
 * by 2 percent. `studyMultiplier` is 1, or the college multiplier passed by the caller from level data.
 */
export function roomLeaderModifiers(workEthic: number, studyMultiplier = 1): { readonly knowledgeGain: number; readonly practiceEffort: number } {
  return {
    knowledgeGain: workEthic > lp('roomLeader.studyWorkEthicAbove') ? lp('roomLeader.studyGain') * studyMultiplier : 0,
    practiceEffort: workEthic < lp('roomLeader.loafWorkEthicBelow') ? lp('roomLeader.effortLoss') : 0,
  };
}

/** Releasing or trading a room leader: cohesion drop of 10 for the room (L2.2.3). */
export function leaderReleaseCohesionDrop(): number {
  return -lp('roomLeader.releaseCohesionDrop');
}

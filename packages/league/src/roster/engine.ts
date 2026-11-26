// The transaction engine (C5.7.1): one function through which every roster move passes, for the user
// and AI clubs alike. Validation order: phase allows the type, player is eligible, list limits hold
// after the move, deadlines are met. Linked moves are atomic. A refusal names the rule and the fix.
// Breakable acts (a healthy player stashed on injured reserve, a medical retirement of a player who
// can play) pass as legal filings and come back as `breakable` for L8.2.5 (G-28).
import type { RosterRules } from './keys.ts';
import { HOURS_PER_DAY, P } from './params.ts';
import { practiceSquadGroup, practiceSquadGroupCaps, subjectToWaivers } from './eligibility.ts';
import {
  LIST, type Accepted, type BreakableAct, type ClubRoster, type Instant, type LeagueRosters, type ListKey,
  type PlayerFacts, type Refusal, type ReserveList, type RosterEntry, type RosterEvent, type Transaction,
  type TxResult, type WaiverItem, type WireEntry,
} from './types.ts';

type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
type Draft = Mutable<LeagueRosters>;
type DClub = Mutable<ClubRoster>;
type DEntry = Mutable<RosterEntry>;

const RESERVE_LISTS: readonly ListKey[] = [LIST.injured, LIST.pup, LIST.nfi, LIST.suspended];

function refuse(rule: string, code: Refusal['code'], message: string, fix: string): Refusal {
  return { ok: false, rule, code, message, fix };
}

// ---------------------------------------------------------------- time

export function absHour(t: Instant): number { return t.dayIndex * HOURS_PER_DAY + t.hour; }
export function fromAbsHour(h: number): Instant {
  const dayIndex = Math.floor(h / HOURS_PER_DAY);
  return { dayIndex, hour: h - dayIndex * HOURS_PER_DAY };
}

/**
 * The day a move filed at `t` counts for (C5.7.1 business-day clock: at or after the daily deadline it
 * counts for the next day). Weekends and holidays are not modelled: the calendar (G-12) owns them.
 */
export function effectiveDay(t: Instant, rules: RosterRules): number {
  if (rules.dailyDeadlineHour === null) return t.dayIndex;
  return t.hour < rules.dailyDeadlineHour ? t.dayIndex : t.dayIndex + 1;
}

/** Claim deadline for a player waived at `t`: the claim period counted from the deadline hour of his effective day. */
export function claimDeadline(t: Instant, hours: number, rules: RosterRules): Instant {
  if (rules.dailyDeadlineHour === null) return fromAbsHour(absHour(t) + hours);
  return fromAbsHour(effectiveDay(t, rules) * HOURS_PER_DAY + rules.dailyDeadlineHour + hours);
}

// ---------------------------------------------------------------- counts

export interface ClubCounts {
  roster: number;
  practiceSquad: number;
  practiceSquadInternational: number;
  practiceSquadGroupB: number;
  practiceSquadVeterans: number;
  elevationsNextGame: number;
  protectionsThisWeek: number;
}

function counted(e: { list: ListKey; personId: number }, players: LeagueRosters['players'], rules: RosterRules): boolean {
  const p = players[String(e.personId)];
  if (p?.countExempt) return false;
  if (e.list === LIST.active) return true;
  return e.list === LIST.medicalRetired && rules.cuts !== null && !rules.cuts.medicalRetirementLeavesCount;
}

export function clubCounts(club: ClubRoster, players: LeagueRosters['players'], rules: RosterRules): ClubCounts {
  const c: ClubCounts = { roster: 0, practiceSquad: 0, practiceSquadInternational: 0, practiceSquadGroupB: 0, practiceSquadVeterans: 0, elevationsNextGame: 0, protectionsThisWeek: 0 };
  for (const e of club.entries) {
    if (counted(e, players, rules)) c.roster += 1;
    if (e.list !== LIST.practiceSquad) continue;
    const p = players[String(e.personId)];
    c.practiceSquad += 1;
    if (p?.internationalPathway) c.practiceSquadInternational += 1;
    const group = p ? practiceSquadGroup(p, rules) : null;
    if (group === 'B') c.practiceSquadGroupB += 1;
    if (group === 'C') c.practiceSquadVeterans += 1;
    if (e.elevatedForGame === club.gamesPlayed && (!e.elevatedAsEmergencyQb || P.emergencyQbElevationCountsPerGame > 0)) c.elevationsNextGame += 1;
    if (e.protectedForGame === club.gamesPlayed) c.protectionsThisWeek += 1;
  }
  return c;
}

/** The roster limit in force (C5.1.1: the offseason limit until the roster deadline, then the season limit). */
export function rosterLimit(state: Pick<LeagueRosters, 'phase'>, rules: RosterRules): number | null {
  return state.phase === 'offseason' ? rules.offseasonLimit : rules.seasonLimit;
}

function limitLeaf(rules: RosterRules): string {
  return rules.keysRead.includes('league.roster_limit') ? 'T5.1.1' : 'C5.1.1';
}

export function allowedDesignations(club: ClubRoster, rules: RosterRules): number {
  if (!rules.reserve) return 0;
  return rules.reserve.designations + (club.inPostseason ? rules.reserve.postseasonDesignations : 0);
}

/** Checks every list limit of one club; `before` lets a club already over a limit (after a league event) move down. */
function checkClubLimits(d: Draft, club: DClub, rules: RosterRules, before: ClubCounts | null, strictRoster: boolean): Refusal | null {
  const c = clubCounts(club, d.players, rules);
  const limit = strictRoster ? rules.seasonLimit : rosterLimit(d, rules);
  if (limit !== null && c.roster > limit && (strictRoster || !before || c.roster > before.roster)) {
    return refuse(strictRoster ? 'C5.6.1' : limitLeaf(rules), 'limit', `club ${club.clubId} would have ${c.roster} on the roster; the limit is ${limit}`,
      'release, trade or place a player on a reserve list first, as a linked move');
  }
  const ps = rules.practiceSquad;
  if (ps) {
    const placesAllowed = ps.size + Math.min(c.practiceSquadInternational, ps.internationalSlots);
    if (c.practiceSquad > placesAllowed) return refuse('C5.3.1', 'limit', `practice squad would hold ${c.practiceSquad}; ${placesAllowed} places are allowed`, 'release a practice squad player first');
    const caps = practiceSquadGroupCaps(rules);
    if (c.practiceSquadGroupB > caps.B) return refuse('C5.3.1', 'limit', `practice squad would hold ${c.practiceSquadGroupB} group B players (at most two accrued seasons); at most ${caps.B}`, 'sign a group A player, or release a group B player');
    if (c.practiceSquadVeterans > caps.C) return refuse('C5.3.1', 'limit', `practice squad would hold ${c.practiceSquadVeterans} veterans of any service; at most ${caps.C}`, 'sign a player with at most two accrued seasons, or release a veteran');
    if (c.elevationsNextGame > ps.elevationsPerGame) return refuse('C5.3.2', 'limit', `elevations for the next game would be ${c.elevationsNextGame}; at most ${ps.elevationsPerGame}`, 'sign the player to the roster instead');
    if (c.protectionsThisWeek > ps.protectionsPerWeek) return refuse('C5.3.3', 'limit', `protections this week would be ${c.protectionsThisWeek}; at most ${ps.protectionsPerWeek}`, 'protect fewer players');
  }
  if (rules.reserve) {
    const allowed = allowedDesignations(club, rules);
    if (club.designationsUsed > allowed) return refuse('C5.4.2', 'limit', `return designations would be ${club.designationsUsed}; ${allowed} this season`, 'none left: the player stays on injured reserve');
    if (club.cutdownDesignationsUsed > rules.reserve.cutdownDesignations) return refuse('C5.4.2', 'limit', `cutdown return designations would be ${club.cutdownDesignationsUsed}; at most ${rules.reserve.cutdownDesignations}`, 'place him on injured reserve without the designation');
  }
  return null;
}

// ---------------------------------------------------------------- context

class Ctx {
  readonly wire: WireEntry[] = [];
  readonly breakable: BreakableAct[] = [];
  readonly before = new Map<number, ClubCounts>();
  inCutdown = false;
  constructor(readonly d: Draft, readonly rules: RosterRules) {}

  club(id: number): DClub | null { return this.d.clubs.find((c) => c.clubId === id) ?? null; }
  touch(club: DClub): void { if (!this.before.has(club.clubId)) this.before.set(club.clubId, clubCounts(club, this.d.players, this.rules)); }
  player(id: number): PlayerFacts | null { return this.d.players[String(id)] ?? null; }
  locate(personId: number): { club: DClub; entry: DEntry; index: number } | null {
    for (const club of this.d.clubs) {
      const index = club.entries.findIndex((e) => e.personId === personId);
      if (index >= 0) return { club, entry: club.entries[index]!, index };
    }
    return null;
  }
  onWaivers(personId: number): boolean { return this.d.waivers.some((w) => w.personId === personId); }
  isFreeAgent(personId: number): boolean { return this.player(personId) !== null && !this.locate(personId) && !this.onWaivers(personId); }
  post(kind: string, clubId: number | null, personId: number | null, detail: Record<string, string | number | boolean> = {}): void {
    this.d.wireSeq += 1;
    this.wire.push({ seq: this.d.wireSeq, dayIndex: this.d.now.dayIndex, clubId, personId, kind, detail });
  }
  limits(strictClub: number | null = null): Refusal | null {
    for (const [id, before] of this.before) {
      const club = this.club(id)!;
      const r = checkClubLimits(this.d, club, this.rules, before, id === strictClub);
      if (r) return r;
    }
    return null;
  }
}

function newEntry(personId: number, list: ListKey, day: number): DEntry {
  return {
    personId, list, sinceDay: day, campFlag: null, reserve: null, elevationsThisSeason: 0, elevatedForGame: null,
    elevatedAsEmergencyQb: false, protectedForGame: null, payGuaranteedThroughGame: null,
  };
}

const inSeason = (d: Draft) => d.phase !== 'offseason';

// ---------------------------------------------------------------- club moves

function step(ctx: Ctx, tx: Transaction): Refusal | null {
  const { d, rules } = ctx;
  const club = ctx.club(tx.clubId);
  if (!club) return refuse('C5.7.1', 'unknown', `no club ${tx.clubId}`, 'file for a club in the league');
  ctx.touch(club);
  // A claim's linked moves wait for the award (C5.7.1 edge case); every other move runs them first.
  if (tx.type !== 'claim' && 'linked' in tx && tx.linked) {
    for (const l of tx.linked) {
      if (l.type === 'cutdown') return refuse('C5.7.1', 'precondition', 'a cutdown cannot be a linked move', 'file the cutdown on its own');
      const r = step(ctx, l);
      if (r) return r;
    }
  }
  switch (tx.type) {
    case 'sign_free_agent': {
      if (!ctx.isFreeAgent(tx.personId)) return refuse('C5.7.1', 'eligibility', `player ${tx.personId} is not a free agent`, ctx.onWaivers(tx.personId) ? 'file a waiver claim instead' : 'sign a free agent');
      club.entries.push(newEntry(tx.personId, LIST.active, d.now.dayIndex));
      ctx.post('signed', club.clubId, tx.personId, { list: LIST.active });
      return null;
    }
    case 'sign_practice_squad': {
      const ps = rules.practiceSquad;
      if (!ps) return refuse('C5.3.1', 'phase', 'this league has no practice squad', 'sign him to the roster');
      if (!inSeason(d) || !d.practiceSquadsOpen) return refuse('C5.6.1', 'phase', 'practice squads form after the cutdown claims are awarded', 'wait for the claim deadline after the roster deadline');
      if (!ctx.isFreeAgent(tx.personId)) return refuse('C5.3.1', 'eligibility', `player ${tx.personId} is not a free agent`, 'sign a free agent');
      const group = practiceSquadGroup(ctx.player(tx.personId)!, rules);
      club.entries.push(newEntry(tx.personId, LIST.practiceSquad, d.now.dayIndex));
      ctx.post('signed_practice_squad', club.clubId, tx.personId, { group: group ?? '' });
      return null;
    }
    case 'sign_from_practice_squad': {
      const at = ctx.locate(tx.personId);
      if (!at || at.entry.list !== LIST.practiceSquad) return refuse('C5.3.3', 'eligibility', `player ${tx.personId} is not on a practice squad`, 'pick a practice squad player');
      if (at.club.clubId === club.clubId) {
        at.entry.list = LIST.active; at.entry.elevatedForGame = null; at.entry.elevatedAsEmergencyQb = false; at.entry.protectedForGame = null; at.entry.sinceDay = d.now.dayIndex;
        ctx.post('promoted', club.clubId, tx.personId);
        return null;
      }
      const owner = at.club;
      const ps = rules.practiceSquad!;
      if (at.entry.protectedForGame === owner.gamesPlayed) return refuse('C5.3.3', 'eligibility', `player ${tx.personId} is protected until after his club's next game`, 'wait until his club has played');
      if (owner.nextGame && owner.nextGame.opponentId === club.clubId && owner.nextGame.dayIndex - d.now.dayIndex <= ps.nextOpponentDays) {
        return refuse('C5.3.3', 'deadline', `player ${tx.personId} may not sign with his club's next opponent this close to the game`, 'wait until after the game');
      }
      ctx.touch(owner);
      owner.entries.splice(at.index, 1);
      const e = newEntry(tx.personId, LIST.active, d.now.dayIndex);
      e.payGuaranteedThroughGame = club.gamesPlayed + ps.poachPayWeeks - 1;
      club.entries.push(e);
      ctx.post('signed_off_practice_squad', club.clubId, tx.personId, { fromClub: owner.clubId, payWeeks: ps.poachPayWeeks });
      return null;
    }
    case 'elevate': {
      const ps = rules.practiceSquad;
      if (!ps || !rules.gameDay) return refuse('C5.3.2', 'phase', 'this league has no practice squad elevations', 'sign him to the roster');
      if (!inSeason(d)) return refuse('C5.3.2', 'phase', 'elevations are for regular season and postseason games', 'wait for the season');
      const at = ctx.locate(tx.personId);
      if (!at || at.club.clubId !== club.clubId || at.entry.list !== LIST.practiceSquad) return refuse('C5.3.2', 'eligibility', `player ${tx.personId} is not on this club's practice squad`, 'elevate one of your practice squad players');
      if (at.entry.elevatedForGame === club.gamesPlayed) return refuse('C5.3.2', 'precondition', 'he is already elevated for this game', 'none needed');
      const p = ctx.player(tx.personId)!;
      if (tx.emergencyQb) {
        if (!rules.gameDay.emergencyQbFromPracticeSquad) return refuse('C5.2.2', 'eligibility', 'the emergency quarterback must come from the 53 under these rules', 'designate a quarterback on the roster');
        if (!p.quarterback) return refuse('C5.2.2', 'eligibility', 'only a bona fide quarterback can be the emergency quarterback', 'pick a quarterback');
      } else {
        const counts = d.phase === 'regular' || !ps.postseasonUnlimited;
        if (counts && at.entry.elevationsThisSeason >= ps.elevationsPerPlayerSeason) {
          return refuse('C5.3.2', 'limit', `player ${tx.personId} has used all ${ps.elevationsPerPlayerSeason} elevations this season`, 'sign him to the roster');
        }
        if (counts && d.phase === 'regular') at.entry.elevationsThisSeason += 1;
      }
      at.entry.elevatedForGame = club.gamesPlayed;
      at.entry.elevatedAsEmergencyQb = tx.emergencyQb === true;
      ctx.post('elevated', club.clubId, tx.personId, { emergencyQb: tx.emergencyQb === true, used: at.entry.elevationsThisSeason });
      return null;
    }
    case 'release': {
      const at = ctx.locate(tx.personId);
      if (!at || at.club.clubId !== club.clubId) return refuse('C5.5.1', 'eligibility', `player ${tx.personId} is not on this club`, 'release one of your players');
      const fromList = at.entry.list;
      club.entries.splice(at.index, 1);
      const p = ctx.player(tx.personId)!;
      // A practice squad player is released straight to free agency (assumption: C5.3 states no waiver step for him).
      if (fromList !== LIST.practiceSquad && rules.waivers && subjectToWaivers(p, rules, d.tradeDeadlinePassed)) {
        const hours = d.phase === 'offseason' ? rules.waivers.offseasonClaimHours : rules.waivers.claimHours;
        d.waivers.push({ personId: tx.personId, fromClubId: club.clubId, deadline: claimDeadline(d.now, hours, rules), claims: [], atCutdown: ctx.inCutdown });
        ctx.post('waived', club.clubId, tx.personId, { fromList, injured: p.injured });
      } else if (rules.cuts) {
        ctx.post('cut', club.clubId, tx.personId, { fromList, aidKept: !rules.cuts.aidCancelledOnCut });
      } else {
        ctx.post('released', club.clubId, tx.personId, { fromList });
      }
      return null;
    }
    case 'claim': {
      if (!rules.waivers) return refuse('C5.5.1', 'phase', 'this league has no waivers', 'sign free agents directly');
      const item = d.waivers.find((w) => w.personId === tx.personId);
      if (!item) return refuse('C5.5.1', 'eligibility', `player ${tx.personId} is not on waivers`, 'claim a player on the wire');
      if (item.fromClubId === club.clubId) return refuse('C5.5.1', 'eligibility', 'a club cannot claim the player it waived', 'sign him after he clears waivers');
      if (absHour(d.now) >= absHour(item.deadline)) return refuse('C5.5.1', 'deadline', 'the claim period has ended', 'none: claims are being awarded');
      if (item.claims.some((c) => c.clubId === club.clubId)) return refuse('C5.5.1', 'precondition', 'this club has already claimed him', 'none needed');
      // Dry run now, so an impossible claim is refused at filing; it runs again for real when awarded.
      const trial = awardTrial(d, rules, club.clubId, tx.personId, tx.linked ?? []);
      if (!trial.ok) return trial;
      item.claims.push({ clubId: club.clubId, linked: structuredClone(tx.linked ?? []) as never });
      ctx.post('claim_filed', club.clubId, tx.personId);
      return null;
    }
    case 'camp_designation': {
      if (!rules.reserve) return refuse('C5.4.3', 'phase', 'this league has no reserve lists', 'none');
      if (d.phase !== 'offseason') return refuse('C5.4.3', 'phase', 'camp designations are made before the roster deadline', 'use a reserve list');
      const at = ctx.locate(tx.personId);
      if (!at || at.club.clubId !== club.clubId || at.entry.list !== LIST.active) return refuse('C5.4.3', 'eligibility', `player ${tx.personId} is not on this club's roster`, 'pick a player on the roster');
      const p = ctx.player(tx.personId)!;
      if (tx.flag === 'pup' && p.practicedThisPreseason) return refuse('C5.4.3', 'eligibility', 'a player who took part in a camp practice or game cannot go on PUP', 'use injured reserve');
      if (tx.flag === 'pup' && !p.injured) ctx.breakable.push({ rule: 'C11.3.1', act: 'healthy player listed physically unable to perform', clubId: club.clubId, personId: tx.personId });
      if (tx.flag === 'nfi' && !p.nonFootballInjury) ctx.breakable.push({ rule: 'C11.3.1', act: 'player without a non-football injury listed NFI', clubId: club.clubId, personId: tx.personId });
      at.entry.campFlag = tx.flag;
      ctx.post(tx.flag === 'pup' ? 'active_pup' : 'active_nfi', club.clubId, tx.personId);
      return null;
    }
    case 'place_reserve': return placeReserve(ctx, club, tx);
    case 'open_return_window': return openWindow(ctx, club, tx.personId);
    case 'activate': return activate(ctx, club, tx.personId);
    case 'protect': {
      if (!rules.practiceSquad) return refuse('C5.3.3', 'phase', 'this league has no practice squad', 'none');
      if (!inSeason(d)) return refuse('C5.3.3', 'phase', 'protections are weekly in the season', 'wait for the season');
      if (tx.personIds.length === 0) return refuse('C5.3.3', 'precondition', 'name at least one player to protect', 'pick players');
      for (const id of tx.personIds) {
        const at = ctx.locate(id);
        if (!at || at.club.clubId !== club.clubId || at.entry.list !== LIST.practiceSquad) return refuse('C5.3.3', 'eligibility', `player ${id} is not on this club's practice squad`, 'protect your own practice squad players');
        at.entry.protectedForGame = club.gamesPlayed;
        ctx.post('protected', club.clubId, id);
      }
      return null;
    }
    case 'trade': {
      if (rules.tradeDeadlineAfterWeek === null) return refuse('C5.5.2', 'phase', 'this league has no trades', 'none');
      if (d.tradeDeadlinePassed) return refuse('C5.5.2', 'deadline', 'the trade deadline has passed; trading reopens with the new league year', 'wait for the new league year');
      const other = ctx.club(tx.otherClubId);
      if (!other || other.clubId === club.clubId) return refuse('C5.7.1', 'unknown', `no other club ${tx.otherClubId}`, 'trade with another club');
      if (tx.give.length + tx.get.length === 0) return refuse('C5.5.2', 'precondition', 'a trade must move at least one player', 'add a player (picks are G-34)');
      ctx.touch(other);
      // Practice squad players are not traded (assumption: they hold no contract with the club to assign, C5.3).
      const tradable = (l: ListKey) => l === LIST.active || RESERVE_LISTS.includes(l);
      const move = (from: DClub, to: DClub, ids: number[]): Refusal | null => {
        for (const id of ids) {
          const at = ctx.locate(id);
          if (!at || at.club.clubId !== from.clubId || !tradable(at.entry.list)) return refuse('C5.5.2', 'eligibility', `player ${id} is not on club ${from.clubId}'s roster or a reserve list`, 'trade players the club holds');
          from.entries.splice(at.index, 1);
          to.entries.push({ ...at.entry, sinceDay: d.now.dayIndex, protectedForGame: null });
          ctx.post('traded', to.clubId, id, { fromClub: from.clubId });
        }
        return null;
      };
      return move(club, other, tx.give) ?? move(other, club, tx.get);
    }
    case 'medical_retirement': {
      if (!rules.cuts) return refuse('T5.1.2', 'phase', 'this league has no medical retirement from the roster count', 'use a reserve list');
      const at = ctx.locate(tx.personId);
      if (!at || at.club.clubId !== club.clubId) return refuse('T5.1.2', 'eligibility', `player ${tx.personId} is not on this club`, 'pick one of your players');
      if (ctx.player(tx.personId)!.medicallyCleared) ctx.breakable.push({ rule: 'T5.1.2', act: 'medical retirement of a player the medical report says can play', clubId: club.clubId, personId: tx.personId });
      at.entry.list = LIST.medicalRetired;
      ctx.post('medical_retirement', club.clubId, tx.personId);
      return null;
    }
    case 'cutdown': {
      if (d.phase !== 'offseason') return refuse('C5.6.1', 'phase', 'the reduction happens once, before the roster deadline', 'none');
      ctx.inCutdown = true;
      for (const m of tx.moves) {
        if (m.type === 'cutdown') return refuse('C5.6.1', 'precondition', 'a cutdown cannot contain a cutdown', 'list the moves');
        if (m.clubId !== club.clubId) return refuse('C5.6.1', 'precondition', 'a cutdown holds only the club\'s own moves', 'file trades separately');
        const r = step(ctx, m);
        if (r) return r;
      }
      ctx.inCutdown = false;
      club.deadlineMet = true;
      ctx.post('cutdown_filed', club.clubId, null, { roster: clubCounts(club, d.players, rules).roster });
      return null;
    }
  }
}

function placeReserve(ctx: Ctx, club: DClub, tx: Extract<Transaction, { type: 'place_reserve' }>): Refusal | null {
  const { d, rules } = ctx;
  const rv = rules.reserve;
  if (!rv) return refuse('C5.4.1', 'phase', 'this league has no reserve lists', 'release or keep the player');
  const at = ctx.locate(tx.personId);
  if (!at || at.club.clubId !== club.clubId || at.entry.list !== LIST.active) return refuse('C5.4.1', 'eligibility', `player ${tx.personId} is not on this club's roster`, 'pick a player on the roster');
  const p = ctx.player(tx.personId)!;
  let designated = false;
  if (tx.list === LIST.injured) {
    if (!p.injured) ctx.breakable.push({ rule: 'H6.5.1', act: 'healthy player placed on injured reserve', clubId: club.clubId, personId: tx.personId });
    if (tx.designateToReturn) {
      if (!ctx.inCutdown) return refuse('C5.4.2', 'phase', 'only a placement at the cutdown can carry the return designation', 'open a return window later');
      club.cutdownDesignationsUsed += 1;
      club.designationsUsed += 1;
      designated = true;
    }
  } else if (tx.list === LIST.pup) {
    if (d.phase !== 'offseason' || at.entry.campFlag !== 'pup') return refuse('C5.4.3', 'eligibility', 'reserve/PUP is for a player on active/PUP at the cutdown', 'use injured reserve');
  } else {
    if (d.phase === 'offseason' && at.entry.campFlag !== 'nfi') return refuse('C5.4.3', 'eligibility', 'reserve/NFI at the cutdown is for a player on active/NFI', 'use injured reserve');
    if (inSeason(d) && !p.nonFootballInjury) ctx.breakable.push({ rule: 'C11.3.1', act: 'player without a non-football injury placed on reserve/NFI', clubId: club.clubId, personId: tx.personId });
  }
  at.entry.list = tx.list;
  at.entry.campFlag = null;
  at.entry.sinceDay = d.now.dayIndex;
  at.entry.reserve = {
    placedAtGame: club.gamesPlayed,
    // C5.4.1 rule 3: injured reserve before the roster deadline is for the season unless designated.
    seasonEnding: tx.list === LIST.injured && d.phase === 'offseason' && !designated,
    designatedAtCutdown: designated, windowOpenedDay: null, suspensionGames: 0,
  };
  ctx.post('placed_reserve', club.clubId, tx.personId, { list: tx.list, seasonEnding: at.entry.reserve.seasonEnding, designated });
  return null;
}

function reserveEntry(ctx: Ctx, club: DClub, personId: number, leaf: string): { entry: DEntry; r: NonNullable<DEntry['reserve']> } | Refusal {
  const at = ctx.locate(personId);
  if (!at || at.club.clubId !== club.clubId || !RESERVE_LISTS.includes(at.entry.list) || !at.entry.reserve) return refuse(leaf, 'eligibility', `player ${personId} is not on this club's reserve lists`, 'pick a reserve player');
  if (at.entry.reserve.seasonEnding) return refuse(leaf, 'eligibility', `player ${personId} is out for the season`, 'none this season');
  return { entry: at.entry, r: at.entry.reserve };
}

function openWindow(ctx: Ctx, club: DClub, personId: number): Refusal | null {
  const { d, rules } = ctx;
  const rv = rules.reserve;
  if (!rv) return refuse('C5.4.2', 'phase', 'this league has no reserve lists', 'none');
  if (!inSeason(d)) return refuse('C5.4.2', 'phase', 'return windows open in the season', 'wait for the season');
  const found = reserveEntry(ctx, club, personId, 'C5.4.2');
  if ('ok' in found) return found;
  const { entry, r } = found;
  if (r.windowOpenedDay !== null) return refuse('C5.4.2', 'precondition', 'his window is already open', 'activate him');
  const missed = club.gamesPlayed - r.placedAtGame;
  if (entry.list === LIST.injured) {
    if (missed < rv.irMinGames) return refuse('C5.4.1', 'deadline', `he has missed ${missed} games; ${rv.irMinGames} are required`, `wait ${rv.irMinGames - missed} more club games`);
    const returns = club.returnsByPlayer[String(personId)] ?? 0;
    if (returns >= rv.returnsPerPlayer) return refuse('C5.4.2', 'limit', `he has returned ${returns} times this season; at most ${rv.returnsPerPlayer}`, 'none this season');
    if (!r.designatedAtCutdown && P.designationCountedAtWindowOpen) {
      if (club.designationsUsed >= allowedDesignations(club, rules)) return refuse('C5.4.2', 'limit', `all ${allowedDesignations(club, rules)} return designations are used`, 'none this season');
      club.designationsUsed += 1;
    }
  } else if (entry.list === LIST.pup) {
    if (club.gamesPlayed < rv.pupWindowAfterGame) return refuse('C5.4.3', 'deadline', `the PUP practice window opens after club game ${rv.pupWindowAfterGame}`, 'wait');
  } else if (entry.list === LIST.nfi) {
    if (missed < rv.nfiMinGames) return refuse('C5.4.3', 'deadline', `he has missed ${missed} games; ${rv.nfiMinGames} are required`, 'wait');
  } else {
    return refuse('C5.4.3', 'precondition', 'a suspended player has no practice window', 'activate him when the suspension ends');
  }
  r.windowOpenedDay = d.now.dayIndex;
  ctx.post('return_window_opened', club.clubId, personId, { list: entry.list, designationsUsed: club.designationsUsed });
  return null;
}

function activate(ctx: Ctx, club: DClub, personId: number): Refusal | null {
  const { d, rules } = ctx;
  const rv = rules.reserve;
  if (!rv) return refuse('C5.4.2', 'phase', 'this league has no reserve lists', 'none');
  const found = reserveEntry(ctx, club, personId, 'C5.4.2');
  if ('ok' in found) return found;
  const { entry, r } = found;
  const missed = club.gamesPlayed - r.placedAtGame;
  const needWindow = (minGames: number, windowDays: number, leaf: string): Refusal | null => {
    if (missed < minGames) return refuse(leaf, 'deadline', `he has missed ${missed} club games; ${minGames} are required`, `wait ${minGames - missed} more club games`);
    if (r.windowOpenedDay === null) return refuse(leaf, 'precondition', 'his practice window is not open', 'open the return window first');
    if (d.now.dayIndex - r.windowOpenedDay > windowDays) return refuse(leaf, 'deadline', 'his practice window has closed', 'none: he stays out for the season');
    return null;
  };
  if (entry.list === LIST.injured) {
    const bad = needWindow(rv.irMinGames, rv.irWindowDays, 'C5.4.1');
    if (bad) return bad;
    if (!r.designatedAtCutdown && !P.designationCountedAtWindowOpen) {
      if (club.designationsUsed >= allowedDesignations(club, rules)) return refuse('C5.4.2', 'limit', 'all return designations are used', 'none this season');
      club.designationsUsed += 1;
    }
    club.returnsByPlayer[String(personId)] = (club.returnsByPlayer[String(personId)] ?? 0) + 1;
  } else if (entry.list === LIST.pup) {
    const bad = needWindow(rv.pupMinGames, rv.pupNfiWindowDays, 'C5.4.3');
    if (bad) return bad;
  } else if (entry.list === LIST.nfi) {
    const bad = needWindow(rv.nfiMinGames, rv.pupNfiWindowDays, 'C5.4.3');
    if (bad) return bad;
  } else if (missed < r.suspensionGames) {
    return refuse('C5.4.3', 'deadline', `the suspension has ${r.suspensionGames - missed} club games left`, 'wait');
  }
  const from = entry.list;
  entry.list = LIST.active; entry.reserve = null; entry.sinceDay = d.now.dayIndex;
  ctx.post('activated', club.clubId, personId, { from });
  return null;
}

/** Runs a claim award on a copy: linked moves, then the player joins the claimant's roster. */
function awardTrial(d: Draft, rules: RosterRules, clubId: number, personId: number, linked: readonly Transaction[]): (Accepted & { ok: true }) | Refusal {
  const copy = structuredClone(d) as Draft;
  copy.waivers = copy.waivers.filter((w) => w.personId !== personId);
  const ctx = new Ctx(copy, rules);
  const club = ctx.club(clubId);
  if (!club) return refuse('C5.7.1', 'unknown', `no club ${clubId}`, 'none');
  ctx.touch(club);
  for (const l of linked) {
    if (l.clubId !== clubId) return refuse('C5.5.1', 'precondition', 'a claim may link only the claiming club\'s moves', 'file other moves separately');
    const r = step(ctx, l);
    if (r) return r;
  }
  club.entries.push(newEntry(personId, LIST.active, copy.now.dayIndex));
  const lim = ctx.limits();
  if (lim) return lim;
  return { ok: true, state: copy, wire: ctx.wire, breakable: ctx.breakable };
}

// ---------------------------------------------------------------- public entry points

/** Files one club move (C5.7.1). The input state is never changed. */
export function applyTransaction(state: LeagueRosters, tx: Transaction, rules: RosterRules): TxResult {
  const d = structuredClone(state) as Draft;
  const ctx = new Ctx(d, rules);
  const r = step(ctx, tx);
  if (r) return r;
  const lim = ctx.limits(tx.type === 'cutdown' ? tx.clubId : null);
  if (lim) return lim;
  return { ok: true, state: d, wire: ctx.wire, breakable: ctx.breakable };
}

/** Waiver order in force (C5.5.1 rule 2): last season's order through the key's week, then standings. */
export function waiverOrder(state: LeagueRosters, rules: RosterRules): readonly number[] {
  if (!rules.waivers) return [];
  const useStandings = state.phase !== 'offseason' && state.leagueWeek >= rules.waivers.standingsAfterWeek && state.priority.standings.length > 0;
  return useStandings ? state.priority.standings : state.priority.priorSeason;
}

function processWaivers(ctx: Ctx, upTo: Instant): void {
  const { rules } = ctx;
  for (;;) {
    const due = ctx.d.waivers
      .filter((w) => absHour(w.deadline) <= absHour(upTo))
      .sort((a, b) => absHour(a.deadline) - absHour(b.deadline) || a.personId - b.personId)[0];
    if (!due) return;
    // Awards happen at the claim deadline: linked releases are dated then (and start their own claim period).
    ctx.d.now = { ...due.deadline };
    const order = waiverOrder(ctx.d, rules);
    const rank = (id: number) => { const i = order.indexOf(id); return i < 0 ? order.length + id : i; };
    const claims = [...due.claims].sort((a, b) => rank(a.clubId) - rank(b.clubId));
    let awarded = false;
    for (const c of claims) {
      const trial = awardTrial(ctx.d, rules, c.clubId, due.personId, c.linked);
      if (!trial.ok) continue;
      Object.assign(ctx.d, trial.state);
      ctx.wire.push(...trial.wire.map((w) => ({ ...w })));
      ctx.post('claimed', c.clubId, due.personId, { fromClub: due.fromClubId });
      awarded = true;
      break;
    }
    ctx.d.waivers = ctx.d.waivers.filter((w) => w.personId !== due.personId);
    if (!awarded) ctx.post('cleared_waivers', null, due.personId, { fromClub: due.fromClubId });
  }
}

function sweepWindows(ctx: Ctx): void {
  const rv = ctx.rules.reserve;
  if (!rv) return;
  for (const club of ctx.d.clubs) {
    for (const e of club.entries) {
      const r = e.reserve;
      if (!r || r.windowOpenedDay === null || r.seasonEnding) continue;
      const days = e.list === LIST.injured ? rv.irWindowDays : rv.pupNfiWindowDays;
      if (ctx.d.now.dayIndex - r.windowOpenedDay > days) {
        r.seasonEnding = true;
        ctx.post('window_expired', club.clubId, e.personId, { list: e.list });
      }
    }
  }
}

/** Applies a league-office or calendar event. Refused only when the calendar asks for something impossible. */
export function applyEvent(state: LeagueRosters, ev: RosterEvent, rules: RosterRules): TxResult {
  const d = structuredClone(state) as Draft;
  const ctx = new Ctx(d, rules);
  switch (ev.type) {
    case 'advance_time': {
      if (absHour(ev.to) < absHour(d.now)) return refuse('C5.7.1', 'precondition', 'time does not run backward', 'advance to a later instant');
      processWaivers(ctx, ev.to);
      d.now = { ...ev.to };
      sweepWindows(ctx);
      if (inSeason(d) && !d.practiceSquadsOpen && rules.practiceSquad && !d.waivers.some((w) => w.atCutdown)) {
        d.practiceSquadsOpen = true;
        ctx.post('practice_squads_open', null, null);
      }
      ctx.post('time', null, null, { dayIndex: d.now.dayIndex, hour: d.now.hour });
      break;
    }
    case 'roster_deadline': {
      if (d.phase !== 'offseason') return refuse('C5.6.1', 'phase', 'the roster deadline has already passed this year', 'none');
      const over = d.clubs.filter((c) => clubCounts(c, d.players, rules).roster > rules.seasonLimit);
      if (over.length) {
        return refuse('C5.6.1', 'limit', `clubs over ${rules.seasonLimit}: ${over.map((c) => c.clubId).join(', ')}`, 'each must file its reduction before the deadline (time stops for the user)');
      }
      d.phase = 'regular';
      for (const w of d.waivers) if (w.atCutdown) w.deadline = { ...ev.claimDeadline };
      if (!rules.practiceSquad) d.practiceSquadsOpen = false;
      ctx.post('roster_deadline', null, null, { limit: rules.seasonLimit });
      break;
    }
    case 'game_played': {
      const club = ctx.club(ev.clubId);
      if (!club) return refuse('C5.7.1', 'unknown', `no club ${ev.clubId}`, 'none');
      if (!inSeason(d)) return refuse('C5.3.2', 'phase', 'only season games move the roster clock', 'none');
      for (const e of club.entries) {
        if (e.elevatedForGame === club.gamesPlayed) {
          e.elevatedForGame = null; e.elevatedAsEmergencyQb = false;
          ctx.post('reverted', club.clubId, e.personId);
        }
        e.protectedForGame = null;
      }
      club.gamesPlayed += 1;
      club.nextGame = null;
      ctx.post('game_played', club.clubId, null, { gamesPlayed: club.gamesPlayed });
      break;
    }
    case 'end_week': {
      if (ev.leagueWeek < d.leagueWeek) return refuse('C5.5.1', 'precondition', 'weeks do not run backward', 'none');
      d.leagueWeek = ev.leagueWeek;
      ctx.post('week', null, null, { leagueWeek: d.leagueWeek });
      break;
    }
    case 'pass_trade_deadline': {
      if (rules.tradeDeadlineAfterWeek === null || d.phase !== 'regular' || d.leagueWeek < rules.tradeDeadlineAfterWeek) {
        return refuse('C5.5.2', 'precondition', `the trade deadline falls after week ${rules.tradeDeadlineAfterWeek ?? 'none'}`, 'wait for that week');
      }
      d.tradeDeadlinePassed = true;
      ctx.post('trade_deadline', null, null);
      break;
    }
    case 'begin_postseason': {
      if (d.phase !== 'regular') return refuse('C5.4.2', 'phase', 'the postseason follows the regular season', 'none');
      d.phase = 'postseason';
      for (const c of d.clubs) c.inPostseason = ev.clubIds.includes(c.clubId);
      ctx.post('postseason', null, null);
      break;
    }
    case 'new_league_year': {
      if (ev.seasonYear <= d.seasonYear) return refuse('C5.5.2', 'precondition', 'league years only move forward', 'none');
      d.seasonYear = ev.seasonYear; d.phase = 'offseason'; d.leagueWeek = 0; d.tradeDeadlinePassed = false; d.practiceSquadsOpen = false;
      for (const club of d.clubs) {
        const kept: DEntry[] = [];
        for (const e of club.entries) {
          if (e.list === LIST.practiceSquad) { ctx.post('practice_squad_expired', club.clubId, e.personId); continue; }
          const next: DEntry = { ...e, elevationsThisSeason: 0, elevatedForGame: null, elevatedAsEmergencyQb: false, protectedForGame: null, payGuaranteedThroughGame: null, campFlag: null };
          if (e.list === LIST.suspended && e.reserve) {
            const left = e.reserve.suspensionGames - (club.gamesPlayed - e.reserve.placedAtGame);
            next.reserve = left > 0 ? { ...e.reserve, placedAtGame: 0, suspensionGames: left } : null;
            if (left <= 0) next.list = LIST.active;
          } else if (e.list !== LIST.medicalRetired && e.list !== LIST.active) {
            next.list = LIST.active; next.reserve = null;
          }
          kept.push(next);
        }
        club.entries = kept;
        club.gamesPlayed = 0; club.designationsUsed = 0; club.cutdownDesignationsUsed = 0; club.returnsByPlayer = {};
        club.inPostseason = false; club.nextGame = null; club.deadlineMet = false;
      }
      ctx.post('new_league_year', null, null, { seasonYear: d.seasonYear });
      break;
    }
    case 'suspend': {
      const club = ctx.club(ev.clubId);
      const at = ctx.locate(ev.personId);
      if (!club || !at || at.club.clubId !== club.clubId || (at.entry.list !== LIST.active && !RESERVE_LISTS.includes(at.entry.list))) {
        return refuse('C5.4.3', 'eligibility', `player ${ev.personId} is not on club ${ev.clubId}'s roster`, 'none');
      }
      if (ev.games < 1) return refuse('C5.4.3', 'precondition', 'a suspension lasts at least one game', 'none');
      at.entry.list = LIST.suspended; at.entry.campFlag = null;
      at.entry.reserve = { placedAtGame: club.gamesPlayed, seasonEnding: false, designatedAtCutdown: false, windowOpenedDay: null, suspensionGames: ev.games };
      ctx.post('suspended', club.clubId, ev.personId, { games: ev.games });
      break;
    }
    case 'set_player_facts': {
      for (const f of ev.facts) d.players[String(f.personId)] = { ...f };
      ctx.post('player_facts', null, null, { count: ev.facts.length });
      break;
    }
    case 'set_next_game': {
      const club = ctx.club(ev.clubId);
      if (!club || !ctx.club(ev.opponentId)) return refuse('C5.3.3', 'unknown', 'unknown club in the game', 'none');
      club.nextGame = { opponentId: ev.opponentId, dayIndex: ev.dayIndex };
      ctx.post('next_game', club.clubId, null, { opponentId: ev.opponentId, dayIndex: ev.dayIndex });
      break;
    }
    case 'set_waiver_order': {
      const ids = d.clubs.map((c) => c.clubId).sort((a, b) => a - b);
      const isPerm = (o: number[]) => o.length === ids.length && [...o].sort((a, b) => a - b).every((v, i) => v === ids[i]);
      if ((ev.priorSeason && !isPerm(ev.priorSeason)) || (ev.standings && !isPerm(ev.standings))) {
        return refuse('C5.5.1', 'precondition', 'a waiver order must list every club once', 'send a full order');
      }
      if (ev.priorSeason) d.priority.priorSeason = [...ev.priorSeason];
      if (ev.standings) d.priority.standings = [...ev.standings];
      ctx.post('waiver_order', null, null);
      break;
    }
  }
  return { ok: true, state: d, wire: ctx.wire, breakable: ctx.breakable };
}

/** A new league of empty rosters (for the world builder and tests). */
export function emptyLeagueRosters(seasonYear: number, clubIds: readonly number[], now: Instant): LeagueRosters {
  return {
    seasonYear, phase: 'offseason', now, leagueWeek: 0, tradeDeadlinePassed: false, practiceSquadsOpen: false,
    clubs: clubIds.map((clubId) => ({
      clubId, entries: [], gamesPlayed: 0, designationsUsed: 0, cutdownDesignationsUsed: 0, returnsByPlayer: {},
      inPostseason: false, nextGame: null, deadlineMet: false,
    })),
    players: {}, waivers: [], priority: { priorSeason: [...clubIds], standings: [] }, wireSeq: 0,
  };
}

/**
 * Checks a state against every invariant the engine promises (C5.1.1 acceptance 1, C5.7.1 acceptance 1):
 * each player on at most one list of one club or on waivers, and every limit held in the season.
 * Returns the problems found; empty means valid.
 */
export function validateRosters(state: LeagueRosters, rules: RosterRules): string[] {
  const problems: string[] = [];
  const seen = new Set<number>();
  const note = (id: number, where: string) => { if (seen.has(id)) problems.push(`player ${id} appears twice (${where})`); seen.add(id); };
  for (const c of state.clubs) for (const e of c.entries) note(e.personId, `club ${c.clubId}`);
  for (const w of state.waivers as readonly WaiverItem[]) note(w.personId, 'waivers');
  for (const c of state.clubs) {
    const r = checkClubLimits(state as Draft, c as DClub, rules, null, false);
    if (r && (state.phase !== 'offseason' || r.rule !== limitLeaf(rules))) problems.push(`club ${c.clubId}: ${r.message}`);
    const counts = clubCounts(c, state.players, rules);
    if (state.phase !== 'offseason' && counts.roster > rules.seasonLimit) problems.push(`club ${c.clubId}: ${counts.roster} over ${rules.seasonLimit} in the season`);
  }
  return problems;
}


// The transfer portal in the off-screen loop (T6, X12.1.1). It runs inside the `moves` slot around the
// roster cycle: on a season's first pass the last cycle's market closes before the roster cycle (entrants
// still unsigned leave, PT-09), and after it the new cycle's entries are drawn (PT-02). Every pass then runs
// the market Wednesdays the world date has passed. Every college program takes part every week (MA-66).
//
// Who enters is league college's `entryChance` (T6.2.1) over the world's facts, and whether he may enter on
// a day is its `entryAllowed` (T6.1.1). Programs choose by observed grades only (K9). Nothing here is shown
// to anyone; the public part (entries) reaches screens through `portalInput` (read.ts).
import { stream } from '@gm/engine-core';
import { college } from '@gm/league';
import type { PersonRecord } from '@gm/schema';
import { isActive } from '../loop/lifecycle.ts';
import type { LiveWorld, StepContext, StepDigest, StepHandler } from '../loop/types.ts';
import { groupOf } from '../recruiting/binding.ts';
import { dayOfWorld, wednesdayOnOrAfter } from '../recruiting/calendar.ts';
import { gradeContext, levelOfTeam, rosteredSet, specOf, type GradeContext, type Level } from '../turnover/binding.ts';
import { PLAYER_SIGNED } from '../turnover/events.ts';
import { RULE_KEY } from '../turnover/params.ts';
import {
  cycleDates, finalDay, portalLevel, portalOf, STREAM_PORTAL, transferRules,
  type EntryVia, type PortalBinding, type PortalCycle, type PortalEntry, type WorldPortal,
} from './binding.ts';
import { TRANSFER_ENTERED, TRANSFER_UNPLACED } from './events.ts';
import { param } from './params.ts';

// League college's T6 functions, named bare (the level-word lint reads `college.` in a condition as a level branch).
const { entryChance, entryAllowed, postseasonWindow, coachChangeWindow } = college;

const HEAD = 'pos:head_coach';
const pid = (id: number) => ({ kind: 'person' as const, id });

interface Pass {
  readonly ctx: StepContext;
  readonly world: LiveWorld;
  readonly b: PortalBinding;
  readonly level: Level;
  readonly s: WorldPortal;
  readonly rules: college.TransferRules;
  readonly counts: Record<string, number>;
  grades: GradeContext | null;
}

function bump(p: Pass, k: string, by = 1): void { p.counts[k] = (p.counts[k] ?? 0) + by; }

/** College teams of the portal level this season, in id order. */
function collegeTeams(p: Pass): number[] {
  return p.world.teams.filter((t) => isActive(p.world, t.id) && levelOfTeam(p.world, t.id) === p.level).map((t) => t.id).sort((x, y) => x - y);
}

function headCoachOf(world: LiveWorld, teamId: number): number | null {
  for (const j of world.jobs.values()) if (j.teamId === teamId && j.positionId === HEAD && j.holderPersonId !== null) return j.holderPersonId;
  return null;
}

/** Eligibility left for the cycle's season (T5.2.1), as RC-07 counts it. */
function eligibleFor(p: Pass, person: PersonRecord, year: number): boolean {
  const e = person.playing?.eligibility.college;
  if (!e) return false;
  if (param('entry.skipNewlyEnrolled') !== 0 && e.clockStartYear === year) return false;
  const seasons = p.b.turnover.rule(p.level, RULE_KEY.seasonsOfCompetition);
  const clock = p.b.turnover.rule(p.level, RULE_KEY.clockYears);
  const start = e.clockStartYear ?? year;
  return (seasons === undefined || e.seasonsOfCompetitionUsed < seasons) && (clock === undefined || year - start < clock);
}

function grades(p: Pass): GradeContext {
  if (p.grades) return p.grades;
  // Entrants are graded as players with college film (T6.3.1: narrower than a high school look), so they
  // count as rostered for the look even after they leave their roster.
  const seen = rosteredSet(p.world);
  for (const e of p.s.cycle?.entries ?? []) if (e.status !== 'pending') seen.add(e.personId);
  p.grades = gradeContext(p.world, seen);
  return p.grades;
}

/** Players of a team in one recruiting room, best observed grade first (the team's own depth order). */
function room(p: Pass, teamId: number, group: string): number[] {
  const g = grades(p);
  return (p.world.rosters.get(teamId) ?? [])
    .filter((id) => { const pos = p.world.people.get(id)?.playing?.position; return pos !== undefined && groupOf(pos) === group; })
    .sort((a, b) => g.grade(teamId, b) - g.grade(teamId, a) || a - b);
}

function starters(group: string): number { return param(`starters.${group}`); }

function winShare(world: LiveWorld, teamId: number, season: number): number | null {
  const last = world.seasons.at(-1);
  if (!last || last.seasonYear !== season) return null;
  const r = last.records[teamId];
  const n = r ? r.wins + r.losses + r.ties : 0;
  return n === 0 ? null : (r!.wins + r!.ties / 2) / n;
}

/** T6.2.1 factors for one player from what the world holds; stand-ins are PT-04. */
function factors(p: Pass, teamId: number, id: number, coachLeft: boolean, year: number): college.RetentionFactors {
  const pos = p.world.people.get(id)!.playing!.position;
  const group = groupOf(pos);
  const blocked = group !== null && room(p, teamId, group).indexOf(id) >= starters(group);
  const share = winShare(p.world, teamId, year - 1);
  return {
    satisfaction: param('stand.satisfaction'),
    blockedOnDepthChart: blocked,
    // PT-06: a head coaching change stands for the position coach's departure (position coaches are not tied to rooms off-screen).
    positionCoachLeft: coachLeft,
    payToMarket: param('stand.payToMarket'),
    teamLosing: share !== null && share < param('losing.winShareBelow'),
    backupWithEligibility: blocked,
    relationship: param('stand.relationship'),
    rolePromise: false,
  };
}

function entryContext(p: Pass, teamId: number, id: number, hiredDay: number | null, lastGameDay: number | null): college.EntryContext {
  return { teamLastGameDay: lastGameDay, headCoachHiredDay: hiredDay, priorTransfers: p.s.transfers[id] ?? 0, hasEligibilityLeft: true, graduated: false };
}

function dayIn(w: { open: number; close: number }, rng: { int(lo: number, hi: number): number }): number {
  return w.open + rng.int(0, w.close - w.open);
}

function addEntry(p: Pass, c: PortalCycle, e: Omit<PortalEntry, 'status' | 'toTeamId' | 'signedDay'>): void {
  c.entries.push({ ...e, status: 'pending', toTeamId: null, signedDay: null });
  bump(p, `portal_drawn_${e.via}`);
}

/** PT-02: the cycle's entries, drawn once when it opens, each on a day his window allows. */
function openCycle(p: Pass, year: number, today: number, changed: ReadonlySet<number>): void {
  const d = cycleDates(p.b, year);
  if (!d || today > d.window.close) return;
  const c: PortalCycle = { year, window: d.window, windowStatus: d.windowStatus, marketClose: d.marketClose, coachDraws: [...changed].sort((x, y) => x - y), entries: [], throughDay: null };
  p.s.cycle = c;
  const title = new Set(p.s.titleTeams[year - 1] ?? []);
  const last = title.size > 0 ? finalDay(p.b, year - 1) : null;
  for (const teamId of collegeTeams(p)) {
    const coachLeft = changed.has(teamId);
    const lastGame = title.has(teamId) ? last : null;
    const post = lastGame !== null ? postseasonWindow(d.window, lastGame, p.rules) : null;
    for (const id of [...(p.world.rosters.get(teamId) ?? [])].sort((x, y) => x - y)) {
      const person = p.world.people.get(id);
      if (!person?.playing || p.world.status.get(id) !== 'active' || !eligibleFor(p, person, year)) continue;
      const rng = stream(p.world.seed, STREAM_PORTAL, [year, id, 'entry']);
      if (!rng.chance(entryChance(factors(p, teamId, id, coachLeft, year)))) continue;
      const via: EntryVia = post ? 'postseason' : 'window';
      const day = dayIn(post ?? d.window, rng);
      const v = entryAllowed(day, d.window, entryContext(p, teamId, id, coachLeft ? today : null, lastGame), p.rules);
      if (!v.ok) { bump(p, `portal_refused_${v.reason}`); continue; }
      addEntry(p, c, { personId: id, position: person.playing.position, fromTeamId: teamId, enteredDay: day, via: v.via === 'coach_change' ? 'coach_change' : via });
    }
  }
}

/**
 * PT-06: a head coaching change after the cycle opened gives that team's players the coaching-change window.
 * The draw adds only the extra chance the change brings, so a player is never drawn twice at full odds.
 */
function coachChangeDraw(p: Pass, c: PortalCycle, teamId: number, hiredDay: number): void {
  c.coachDraws.push(teamId);
  c.coachDraws.sort((x, y) => x - y);
  const w = coachChangeWindow(hiredDay, p.rules);
  if (!w || w.close > c.marketClose) return;
  const entered = new Set(c.entries.map((e) => e.personId));
  for (const id of [...(p.world.rosters.get(teamId) ?? [])].sort((x, y) => x - y)) {
    const person = p.world.people.get(id);
    if (entered.has(id) || !person?.playing || p.world.status.get(id) !== 'active' || !eligibleFor(p, person, c.year)) continue;
    const p0 = entryChance(factors(p, teamId, id, false, c.year));
    const p1 = entryChance(factors(p, teamId, id, true, c.year));
    const extra = p0 >= 1 ? 0 : Math.max(0, (p1 - p0) / (1 - p0));
    const rng = stream(p.world.seed, STREAM_PORTAL, [c.year, id, 'coach', hiredDay]);
    if (!rng.chance(extra)) continue;
    const day = dayIn(w, rng);
    const v = entryAllowed(day, c.window, entryContext(p, teamId, id, hiredDay, null), p.rules);
    if (!v.ok) { bump(p, `portal_refused_${v.reason}`); continue; }
    addEntry(p, c, { personId: id, position: person.playing.position, fromTeamId: teamId, enteredDay: day, via: 'coach_change' });
  }
}

/** Entries whose day has come are announced and leave their roster (their place opens, T6.2.1 outputs). */
function announce(p: Pass, c: PortalCycle, upTo: number): void {
  for (const e of c.entries) {
    if (e.status !== 'pending' || e.enteredDay > upTo) continue;
    e.status = 'in_market';
    p.world.rosters.set(e.fromTeamId, (p.world.rosters.get(e.fromTeamId) ?? []).filter((x) => x !== e.personId));
    p.grades = null;
    p.ctx.emit({ type: TRANSFER_ENTERED, date: p.world.date, subjects: [pid(e.personId)], payload: { team: e.fromTeamId, via: e.via, day: e.enteredDay }, witnesses: { kind: 'public' }, tier: p.ctx.tierOfTeam(e.fromTeamId) });
    bump(p, 'portal_entered');
  }
}

function prestigeOf(world: LiveWorld, teamId: number): number { return world.teams.find((t) => t.id === teamId)?.prestige ?? 0; }

/**
 * PT-07, PT-08: one market Wednesday. Programs with roster room, best prestige first ("programs with money
 * buy starters", T6.3.1), offer to entrants who would start for them by their own observed grade. Each entrant, best public grade first, signs the offer he likes
 * most among programs that still have room.
 */
function marketDay(p: Pass, c: PortalCycle, day: number): void {
  const market = c.entries.filter((e) => e.status === 'in_market').sort((a, b) => a.personId - b.personId);
  if (market.length === 0) return;
  const g = grades(p);
  const teams = collegeTeams(p).sort((a, b) => prestigeOf(p.world, b) - prestigeOf(p.world, a) || a - b);
  const roomLeft = new Map<number, number>();
  for (const t of teams) roomLeft.set(t, specOf(p.b.turnover, p.world, t).rosterLimit - (p.world.rosters.get(t)?.length ?? 0));
  const offers = new Map<number, number[]>();
  for (const t of teams) {
    const r = roomLeft.get(t)!;
    if (r <= 0) continue;
    const wanted: { id: number; grade: number }[] = [];
    for (const e of market) {
      if (e.fromTeamId === t) continue;
      const group = groupOf(e.position);
      if (group === null) continue;
      // PT-07: a program takes an entrant who would start in his room by its own grade (`market.depthToSign`
      // times starters); the rest of its room it leaves to the next class and walk-ons (T6.3.1).
      const grade = g.grade(t, e.personId);
      const ahead = room(p, t, group).filter((id) => g.grade(t, id) > grade).length;
      if (ahead < param('market.depthToSign') * starters(group)) wanted.push({ id: e.personId, grade });
    }
    wanted.sort((a, b) => b.grade - a.grade || a.id - b.id);
    for (const w of wanted.slice(0, Math.min(r, param('market.offersPerWeek')))) offers.set(w.id, [...(offers.get(w.id) ?? []), t]);
  }
  const order = market.filter((e) => offers.has(e.personId)).sort((a, b) => g.publicGrade(b.personId) - g.publicGrade(a.personId) || a.personId - b.personId);
  for (const e of order) {
    const rng = stream(p.world.seed, STREAM_PORTAL, [c.year, e.personId, 'choose', day]);
    let best: number | null = null, bestScore = -Infinity;
    for (const t of offers.get(e.personId)!) {
      const noise = param('choice.noise') * rng.normal();
      if ((roomLeft.get(t) ?? 0) <= 0) continue;
      const group = groupOf(e.position);
      const depth = group === null ? [] : room(p, t, group);
      const startsThere = group !== null && depth.filter((id) => g.grade(t, id) > g.grade(t, e.personId)).length < starters(group);
      const score = param('choice.prestigeWeight') * prestigeOf(p.world, t) + param('choice.roleWeight') * (startsThere ? 1 : 0) + noise;
      if (score > bestScore) { best = t; bestScore = score; }
    }
    if (best === null) continue;
    sign(p, e, best, day);
    roomLeft.set(best, (roomLeft.get(best) ?? 0) - 1);
  }
}

function sign(p: Pass, e: PortalEntry, teamId: number, day: number): void {
  p.world.rosters.set(teamId, [...(p.world.rosters.get(teamId) ?? []), e.personId]);
  e.status = 'signed'; e.toTeamId = teamId; e.signedDay = day;
  p.s.transfers[e.personId] = (p.s.transfers[e.personId] ?? 0) + 1;
  p.grades = null;
  p.ctx.emit({ type: PLAYER_SIGNED, date: p.world.date, subjects: [pid(e.personId)], payload: { kind: 'transfer', team: teamId }, witnesses: { kind: 'public' }, tier: p.ctx.tierOfTeam(teamId) });
  bump(p, 'portal_signed');
}

/** Market Wednesdays after the last one run, up to `upTo` and never past the market close; entries are announced on their own days. */
function runMarket(p: Pass, c: PortalCycle, upTo: number): void {
  const last = Math.min(upTo, c.marketClose);
  let d = wednesdayOnOrAfter(Math.max(c.window.open, (c.throughDay ?? c.window.open - 1) + 1));
  for (; d <= last; d += 7) {
    announce(p, c, d);
    marketDay(p, c, d);
    c.throughDay = d;
  }
  announce(p, c, last);
}

/** PT-09: the market closes the day before the season's first week; entrants still unsigned leave football. */
function closeCycle(p: Pass, c: PortalCycle): void {
  runMarket(p, c, c.marketClose);
  const byVia: Record<EntryVia, number> = { window: 0, postseason: 0, coach_change: 0 };
  let signed = 0, unplaced = 0;
  for (const e of c.entries) {
    byVia[e.via]++;
    if (e.status === 'in_market') {
      e.status = 'unplaced';
      p.ctx.markOutOfFootball(e.personId);
      p.ctx.emit({ type: TRANSFER_UNPLACED, date: p.world.date, subjects: [pid(e.personId)], payload: { team: e.fromTeamId, day: c.marketClose }, witnesses: { kind: 'none' }, tier: 3 });
      bump(p, 'portal_unplaced');
    }
    if (e.status === 'signed') signed++;
    if (e.status === 'unplaced') unplaced++;
  }
  p.s.history.push({ year: c.year, programs: collegeTeams(p).length, entered: c.entries.filter((e) => e.status !== 'pending').length, signed, unplaced, byVia });
  p.s.cycle = null;
}

function passOf(ctx: StepContext, b: PortalBinding): Pass | null {
  const level = portalLevel(b);
  if (level === null) return null;
  return { ctx, world: ctx.world, b, level, s: portalOf(ctx.world), rules: transferRules(b, level), counts: {}, grades: null };
}

/** Before the roster cycle: close a cycle from an earlier season (its market has run out by the new season). */
export function closePortal(ctx: StepContext, b: PortalBinding): StepDigest {
  const p = passOf(ctx, b);
  if (!p) return {};
  const c = p.s.cycle;
  if (c && c.year < ctx.world.date.seasonYear) closeCycle(p, c);
  return p.counts;
}

/** After the roster cycle: note title teams and coaching changes, open this season's cycle, and run the market to the world date. */
export function runPortal(ctx: StepContext, b: PortalBinding): StepDigest {
  const p = passOf(ctx, b);
  if (!p) return { portal: false };
  const { world, s } = p;
  const season = world.date.seasonYear;
  const today = dayOfWorld(world.date);
  const teams = collegeTeams(p);
  const inTeams = new Set(teams);
  const title = new Set(s.titleTeams[season] ?? []);
  for (const r of world.results) if (r.title) for (const t of [r.homeTeamId, r.awayTeamId]) if (inTeams.has(t)) title.add(t);
  if (title.size > 0) s.titleTeams[season] = [...title].sort((x, y) => x - y);
  for (const y of Object.keys(s.titleTeams).map(Number)) if (y < season - 1) delete s.titleTeams[y];
  // Coaching changes since the last pass (a team seen for the first time is not a change).
  const changed = new Set<number>();
  for (const t of teams) {
    const now = headCoachOf(world, t);
    if (t in s.headCoaches && now !== null && s.headCoaches[t] !== now) changed.add(t);
    s.headCoaches[t] = now;
  }
  if (s.cycle && s.cycle.year < season) closeCycle(p, s.cycle);
  if (!s.cycle) openCycle(p, season, today, changed);
  else for (const t of [...changed].sort((x, y) => x - y)) if (!s.cycle.coachDraws.includes(t)) coachChangeDraw(p, s.cycle, t, today);
  if (s.cycle) runMarket(p, s.cycle, today);
  const c = s.cycle;
  return { ...p.counts, portal_cycle: c?.year ?? null, portal_entries: c?.entries.length ?? 0, portal_in_market: c?.entries.filter((e) => e.status === 'in_market').length ?? 0 };
}

/** The `moves` slot with the portal: the last cycle closes first, then the roster cycle (`inner`), then this season's portal. */
export function movesWithPortal(b: PortalBinding, inner: StepHandler): StepHandler {
  return (ctx) => {
    const d0 = closePortal(ctx, b);
    const d1 = inner(ctx) ?? {};
    const d2 = runPortal(ctx, b);
    return { ...d1, ...d0, ...d2 };
  };
}

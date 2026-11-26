// The offseason roster cycle (K7 `moves`, X12.1.1), run on the first weekly pass of a season, after the
// season point has formed the year's cohorts. Order follows the real year (C4): eligibility ends, players
// choose to retire (D8.4.1 path 2), free agency (C8), the draft (C7) in the C7.2.1 selection order,
// undrafted signings (X11.1.1 `undrafted_pool`), the cutdown to the roster limit (M6), and players no
// team wanted for the X12.1.2 number of cycles leave football (D8.4.1 path 1). College programs then sign
// recruits and walk-ons to their limit (T4). Every choice reads observed grades only (K9).
import { stream } from '@gm/engine-core';
import { development, draft } from '@gm/league';
import { cohorts } from '@gm/people';
import type { RuleSet } from '@gm/schema';
import { param as genParam } from '../generation/params.ts';
import { isActive } from '../loop/lifecycle.ts';
import { RELEASED } from '../loop/events.ts';
import { param as loopParam } from '../loop/params.ts';
import type { LiveWorld, StepContext, StepHandler } from '../loop/types.ts';
import { ageIn, gradeContext, levelOfTeam, positionTargets, rosteredSet, specOf, type GradeContext, type Level, type Phase, type PolicyContext, type TurnoverBinding } from './binding.ts';
import { hasEligibility } from './development.ts';
import { ELIGIBILITY_ENDED, LEFT_UNSIGNED, PLAYER_DRAFTED, PLAYER_RETIRED, PLAYER_SIGNED } from './events.ts';
import { param, RULE_KEY } from './params.ts';

export const POOL = { proEntry: 'pro_entry_pool', recruits: 'recruit_class', walkOns: 'college_walk_on' } as const;
export const FREE_AGENT_PREFIX = 'free_agents:';
export const STREAM_MOVES = 'world.turnover.moves';

/** A RuleSet over the binding's reader, for the league draft module. A missing key throws when read. */
export function ruleSetOf(b: TurnoverBinding, level: Level, seasonYear: number): RuleSet {
  const num = (k: string): number => {
    const v = b.rule(level, k);
    if (v === undefined) throw new Error(`league ${level} holds no rule ${k}`);
    return v;
  };
  return { id: `world:${level}`, level: level as RuleSet['level'], seasonYear, num, bool: (k) => num(k) !== 0, opt: (k) => String(num(k)), keys: () => [] };
}

const pid = (id: number) => ({ kind: 'person' as const, id });

interface Cycle extends PolicyContext {
  readonly ctx: StepContext;
  readonly world: LiveWorld;
  readonly b: TurnoverBinding;
  readonly season: number;
  readonly grades: GradeContext;
  readonly counts: Record<string, number>;
  readonly draftedRound: Map<number, number>;
}

function bump(c: Cycle, k: string, by = 1): void { c.counts[k] = (c.counts[k] ?? 0) + by; }

function take(world: LiveWorld, name: string): number[] {
  const ids = world.pools.get(name) ?? [];
  world.pools.delete(name);
  return ids;
}

function addFreeAgent(world: LiveWorld, season: number, id: number): void {
  const k = `${FREE_AGENT_PREFIX}${season}`;
  world.pools.set(k, [...(world.pools.get(k) ?? []), id]);
}

function freeAgentPools(world: LiveWorld): string[] {
  return [...world.pools.keys()].filter((k) => k.startsWith(FREE_AGENT_PREFIX)).sort();
}

function available(world: LiveWorld, id: number): boolean {
  return world.status.get(id) === 'active' && !world.outOfFootballSince.has(id) && world.people.get(id)?.playing !== undefined;
}

/** Need of a team at a position: open places against the mix target, as a 0..1 share. */
function needAt(c: Cycle, teamId: number, position: string): number {
  const target = positionTargets(specOf(c.b, c.world, teamId))[position] ?? 0;
  if (target <= 0) return 0;
  let have = 0;
  for (const id of c.world.rosters.get(teamId) ?? []) if (c.world.people.get(id)?.playing?.position === position) have++;
  return Math.max(0, Math.min(1, (target - have) / target));
}

function score(c: Cycle, teamId: number, id: number): number {
  const pos = c.world.people.get(id)!.playing!.position;
  const need = needAt(c, teamId, pos);
  return c.b.policy?.boardScore?.(c.grades, teamId, id, need) ?? c.grades.grade(teamId, id) + param('need.weight') * need;
}

/** Best available for a team from a candidate list: the policy's pick, else the default board (ties to the lower id). */
function best(c: Cycle, teamId: number, ids: readonly number[], phase: Phase): number | null {
  const chosen = c.b.policy?.pick?.(c, teamId, ids, phase) ?? null;
  if (chosen === 'pass') return null;
  if (chosen !== null && ids.includes(chosen)) return chosen;
  let top: number | null = null, topScore = -Infinity;
  for (const id of ids) {
    const s = score(c, teamId, id);
    if (s > topScore || (s === topScore && top !== null && id < top)) { top = id; topScore = s; }
  }
  return top;
}

function sign(c: Cycle, teamId: number, id: number, kind: string): void {
  const p = c.world.people.get(id)!;
  if (hasEligibility(c.b.rule, levelOfTeam(c.world, teamId)) && p.playing && p.playing.eligibility.college.clockStartYear === null) {
    const e = p.playing.eligibility;
    c.world.people.set(id, { ...p, playing: { ...p.playing, eligibility: { ...e, college: { ...e.college, clockStartYear: c.season } } } });
  }
  c.world.rosters.set(teamId, [...(c.world.rosters.get(teamId) ?? []), id]);
  c.ctx.emit({ type: PLAYER_SIGNED, date: c.world.date, subjects: [pid(id)], payload: { kind, team: teamId }, witnesses: { kind: 'public' }, tier: c.ctx.tierOfTeam(teamId) });
  bump(c, `signed_${kind}`);
}

function release(c: Cycle, teamId: number, id: number): void {
  c.world.rosters.set(teamId, (c.world.rosters.get(teamId) ?? []).filter((x) => x !== id));
  addFreeAgent(c.world, c.season, id);
  c.ctx.emit({ type: RELEASED, date: c.world.date, subjects: [pid(id)], payload: { reason: 'cutdown' }, witnesses: { kind: 'public' }, tier: c.ctx.tierOfTeam(teamId) });
  bump(c, 'released');
}

function leaveFootball(c: Cycle, id: number): void {
  c.ctx.markOutOfFootball(id);
}

/** Teams of a level in the world this season, in id order. */
function teamsAt(c: Cycle, level: Level): number[] {
  return c.world.teams.filter((t) => isActive(c.world, t.id) && levelOfTeam(c.world, t.id) === level).map((t) => t.id).sort((x, y) => x - y);
}

/** Last season's winning share per team (ties count half, C3). */
function winShares(world: LiveWorld, teamIds: readonly number[]): Map<number, number> {
  const rec = world.seasons.at(-1)?.records ?? {};
  const out = new Map<number, number>();
  for (const id of teamIds) {
    const r = rec[id];
    const g = r ? r.wins + r.losses + r.ties : 0;
    out.set(id, g === 0 ? 0.5 : (r!.wins + r!.ties / 2) / g);
  }
  return out;
}

/** T5: college players whose seasons of competition or eligibility clock are used up leave for the pro entry pool. */
function endEligibility(c: Cycle, level: Level): void {
  const seasons = c.b.rule(level, RULE_KEY.seasonsOfCompetition);
  const clock = c.b.rule(level, RULE_KEY.clockYears);
  if (seasons === undefined) return;
  const pool = c.world.pools.get(POOL.proEntry) ?? [];
  for (const teamId of teamsAt(c, level)) {
    const keep: number[] = [];
    for (const id of c.world.rosters.get(teamId) ?? []) {
      const p = c.world.people.get(id);
      const e = p?.playing?.eligibility.college;
      if (!p || !e) { keep.push(id); continue; }
      // A founding player has no clock start on record: his clock started at the first college age.
      const start = e.clockStartYear ?? p.birthDate.seasonYear + genParam('age.collegeFirstYear');
      const done = e.seasonsOfCompetitionUsed >= seasons || (clock !== undefined && c.season - start >= clock);
      if (!done) { keep.push(id); continue; }
      pool.push(id);
      c.ctx.emit({ type: ELIGIBILITY_ENDED, date: c.world.date, subjects: [pid(id)], payload: { seasons: e.seasonsOfCompetitionUsed }, witnesses: { kind: 'public' }, tier: c.ctx.tierOfTeam(teamId) });
      bump(c, 'eligibility_ended');
    }
    c.world.rosters.set(teamId, keep);
  }
  c.world.pools.set(POOL.proEntry, pool);
}

/** D8.4.1 path 2 for rostered pro players and free agents. */
function retirements(c: Cycle, teamIds: readonly number[]): void {
  const n = development.devNumbers();
  const tryRetire = (id: number): boolean => {
    const p = c.world.people.get(id);
    if (!p?.playing || !available(c.world, id)) return false;
    const age = ageIn(p, c.season);
    const chance = development.retirementChance(n, {
      family: development.familyOf(p.playing.position), ageYears: age,
      // Not known off-screen yet: health (D11) and depth chart (M2) steps are unbound. Their multipliers stay at 1.
      majorInjuryLastYear: false, lostStartingJob: false, contenderWantsHim: false, facets: p.traitBlock.facets,
    });
    if (!stream(c.world.seed, STREAM_MOVES, ['retire', id, c.season]).chance(chance)) return false;
    leaveFootball(c, id);
    c.ctx.emit({ type: PLAYER_RETIRED, date: c.world.date, subjects: [pid(id)], payload: { age }, witnesses: { kind: 'public' }, tier: 3 });
    bump(c, 'retired');
    return true;
  };
  for (const teamId of teamIds) c.world.rosters.set(teamId, (c.world.rosters.get(teamId) ?? []).filter((id) => !tryRetire(id)));
  for (const k of freeAgentPools(c.world)) c.world.pools.set(k, (c.world.pools.get(k) ?? []).filter((id) => !tryRetire(id)));
}

/** Free agents of every cycle, still available. */
function freeAgents(c: Cycle): number[] {
  return freeAgentPools(c.world).flatMap((k) => c.world.pools.get(k) ?? []).filter((id) => available(c.world, id));
}

function dropFromPools(world: LiveWorld, id: number): void {
  for (const k of freeAgentPools(world)) world.pools.set(k, (world.pools.get(k) ?? []).filter((x) => x !== id));
}

/** Round-robin signings: each team in order signs its best candidate until it reaches `upTo` or the list is empty. */
function fill(c: Cycle, order: readonly number[], candidates: number[], upTo: (teamId: number) => number, kind: string, onSign?: (id: number) => void): number[] {
  const left = [...candidates];
  // A team that takes nobody is done for this round of signings (K7.4.2: he signs only players worth more than replacement).
  const done = new Set<number>();
  let moved = true;
  while (moved && left.length > 0) {
    moved = false;
    for (const teamId of order) {
      if ((c.world.rosters.get(teamId) ?? []).length >= upTo(teamId) || left.length === 0) continue;
      if (done.has(teamId)) continue;
      const id = best(c, teamId, left, { kind: kind as Phase['kind'] });
      if (id === null) { done.add(teamId); continue; }
      left.splice(left.indexOf(id), 1);
      onSign?.(id);
      sign(c, teamId, id, kind);
      moved = true;
    }
  }
  return left;
}

/** M6 cutdown: keep each position's mix count by grade, then the best of the rest to the limit. */
function cutdown(c: Cycle, teamId: number): void {
  const spec = specOf(c.b, c.world, teamId);
  const targets = positionTargets(spec);
  const ids = [...(c.world.rosters.get(teamId) ?? [])].sort((x, y) => c.grades.grade(teamId, y) - c.grades.grade(teamId, x) || x - y);
  if (ids.length <= spec.rosterLimit) return;
  const chosen = c.b.policy?.cutdown?.(c, teamId, ids, spec.rosterLimit, targets) ?? null;
  if (chosen !== null && chosen.length <= spec.rosterLimit && chosen.every((id) => ids.includes(id))) {
    const keep = new Set(chosen);
    for (const id of ids) if (!keep.has(id)) release(c, teamId, id);
    return;
  }
  const kept = new Set<number>();
  const have: Record<string, number> = {};
  for (const id of ids) {
    const pos = c.world.people.get(id)?.playing?.position ?? '';
    if ((have[pos] ?? 0) < (targets[pos] ?? 0)) { kept.add(id); have[pos] = (have[pos] ?? 0) + 1; }
  }
  for (const id of ids) { if (kept.size >= spec.rosterLimit) break; kept.add(id); }
  for (const id of ids) if (!kept.has(id)) release(c, teamId, id);
}

/** C7: this year's draft over the pro entry pool, in the C7.2.1 selection order from last season's records. */
function runDraft(c: Cycle, level: Level, order: readonly number[], shares: Map<number, number>): number[] {
  const rules = ruleSetOf(c.b, level, c.season);
  const champion = Object.values(c.world.seasons.at(-1)?.champions ?? {});
  const slots = order.map((teamId, i) => ({ pick: i + 1, teamId, tier: champion.includes(teamId) ? 1 : 0 }))
    .sort((x, y) => x.tier - y.tier || shares.get(x.teamId)! - shares.get(y.teamId)! || x.pick - y.pick)
    .map((s, i) => ({ ...s, pick: i + 1 }));
  const ledger = draft.createLedger(c.season, order, rules, 0);
  const selections = draft.selectionOrder(slots, shares, ledger, rules);
  const pool = take(c.world, POOL.proEntry).filter((id) => available(c.world, id));
  const drafted: number[] = [];
  const rounds = rules.num(RULE_KEY.draftRounds);
  for (const s of selections) {
    const id = best(c, s.ownerClubId, pool.filter((x) => !drafted.includes(x)), { kind: 'draft', round: s.round, rounds });
    if (id === null) break;
    drafted.push(id);
    c.draftedRound.set(id, s.round);
    c.world.rosters.set(s.ownerClubId, [...(c.world.rosters.get(s.ownerClubId) ?? []), id]);
    c.ctx.emit({ type: PLAYER_DRAFTED, date: c.world.date, subjects: [pid(id)], payload: { round: s.round, overall: s.overall, team: s.ownerClubId }, witnesses: { kind: 'public' }, tier: c.ctx.tierOfTeam(s.ownerClubId) });
    bump(c, 'drafted');
  }
  const und = cohorts.formUndraftedPool(pool, drafted, c.season, c.world.date, c.ctx.source);
  c.ctx.emit({ type: und.emit.type, date: und.emit.date, payload: und.emit.payload, witnesses: und.emit.witnesses, tier: und.emit.tier });
  return und.ids;
}

/** One pro league's offseason. */
function proOffseason(c: Cycle, level: Level): void {
  const teams = teamsAt(c, level);
  if (teams.length === 0) return;
  const shares = winShares(c.world, teams);
  // Worst record first for every choice (C7.2.1, and the waiver order C5 uses), ties by id.
  const order = [...teams].sort((x, y) => shares.get(x)! - shares.get(y)! || x - y);
  retirements(c, teams);
  const rounds = c.b.rule(level, RULE_KEY.draftRounds) ?? 0;
  const offseason = c.b.rule(level, RULE_KEY.offseasonLimit) ?? specOf(c.b, c.world, teams[0]!).rosterLimit;
  // C8 free agency before the draft, leaving room for the year's picks.
  fill(c, order, freeAgents(c), () => offseason - rounds, 'free_agent', (id) => dropFromPools(c.world, id));
  const undrafted = rounds > 0 ? runDraft(c, level, order, shares) : take(c.world, POOL.proEntry);
  const unsigned = fill(c, order, undrafted.filter((id) => available(c.world, id)), () => offseason, 'undrafted');
  for (const id of unsigned) addFreeAgent(c.world, c.season, id);
  for (const teamId of order) cutdown(c, teamId);
  // X12.1.2: a free agent unsigned for the set number of cycles leaves football.
  const cycles = loopParam('career.jobCyclesBeforeLeaving');
  for (const k of freeAgentPools(c.world)) {
    const since = Number(k.slice(FREE_AGENT_PREFIX.length));
    if (c.season - since + 1 < cycles) continue;
    for (const id of c.world.pools.get(k) ?? []) {
      if (!available(c.world, id)) continue;
      leaveFootball(c, id);
      c.ctx.emit({ type: LEFT_UNSIGNED, date: c.world.date, subjects: [pid(id)], payload: { cycles }, witnesses: { kind: 'none' }, tier: 3 });
      bump(c, 'left_unsigned');
    }
    c.world.pools.delete(k);
  }
}

/** One college league's signings (T4): recruits at enrolment age, then walk-ons, to the roster limit. */
function collegeSignings(c: Cycle, level: Level): void {
  const teams = teamsAt(c, level);
  if (teams.length === 0) return;
  // No recruiting board is bound yet (front-office gm.college, K7.5): programs choose in an order drawn each year.
  const s = stream(c.world.seed, STREAM_MOVES, ['college_order', level, c.season]);
  const order = [...teams];
  for (let i = order.length - 1; i > 0; i--) { const j = s.int(0, i); [order[i], order[j]] = [order[j]!, order[i]!]; }
  const enrol = genParam('age.collegeFirstYear');
  const limit = (teamId: number) => specOf(c.b, c.world, teamId).rosterLimit;
  for (const [pool, kind] of [[POOL.recruits, 'recruit'], [POOL.walkOns, 'walk_on']] as const) {
    const ids = c.world.pools.get(pool) ?? [];
    const ready = ids.filter((id) => available(c.world, id) && ageIn(c.world.people.get(id)!, c.season) >= enrol);
    const offered = kind === 'recruit' ? recruitByOffers(c, order, ready, limit) : ready;
    const left = new Set(fill(c, order, offered, limit, kind));
    // Recruits not signed at enrolment age play somewhere the world does not hold: they leave its football.
    for (const id of left) leaveFootball(c, id);
    bump(c, `unsigned_${kind}`, left.size);
    const readySet = new Set(ready);
    c.world.pools.set(pool, ids.filter((id) => !readySet.has(id) && available(c.world, id)));
  }
}

/**
 * K7.5.1 offers, then the recruit's choice (TO-08): each program offers down its own board; recruits, best
 * public grade first, take the offer from the program they rank highest (prestige plus their own noise) that
 * still has a place. Returns the recruits nobody signed, for the default fill. Without the policy hook every
 * ready recruit goes to the default fill.
 */
function recruitByOffers(c: Cycle, order: readonly number[], ready: readonly number[], limit: (teamId: number) => number): number[] {
  const offersOf = c.b.policy?.recruitOffers;
  if (!offersOf) return [...ready];
  const offers = new Map<number, number[]>();
  for (const teamId of order) {
    const open = limit(teamId) - (c.world.rosters.get(teamId) ?? []).length;
    if (open <= 0) continue;
    for (const id of offersOf(c, teamId, ready, open) ?? []) offers.set(id, [...(offers.get(id) ?? []), teamId]);
  }
  const prestige = new Map(c.world.teams.map((t) => [t.id, t.prestige]));
  const left: number[] = [];
  const byGrade = [...ready].sort((x, y) => c.grades.publicGrade(y) - c.grades.publicGrade(x) || x - y);
  for (const id of byGrade) {
    const s = stream(c.world.seed, STREAM_MOVES, ['recruit_choice', id, c.season]);
    const open = (offers.get(id) ?? []).filter((t) => (c.world.rosters.get(t) ?? []).length < limit(t)).sort((x, y) => x - y);
    let top: number | null = null, topPull = -Infinity;
    for (const t of open) {
      const pull = (prestige.get(t) ?? 0) + s.normal() * param('recruit.prestigeNoiseSd');
      if (pull > topPull) { top = t; topPull = pull; }
    }
    if (top === null) { left.push(id); continue; }
    sign(c, top, id, 'recruit');
  }
  return left;
}

export function rosterMovesStep(b: TurnoverBinding): StepHandler {
  return (ctx) => {
    const { world } = ctx;
    if (world.week !== 0 || world.seasons.length === 0) return { offseason: false };
    const c: Cycle = { ctx, world, b, season: world.date.seasonYear, grades: gradeContext(world, rosteredSet(world)), counts: {}, draftedRound: new Map() };
    const levels = Object.keys(b.content.levels).sort() as Level[];
    for (const level of levels) endEligibility(c, level);
    for (const level of levels) if (b.rule(level, RULE_KEY.seasonsOfCompetition) === undefined) proOffseason(c, level);
    for (const level of levels) if (b.rule(level, RULE_KEY.seasonsOfCompetition) !== undefined) collegeSignings(c, level);
    return { offseason: true, ...c.counts };
  };
}

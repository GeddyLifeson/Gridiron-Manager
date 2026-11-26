// The front office AI (K7, front-office `gm`) as the world's roster policy. Each pro club has one general
// manager, generated once from the world seed and the club id (K7.1.1). He decides from his club's own
// observed grades only (K7.2.2 rule 6, K9): a `PlayerView` carries the observed grade and its variance, never
// the truth. Mechanics stay in moves.ts (the draft order, signings, rosters); this file only chooses.
//
// What the world cannot give him yet, and the stand-in used (each flagged in README.md, TO-06 to TO-09):
// - the J14.6.1 contribution table (engine batch runs): one wins-per-ISS for every position, replacement
//   level from the club's own roster, slot weights from the position mix;
// - contracts and the cap (C6): every cost is empty, so value equals surplus;
// - projections (D6.5.1 ceiling looks): `projected` is null;
// - job pressure (K8.3.1): 0; the power arrangement (L5.2.1): `split` for every club.
import { stream } from '@gm/engine-core';
import { gm } from '@gm/front-office';
import { cap, development } from '@gm/league';
import { ageIn, levelOfTeam, positionTargets, specOf, type Level, type PolicyContext, type Phase, type RosterPolicy } from './binding.ts';
import { POOL, ruleSetOf } from './moves.ts';
import { param } from './params.ts';

export const STREAM_GM = 'world.frontoffice.gm';
export const STREAM_DRAW = 'world.frontoffice.draw';

type View = gm.PlayerView;

/** D8.2.1 curve read as K7's linear age curve: prime ends at the last flat band, decline is the mean of the next four years. */
export function ageCurve(): gm.AgeCurve {
  const n = development.devNumbers();
  const fam = (position: string) => development.familyOf(position);
  const primeEnd = (position: string): number => {
    let a = 18;
    while (a < 45 && development.curvePercent(n, fam(position), a + 1) >= 0) a++;
    return a;
  };
  const issPerPercent = (position: string): number => {
    // The whole-player look is the mean over attributes; only body-moved attributes age (D8.2.1, body.ts).
    const worked = development.WORKED[fam(position)];
    const moved = worked.filter((a) => (development.BODY_MOVED as readonly string[]).includes(a));
    return moved.reduce((s, a) => s + development.issPerPercent(n, a), 0) / Math.max(1, worked.length);
  };
  const cache = new Map<string, { peak: number; end: number; decline: number }>();
  const of = (position: string) => {
    let c = cache.get(position);
    if (!c) {
      const end = primeEnd(position);
      let pct = 0;
      for (let y = 1; y <= 4; y++) pct += development.curvePercent(n, fam(position), end + y);
      c = { peak: end, end, decline: Math.max(0, -pct / 4) * issPerPercent(position) };
      cache.set(position, c);
    }
    return c;
  };
  return {
    group: (position) => development.CURVE_GROUP[fam(position)],
    peakAge: (position) => of(position).peak,
    primeEndAge: (position) => of(position).end,
    declineIssPerYear: (position) => of(position).decline,
  };
}

const quantile = (xs: readonly number[], q: number): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]!;
};

interface TeamState {
  readonly profile: gm.GmProfile;
  readonly ctx: gm.ValueContext;
  needs: { size: number; needs: gm.Need[] } | null;
}

interface CycleState {
  readonly teams: Map<number, TeamState>;
  readonly draws: Map<string, number>;
  readonly baseline: Map<Level, Record<string, number>>;
}

/** The front office AI bound as the `RosterPolicy` for pro clubs (TO-06). College clubs keep the default board. */
export function gmPolicy(): RosterPolicy {
  const curve = ageCurve();
  const cycles = new WeakMap<PolicyContext, CycleState>();

  const cycleOf = (pc: PolicyContext): CycleState => {
    let c = cycles.get(pc);
    if (!c) { c = { teams: new Map(), draws: new Map(), baseline: new Map() }; cycles.set(pc, c); }
    return c;
  };

  const view = (pc: PolicyContext, teamId: number, id: number): View => {
    const p = pc.world.people.get(id)!;
    const g = pc.grades.belief(teamId, id);
    return { personId: id, position: p.playing!.position, age: ageIn(p, pc.season), grade: { mean: g.mean, variance: g.variance }, projected: null, fit: 1, flags: 0, costCentsByYear: [] };
  };

  const gmIdOf = (pc: PolicyContext, teamId: number): number => {
    for (const j of pc.world.jobs.values()) if (j.teamId === teamId && j.positionId === 'pos:general_manager' && j.holderPersonId !== null) return j.holderPersonId;
    return -teamId;
  };

  const teamOf = (pc: PolicyContext, teamId: number): TeamState => {
    const cyc = cycleOf(pc);
    const hit = cyc.teams.get(teamId);
    if (hit) return hit;
    const spec = specOf(pc.b, pc.world, teamId);
    const positions = Object.keys(spec.rosterMix).sort();
    const groups = [...new Set(positions.map((x) => curve.group(x)))].sort();
    const gmId = gmIdOf(pc, teamId);
    // K7.1.1: one general manager per club, the same every season (front offices do not turn over off-screen yet).
    const profile = gm.generateGm(stream(pc.world.seed, STREAM_GM, [teamId]), gmId, positions, groups, 'split');
    const targets = positionTargets(spec);
    const own = new Map<string, number[]>();
    for (const id of pc.world.rosters.get(teamId) ?? []) {
      const pos = pc.world.people.get(id)?.playing?.position;
      if (pos) own.set(pos, [...(own.get(pos) ?? []), pc.grades.grade(teamId, id)]);
    }
    const all = [...own.values()].flat();
    const replacement = new Map<string, number>();
    const table: gm.ContributionTable = {
      winsPerIss: () => param('gm.winsPerIss'),
      replacementIss: (position) => {
        let r = replacement.get(position);
        if (r === undefined) { r = quantile(own.get(position) ?? all, param('gm.replacementQuantile')); replacement.set(position, r); }
        return r;
      },
      slotWeights: (position) => {
        const t = targets[position] ?? 0;
        const starters = Math.max(1, Math.round(t * param('role.starterShareOfMix')));
        return Array.from({ length: Math.max(starters, t) }, (_, i) => (i < starters ? 1 : param('gm.depthSlotWeight')));
      },
    };
    const draw: gm.PersistentDraw = (kind, gmPerson, key) => {
      const k = `${kind}:${gmPerson}:${key}`;
      let v = cyc.draws.get(k);
      if (v === undefined) { v = stream(pc.world.seed, STREAM_DRAW, [kind, gmPerson, key]).normal(); cyc.draws.set(k, v); }
      return v;
    };
    // Costs are empty until contracts are in the world, so the going rate never enters a decision (TO-07).
    const ctx: gm.ValueContext = { table, curve, centsPerWin: 1, draw, pressure: 0 };
    const t: TeamState = { profile, ctx, needs: null };
    cyc.teams.set(teamId, t);
    return t;
  };

  /** The public baseline of a starter at each position (K7.2.1 input): mean public grade of each club's starters. */
  const baselineOf = (pc: PolicyContext, level: Level): Record<string, number> => {
    const cyc = cycleOf(pc);
    const hit = cyc.baseline.get(level);
    if (hit) return hit;
    const sums: Record<string, { s: number; n: number }> = {};
    for (const [teamId, ids] of pc.world.rosters) {
      if (levelOfTeam(pc.world, teamId) !== level) continue;
      const targets = positionTargets(specOf(pc.b, pc.world, teamId));
      const byPos = new Map<string, number[]>();
      for (const id of ids) {
        const pos = pc.world.people.get(id)?.playing?.position;
        if (pos) byPos.set(pos, [...(byPos.get(pos) ?? []), pc.grades.publicGrade(id)]);
      }
      for (const [pos, gs] of byPos) {
        const k = Math.max(1, Math.round((targets[pos] ?? 0) * param('role.starterShareOfMix')));
        for (const g of [...gs].sort((a, b) => b - a).slice(0, k)) { const e = (sums[pos] ??= { s: 0, n: 0 }); e.s += g; e.n++; }
      }
    }
    const out: Record<string, number> = {};
    for (const pos of Object.keys(sums).sort()) out[pos] = sums[pos]!.s / sums[pos]!.n;
    cyc.baseline.set(level, out);
    return out;
  };

  const needsOf = (pc: PolicyContext, teamId: number, t: TeamState): gm.Need[] => {
    const roster = pc.world.rosters.get(teamId) ?? [];
    if (t.needs && t.needs.size === roster.length) return t.needs.needs;
    const own = gm.gmNeeds(t.profile, {
      roster: roster.filter((id) => pc.world.people.get(id)?.playing).map((id) => view(pc, teamId, id)),
      baselineIss: baselineOf(pc, levelOfTeam(pc.world, teamId)), expiring: new Set(), unavailable: new Set(),
    }, t.ctx);
    const needs = gm.blendOwn(own, [], t.profile.coachVoiceWeight);
    t.needs = { size: roster.length, needs };
    return needs;
  };

  const builderSets = new WeakMap<object, Map<string, gm.CollegeRosterPhilosophy>>();
  /** K7.1.2: the head coach's roster-building record, one per program and head coach. */
  const builderOf = (pc: PolicyContext, teamId: number): gm.CollegeRosterPhilosophy => {
    let hc = 0;
    for (const j of pc.world.jobs.values()) if (j.teamId === teamId && j.positionId === 'pos:head_coach' && j.holderPersonId !== null) hc = j.holderPersonId;
    const k = `${teamId}:${hc}`;
    let builders = builderSets.get(pc.world);
    if (!builders) { builders = new Map(); builderSets.set(pc.world, builders); }
    let b = builders.get(k);
    if (!b) {
      const positions = Object.keys(specOf(pc.b, pc.world, teamId).rosterMix).sort();
      // No transfers in the world yet (TO-04), so the era's transfer share is 0.
      b = gm.generateCollegeBuilder(stream(pc.world.seed, STREAM_GM, ['college', teamId, hc]), hc, positions, 0);
      builders.set(k, b);
    }
    return b;
  };

  const freeSets = new WeakMap<PolicyContext, Map<number, Map<string, number>>>();
  /** Per position, his grade of the entry-pool prospect just past the expected draft picks there (TO-06). */
  const freeAlternative = (pc: PolicyContext, teamId: number): Map<string, number> => {
    let byTeam = freeSets.get(pc);
    if (!byTeam) { byTeam = new Map(); freeSets.set(pc, byTeam); }
    const hit = byTeam.get(teamId);
    if (hit) return hit;
    const level = levelOfTeam(pc.world, teamId);
    const spec = specOf(pc.b, pc.world, teamId);
    const clubs = pc.world.teams.filter((x) => levelOfTeam(pc.world, x.id) === level).length;
    const picks = clubs * (pc.b.rule(level, 'league_rules.draft.rounds') ?? 0);
    const mixTotal = Object.values(spec.rosterMix).reduce((a, x) => a + x, 0);
    const grades = new Map<string, number[]>();
    for (const id of pc.world.pools.get(POOL.proEntry) ?? []) {
      const pos = pc.world.people.get(id)?.playing?.position;
      if (pos) grades.set(pos, [...(grades.get(pos) ?? []), pc.grades.grade(teamId, id)]);
    }
    const out = new Map<string, number>();
    for (const [pos, gs] of grades) {
      const k = Math.round(picks * (spec.rosterMix[pos] ?? 0) / Math.max(1, mixTotal));
      const sorted = [...gs].sort((a, b) => b - a);
      out.set(pos, sorted[Math.min(sorted.length - 1, k)]!);
    }
    byTeam.set(teamId, out);
    return out;
  };

  const isPro = (pc: PolicyContext, teamId: number) => pc.b.rule(levelOfTeam(pc.world, teamId), 'eligibility.seasons_of_competition') === undefined;

  const rookieYears = (pc: PolicyContext, level: Level, round: number | null): number => {
    const keys = ['rookie.length_round_1', 'rookie.length_later_rounds', 'rookie.length_undrafted'];
    if (keys.some((k) => pc.b.rule(level, k) === undefined)) return gm.P('value.horizonYears');
    return cap.rookieLength(round, ruleSetOf(pc.b, level, pc.season));
  };

  return {
    pick(pc, teamId, candidates, phase: Phase) {
      if (!isPro(pc, teamId) || candidates.length === 0) return null;
      const t = teamOf(pc, teamId);
      const needs = needsOf(pc, teamId, t);
      const pool = candidates.map((id) => view(pc, teamId, id));
      const level = levelOfTeam(pc.world, teamId);
      if (phase.kind === 'draft') {
        const prospects = pool.map((v) => ({ ...v, coachRank: null, consensusRank: 0 }));
        return gm.buildBoard(t.profile, prospects, needs, t.ctx, phase.round ?? 1, phase.rounds ?? 1, rookieYears(pc, level, phase.round ?? 1))[0]?.personId ?? null;
      }
      if (phase.kind === 'undrafted') return gm.undraftedBoard(t.profile, pool, needs, t.ctx)[0] ?? null;
      // K7.2.2 replacement before the draft is the player he can have for nothing after it: the prospect at
      // each position just past the league's expected picks there, as his own staff grades the entry pool.
      const free = freeAlternative(pc, teamId);
      const faCtx: gm.ValueContext = { ...t.ctx, table: { ...t.ctx.table, replacementIss: (pos) => free.get(pos) ?? t.ctx.table.replacementIss(pos) } };
      // C8: no contracts yet, so the expected deal is the general manager's own horizon and no minimum (TO-07).
      const fas = pool.map((v) => ({ ...v, expectedYears: gm.P('value.horizonYears'), guaranteeShare: 0, minimumCents: 0, publicSuitors: 0 }));
      // K7.4.2: he targets only players worth more than replacement; with none left he signs nobody.
      return gm.targets(t.profile, fas, needs, faCtx)[0]?.personId ?? 'pass';
    },
    recruitOffers(pc, teamId, candidates, openPlaces) {
      if (isPro(pc, teamId) || candidates.length === 0) return null;
      const b = builderOf(pc, teamId);
      const t = teamOf(pc, teamId);
      const targets = positionTargets(specOf(pc.b, pc.world, teamId));
      const have: Record<string, number> = {};
      for (const id of pc.world.rosters.get(teamId) ?? []) { const pos = pc.world.people.get(id)?.playing?.position; if (pos) have[pos] = (have[pos] ?? 0) + 1; }
      const places: Record<string, gm.Places> = {};
      for (const [pos, n] of Object.entries(targets)) places[pos] = { open: Math.max(0, n - (have[pos] ?? 0)), target: n };
      // Recruits carry no projection, sign chance or home region off-screen yet (TO-08): the board is value and need.
      const pool: gm.Recruit[] = candidates.map((id) => ({ ...view(pc, teamId, id), region: '', signChance: 1, committedElsewhere: false, lowerSource: false }));
      // Replacement level for a class is the low end of the class itself, as this staff grades it: against the
      // club's own roster almost no freshman would rate above replacement.
      const byPos = new Map<string, number[]>();
      for (const v of pool) byPos.set(v.position, [...(byPos.get(v.position) ?? []), v.grade.mean]);
      const allGrades = pool.map((v) => v.grade.mean);
      const table: gm.ContributionTable = { ...t.ctx.table, replacementIss: (pos) => quantile(byPos.get(pos) ?? allGrades, param('gm.replacementQuantile')) };
      const board = gm.recruitBoard(b, pool, gm.placeNeeds(b, places), new Set(), { ...t.ctx, table });
      return board.slice(0, gm.offersWanted(openPlaces, param('college.offersPerSignee'), gm.P('college.evenBattleShare'))).map((r) => r.personId);
    },
    cutdown(pc, teamId, roster, limit, minByPosition) {
      if (!isPro(pc, teamId)) return null;
      const t = teamOf(pc, teamId);
      const result = gm.cutdown(t.profile, {
        roster: roster.filter((id) => pc.world.people.get(id)?.playing).map((id) => view(pc, teamId, id)),
        limit, minByPosition, coachRank: new Map(), draftedRound: pc.draftedRound, deadCentsByYear: new Map(),
        rounds: pc.b.rule(levelOfTeam(pc.world, teamId), 'league_rules.draft.rounds') ?? 0,
      }, t.ctx);
      return result.keep;
    },
  };
}

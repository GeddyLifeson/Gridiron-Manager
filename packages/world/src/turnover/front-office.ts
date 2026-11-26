// The front office AI (K7, front-office `gm`) as the world's roster policy. Each pro club has one general
// manager: the person in its `pos:general_manager` seat, with his K7.1.1 profile drawn once from the world seed
// and the club id. Before free agency he may break the contact rule (K7.7.1, `earlyContact` through `gm.raise`). He decides from his club's own
// observed grades only (K7.2.2 rule 6, K9): a `PlayerView` carries the observed grade and its variance, never
// the truth. Mechanics stay in moves.ts (the draft order, signings, rosters); this file only chooses.
//
// What the world cannot give him yet, and the stand-in used (each flagged in README.md, TO-06 to TO-09):
// - the J14.6.1 contribution table (engine batch runs): wins per ISS weighted by what the real market pays
//   for being better at each position (TO-18), replacement level from the club's own roster, slot weights
//   from the position mix;
// - contracts and the cap (C6): with the contracts module bound, a player's cost is his contract's salary
//   by year and the going rate per win is last market's (TO-07); without contracts in the world every cost
//   is empty, so value equals surplus;
// - projections (D6.5.1 ceiling looks): `projected` is null;
// - job pressure (K8.3.1): 0; the power arrangement (L5.2.1): `split` for every club.
import { stream } from '@gm/engine-core';
import { gm } from '@gm/front-office';
import { cap, development } from '@gm/league';
import { isSuspended } from '../compliance/penalties.ts';
import { complianceOf, complianceRules, dispositionOf, generalManagerOf, partyOf, publicBelief, setCompliance, sinkFor, STREAM_CONDUCT, streamFor } from '../compliance/binding.ts';
import { ageIn, levelOfTeam, positionTargets, specOf, type Level, type PolicyContext, type Phase, type RosterPolicy } from './binding.ts';
import { POOL, ruleSetOf } from './moves.ts';
import { ruleSetFor, type ContractsBinding } from '../contracts/binding.ts';
import { marketPrice, positionValueWeights, publicPercentiles } from '../contracts/scale.ts';
import { contractsOf, lastYear, salaryIn, type PlayerContract } from '../contracts/state.ts';
import { capFromRules } from '../money/club.ts';
import { param } from './params.ts';

export const STREAM_GM = 'world.frontoffice.gm';
export const STREAM_DRAW = 'world.frontoffice.draw';

type View = gm.PlayerView;

/**
 * D8.2.1 curve read as K7's linear age curve. Prime end and decline come from the fitted curve
 * (development tables `curves.primeEnd` and `curves.declineIssPerYear`, fit-aging.ts): the last age whose
 * expected whole-player value is within `value.primeBandIss` of the peak, and the mean yearly ISS loss
 * over the four years after it. The peak age read here is the prime end (K7 projects growth to it).
 */
export function ageCurve(): gm.AgeCurve {
  const c = development.devNumbers().tables.curves;
  const group = (position: string) => development.CURVE_GROUP[development.familyOf(position)];
  return {
    group,
    peakAge: (position) => c.primeEnd[group(position)]!,
    primeEndAge: (position) => c.primeEnd[group(position)]!,
    declineIssPerYear: (position) => c.declineIssPerYear[group(position)]!,
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
  /** The free agent value context (replacement = the free alternative), made once per cycle. */
  fa: gm.ValueContext | null;
}

interface CycleState {
  readonly teams: Map<number, TeamState>;
  readonly draws: Map<string, Map<number, Map<number, number>>>;
  readonly baseline: Map<Level, Record<string, number>>;
  readonly views: Map<number, Map<number, View>>;
  readonly bases: Map<number, { readonly profile: gm.GmProfile; readonly ctx: gm.ValueContext }>;
  /** The going rate per win this cycle (TO-07), once computed. */
  centsPerWin: number | null;
  /** The C8.3.1 market line of each free agent this cycle (PC-11): team independent. */
  readonly market: Map<number, { readonly years: number; readonly guaranteeShare: number; readonly minimumCents: number; readonly apyCents: number }>;
  /** Active contracts by player, read once per cycle. */
  contracts: Map<number, PlayerContract> | null;
  /** Street signings' market price above the minimum, by club, this cycle (capState counts them at the minimum). */
  readonly street: Map<number, number>;
}

/** What the front office reads from the contracts module, when the world holds contracts. */
export interface GmPolicyOptions {
  /** The contracts binding: its rules give a free agent's minimum salary (C6.4.1). */
  readonly contracts?: ContractsBinding;
}

const PROSPECTS = new WeakMap<View, gm.Prospect>();
const FREE_AGENTS = new WeakMap<View, gm.FreeAgent>();

/** The front office AI bound as the `RosterPolicy` for pro clubs (TO-06). College clubs keep the default board. */
export function gmPolicy(opts: GmPolicyOptions = {}): RosterPolicy {
  const curve = ageCurve();
  const cycles = new WeakMap<PolicyContext, CycleState>();

  const cycleOf = (pc: PolicyContext): CycleState => {
    let c = cycles.get(pc);
    if (!c) { c = { teams: new Map(), draws: new Map(), baseline: new Map(), views: new Map(), bases: new Map(), centsPerWin: null, market: new Map(), contracts: null, street: new Map() }; cycles.set(pc, c); }
    return c;
  };

  const contractMap = (pc: PolicyContext): Map<number, PlayerContract> => {
    const cyc = cycleOf(pc);
    if (!cyc.contracts) cyc.contracts = new Map(contractsOf(pc.world).active.map((c) => [c.personId, c]));
    return cyc.contracts;
  };
  // TO-07: a player's cost to his own club is his contract's salary for each league year from this one; a
  // player under contract elsewhere, out of contract, or in a world without contracts costs nothing yet.
  const costOf = (pc: PolicyContext, teamId: number, id: number): readonly number[] => {
    const c = contractMap(pc).get(id);
    if (!c || c.teamId !== teamId) return [];
    return c.terms.years.filter((y) => y.leagueYear >= pc.season).map((y) => salaryIn(c, y.leagueYear));
  };

  // One view per team and player per cycle: its inputs (the cached look, the position, the age) do not move
  // inside a cycle, and the same object lets the value context remember his wins by season.
  const view = (pc: PolicyContext, teamId: number, id: number): View => {
    const cyc = cycleOf(pc);
    let byPerson = cyc.views.get(teamId);
    if (!byPerson) { byPerson = new Map(); cyc.views.set(teamId, byPerson); }
    const hit = byPerson.get(id);
    if (hit) return hit;
    const p = pc.world.people.get(id)!;
    const g = pc.grades.belief(teamId, id);
    const v: View = { personId: id, position: p.playing!.position, age: ageIn(p, pc.season), grade: { mean: g.mean, variance: g.variance }, projected: null, fit: 1, flags: 0, costCentsByYear: costOf(pc, teamId, id) };
    byPerson.set(id, v);
    return v;
  };
  const prospectOf = (v: View): gm.Prospect => {
    let x = PROSPECTS.get(v);
    if (!x) { x = { ...v, coachRank: null, consensusRank: 0 }; PROSPECTS.set(v, x); }
    return x;
  };
  // C8.3.1 market line of a free agent (PC-11): years and guarantee share from the sourced scale at his public
  // percentile among the level's rostered players at his position, and his minimum salary. Without contracts
  // bound, the expected deal is the general manager's own horizon and no minimum (TO-07).
  const marketLine = (pc: PolicyContext, teamId: number, id: number) => {
    const cyc = cycleOf(pc);
    const hit = cyc.market.get(id);
    if (hit) return hit;
    const cb = opts.contracts;
    const p = pc.world.people.get(id)!;
    const capCents = cb ? capFromRules(cb.rule, cb.rulesYear)(pc.world, teamId, pc.season) : undefined;
    if (!cb || capCents === undefined || contractMap(pc).size === 0) {
      const none = { years: gm.P('value.horizonYears'), guaranteeShare: 0, minimumCents: 0, apyCents: 0 };
      cyc.market.set(id, none);
      return none;
    }
    const level = levelOfTeam(pc.world, teamId);
    const rules = ruleSetFor(cb, level);
    const position = p.playing!.position;
    const peers = pc.world.teams.filter((t) => levelOfTeam(pc.world, t.id) === level)
      .flatMap((t) => (pc.world.rosters.get(t.id) ?? []).filter((x) => pc.world.people.get(x)?.playing?.position === position));
    const pct = publicPercentiles(pc.world, pc.grades, [...new Set([...peers, id])]).get(id) ?? 0;
    const minimumCents = cap.minimumSalary(rules, cb.rulesYear, p.playing!.eligibility.pro.creditedSeasons);
    const age = ageIn(p, pc.season);
    const line = marketPrice({ position, percentile: pct, suitors: 0, age, primeEndAge: curve.primeEndAge(position), capCents, minimumCents, time: 1 });
    const out = { years: line.years, guaranteeShare: line.guaranteeShare, minimumCents, apyCents: line.apyCents.mid };
    cyc.market.set(id, out);
    return out;
  };
  const freeAgentOf = (pc: PolicyContext, teamId: number, v: View): gm.FreeAgent => {
    let x = FREE_AGENTS.get(v);
    if (!x) {
      const m = marketLine(pc, teamId, v.personId);
      x = { ...v, expectedYears: m.years, guaranteeShare: m.guaranteeShare, minimumCents: m.minimumCents, publicSuitors: 0 };
      FREE_AGENTS.set(v, x);
    }
    return x;
  };

  // K7.1.1: the club's general manager person (founding fills the seat); -teamId only for a club with the seat vacant.
  const gmIdOf = (pc: PolicyContext, teamId: number): number => generalManagerOf(pc.world, teamId) ?? -teamId;

  /** A club's general manager and his value context before the going rate enters it (centsPerWin 1). */
  const baseOf = (pc: PolicyContext, teamId: number): { readonly profile: gm.GmProfile; readonly ctx: gm.ValueContext } => {
    const cyc = cycleOf(pc);
    const hit = cyc.bases.get(teamId);
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
    const weights = new Map<string, readonly number[]>();
    // TO-18: the market's price of being better at each position sets its wins per ISS point.
    const posWeight = positionValueWeights(spec.rosterMix);
    const table: gm.ContributionTable = {
      winsPerIss: (position) => param('gm.winsPerIss') * (posWeight[position] ?? 1),
      replacementIss: (position) => {
        let r = replacement.get(position);
        if (r === undefined) { r = quantile(own.get(position) ?? all, param('gm.replacementQuantile')); replacement.set(position, r); }
        return r;
      },
      slotWeights: (position) => {
        let w = weights.get(position);
        if (w === undefined) {
          const t = targets[position] ?? 0;
          const starters = Math.max(1, Math.round(t * param('role.starterShareOfMix')));
          w = Object.freeze(Array.from({ length: Math.max(starters, t) }, (_, i) => (i < starters ? 1 : param('gm.depthSlotWeight'))));
          weights.set(position, w);
        }
        return w;
      },
    };
    const draw: gm.PersistentDraw = (kind, gmPerson, key) => {
      let byGm = cyc.draws.get(kind);
      if (!byGm) { byGm = new Map(); cyc.draws.set(kind, byGm); }
      let byKey = byGm.get(gmPerson);
      if (!byKey) { byKey = new Map(); byGm.set(gmPerson, byKey); }
      let v = byKey.get(key);
      if (v === undefined) { v = stream(pc.world.seed, STREAM_DRAW, [kind, gmPerson, key]).normal(); byKey.set(key, v); }
      return v;
    };
    // The table, curve and draw above are fixed for the cycle, so the context may remember values (memo).
    const base = { profile, ctx: { table, curve, centsPerWin: 1, draw, pressure: 0, memo: true } satisfies gm.ValueContext };
    cyc.bases.set(teamId, base);
    return base;
  };

  /**
   * TO-07, K7.2.2 rule 5: the going rate per win. It is last market's free agent signings at their average per
   * year over the wins each signing club's own general manager now expects of the player this season. Before
   * any market (the founding year) it is the same reading of every active veteran contract with its club.
   * Without contracts in the world it is 1, and since every cost is then empty it never enters a decision.
   */
  const goingRate = (pc: PolicyContext): number => {
    const cyc = cycleOf(pc);
    if (cyc.centsPerWin !== null) return cyc.centsPerWin;
    const st = contractsOf(pc.world);
    const winsOf = (teamId: number, personId: number): number => {
      if (!pc.world.people.get(personId)?.playing || !isPro(pc, teamId)) return 0;
      const b = baseOf(pc, teamId);
      return gm.winsByYear(b.profile, view(pc, teamId, personId), b.ctx, 1)[0] ?? 0;
    };
    const signed = (st.lastMarket?.signings ?? []).map((x) => ({ apyCents: x.apyCents, wins: winsOf(x.teamId, x.personId) }));
    const founding = st.active.filter((c) => c.terms.form === 'veteran')
      .map((c) => ({ apyCents: salaryIn(c, c.terms.years[0]!.leagueYear), wins: winsOf(c.teamId, c.personId) }));
    const rate = st.active.length === 0 ? 1 : gm.goingRateCentsPerWin(signed, gm.goingRateCentsPerWin(founding, 1));
    cyc.centsPerWin = rate;
    return rate;
  };

  const teamOf = (pc: PolicyContext, teamId: number): TeamState => {
    const cyc = cycleOf(pc);
    const hit = cyc.teams.get(teamId);
    if (hit) return hit;
    const base = baseOf(pc, teamId);
    const rate = goingRate(pc);
    const ctx: gm.ValueContext = rate === 1 ? base.ctx : { ...base.ctx, centsPerWin: rate };
    const t: TeamState = { profile: base.profile, ctx, needs: null, fa: null };
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

  /** K7.4.2 free agent board: replacement is the free alternative after the draft, the deal his own horizon (TO-07). */
  const faBoard = (pc: PolicyContext, teamId: number, pool: readonly View[], needs: readonly gm.Need[], t: TeamState) => {
    // K7.2.2 replacement before the draft is the player he can have for nothing after it: the prospect at
    // each position just past the league's expected picks there, as his own staff grades the entry pool.
    if (!t.fa) {
      const free = freeAlternative(pc, teamId);
      t.fa = { ...t.ctx, table: { ...t.ctx.table, replacementIss: (pos) => free.get(pos) ?? t.ctx.table.replacementIss(pos) } };
    }
    const ctx = t.fa;
    const fas = pool.map((v) => freeAgentOf(pc, teamId, v));
    return { ctx, byId: new Map(fas.map((v) => [v.personId, v])), ranked: gm.targets(t.profile, fas, needs, ctx) };
  };

  /** A suspended general manager may not act (L8.2.5 order): his club's acting front office keeps the default board. */
  const gmOut = (pc: PolicyContext, teamId: number): boolean => {
    const id = generalManagerOf(pc.world, teamId);
    return id !== null && isSuspended(pc.world, id);
  };

  // C6.3.2 as the world's contracts carry it (PC-06): cutting a player still owes the guaranteed salary of
  // each year left, so that money is spent whether he stays or goes.
  const deadOf = (pc: PolicyContext, teamId: number, roster: readonly number[]): Map<number, readonly number[]> => {
    const out = new Map<number, readonly number[]>();
    for (const id of roster) {
      const c = contractMap(pc).get(id);
      if (!c || c.teamId !== teamId) continue;
      const dead = c.terms.years.filter((y) => y.leagueYear >= pc.season).map((y) => (y.baseSalary.guarantee.skill ? y.baseSalary.amountCents : 0));
      if (dead.some((x) => x > 0)) out.set(id, dead);
    }
    return out;
  };

  // K7.4.1 rule 2 with CBA Art. 13 s.6(d)(iv): this league year's team salary if the club keeps `roster`, and
  // what cutting each player changes it by. Under contract: his salary this year counts; a release saves it but
  // brings every guaranteed salary still owed into this year (PC-06 pays it now). Not yet under contract (a
  // pick, a signing of this cycle, an expiring veteran): his minimum at least, which PC-13 never prices below.
  const capState = (pc: PolicyContext, teamId: number, roster: readonly number[]) => {
    const cb = opts.contracts;
    const capCents = cb ? capFromRules(cb.rule, cb.rulesYear)(pc.world, teamId, pc.season) : undefined;
    if (!cb || capCents === undefined || contractMap(pc).size === 0) return undefined;
    const rules = ruleSetFor(cb, levelOfTeam(pc.world, teamId));
    let salary = 0;
    const deltaIfCutCents = new Map<number, number>();
    for (const id of roster) {
      const p = pc.world.people.get(id)?.playing;
      if (!p) continue;
      const c = contractMap(pc).get(id);
      if (c && c.teamId === teamId && lastYear(c) >= pc.season) {
        const now = salaryIn(c, pc.season);
        const owed = c.terms.years.filter((y) => y.leagueYear >= pc.season && y.baseSalary.guarantee.skill).reduce((a, y) => a + y.baseSalary.amountCents, 0);
        salary += now;
        deltaIfCutCents.set(id, owed - now);
      } else {
        const min = cap.minimumSalary(rules, cb.rulesYear, p.eligibility.pro.creditedSeasons);
        salary += min;
        deltaIfCutCents.set(id, -min);
      }
    }
    // Players this club already released this cycle still owe their guarantees now (PC-06), and a street
    // signing costs his market price, not the minimum counted for him above.
    const on = new Set(roster);
    for (const c of contractMap(pc).values()) {
      if (c.teamId !== teamId || on.has(c.personId) || lastYear(c) < pc.season || pc.world.status.get(c.personId) !== 'active') continue;
      salary += c.terms.years.filter((y) => y.leagueYear >= pc.season && y.baseSalary.guarantee.skill).reduce((a, y) => a + y.baseSalary.amountCents, 0);
    }
    salary += cycleOf(pc).street.get(teamId) ?? 0;
    return { roomCents: capCents - salary, deltaIfCutCents };
  };

  // TO-19: a player signed this cycle has no contract until the contract year opens after the cutdown, so at
  // the cutdown he carries the deal he is about to sign: a pick or an undrafted rookie his rookie length at the
  // minimum (PC-05), anyone else his C8.3.1 market line (PC-11). Without contracts bound, nothing.
  const expectedCost = (pc: PolicyContext, teamId: number, id: number): readonly number[] => {
    const cb = opts.contracts;
    const p = pc.world.people.get(id)?.playing;
    if (!cb || !p || contractMap(pc).size === 0) return [];
    const level = levelOfTeam(pc.world, teamId);
    const rules = ruleSetFor(cb, level);
    const credited = p.eligibility.pro.creditedSeasons;
    const min = (k: number) => cap.minimumSalary(rules, cb.rulesYear, credited + k);
    const round = pc.draftedRound.get(id);
    if (round !== undefined || credited === 0) return Array.from({ length: rookieYears(pc, level, round ?? null) }, (_, k) => min(k));
    const m = marketLine(pc, teamId, id);
    return Array.from({ length: Math.max(1, m.years) }, (_, k) => Math.max(m.apyCents, min(k)));
  };

  // TO-19: at and after the cutdown this season's pay is spent whether a player stays or goes. The market has
  // closed, and PC-13 spends the owner's budget on the players kept, so a cut buys nothing this year; only later
  // years' pay and guarantees count. The cap still binds this year (capState and the K7.4.1 rule 2 repair pass).
  const laterOnly = (xs: readonly number[]): number[] => xs.map((x, y) => (y === 0 ? 0 : x));
  const cutBoard = (pc: PolicyContext, teamId: number, roster: readonly number[]) => {
    const dead = new Map([...deadOf(pc, teamId, roster)].map(([id, d]) => [id, laterOnly(d)]));
    const views: View[] = roster.filter((id) => pc.world.people.get(id)?.playing).map((id) => {
      const v = view(pc, teamId, id);
      return { ...v, costCentsByYear: laterOnly(v.costCentsByYear.length > 0 ? v.costCentsByYear : expectedCost(pc, teamId, id)) };
    });
    return { views, dead };
  };

  const isPro = (pc: PolicyContext, teamId: number) => pc.b.rule(levelOfTeam(pc.world, teamId), 'eligibility.seasons_of_competition') === undefined;

  const rookieYears = (pc: PolicyContext, level: Level, round: number | null): number => {
    const keys = ['rookie.length_round_1', 'rookie.length_later_rounds', 'rookie.length_undrafted'];
    if (keys.some((k) => pc.b.rule(level, k) === undefined)) return gm.P('value.horizonYears');
    return cap.rookieLength(round, ruleSetOf(pc.b, level, pc.season));
  };

  return {
    pick(pc, teamId, candidates, phase: Phase) {
      if (!isPro(pc, teamId) || candidates.length === 0 || gmOut(pc, teamId)) return null;
      const t = teamOf(pc, teamId);
      const needs = needsOf(pc, teamId, t);
      const pool = candidates.map((id) => view(pc, teamId, id));
      const level = levelOfTeam(pc.world, teamId);
      if (phase.kind === 'draft') {
        const prospects = pool.map(prospectOf);
        return gm.buildBoard(t.profile, prospects, needs, t.ctx, phase.round ?? 1, phase.rounds ?? 1, rookieYears(pc, level, phase.round ?? 1))[0]?.personId ?? null;
      }
      if (phase.kind === 'undrafted') return gm.undraftedBoard(t.profile, pool, needs, t.ctx)[0] ?? null;
      // K7.4.2: he targets only players worth more than replacement; with none left he signs nobody.
      return faBoard(pc, teamId, pool, needs, t).ranked[0]?.personId ?? 'pass';
    },
    earlyContact(pc, teamId, candidates, slot) {
      if (!isPro(pc, teamId) || candidates.length === 0 || gmOut(pc, teamId)) return null;
      // K7.7.1 needs a person who can act: no general manager in the seat, no act.
      const gmId = generalManagerOf(pc.world, teamId);
      if (gmId === null) return null;
      const t = teamOf(pc, teamId);
      const pool = candidates.map((id) => view(pc, teamId, id));
      const board = faBoard(pc, teamId, pool, needsOf(pc, teamId, t), t);
      const top = board.ranked[0];
      if (!top) return null;
      // K7.2.2 gain: the worth of his top target over the one he expects to land from his place in the order.
      const worth = (id: number): number => gm.playerWorth(t.profile, board.byId.get(id)!, board.ctx, gm.P('value.horizonYears')).value;
      const expected = board.ranked[Math.min(slot, board.ranked.length - 1)]!;
      const gainWins = Math.max(0, worth(top.personId) - worth(expected.personId));
      const level = levelOfTeam(pc.world, teamId);
      const team = pc.world.teams.find((x) => x.id === teamId)!;
      const rules = complianceRules(`world:${level}`, pc.season, level, (k) => pc.b.rule(level, k));
      const kind = 'early_contact_player';
      // The general manager and the player he reached both know (L6.3.1 holders); either can talk.
      const r = gm.raise(complianceOf(pc.world), {
        kind, gainWins, belief: publicBelief(gm.OPPORTUNITIES[kind].classId), actor: partyOf(pc.world, gmId, 'general_manager', teamId),
        marketRead: t.profile.behavior.marketRead, disposition: dispositionOf(pc.world, gmId, 0), orderedBy: null, knew: [gmId, top.personId],
        date: pc.world.date, competitionId: team.competitionId, tier: pc.ctx.tierOfTeam(teamId), source: pc.ctx.source,
      }, rules, t.ctx.draw, streamFor(pc.ctx, STREAM_CONDUCT), sinkFor(pc.ctx));
      setCompliance(pc.world, r.state);
      return r.commit ? top.personId : null;
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
      // The quantile is a pure function of the class, so each position's is computed once per board.
      const replacement = new Map<string, number>();
      const table: gm.ContributionTable = {
        ...t.ctx.table,
        replacementIss: (pos) => {
          let r = replacement.get(pos);
          if (r === undefined) { r = quantile(byPos.get(pos) ?? allGrades, param('gm.replacementQuantile')); replacement.set(pos, r); }
          return r;
        },
      };
      const board = gm.recruitBoard(b, pool, gm.placeNeeds(b, places), new Set(), { ...t.ctx, table });
      return board.slice(0, gm.offersWanted(openPlaces, param('college.offersPerSignee'), gm.P('college.evenBattleShare'))).map((r) => r.personId);
    },
    cutdown(pc, teamId, roster, limit, minByPosition) {
      if (!isPro(pc, teamId) || gmOut(pc, teamId)) return null;
      const t = teamOf(pc, teamId);
      const { views, dead } = cutBoard(pc, teamId, roster);
      const result = gm.cutdown(t.profile, {
        roster: views,
        limit, minByPosition, coachRank: new Map(), draftedRound: pc.draftedRound, deadCentsByYear: dead,
        rounds: pc.b.rule(levelOfTeam(pc.world, teamId), 'league_rules.draft.rounds') ?? 0,
        ...(capState(pc, teamId, roster) ? { cap: capState(pc, teamId, roster)! } : {}),
      }, t.ctx);
      return result.keep;
    },
    streetSign(pc, teamId, candidates) {
      if (!isPro(pc, teamId) || candidates.length === 0 || gmOut(pc, teamId)) return null;
      const t = teamOf(pc, teamId);
      const ids = (pc.world.rosters.get(teamId) ?? []).filter((id) => pc.world.people.get(id)?.playing);
      const { views: roster, dead } = cutBoard(pc, teamId, ids);
      const cs = capState(pc, teamId, ids);
      // K7.4.5 rule 3 score of each kept player: surplus plus the dead money a release would still cost.
      const keepScore = (v: View) => gm.playerWorth(t.profile, v, t.ctx).surplus + gm.costWins(t.profile, dead.get(v.personId) ?? [], t.ctx);
      const worst = new Map<string, { v: View; s: number }>();
      for (const v of roster) {
        const s = keepScore(v);
        const w = worst.get(v.position);
        if (!w || s < w.s || (s === w.s && v.personId < w.v.personId)) worst.set(v.position, { v, s });
      }
      let best: { sign: number; drop: number; gain: number; extra: number } | null = null;
      for (const id of [...candidates].sort((a, b) => a - b)) {
        const w = worst.get(pc.world.people.get(id)?.playing?.position ?? '');
        if (!w) continue;
        // C8.3.1: he signs at the market line; the club must fit him under the cap after the release (K7.4.1 rule 2).
        const m = marketLine(pc, teamId, id);
        const price = Math.max(m.apyCents, m.minimumCents);
        if (cs && cs.roomCents - (cs.deltaIfCutCents.get(w.v.personId) ?? 0) - price < 0) continue;
        const fa: View = { ...view(pc, teamId, id), costCentsByYear: laterOnly(Array.from({ length: Math.max(1, m.years) }, () => price)) };
        if (gm.playerWorth(t.profile, fa, t.ctx).surplus <= w.s) continue;
        const gain = gm.rosterDelta(t.profile, roster, [fa], [w.v.personId], t.ctx) - gm.costWins(t.profile, dead.get(w.v.personId) ?? [], t.ctx);
        if (gain > gm.P('roster.claimMargin') && (!best || gain > best.gain)) best = { sign: id, drop: w.v.personId, gain, extra: price - m.minimumCents };
      }
      if (!best) return null;
      const street = cycleOf(pc).street;
      street.set(teamId, (street.get(teamId) ?? 0) + best.extra);
      return { sign: best.sign, drop: best.drop };
    },
  };
}

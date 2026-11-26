// T3.1 Building the college schedule. Three steps, each a pure function of the inputs and one stream:
//   1. Conference games (T3.1.1 rules 2, 3, 5): protected rivals every year, the other members by
//      staleness so every pair meets within the conference's cycle, hosts alternating by history.
//   2. Non-conference games (T3.1.2): cross-conference protected rivals, signed contracts, the
//      10-power-opponent rule, lower-subdivision guarantee games at the real rate, then peers.
//   3. Weeks: greedy edge colouring with Kempe-chain repair, each team at most one game a week,
//      non-conference games early and conference games late (preferences, not rules).
// History (who last met whom, and who hosted) comes in and goes out, so realignment just works.
import type { RandomStream } from '@gm/schema';
import type { ScheduleConfig, ScheduledGame, TeamId } from './types.ts';
import { DEFAULT_CONFIG } from './types.ts';
import { orientBalanced, type OrientEdge } from './balance.ts';
import { byYear, distanceKm, floorDiv, half, mod, pairKey, shuffle, TWO } from './util.ts';

export interface CollegeTeam {
  readonly id: TeamId;
  /** Competition level id from world data (for example `college_top`); compared only with config values. */
  readonly level: string;
  readonly conferenceId: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly zone: string;
  readonly venueId: string;
}

export interface CollegeConference {
  readonly id: string;
  /** `power`, `other` or `second` (T2.2.1 tiers). */
  readonly tier: string;
  readonly memberIds: readonly TeamId[];
}

export interface Rivalry { readonly a: TeamId; readonly b: TeamId; readonly strength: number }
export interface NeutralVenue { readonly id: string; readonly latitude: number; readonly longitude: number; readonly zone: string }
export interface Meeting { readonly year: number; readonly host: TeamId | null }
export type MeetingHistory = Readonly<Record<string, Meeting>>;
export interface Contract { readonly home: TeamId; readonly away: TeamId; readonly neutralVenueId?: string }

export interface CollegeSeasonInput {
  readonly season: number;
  readonly teams: readonly CollegeTeam[];
  readonly conferences: readonly CollegeConference[];
  readonly rivalries: readonly Rivalry[];
  readonly history: MeetingHistory;
  readonly contracts?: readonly Contract[];
  readonly neutralVenues?: readonly NeutralVenue[];
  readonly week1SaturdayDayIndex?: number;
  readonly random: RandomStream;
  readonly config?: ScheduleConfig;
}

export interface CollegeSchedule {
  readonly season: number;
  readonly games: ScheduledGame[];
  readonly history: Record<string, Meeting>;
  /** T3.1.1 rule 6: teams short of the playoff standard (from 2027), with their qualifying count. */
  readonly warnings: readonly { readonly team: TeamId; readonly qualifying: number }[];
  readonly log: readonly string[];
}

interface Draft { home: TeamId; away: TeamId; kind: ScheduledGame['kind']; conference: boolean; neutralVenue: string | null; lateOk: boolean }

/** Conference games per team this season, with the parity rule for odd n times odd g. */
export function conferenceGameCounts(conf: CollegeConference, season: number, cfg: ScheduleConfig = DEFAULT_CONFIG): Map<TeamId, number> {
  const C = cfg.college;
  const members = conf.memberIds.slice().sort();
  const n = members.length;
  const override = (C.conferenceGamesOverride as Record<string, number>)[conf.id];
  const base = Math.min(override ?? (C.conferenceGamesByTier as Record<string, number>)[conf.tier] ?? n - 1, n - 1);
  const out = new Map(members.map((m) => [m, base] as const));
  // An odd-sized conference with an odd game count leaves one school a game short (2026 ACC: 16 at 9, one at 8).
  if (!(mod(n * base, TWO) === 0)) out.set(members[mod(season, n)]!, base - 1);
  return out;
}

/** Protected annual pairs inside a conference: rivals by strength, at most `maxProtected` per team. */
export function protectedPairs(conf: CollegeConference, rivalries: readonly Rivalry[], counts: ReadonlyMap<TeamId, number>, cfg: ScheduleConfig = DEFAULT_CONFIG): [TeamId, TeamId][] {
  const inConf = new Set(conf.memberIds);
  const maxProtected = cfg.college.maxProtected;
  const deg = new Map<TeamId, number>();
  const out: [TeamId, TeamId][] = [];
  const rows = rivalries.filter((r) => inConf.has(r.a) && inConf.has(r.b))
    .slice().sort((x, y) => y.strength - x.strength || (pairKey(x.a, x.b) < pairKey(y.a, y.b) ? -1 : 1));
  for (const r of rows) {
    const da = deg.get(r.a) ?? 0;
    const db = deg.get(r.b) ?? 0;
    if (da >= maxProtected || db >= maxProtected) continue;
    if (da >= (counts.get(r.a) ?? 0) || db >= (counts.get(r.b) ?? 0)) continue;
    out.push([r.a, r.b]);
    deg.set(r.a, da + 1);
    deg.set(r.b, db + 1);
  }
  return out;
}

function staleness(a: TeamId, b: TeamId, season: number, history: MeetingHistory, cfg: ScheduleConfig): number {
  const m = history[pairKey(a, b)];
  const cap = cfg.college.rotationStaleCap;
  if (!m) return cap + 1;
  return Math.min(season - m.year, cap);
}

/**
 * Pick the rotating conference opponents: an exact-degree subgraph of the non-protected pairs that
 * favours the pairs that have gone longest without meeting (weight = staleness squared).
 */
export function rotatingPairs(
  members: readonly TeamId[],
  need: ReadonlyMap<TeamId, number>,
  protectedSet: ReadonlySet<string>,
  season: number,
  history: MeetingHistory,
  rng: RandomStream,
  cfg: ScheduleConfig = DEFAULT_CONFIG,
): [TeamId, TeamId][] {
  const C = cfg.college;
  const ids = members.slice().sort();
  const n = ids.length;
  const ix = new Map(ids.map((m, i) => [m, i] as const));
  const allowed: boolean[][] = ids.map((a) => ids.map((b) => a !== b && !protectedSet.has(pairKey(a, b))));
  const w: number[][] = ids.map((a) => ids.map((b) => { const s = staleness(a, b, season, history, cfg); return s * s; }));
  const r = ids.map((m) => need.get(m) ?? 0);
  for (let attempt = 0; attempt < C.restarts; attempt++) {
    const inS: boolean[][] = ids.map(() => ids.map(() => false));
    const deg = new Array<number>(n).fill(0);
    const nb: number[][] = ids.map(() => []);
    const add = (a: number, b: number) => { inS[a]![b] = true; inS[b]![a] = true; deg[a]!++; deg[b]!++; nb[a]!.push(b); nb[b]!.push(a); };
    const del = (a: number, b: number) => {
      inS[a]![b] = false; inS[b]![a] = false; deg[a]!--; deg[b]!--;
      nb[a]!.splice(nb[a]!.indexOf(b), 1); nb[b]!.splice(nb[b]!.indexOf(a), 1);
    };
    // Greedy by weight with random ties.
    const cand: [number, number][] = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (allowed[a]![b]) cand.push([a, b]);
    const order = shuffle(cand, rng).sort((x, y) => w[y[0]]![y[1]]! - w[x[0]]![x[1]]!);
    for (const [a, b] of order) if (deg[a]! < r[a]! && deg[b]! < r[b]!) add(a, b);
    // Augmenting walks for the remaining deficits.
    let ok = true;
    for (let guard = 0; guard < n * n; guard++) {
      const u0 = deg.findIndex((d, i) => d < r[i]!);
      if (u0 < 0) break;
      let u = u0;
      let fixed = false;
      for (let step = 0; step < C.walkSteps; step++) {
        const opts: number[] = [];
        for (let x = 0; x < n; x++) if (allowed[u]![x] && !inS[u]![x]) opts.push(x);
        if (opts.length === 0) break;
        const x = opts[rng.int(0, opts.length - 1)]!;
        if (deg[x]! < r[x]!) { add(u, x); fixed = true; break; }
        const ys = nb[x]!.filter((y) => y !== u);
        if (ys.length === 0) continue;
        const y = ys[rng.int(0, ys.length - 1)]!;
        del(x, y);
        add(u, x);
        u = y;
      }
      if (!fixed) { ok = false; break; }
    }
    if (!ok || deg.some((d, i) => d !== r[i])) continue;
    // Improve by degree-preserving swaps: (a,b),(c,d) -> (a,c),(b,d).
    const edges = (): [number, number][] => { const e: [number, number][] = []; for (let a = 0; a < n; a++) for (const b of nb[a]!) if (a < b) e.push([a, b]); return e; };
    let list = edges();
    for (let it = 0; it < C.rotationIterations && list.length > 1; it++) {
      const i = rng.int(0, list.length - 1);
      let j = rng.int(0, list.length - 1 - 1);
      if (j >= i) j++;
      let [a, b] = list[i]!;
      const [c, d] = list[j]!;
      if (rng.chance(half(1))) [a, b] = [b, a];
      if (a === c || a === d || b === c || b === d) continue;
      if (!allowed[a]![c] || !allowed[b]![d] || inS[a]![c] || inS[b]![d]) continue;
      const delta = w[a]![c]! + w[b]![d]! - w[a]![b]! - w[c]![d]!;
      if (delta < 0) continue;
      del(a, b); del(c, d); add(a, c); add(b, d);
      list = edges();
    }
    void ix;
    return edges().map(([a, b]) => [ids[a]!, ids[b]!]);
  }
  throw new Error(`T3.1.1: could not build a conference rotation for ${ids[0]} and its conference`);
}

function prefHost(a: TeamId, b: TeamId, history: MeetingHistory): TeamId | null {
  const m = history[pairKey(a, b)];
  if (!m || m.host === null) return null;
  return m.host === a ? b : a;
}

/** Orient a set of pairs with history alternation and home counts within [floor(g/2), ceil(g/2)]. */
function orientConference(pairs: readonly [TeamId, TeamId][], counts: ReadonlyMap<TeamId, number>, history: MeetingHistory, rng: RandomStream): Map<string, TeamId> {
  const ids = [...counts.keys()].sort();
  const ix = new Map(ids.map((m, i) => [m, i] as const));
  const edges: OrientEdge[] = pairs.map(([a, b]) => {
    const p = prefHost(a, b, history);
    return { a: ix.get(a)!, b: ix.get(b)!, pref: p === null ? -1 : ix.get(p)! };
  });
  const lo = ids.map((m) => floorDiv(counts.get(m)!, TWO));
  const hi = ids.map((m) => Math.ceil(half(counts.get(m)!)));
  const host = orientBalanced(ids.length, edges, lo, hi, () => rng.chance(half(1)));
  if (!host) throw new Error('T3.1.1: no balanced home-and-away split for a conference');
  const out = new Map<string, TeamId>();
  pairs.forEach(([a, b], k) => out.set(pairKey(a, b), ids[host[k]!]!));
  return out;
}

export function generateCollegeSeason(input: CollegeSeasonInput): CollegeSchedule {
  const cfg = input.config ?? DEFAULT_CONFIG;
  const C = cfg.college;
  const rng = input.random;
  const season = input.season;
  const log: string[] = [];
  const team = new Map(input.teams.map((t) => [t.id, t] as const));
  const confOf = new Map(input.conferences.map((c) => [c.id, c] as const));
  const tierOf = (t: TeamId) => { const c = team.get(t)!.conferenceId; return c ? confOf.get(c)!.tier : null; };
  const powerIndependents = new Set(C.powerOpponentRule.countingIndependents);
  const isPower = (t: TeamId) => tierOf(t) === 'power' || powerIndependents.has(t);
  const isTop = (t: TeamId) => team.get(t)!.level === C.topLevel;
  const target = new Map(input.teams.map((t) => [t.id, (C.gamesByLevel as Record<string, number>)[t.level] ?? 0] as const));
  const drafts: Draft[] = [];
  const played = new Map<TeamId, number>();
  const met = new Set<string>();
  const addDraft = (d: Draft) => {
    drafts.push(d);
    met.add(pairKey(d.home, d.away));
    for (const t of [d.home, d.away]) played.set(t, (played.get(t) ?? 0) + 1);
  };
  const slots = (t: TeamId) => target.get(t)! - (played.get(t) ?? 0);

  // 1. Conference games.
  for (const conf of input.conferences) {
    const counts = conferenceGameCounts(conf, season, cfg);
    const prot = protectedPairs(conf, input.rivalries, counts, cfg);
    const pset = new Set(prot.map(([a, b]) => pairKey(a, b)));
    const need = new Map<TeamId, number>();
    for (const [m, g] of counts) need.set(m, g - prot.filter(([a, b]) => a === m || b === m).length);
    const rot = rotatingPairs(conf.memberIds, need, pset, season, input.history, rng, cfg);
    const all = [...prot, ...rot];
    const hosts = orientConference(all, counts, input.history, rng);
    for (const [a, b] of all) {
      const h = hosts.get(pairKey(a, b))!;
      addDraft({ home: h, away: h === a ? b : a, kind: pset.has(pairKey(a, b)) ? 'protected' : 'conference', conference: true, neutralVenue: null, lateOk: true });
    }
  }

  const hostFor = (a: TeamId, b: TeamId): TeamId => {
    const p = prefHost(a, b, input.history);
    if (p) return p;
    // The stronger program usually hosts a power-versus-other game (T3.1.2 fact, share is an assumption).
    if (isPower(a) !== isPower(b)) {
      const strong = isPower(a) ? a : b;
      return rng.chance(C.powerHostsOtherShare) ? strong : strong === a ? b : a;
    }
    return rng.chance(half(1)) ? a : b;
  };
  const near = (from: TeamId, pool: readonly TeamId[]): TeamId[] => {
    const f = team.get(from)!;
    return pool.slice().sort((x, y) => {
      const tx = team.get(x)!;
      const ty = team.get(y)!;
      return distanceKm(f.latitude, f.longitude, tx.latitude, tx.longitude, cfg) - distanceKm(f.latitude, f.longitude, ty.latitude, ty.longitude, cfg) || (x < y ? -1 : 1);
    });
  };
  const sameConf = (a: TeamId, b: TeamId) => { const ca = team.get(a)!.conferenceId; return ca !== null && ca === team.get(b)!.conferenceId; };
  const canPair = (a: TeamId, b: TeamId) => a !== b && !sameConf(a, b) && !met.has(pairKey(a, b)) && slots(a) > 0 && slots(b) > 0;

  // Who must reach the power-opponent count: members of rule conferences (T3.1.2 rule 5), and from the
  // playoff-standard year every power program (T3.1.1 rule 6 counts conference plus power games).
  const ruleConfs = new Set(C.powerOpponentRule.conferences);
  const mustReach = (t: TeamId) => {
    const c = team.get(t)!.conferenceId;
    if (c === null) return false;
    return ruleConfs.has(c) || (season >= C.qualifyingStandard.fromYear && confOf.get(c)!.tier === 'power');
  };
  const confGamesOf = (t: TeamId) => drafts.filter((d) => d.conference && (d.home === t || d.away === t)).length;
  const powerNonConf = (t: TeamId) => drafts.filter((d) => !d.conference && (d.home === t || d.away === t) && isPower(d.home === t ? d.away : d.home)).length;
  const powerNeed = (t: TeamId) => (mustReach(t) ? Math.max(0, C.powerOpponentRule.minGames - confGamesOf(t) - powerNonConf(t)) : 0);

  // 2a. Protected rivals across conferences, every year, strongest first. A non-power rival is dropped
  // when it would leave no room for a required power game (the athletic director keeps the rule).
  const cross = input.rivalries.slice().sort((x, y) => y.strength - x.strength || (pairKey(x.a, x.b) < pairKey(y.a, y.b) ? -1 : 1));
  for (const r of cross) {
    if (!team.has(r.a) || !team.has(r.b) || sameConf(r.a, r.b)) continue;
    if (!canPair(r.a, r.b)) continue;
    const blocks = (t: TeamId, o: TeamId) => !isPower(o) && powerNeed(t) >= slots(t);
    if (blocks(r.a, r.b) || blocks(r.b, r.a)) { log.push(`${r.a} v ${r.b}: protected game dropped this season for the power-opponent rule`); continue; }
    const h = hostFor(r.a, r.b);
    addDraft({ home: h, away: h === r.a ? r.b : r.a, kind: 'protected', conference: false, neutralVenue: null, lateOk: true });
  }
  // 2b. Signed contracts (T3.1.2: the athletic director's games).
  for (const c of input.contracts ?? []) {
    if (!team.has(c.home) || !team.has(c.away) || !canPair(c.home, c.away)) { log.push(`contract ${c.home} v ${c.away} skipped: no slot`); continue; }
    addDraft({ home: c.home, away: c.away, kind: 'contract', conference: false, neutralVenue: c.neutralVenueId ?? null, lateOk: false });
  }
  // 2c. Ten power opponents where required (T3.1.2 rule 5, T3.1.1 rule 6).
  const powerPool = input.teams.filter((t) => isPower(t.id)).map((t) => t.id);
  for (const t of shuffle(input.teams.filter((x) => mustReach(x.id)).map((x) => x.id), rng)) {
    while (powerNeed(t) > 0) {
      const pool = near(t, powerPool.filter((p) => canPair(t, p)));
      const needy = pool.filter((p) => powerNeed(p) > 0);
      const pick = (needy.length ? needy : pool).slice(0, C.nearestCandidates);
      if (pick.length === 0) { log.push(`${t}: no power opponent available`); break; }
      const o = pick[rng.int(0, pick.length - 1)]!;
      const h = hostFor(t, o);
      addDraft({ home: h, away: h === t ? o : t, kind: 'nonconference', conference: false, neutralVenue: null, lateOk: false });
    }
  }
  // 2d. Lower-subdivision guarantee games: the top team hosts and pays (T3.1.2 rule 2).
  const tops = input.teams.filter((t) => isTop(t.id)).map((t) => t.id);
  const seconds = input.teams.filter((t) => team.get(t.id)!.level === C.secondLevel).map((t) => t.id);
  const topSecond = new Map<TeamId, number>();
  const existing = drafts.filter((d) => isTop(d.home) !== isTop(d.away)).length;
  let wanted = Math.round(C.secondSubdivisionGameRate * tops.length) - existing;
  for (const t of shuffle(tops, rng)) {
    if (wanted <= 0) break;
    if (slots(t) <= 0) continue;
    const pool = near(t, seconds.filter((s) => canPair(t, s) && (topSecond.get(s) ?? 0) < C.secondSubdivisionMaxTopGames)).slice(0, C.nearestCandidates);
    if (pool.length === 0) continue;
    const s = pool[rng.int(0, pool.length - 1)]!;
    topSecond.set(s, (topSecond.get(s) ?? 0) + 1);
    addDraft({ home: t, away: s, kind: 'guarantee', conference: false, neutralVenue: null, lateOk: true });
    wanted--;
  }
  // 2e and 2f. Fill the rest among peers: top with top, then second with second.
  const fill = (pool: readonly TeamId[], kind: Draft['kind']) => {
    for (let it = 0; it < C.fillIterations; it++) {
      const open = shuffle(pool.filter((t) => slots(t) > 0), rng);
      if (open.length === 0) return;
      let progress = false;
      for (const t of open) {
        if (slots(t) <= 0) continue;
        const cands = near(t, open.filter((o) => canPair(t, o))).slice(0, C.nearestCandidates);
        if (cands.length === 0) continue;
        const o = cands[rng.int(0, cands.length - 1)]!;
        const h = hostFor(t, o);
        addDraft({ home: h, away: h === t ? o : t, kind, conference: false, neutralVenue: null, lateOk: false });
        progress = true;
      }
      if (progress) continue;
      // Stuck: break an existing peer game between two full teams to free partners (augmenting step).
      const t = open[0]!;
      const k = drafts.findIndex((d) => d.kind === kind && d.home !== t && d.away !== t && canPairIgnoringSlots(t, d.home) && canPairIgnoringSlots(t, d.away));
      if (k < 0) return;
      const d = drafts.splice(k, 1)[0]!;
      met.delete(pairKey(d.home, d.away));
      for (const x of [d.home, d.away]) played.set(x, played.get(x)! - 1);
    }
  };
  const canPairIgnoringSlots = (a: TeamId, b: TeamId) => a !== b && !sameConf(a, b) && !met.has(pairKey(a, b));
  fill(tops, 'nonconference');
  // A top team still short hosts another lower-subdivision team: every top team plays the full count.
  for (const t of tops) {
    while (slots(t) > 0) {
      const pool = near(t, seconds.filter((s) => canPair(t, s)));
      const relaxed = pool.length ? pool : near(t, seconds.filter((s) => canPairIgnoringSlots(t, s)));
      if (relaxed.length === 0) throw new Error(`T3.1.2: ${t} cannot be filled to ${target.get(t)} games`);
      const s = relaxed[0]!;
      addDraft({ home: t, away: s, kind: 'guarantee', conference: false, neutralVenue: null, lateOk: true });
      log.push(`${t}: filled with an extra lower-subdivision game`);
    }
  }
  fill(seconds, 'second_subdivision');
  for (const s of seconds) if (slots(s) > 0) log.push(`${s}: ${slots(s)} short of ${target.get(s)} games`);

  // Neutral sites: a share of top-versus-top non-conference and protected games (T3.1.1 rule 5).
  const venues = input.neutralVenues ?? [];
  if (venues.length) {
    const cands = drafts.filter((d) => isTop(d.home) && isTop(d.away) && !d.conference && d.neutralVenue === null);
    const topTop = drafts.filter((d) => isTop(d.home) && isTop(d.away)).length;
    const n = Math.min(cands.length, Math.round(C.neutralShare * topTop));
    for (const d of shuffle(cands, rng).slice(0, n)) {
      const a = team.get(d.home)!;
      const b = team.get(d.away)!;
      const mlat = half(a.latitude + b.latitude);
      const mlon = half(a.longitude + b.longitude);
      d.neutralVenue = venues.slice().sort((x, y) => distanceKm(mlat, mlon, x.latitude, x.longitude, cfg) - distanceKm(mlat, mlon, y.latitude, y.longitude, cfg))[0]!.id;
    }
  }

  // 3. Weeks.
  const weeks = byYear(C.weeksByYear, season);
  const weekOf = placeWeeks(drafts, input.teams.map((t) => t.id), weeks, byYear(C.optionalFirstWeekByYear, season), rng, cfg);

  const games: ScheduledGame[] = drafts.map((d, i) => {
    const h = team.get(d.home)!;
    const nv = d.neutralVenue ? venues.find((v) => v.id === d.neutralVenue) : undefined;
    const w = weekOf[i]!;
    const off = cfg.slots.days.sat;
    return {
      id: `c.${season}.${w}.${d.home}.${d.away}`, season, phase: 'regular', week: w, home: d.home, away: d.away,
      venueId: d.neutralVenue ?? h.venueId, neutral: d.neutralVenue !== null, international: false, region: null,
      kind: d.kind, conferenceGame: d.conference, day: 'sat', dayOffset: off,
      dayIndex: input.week1SaturdayDayIndex === undefined ? null : input.week1SaturdayDayIndex + w * cfg.time.daysPerWeek,
      slot: 'saturday', kickoffEtMinutes: null, venueZone: nv ? nv.zone : h.zone, national: false, flexEligible: false, status: 'scheduled',
    };
  });

  const history: Record<string, Meeting> = { ...input.history };
  for (const g of games) history[pairKey(g.home, g.away)] = { year: season, host: g.neutral ? null : g.home };

  // T3.1.1 rule 6: the playoff standard from 2027.
  const warnings: { team: TeamId; qualifying: number }[] = [];
  if (season >= C.qualifyingStandard.fromYear) {
    for (const t of tops) {
      const mine = games.filter((g) => g.home === t || g.away === t);
      const q = mine.filter((g) => {
        const o = g.home === t ? g.away : g.home;
        if (isPower(t)) return g.conferenceGame || isPower(o);
        return isTop(o);
      }).length;
      if (q < C.qualifyingStandard.minGames) warnings.push({ team: t, qualifying: q });
    }
  }
  return { season, games, history, warnings, log };
}

/**
 * Weeks 0 to weeks-1 (week 0 is the early week). Greedy colouring in preference order, Kempe-chain
 * repair when two teams share no free week, then single-game moves that lower the preference cost.
 */
function placeWeeks(drafts: readonly Draft[], teams: readonly TeamId[], weeks: number, optionalFirst: boolean, rng: RandomStream, cfg: ScheduleConfig): number[] {
  const P = cfg.college.weekPrefs;
  const lastWeek = weeks - 1;
  const ix = new Map(teams.map((t, i) => [t, i] as const));
  const u = drafts.map((d) => ix.get(d.home)!);
  const v = drafts.map((d) => ix.get(d.away)!);
  const lateGuarantee = drafts.map((d) => d.kind === 'guarantee' && rng.chance(P.lateNonConferenceShare));
  const pref = (e: number, w: number): number => {
    const d = drafts[e]!;
    let c = 0;
    if (w === 0 && optionalFirst) c += cfg.college.firstWeekPenalty;
    if (d.kind === 'protected' && P.protectedFinalWeek && w !== lastWeek) c += P.rivalryWeekPenalty;
    if (d.conference && w < P.conferenceFirst) c += P.wrongPhasePenalty;
    if (!d.conference && d.kind !== 'protected') {
      const late = lateGuarantee[e]! && w > lastWeek - P.nonConferenceEarlyLast;
      if (w > P.nonConferenceEarlyLast && !late) c += P.wrongPhasePenalty;
    }
    return c;
  };
  for (let attempt = 0; attempt < cfg.college.restarts; attempt++) {
    const N = teams.length;
    const at = new Int32Array(N * weeks).fill(-1);
    const wk = new Int32Array(drafts.length).fill(-1);
    const place = (e: number, w: number) => { wk[e] = w; at[u[e]! * weeks + w] = e; at[v[e]! * weeks + w] = e; };
    const unplace = (e: number) => { const w = wk[e]!; at[u[e]! * weeks + w] = -1; at[v[e]! * weeks + w] = -1; wk[e] = -1; };
    const chain = (t: number, a: number, b: number): number[] => {
      const out: number[] = [];
      let cur = t;
      let w = a;
      for (;;) {
        const e = at[cur * weeks + w]!;
        if (e < 0 || out.includes(e)) break;
        out.push(e);
        cur = u[e] === cur ? v[e]! : u[e]!;
        w = w === a ? b : a;
      }
      return out;
    };
    const swap = (edges: readonly number[], a: number, b: number) => {
      const old = edges.map((e) => wk[e]!);
      edges.forEach(unplace);
      edges.forEach((e, i) => place(e, old[i] === a ? b : a));
    };
    const order = shuffle(drafts.map((_, i) => i), rng).sort((x, y) => rank(drafts[x]!) - rank(drafts[y]!));
    let failed = false;
    for (const e of order) {
      const fu: number[] = [];
      const fv: number[] = [];
      for (let w = 0; w < weeks; w++) { if (at[u[e]! * weeks + w] === -1) fu.push(w); if (at[v[e]! * weeks + w] === -1) fv.push(w); }
      const common = fu.filter((w) => fv.includes(w));
      if (common.length) {
        let best = common[0]!;
        let bc = Number.MAX_SAFE_INTEGER;
        for (const w of shuffle(common, rng)) { const c = pref(e, w); if (c < bc) { bc = c; best = w; } }
        place(e, best);
        continue;
      }
      let done = false;
      for (const a of fu) {
        for (const b of fv) {
          const path = chain(v[e]!, a, b);
          if (path.some((x) => u[x] === u[e] || v[x] === u[e])) continue;
          swap(path, a, b);
          if (at[u[e]! * weeks + a] === -1 && at[v[e]! * weeks + a] === -1) { place(e, a); done = true; break; }
          swap(path, a, b);
        }
        if (done) break;
      }
      if (!done) { failed = true; break; }
    }
    if (failed) continue;
    // Improve: move single games to a better free week.
    for (let pass = 0; pass < weeks; pass++) {
      let moved = false;
      for (let e = 0; e < drafts.length; e++) {
        const cur = wk[e]!;
        let best = cur;
        let bc = pref(e, cur);
        for (let w = 0; w < weeks; w++) {
          if (w === cur || at[u[e]! * weeks + w] !== -1 || at[v[e]! * weeks + w] !== -1) continue;
          const c = pref(e, w);
          if (c < bc) { bc = c; best = w; }
        }
        if (best !== cur) { unplace(e); place(e, best); moved = true; }
      }
      if (!moved) break;
    }
    return Array.from(wk);
  }
  throw new Error('T3.1: could not place the college season into its weeks');
}

function rank(d: Draft): number {
  if (d.kind === 'protected') return 0;
  return d.conference ? 1 : 1 + 1;
}

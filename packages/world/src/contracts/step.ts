// Player contracts for every club whose league has a cap (C6, C8.3.1), the yearly player payroll charged to
// the club's books (C6.2.3 rule 1), and the minimum team cash spending floor checked at the end of each
// period, with any shortfall paid to the period's players and logged (C6.2.3 rule 2, CBA Art. 12 s.9).
// Every figure comes from a rule key (cap, minimums, rookie lengths, the floor percent) or from the owner's
// budget the money module already draws (C6.2.3 rule 3); see README decisions PC-01 to PC-10.
import { stream } from '@gm/engine-core';
import { cap as capRules, market } from '@gm/league';
import type { ContractRecord, RuleSet } from '@gm/schema';
import type { LiveWorld, StepContext, StepDigest, StepHandler } from '../loop/types.ts';
import { isActive } from '../loop/lifecycle.ts';
import { cashBudget, chargeClub, clubMoneyOf, capFromRules, type CapCents } from '../money/club.ts';
import { ageIn, gradeContext, levelOfTeam, rosteredSet, type GradeContext, type Level, type RuleRead } from '../turnover/binding.ts';
import { PLAYER_DRAFTED, PLAYER_SIGNED } from '../turnover/events.ts';
import { ageCurve } from '../turnover/front-office.ts';
import { ruleSetFor, type ContractsBinding } from './binding.ts';
import { param, type FloorPeriod } from './params.ts';
import { marketPrice, publicPercentiles, sourcedScale } from './scale.ts';
import { contractsOf, lastYear, salaryIn, setContracts, type ContractsState, type FloorCheck, type PlayerContract } from './state.ts';

/** Reason on a club's yearly player pay entry (C6.2.3 rule 1). The floor counts these only (MO-10). */
export const PLAYER_PAY_REASON = 'player_pay';
/** Reason prefix on a floor shortfall payment, `floor_shortfall:<from>-<to>`. */
export const FLOOR_SHORTFALL_REASON = 'floor_shortfall';
/** J13 stream of a founding contract's remaining years (PC-03). */
export const STREAM_FOUNDING = 'world.contracts.founding';

export { ruleSetFor, type ContractsBinding } from './binding.ts';

/** League-rules key of a named floor period, `cap.min_cash_period_<from>_<to>_pct` (CBA Art. 12 s.9(a), (b)). */
const PERIOD_KEY = /^cap\.min_cash_period_(\d+)_(\d+)_pct$/;
/** The percent a year outside every named period reads (MO-02: today's rules). */
export const FLOOR_PCT_KEY = 'cap.min_cash_spend_pct';

/** The floor periods a level's league rules name, oldest first, each with its own percent. */
export function namedFloorPeriods(b: ContractsBinding, level: Level): FloorPeriod[] {
  const out: FloorPeriod[] = [];
  for (const key of b.keys(level)) {
    const m = PERIOD_KEY.exec(key);
    const pct = m ? b.rule(level, key) : undefined;
    if (m && pct !== undefined) out.push({ from: Number(m[1]), to: Number(m[2]), pct });
  }
  return out.sort((x, y) => x.from - y.from);
}

/**
 * The floor period holding a league year (PC-04): a period the league rules name, with its own percent; else
 * `floor.periodYears`-long periods on either side, at `cap.min_cash_spend_pct`. Null where the level has no floor.
 */
export function floorPeriodOf(b: ContractsBinding, level: Level, year: number): FloorPeriod | null {
  const named = namedFloorPeriods(b, level);
  const pct = b.rule(level, FLOOR_PCT_KEY);
  const known = named.find((p) => year >= p.from && year <= p.to);
  if (known) return known;
  if (pct === undefined) return null;
  const len = param('floor.periodYears');
  if (named.length === 0) {
    const from = Math.floor(year / len) * len;
    return { from, to: from + len - 1, pct };
  }
  const first = named[0]!, last = named[named.length - 1]!;
  if (year > last.to) {
    const from = last.to + 1 + Math.floor((year - last.to - 1) / len) * len;
    return { from, to: from + len - 1, pct };
  }
  const to = first.from - 1 - Math.floor((first.from - 1 - year) / len) * len;
  return { from: to - len + 1, to, pct };
}

const NONE = { skill: false, cap: false, injury: false };
const FULL = { skill: true, cap: true, injury: true };
const FIRST_ROUND = 1;

/** How a player new to a club's books arrived. A free agent carries the C8.3.1 rule 2 suitor count at the moment he signed. */
export type Signing =
  | { readonly kind: 'drafted'; readonly round: number }
  | { readonly kind: 'undrafted' }
  | { readonly kind: 'free_agent'; readonly suitors: number }
  | { readonly kind: 'veteran' };

interface Run {
  readonly world: LiveWorld;
  readonly b: ContractsBinding;
  readonly year: number;
  readonly cap: CapCents;
  readonly grades: GradeContext;
  readonly signings: ReadonlyMap<number, Signing>;
  readonly founding: boolean;
  /** Public percentile of each rostered player at his position, by level (PC-11). */
  readonly percentiles: (level: Level) => ReadonlyMap<number, number>;
  /** C8.3.1 rule 4 time factor of this year's free agent signings (PC-12). */
  readonly time: number;
  readonly freeAgentApy: { personId: number; teamId: number; apyCents: number }[];
  state: ContractsState;
  signed: number;
  ended: number;
  releasedGuaranteeCents: number;
  /** Released guarantees charged this year, by club (PC-06): they count against the year's room. */
  readonly releasedBy: Map<number, number>;
}

function credited(world: LiveWorld, id: number): number {
  return world.people.get(id)?.playing?.eligibility.pro.creditedSeasons ?? 0;
}

function contractYear(leagueYear: number, cents: number, guarantee: typeof NONE): PlayerContract['terms']['years'][number] {
  return {
    leagueYear, baseSalary: { amountCents: cents, guarantee }, optionBonus: null, rosterBonuses: [], workoutBonusCents: 0,
    incentives: [], voidable: false, option: 'none',
  };
}

function newContract(r: Run, personId: number, teamId: number, form: PlayerContract['terms']['form'], years: PlayerContract['terms']['years']): PlayerContract {
  const id = r.state.nextId;
  r.state = { ...r.state, nextId: id + 1 };
  r.signed++;
  const c: ContractRecord = {
    id, personId, teamId, signed: r.world.date, agentId: null, state: 'active', summaryKey: null,
    terms: { kind: 'player', form, signingBonusCents: 0, signingBonusPaidOn: r.world.date, years: [...years], offset: false, noTrade: false },
  };
  return c as PlayerContract;
}

/** Bisection steps that fix the budget scale (PC-13) to well under a cent of payroll. */
const SCALE_STEPS = 60;

/**
 * The factor k at which `spend(k)` reaches `room`: `spend` is non-decreasing in k and flat once every player
 * is at his top. Below 1 when the market prices are over the room; 1 or more when they are under it.
 */
function scaleTo(spend: (k: number) => number, room: number): number {
  const at1 = spend(1);
  if (at1 === 0) return 1;
  if (at1 >= room) return room / at1;
  let lo = 1, hi = 2;
  while (spend(hi) < room && spend(hi) > spend(hi / 2)) hi *= 2;
  for (let i = 0; i < SCALE_STEPS; i++) { const mid = (lo + hi) / 2; if (spend(mid) < room) lo = mid; else hi = mid; }
  return lo;
}

/**
 * Contracts for one club's rostered players who hold none (PC-01, PC-02, PC-03, PC-11 to PC-13). Rookies sign
 * the fixed rookie length at the minimum for each year's credited seasons. Everyone else is paid from the
 * sourced position scale at his public percentile: a free agent at the C8.3.1 market price (demand from the
 * clubs with need and room when he signed, and the time factor), a founding player or a re-signing veteran
 * at the scale price itself. New veteran money is cut back to fit under the cap.
 */
function openClub(r: Run, teamId: number, rules: RuleSet, capCents: number, keep: readonly PlayerContract[]): PlayerContract[] {
  const { world, year } = r;
  const roster = [...(world.rosters.get(teamId) ?? [])].sort((a, b) => a - b);
  const held = new Set(keep.map((c) => c.personId));
  const fresh = roster.filter((id) => !held.has(id) && world.people.get(id)?.playing);
  if (fresh.length === 0) return [];
  const minimum = (id: number, k = 0) => capRules.minimumSalary(rules, r.b.rulesYear, credited(world, id) + k);
  const percentile = r.percentiles(levelOfTeam(world, teamId));
  // C6.2.3 rule 3: the owner's budget for the year, capped at the cap.
  const target = Math.min(cashBudget(world, teamId, year, r.cap) ?? capCents, capCents);

  const out: PlayerContract[] = [];
  // Guarantees of players released this year are on the books too (PC-06).
  let committed = keep.reduce((s, c) => s + salaryIn(c, year), 0) + (r.releasedBy.get(teamId) ?? 0);
  // Rookies first: their pay is fixed by rule (C6.4.2 rule 1, PC-05).
  const vets: number[] = [];
  for (const id of fresh) {
    const sg = r.signings.get(id);
    if (sg?.kind !== 'drafted' && sg?.kind !== 'undrafted') { vets.push(id); continue; }
    const round = sg.kind === 'drafted' ? sg.round : null;
    const n = capRules.rookieLength(round, rules);
    const g = round === FIRST_ROUND ? FULL : NONE;
    const years = Array.from({ length: n }, (_, k) => contractYear(year + k, minimum(id, k), g));
    committed += years[0]!.baseSalary.amountCents;
    out.push(newContract(r, id, teamId, 'rookie', years));
  }
  const curve = ageCurve();
  const priced = vets.map((id) => {
    const p = world.people.get(id)!;
    const position = p.playing!.position;
    const sg = r.signings.get(id);
    const pct = percentile.get(id) ?? 0;
    const age = ageIn(p, year);
    const primeEndAge = curve.primeEndAge(position);
    // PC-11: the market line. A free agent prices with his suitors and the time factor (PC-12); a founding
    // player or a re-signing veteran at the scale price, demand and time both neutral (PC-13).
    const line = marketPrice({
      position, percentile: pct, suitors: sg?.kind === 'free_agent' ? sg.suitors : 0, age, primeEndAge, capCents,
      minimumCents: minimum(id), time: sg?.kind === 'free_agent' ? r.time : 1,
    });
    const apy = sg?.kind === 'free_agent' ? line.apyCents.mid : Math.max(minimum(id), Math.round(market.shareAt(sourcedScale(position), pct) * capCents));
    const top = Math.max(apy, Math.round(sourcedScale(position).shares[0]! * capCents));
    return { id, apy, top, years: line.years, guaranteeShare: line.guaranteeShare, free: sg?.kind === 'free_agent' };
  });
  // PC-13: the club spends its owner's budget. The year's new veteran money above the minimum moves in
  // proportion to each player's market price until the payroll meets the budget: down to fit (never above
  // the cap), or up, no player past the top of his position's scale.
  const extra = priced.map((x) => x.apy - minimum(x.id));
  const most = priced.map((x) => x.top - minimum(x.id));
  const room = target - committed - priced.reduce((s, x) => s + minimum(x.id), 0);
  const spend = (k: number) => extra.reduce((s, e, i) => s + Math.min(e * k, most[i]!), 0);
  const scale = scaleTo(spend, Math.max(0, room));
  for (const [i, x] of priced.entries()) {
    const apy = minimum(x.id) + Math.floor(Math.min(extra[i]! * scale, most[i]!));
    // PC-03: C8.3.1 rule 3 years; a founding contract is part way through its term.
    let n = x.years;
    if (r.founding) n = stream(world.seed, STREAM_FOUNDING, [teamId, x.id]).int(1, n);
    // PC-11: the guarantee share is carried as fully guaranteed salary in the first years.
    const guaranteed = Math.round(n * x.guaranteeShare);
    const years = Array.from({ length: n }, (_, k) => contractYear(year + k, Math.max(apy, minimum(x.id, k)), k < guaranteed ? FULL : NONE));
    out.push(newContract(r, x.id, teamId, apy === minimum(x.id) ? 'minimum' : 'veteran', years));
    if (x.free) r.freeAgentApy.push({ personId: x.id, teamId, apyCents: apy });
  }
  return out;
}

/** End contracts that ran out, of players gone from the club's roster, or of players out of football (PC-06). */
function closeContracts(r: Run): PlayerContract[] {
  const { world, year } = r;
  const keep: PlayerContract[] = [];
  for (const c of r.state.active) {
    const onRoster = (world.rosters.get(c.teamId) ?? []).includes(c.personId) && isActive(world, c.teamId, year);
    if (onRoster && lastYear(c) >= year && world.status.get(c.personId) === 'active') { keep.push(c); continue; }
    r.ended++;
    // PC-06: a release before the last year still owes the guaranteed salary of the years left, paid now.
    if (lastYear(c) >= year && world.status.get(c.personId) === 'active') {
      const owed = c.terms.years.filter((y) => y.leagueYear >= year && y.baseSalary.guarantee.skill).reduce((s, y) => s + y.baseSalary.amountCents, 0);
      if (owed > 0) {
        chargeClub(world, { teamId: c.teamId, seasonYear: year, cents: owed, reason: PLAYER_PAY_REASON });
        r.releasedGuaranteeCents += owed;
        r.releasedBy.set(c.teamId, (r.releasedBy.get(c.teamId) ?? 0) + owed);
      }
    }
  }
  return keep;
}

/** C6.2.3 rule 2: check every floor period that ended last league year, once, and pay any shortfall to its players. */
function checkFloors(r: Run): number {
  const { world, b, year } = r;
  const checks: FloorCheck[] = [];
  const closed = new Set<string>();
  let total = 0;
  for (const [teamKey, players] of Object.entries(r.state.periodRoster).sort((x, y) => Number(x[0]) - Number(y[0]))) {
    const teamId = Number(teamKey);
    if (!world.teams.some((t) => t.id === teamId)) continue;
    const level = levelOfTeam(world, teamId);
    const period = floorPeriodOf(b, level, year - 1);
    if (!period || period.to !== year - 1) continue;
    const key = `${period.from}-${period.to}`;
    closed.add(key);
    const counted = r.state.paidYears.filter((y) => y >= period.from && y <= period.to);
    if (r.state.checkedPeriods.includes(key) || counted.length === 0 || !isActive(world, teamId, year - 1)) continue;
    const caps = counted.map((y) => r.cap(world, teamId, y) ?? 0);
    const spent = counted.map((y) => clubMoneyOf(world).payments
      .filter((p) => p.teamId === teamId && p.seasonYear === y && p.reason === PLAYER_PAY_REASON).reduce((s, p) => s + p.cents, 0));
    // The period's own percent from its key (89 for 2017-20, 90 after), handed to the cap module's floor.
    const base = ruleSetFor(b, level);
    const f = capRules.cashFloor(caps, spent, { ...base, num: (k) => (k === FLOOR_PCT_KEY ? period.pct : base.num(k)) });
    const ids = [...players].sort((x, y) => x - y);
    let recipients: FloorCheck['recipients'] = [];
    if (f.shortfallCents > 0) {
      chargeClub(world, { teamId, seasonYear: year, cents: f.shortfallCents, reason: `${FLOOR_SHORTFALL_REASON}:${key}` });
      total += f.shortfallCents;
      // PC-08: equal shares; the CBA leaves the split to the NFLPA's allocation instructions.
      const share = ids.length > 0 ? Math.floor(f.shortfallCents / ids.length) : 0;
      let rest = f.shortfallCents - share * ids.length;
      recipients = ids.map((personId) => {
        const extra = rest > 0 ? 1 : 0;
        rest -= extra;
        return { personId, cents: share + extra };
      });
    }
    checks.push({ teamId, from: period.from, to: period.to, yearsCounted: counted.length, ...f, paidYear: year, recipients });
  }
  if (closed.size === 0) return 0;
  const fresh = [...closed].filter((k) => !r.state.checkedPeriods.includes(k)).sort();
  r.state = { ...r.state, periodRoster: {}, checkedPeriods: [...r.state.checkedPeriods, ...fresh], floorChecks: [...r.state.floorChecks, ...checks] };
  return total;
}

export interface ContractYearRun {
  readonly seasonYear: number;
  readonly signed: number;
  readonly ended: number;
  readonly active: number;
  readonly playerPayCents: number;
  readonly floorShortfallCents: number;
  readonly already: boolean;
}

/**
 * One league year's contract work, once: check a floor period that just closed, end and open contracts,
 * then charge each capped club the year's player salaries through `chargeClub` (C6.2.3 rule 1).
 * `signings` names this year's drafted (with round) and undrafted signings; anyone else new signs as a veteran.
 */
export function runContractYear(world: LiveWorld, b: ContractsBinding, signings: ReadonlyMap<number, Signing> = new Map()): ContractYearRun {
  const year = world.date.seasonYear;
  const start = contractsOf(world);
  if (start.paidYears.includes(year)) return { seasonYear: year, signed: 0, ended: 0, active: start.active.length, playerPayCents: 0, floorShortfallCents: 0, already: true };
  const cap = capFromRules(b.rule, b.rulesYear);
  const grades = gradeContext(world, rosteredSet(world));
  const teams = world.teams.filter((t) => isActive(world, t.id, year) && !(b.skipTeam?.(world, t.id) ?? false)).map((t) => t.id).sort((x, y) => x - y);
  const byLevel = new Map<Level, Map<number, number>>();
  // PC-11: the percentile population is every player rostered at the level's capped clubs this year.
  const percentiles = (level: Level): ReadonlyMap<number, number> => {
    let m = byLevel.get(level);
    if (!m) {
      const ids = teams.filter((t) => levelOfTeam(world, t) === level && cap(world, t, year) !== undefined).flatMap((t) => world.rosters.get(t) ?? []);
      m = publicPercentiles(world, grades, ids);
      byLevel.set(level, m);
    }
    return m;
  };
  const r: Run = {
    world, b, year, cap, grades, signings, percentiles, time: b.marketTime?.(year) ?? 1, freeAgentApy: [],
    founding: start.paidYears.length === 0, state: start, signed: 0, ended: 0, releasedGuaranteeCents: 0, releasedBy: new Map(),
  };
  const floorShortfallCents = checkFloors(r);
  const keep = closeContracts(r);
  const opened: PlayerContract[] = [];
  const paidBy = new Map<number, number>();
  const roster: Record<string, readonly number[]> = { ...r.state.periodRoster };
  for (const teamId of teams) {
    const capCents = cap(world, teamId, year);
    if (capCents === undefined) continue;
    const rules = ruleSetFor(b, levelOfTeam(world, teamId));
    const mine = keep.filter((c) => c.teamId === teamId);
    opened.push(...openClub(r, teamId, rules, capCents, mine));
  }
  const active = [...keep, ...opened].sort((x, y) => x.id - y.id);
  for (const c of active) {
    paidBy.set(c.teamId, (paidBy.get(c.teamId) ?? 0) + salaryIn(c, year));
    const k = String(c.teamId);
    if (!(roster[k] ?? []).includes(c.personId)) roster[k] = [...(roster[k] ?? []), c.personId];
  }
  let pay = 0;
  for (const [teamId, cents] of [...paidBy].sort((x, y) => x[0] - y[0])) {
    if (cents <= 0) continue;
    chargeClub(world, { teamId, seasonYear: year, cents, reason: PLAYER_PAY_REASON });
    pay += cents;
  }
  const lastMarket = { seasonYear: year, signings: [...r.freeAgentApy].sort((x, y) => x.personId - y.personId) };
  setContracts(world, { ...r.state, active, paidYears: [...r.state.paidYears, year], periodRoster: roster, lastMarket });
  return { seasonYear: year, signed: r.signed, ended: r.ended, active: active.length, playerPayCents: pay + r.releasedGuaranteeCents, floorShortfallCents, already: false };
}

/** Player cash a club paid in a league year: salaries and released guarantees, not staff pay or fines. */
export function playerCashPaid(world: LiveWorld, teamId: number, seasonYear: number): number {
  return clubMoneyOf(world).payments.filter((p) => p.teamId === teamId && p.seasonYear === seasonYear && p.reason === PLAYER_PAY_REASON).reduce((s, p) => s + p.cents, 0);
}

/**
 * C8.3.1 rule 2 suitors of a free agent at the moment he signs: the capped clubs of his level with need at
 * his position (no more players there than the level's median club) and room for his scale price at his public
 * percentile among the level's rostered players at the position (the cap less
 * what the club owes this league year: open contracts' salaries, and the minimum for each rostered player
 * still without one). The club that signed him counts if it qualifies without him; never fewer than one.
 */
export function suitorsAt(world: LiveWorld, b: ContractsBinding, grades: GradeContext, personId: number, signedWith: number): number {
  const year = world.date.seasonYear;
  const p = world.people.get(personId)?.playing;
  if (!p) return 1;
  const level = levelOfTeam(world, signedWith);
  const cap = capFromRules(b.rule, b.rulesYear);
  const rules = ruleSetFor(b, level);
  const st = contractsOf(world);
  const clubs = world.teams.filter((t) => isActive(world, t.id, year) && levelOfTeam(world, t.id) === level && cap(world, t.id, year) !== undefined).map((t) => t.id);
  const at = (teamId: number) => (world.rosters.get(teamId) ?? []).filter((id) => id !== personId && world.people.get(id)?.playing?.position === p.position).length;
  const counts = clubs.map(at).sort((x, y) => x - y);
  const median = counts.length === 0 ? 0 : counts[Math.floor((counts.length - 1) / 2)]!;
  const byPerson = new Map(st.active.map((c) => [c.personId, c]));
  const peers = clubs.flatMap((t) => (world.rosters.get(t) ?? []).filter((id) => world.people.get(id)?.playing?.position === p.position));
  const pct = publicPercentiles(world, grades, [...new Set([...peers, personId])]).get(personId) ?? PUBLIC_MIDDLE;
  const share = market.shareAt(sourcedScale(p.position), pct);
  let n = 0;
  for (const teamId of clubs) {
    const capCents = cap(world, teamId, year)!;
    const price = Math.round(share * capCents);
    let owed = 0;
    for (const id of world.rosters.get(teamId) ?? []) {
      if (id === personId || !world.people.get(id)?.playing) continue;
      const c = byPerson.get(id);
      owed += c && c.teamId === teamId && lastYear(c) >= year ? salaryIn(c, year) : capRules.minimumSalary(rules, b.rulesYear, credited(world, id));
    }
    if (at(teamId) <= median && capCents - owed >= price) n++;
  }
  return Math.max(1, n);
}

/** Percentile of a player with no peers at his position: the middle of the scale. */
const PUBLIC_MIDDLE = 0.5;

/**
 * The moves step with the league year's contract work run after it, the first time it sees the year.
 * Bind it around the roster cycle, `contractsStep(b, movesStep(tb, rosterMovesStep(tb)))`, so the year's
 * draft and signings are on rosters before contracts open. It reads the cycle's `player_drafted` and
 * undrafted `player_signed` events as they are emitted, and passes every event through unchanged.
 */
export function contractsStep(b: ContractsBinding, inner: StepHandler): StepHandler {
  return (ctx: StepContext): StepDigest | void => {
    const signings = new Map<number, Signing>();
    let grades: GradeContext | null = null;
    const spy: StepContext = {
      world: ctx.world, step: ctx.step, source: ctx.source,
      tierOfTeam: (t) => ctx.tierOfTeam(t),
      open: (name, scope) => ctx.open(name, scope),
      markOutOfFootball: (id) => ctx.markOutOfFootball(id),
      emit: (e) => {
        const subject = e.subjects?.[0];
        const payload = e.payload ?? {};
        if (subject && subject.kind === 'person') {
          if (e.type === PLAYER_DRAFTED && typeof payload.round === 'number') signings.set(subject.id, { kind: 'drafted', round: payload.round });
          if (e.type === PLAYER_SIGNED && payload.kind === 'undrafted') signings.set(subject.id, { kind: 'undrafted' });
          // The roster already holds him; his suitors are counted now, before the next club signs anyone (PC-12).
          if (e.type === PLAYER_SIGNED && payload.kind === 'free_agent' && typeof payload.team === 'number') {
            signings.set(subject.id, { kind: 'free_agent', suitors: suitorsAt(ctx.world, b, (grades ??= gradeContext(ctx.world, rosteredSet(ctx.world))), subject.id, payload.team) });
          }
        }
        return ctx.emit(e);
      },
    };
    const d = inner(spy);
    const run = runContractYear(ctx.world, b, signings);
    if (run.already) return d;
    return {
      ...(d ?? {}), contractsSigned: run.signed, contractsEnded: run.ended, contractsActive: run.active,
      playerPayCents: run.playerPayCents, floorShortfallCents: run.floorShortfallCents,
    };
  };
}
